const CareerAgentMessage = require("../models/CareerAgentMessage");
const CareerAgentMemory = require("../models/CareerAgentMemory");
const { inferQuestionType } = require("./careerAgentService");

const MESSAGE_TTL_DAYS = Number(process.env.CAREER_AGENT_MESSAGE_TTL_DAYS) || 60;
const MAX_MESSAGES_PER_USER = Number(process.env.CAREER_AGENT_MAX_MESSAGES_PER_USER) || 40;
const MAX_MEMORY_ITEMS = 12;
// How long a previously-uploaded document stays usable for follow-up questions that don't
// re-attach it. Generous enough for same-session follow-ups, short enough to avoid an old
// resume bleeding into an unrelated conversation days later.
const REMEMBERED_DOCUMENT_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_REMEMBERED_DOCUMENT_CHARS = 8000;

function expiresAtFromNow() {
  return new Date(Date.now() + MESSAGE_TTL_DAYS * 24 * 60 * 60 * 1000);
}

function normalizeList(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  )].slice(0, MAX_MEMORY_ITEMS);
}

function addUnique(existing = [], next = []) {
  return normalizeList([...existing, ...next]);
}

function extractCommaOrAndList(text = "") {
  return String(text)
    .split(/,| and | or |\n/i)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && item.length <= 40);
}

function extractTargetRoles(message = "") {
  const text = String(message || "").toLowerCase();
  const roles = [];

  if (text.includes("backend") || text.includes("back end")) roles.push("Backend Developer");
  if (text.includes("frontend") || text.includes("front end") || text.includes("react")) roles.push("Frontend Developer");
  if (text.includes("full stack") || text.includes("fullstack")) roles.push("Full Stack Developer");
  if (text.includes("qa") || text.includes("testing")) roles.push("QA Engineer");
  if (text.includes("data analyst")) roles.push("Data Analyst");
  if (text.includes("machine learning") || text.includes("ml engineer")) roles.push("Machine Learning Engineer");

  return normalizeList(roles);
}

function extractLocations(message = "") {
  const text = String(message || "");
  const locations = [];
  const knownLocations = [
    "Hyderabad",
    "Bengaluru",
    "Bangalore",
    "Pune",
    "Mumbai",
    "Delhi",
    "Noida",
    "Gurgaon",
    "Chennai",
    "Remote"
  ];

  knownLocations.forEach((location) => {
    if (new RegExp(`\\b${location}\\b`, "i").test(text)) {
      locations.push(location);
    }
  });

  return normalizeList(locations);
}

function extractSkillGoals(message = "") {
  const text = String(message || "").toLowerCase();
  const skills = [];
  const knownSkills = [
    "node.js",
    "express",
    "mongodb",
    "sql",
    "postgresql",
    "mysql",
    "java",
    "python",
    "react",
    "typescript",
    "javascript",
    "docker",
    "aws",
    "rest api",
    "jwt",
    "oauth",
    "testing",
    "playwright",
    "selenium"
  ];

  knownSkills.forEach((skill) => {
    if (text.includes(skill)) {
      skills.push(skill);
    }
  });

  if (/(learn|develop|improve|skill|roadmap)/.test(text)) {
    const targetRoles = extractTargetRoles(text);
    if (targetRoles.some((role) => role.toLowerCase().includes("backend"))) {
      skills.push("REST APIs", "authentication", "databases", "testing", "deployment");
    }
  }

  return normalizeList(skills);
}

function extractResumeIssues(message = "") {
  const text = String(message || "").toLowerCase();
  const issues = [];

  if (text.includes("ats")) issues.push("ATS score concern");
  if (text.includes("resume")) issues.push("Resume improvement");
  if (text.includes("keyword")) issues.push("Missing keywords");
  if (text.includes("project")) issues.push("Project evidence needs improvement");
  if (text.includes("experience")) issues.push("Experience evidence needs improvement");

  return normalizeList(issues);
}

function deriveMemoryPatch({ message, intent }) {
  const targetRoles = extractTargetRoles(message);
  const preferredLocations = extractLocations(message);
  const skillGoals = extractSkillGoals(message);
  const resumeIssues = extractResumeIssues(message);
  const normalizedMessage = String(message || "").trim();

  return {
    targetRoles,
    preferredLocations,
    skillGoals,
    resumeIssues,
    lastIntent: intent,
    lastConcern: normalizedMessage.slice(0, 240),
    careerGoal:
      targetRoles.length || preferredLocations.length
        ? [
            targetRoles.length ? `Targeting ${targetRoles.join(", ")}` : "",
            preferredLocations.length ? `in ${preferredLocations.join(", ")}` : ""
          ].filter(Boolean).join(" ")
        : undefined,
    facts: normalizeList([
      ...targetRoles.map((role) => `Target role: ${role}`),
      ...preferredLocations.map((location) => `Preferred location: ${location}`),
      ...skillGoals.map((skill) => `Skill goal: ${skill}`),
      ...resumeIssues.map((issue) => `Resume issue: ${issue}`)
    ])
  };
}

async function getCareerAgentContext(userId) {
  const [messages, memory] = await Promise.all([
    CareerAgentMessage.find({ userId })
      .sort({ createdAt: -1 })
      .limit(MAX_MESSAGES_PER_USER)
      .lean(),
    CareerAgentMemory.findOne({ userId }).lean()
  ]);

  return {
    recentMessages: messages.reverse().map((message) => ({
      role: message.role,
      content: message.content
    })),
    memory: memory || {
      targetRoles: [],
      preferredLocations: [],
      skillGoals: [],
      resumeIssues: [],
      facts: []
    },
    rememberedDocument: getUsableRememberedDocument(memory)
  };
}

// Returns the last uploaded document only if it is still within the reuse window.
function getUsableRememberedDocument(memory) {
  if (!memory || !memory.lastDocumentText) {
    return null;
  }

  const uploadedAt = memory.lastDocumentAt ? new Date(memory.lastDocumentAt).getTime() : 0;
  if (!uploadedAt || Date.now() - uploadedAt > REMEMBERED_DOCUMENT_TTL_MS) {
    return null;
  }

  return {
    text: memory.lastDocumentText,
    fileName: memory.lastDocumentName || "previously uploaded document",
    uploadedAt: memory.lastDocumentAt
  };
}

async function rememberUploadedDocument({ userId, documentText, documentName }) {
  const text = String(documentText || "").trim();
  if (!userId || !text) {
    return;
  }

  await CareerAgentMemory.updateOne(
    { userId },
    {
      $set: {
        lastDocumentText: text.slice(0, MAX_REMEMBERED_DOCUMENT_CHARS),
        lastDocumentName: String(documentName || "uploaded document").slice(0, 200),
        lastDocumentAt: new Date()
      }
    },
    { upsert: true }
  );
}

async function saveCareerAgentTurn({ userId, userMessage, assistantReply, intent }) {
  const expiresAt = expiresAtFromNow();

  await CareerAgentMessage.insertMany([
    {
      userId,
      role: "user",
      content: userMessage,
      intent,
      expiresAt
    },
    {
      userId,
      role: "assistant",
      content: assistantReply,
      intent,
      expiresAt
    }
  ]);

  await pruneOldMessages(userId);
  await updateCareerAgentMemory({ userId, message: userMessage, intent });
}

async function updateCareerAgentMemory({ userId, message, intent = inferQuestionType(message) }) {
  const patch = deriveMemoryPatch({ message, intent });
  const existing = await CareerAgentMemory.findOne({ userId });

  if (!existing) {
    await CareerAgentMemory.create({
      userId,
      ...patch
    });
    return;
  }

  existing.targetRoles = addUnique(existing.targetRoles, patch.targetRoles);
  existing.preferredLocations = addUnique(existing.preferredLocations, patch.preferredLocations);
  existing.skillGoals = addUnique(existing.skillGoals, patch.skillGoals);
  existing.resumeIssues = addUnique(existing.resumeIssues, patch.resumeIssues);
  existing.facts = addUnique(existing.facts, patch.facts).slice(0, 30);
  existing.lastConcern = patch.lastConcern || existing.lastConcern;
  existing.lastIntent = patch.lastIntent || existing.lastIntent;
  existing.careerGoal = patch.careerGoal || existing.careerGoal;
  await existing.save();
}

async function pruneOldMessages(userId) {
  const oldMessages = await CareerAgentMessage.find({ userId })
    .sort({ createdAt: -1 })
    .skip(MAX_MESSAGES_PER_USER)
    .select("_id")
    .lean();

  if (!oldMessages.length) {
    return;
  }

  await CareerAgentMessage.deleteMany({
    _id: { $in: oldMessages.map((message) => message._id) }
  });
}

module.exports = {
  getCareerAgentContext,
  saveCareerAgentTurn,
  updateCareerAgentMemory,
  pruneOldMessages,
  deriveMemoryPatch,
  rememberUploadedDocument
};
