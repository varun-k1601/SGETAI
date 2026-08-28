const { generateCareerAgentReply: generateCareerAgentReplyOllama } = require("./ollamaService");
const { generateCareerAgentReply: generateCareerAgentReplyGemini, hasUsableApiKey: hasGeminiKey } = require("./geminiGenerativeService");
const { buildJobText } = require("../utils/textBuilders");

// TOTAL wall-clock budget for producing a model reply, across every provider and every attempt.
// It sits between the per-provider timeouts below it and the proxy/browser timeouts above it:
//
//   Gemini 45s / Ollama 100s  <  THIS 120s  <  nginx proxy_read_timeout 150s  <  browser abort 180s
//
// Each layer must be strictly shorter than the one wrapping it. If this budget were ever raised
// above nginx's read timeout, the proxy would cut the connection first and its 504 - which carries
// none of our CORS headers - would reach the browser as an unreadable "Failed to fetch" again.
const CAREER_AGENT_TOTAL_BUDGET_MS = Number(process.env.CAREER_AGENT_TOTAL_BUDGET_MS) || 120000;
// Below this much remaining budget a provider cannot plausibly finish, so we stop rather than
// start a call we know will time out.
// 12s, not less: Gemini's API rejects any deadline under 10s outright, so a thinner slice than
// that cannot produce an answer from either provider - it can only produce a wasted attempt.
const MIN_PROVIDER_SLICE_MS = Number(process.env.CAREER_AGENT_MIN_PROVIDER_SLICE_MS) || 12000;

// Phase 2: Caching for performance optimization
const profileCache = new Map();
const PROFILE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCachedProfile(userId) {
  if (profileCache.has(userId)) {
    const cached = profileCache.get(userId);
    if (Date.now() - cached.timestamp < PROFILE_CACHE_TTL) {
      return cached.data;
    }
    profileCache.delete(userId);
  }
  return null;
}

function cacheProfile(userId, profileData) {
  profileCache.set(userId, {
    data: profileData,
    timestamp: Date.now()
  });
}

const platformKnowledge = {
  productName: "SGETAI",
  userTypes: {
    seeker: "Applicants search jobs, apply manually, build resumes, check ATS fit, complete profiles, chat, track applications, and receive recommendations.",
    proSeeker: "Pro applicants get AI resume generation, pre-apply checks, career agent chat, auto-apply preferences, and stronger automation.",
    organization: "Recruiters manage organization profiles, post jobs, review ranked applications, update statuses, trigger verification, and publish company posts."
  },
  corePages: [
    "Profile",
    "Search Jobs",
    "My Applications",
    "Resume Builder",
    "ATS Checker",
    "Pro Tools",
    "Chat",
    "Feed",
    "Notifications",
    "Recruiter Jobs",
    "Recruiter Applications"
  ],
  rules: [
    "Profile completeness improves recommendations, ATS scoring, resume generation, and auto-apply quality.",
    "Manual applications can use an attached resume; ATS score should be based on the submitted resume.",
    "Auto-apply should use generated tailored resumes and only apply above the configured threshold.",
    "Background verification is only available when an experienced applicant has verifiable experience with manager email; freshers can proceed without it.",
    "Resume generation should use truthful profile data and tailor objective, skills, projects, and experience to the selected job."
  ]
};

const platformHelpMap = [
  {
    keywords: ["username", "user name"],
    answer: "After login, open Profile and check Current profile snapshot. The Username row shows the generated or chosen username."
  },
  {
    keywords: ["upload resume", "attach resume", "manual resume"],
    answer: "Open Search Jobs, select a job, click Apply, then use Attach your own resume before submitting. Recruiters can view/download it from their applicant dashboard."
  },
  {
    keywords: ["ats", "ats score", "check resume"],
    answer: "Use ATS Checker to upload or paste a resume and compare it against a job or job description. Manual applications also calculate ATS from the submitted resume."
  },
  {
    keywords: ["generate resume", "resume generation", "download pdf"],
    answer: "Use Pro Tools, select a target job, click Generate resume, then Download PDF. Resume quality depends on completed profile sections like education, skills, projects, links, and experience."
  },
  {
    keywords: ["auto apply", "auto-apply"],
    answer: "Use Pro Tools -> Auto-apply preferences. Complete your profile first, set threshold above 55, choose locations and excluded companies, then enable auto-apply."
  },
  {
    keywords: ["application status", "my applications", "withdraw"],
    answer: "Open My Applications to see status, ATS score, verification progress, and withdraw options for jobs you applied to."
  },
  {
    keywords: ["profile", "complete profile"],
    answer: "Open Profile and complete Basic details, Education, Career summary, Experience if applicable, Skills and preferences, Portfolio links, and media/projects."
  }
];

const skillRoadmaps = {
  backend: [
    "One backend language deeply: Node.js, Java, Python, Go, or C#",
    "REST API design, routing, validation, error handling, pagination, and clean response formats",
    "Authentication and authorization: JWT, sessions, password hashing, roles, permissions, and OAuth basics",
    "Databases: MongoDB and SQL basics, schema design, indexing, transactions, and query optimization",
    "Architecture: controllers, services, repositories, middleware, config, logging, and background workers",
    "Security: CORS, rate limiting, input sanitization, secure uploads, secrets management, and least privilege",
    "Testing and production: unit/API tests, Postman, Docker basics, deployment, environment variables, and monitoring"
  ],
  frontend: [
    "HTML, CSS, JavaScript, and TypeScript fundamentals",
    "React components, routing, forms, state management, and API integration",
    "Responsive UI, accessibility, loading states, error states, and browser debugging",
    "Performance basics, reusable design systems, and clean user flows"
  ],
  "full-stack": [
    "React plus one backend stack such as Node.js/Express",
    "REST APIs, authentication, database modeling, file uploads, and deployment",
    "End-to-end feature building from UI to database",
    "Testing, debugging, Git workflow, and project explanation skills"
  ],
  qa: [
    "Manual testing, test cases, test plans, and bug reporting",
    "Automation with Playwright, Cypress, Selenium, or similar tools",
    "API testing with Postman, REST basics, and SQL basics",
    "Regression testing, CI basics, and clear defect communication"
  ],
  "data/ml": [
    "Python, NumPy, Pandas, data cleaning, and visualization",
    "SQL, statistics, and model evaluation metrics",
    "Regression, classification, clustering, validation, and feature engineering",
    "ML project deployment basics and explaining tradeoffs clearly"
  ]
};

function listMissingProfileSections(profile = {}) {
  const missing = [];

  if (!profile.phone) missing.push("phone");
  if (!profile.careerObjective && !profile.bio && !profile.tagline) missing.push("career summary");
  if (!profile.universityName && !(profile.education || []).length) missing.push("education");
  if (!(profile.skills || []).length && !(profile.skillGroups || []).length) missing.push("skills");
  if (!(profile.preferredRoles || []).length) missing.push("preferred roles");
  if (!(profile.projects || []).length) missing.push("projects");
  if (!profile.linkedinUrl) missing.push("LinkedIn URL");
  if (!profile.githubUrl && !profile.portfolioUrl) missing.push("GitHub or portfolio URL");

  return missing;
}

function getProfileCompleteness(profile = {}) {
  const checks = [
    { key: "basicDetails", complete: Boolean(profile.firstName && profile.lastName && profile.phone) },
    { key: "careerSummary", complete: Boolean(profile.careerObjective || profile.bio || profile.tagline) },
    { key: "education", complete: Boolean(profile.universityName || (profile.education || []).length) },
    { key: "skills", complete: Boolean((profile.skills || []).length || (profile.skillGroups || []).length) },
    { key: "preferredRoles", complete: Boolean((profile.preferredRoles || []).length) },
    { key: "projects", complete: Boolean((profile.projects || []).length) },
    { key: "links", complete: Boolean(profile.linkedinUrl || profile.githubUrl || profile.portfolioUrl) }
  ];
  const completedCount = checks.filter((item) => item.complete).length;

  return {
    score: Math.round((completedCount / checks.length) * 100),
    completed: checks.filter((item) => item.complete).map((item) => item.key),
    missing: listMissingProfileSections(profile),
    recommendation:
      completedCount === checks.length
        ? "Profile is strong enough for recommendations, ATS, and resume generation."
        : "Complete missing sections to improve recommendations, ATS score, resume generation, and auto-apply quality."
  };
}

function getPlatformHelp(message = "") {
  const normalized = normalizeMessage(message);
  const matched = platformHelpMap.find((item) => {
    return item.keywords.some((keyword) => {
      const normalizedKeyword = normalizeMessage(keyword);
      const keywordTokens = normalizedKeyword.split(" ").filter(Boolean);

      if (normalized.includes(normalizedKeyword)) {
        return true;
      }

      return keywordTokens.length > 1 && keywordTokens.every((token) => normalized.includes(token));
    });
  });

  return matched || null;
}

function getSkillGapRoadmap(targetRole, profile = {}) {
  const roadmap = skillRoadmaps[targetRole] || [];
  const userSkills = new Set((profile.skills || []).map((skill) => normalizeMessage(skill)));
  const likelyPresent = roadmap.filter((item) => {
    const normalizedItem = normalizeMessage(item);
    return [...userSkills].some((skill) => skill && normalizedItem.includes(skill));
  });

  return {
    targetRole: targetRole || "unspecified",
    roadmap,
    likelyPresent,
    recommendedProjects:
      targetRole === "backend"
        ? [
            "REST API with JWT auth, role-based access, MongoDB/SQL models, validation, and tests",
            "File upload service with secure storage, error handling, and cleanup",
            "Job board backend with applications, status updates, notifications, and admin/recruiter permissions"
          ]
        : targetRole === "frontend"
          ? [
              "Responsive job dashboard with filters, forms, loading/error states, and API integration",
              "Profile editor with file uploads, validations, and polished dark/light mode"
            ]
          : [
              "Build one role-specific project that proves the top skills in the roadmap."
            ]
  };
}

function summarizeApplications(applications = []) {
  const statusCounts = applications.reduce((counts, application) => {
    const status = application.status || "Unknown";
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {});

  return {
    total: applications.length,
    statusCounts,
    recent: applications.slice(0, 6).map((application) => ({
      id: application._id,
      status: application.status,
      atsScore: application.atsScore,
      atsTag: application.atsTag,
      verificationStatus: application.verificationStatus,
      source: application.source,
      appliedAt: application.createdAt,
      job: {
        title: application.jobId?.title,
        location: application.jobId?.location,
        type: application.jobId?.type
      },
      organization: {
        companyName: application.organizationId?.companyName
      }
    }))
  };
}

function getCareerAgentModel() {
  return process.env.CAREER_AGENT_MODEL || process.env.OLLAMA_ANALYSIS_MODEL || "qwen2.5:7b";
}

function normalizeMessage(message = "") {
  return String(message)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanModelText(text = "") {
  return String(text || "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
}

function inferQuestionType(message = "") {
  const text = String(message).toLowerCase();
  const compactText = normalizeMessage(message);

  if (
    /^(hi|hello|hey|hii|hiii|yo|good morning|good afternoon|good evening)$/.test(compactText) ||
    /^(how are you|how r u|how are u|how is it going|hows it going|what is up|whats up|sup)$/.test(compactText)
  ) {
    return "greeting";
  }

  if (/^(thanks|thank you|thankyou|ok thanks|okay thanks|cool thanks)$/.test(compactText)) {
    return "thanks";
  }

  if (/^(bye|goodbye|see you|see ya)$/.test(compactText)) {
    return "goodbye";
  }

  if (/\b(where|how)\b.*\b(upload|attach|download|find|open|create|post|apply|withdraw|upgrade|profile|username|resume|job)\b/.test(text)) {
    return "platform_usage";
  }

  if (/(skill|skills|learn|develop|improve|roadmap|gap|gaps)/.test(text)) {
    return "skill_development";
  }

  if (/(resume|cv|latex|pdf|ats|keyword)/.test(text)) {
    return "resume_or_ats";
  }

  if (/(job|role|opening|apply|recommend|company|hiring)/.test(text)) {
    return "job_search";
  }

  if (/(profile|project|education|experience|portfolio|github|linkedin)/.test(text)) {
    return "profile_improvement";
  }

  if (/(auto.?apply|threshold|pro|subscription)/.test(text)) {
    return "pro_features";
  }

  if (/(interview|hr|technical round|screening|question)/.test(text)) {
    return "interview_prep";
  }

  if (
    /\b(what is|what are|what does|how does|how do|explain|define|difference between|why is|why does|when did|who is|who was|tell me about)\b/.test(text) ||
    /\bhow\b.*\bworks?\b/.test(text)
  ) {
    return "general_knowledge";
  }

  return "general_career";
}

function inferTargetRole(message = "") {
  const text = String(message || "").toLowerCase();

  if (text.includes("backend") || text.includes("back end")) {
    return "backend";
  }

  if (text.includes("frontend") || text.includes("front end") || text.includes("react")) {
    return "frontend";
  }

  if (text.includes("full stack") || text.includes("fullstack")) {
    return "full-stack";
  }

  if (text.includes("qa") || text.includes("testing") || text.includes("automation")) {
    return "qa";
  }

  if (text.includes("data") || text.includes("ml") || text.includes("machine learning")) {
    return "data/ml";
  }

  return "";
}

function compactProfileForAgent(profile = {}) {
  return {
    name: [profile.firstName, profile.lastName].filter(Boolean).join(" "),
    currentStatus: profile.currentStatus,
    headline: profile.tagline,
    bio: profile.bio,
    careerObjective: profile.careerObjective,
    preferredRoles: profile.preferredRoles || [],
    openToWork: profile.openToWork,
    expectedSalary: profile.expectedSalary,
    education: {
      universityName: profile.universityName,
      degree: profile.degree,
      major: profile.major,
      graduationYear: profile.graduationYear,
      currentGPA: profile.currentGPA,
      history: (profile.education || []).map((item) => ({
        institution: item.institution,
        degree: item.degree,
        fieldOfStudy: item.fieldOfStudy,
        startDate: item.startDate,
        endDate: item.endDate
      }))
    },
    skillGroups: (profile.skillGroups || []).map((group) => ({
      category: group.category,
      skills: group.skills || []
    })),
    skills: profile.skills || [],
    projects: (profile.projects || []).map((project) => ({
      title: project.title,
      description: project.description,
      links: project.links || []
    })),
    experience: (profile.experience || []).map((item) => ({
      jobTitle: item.jobTitle,
      companyName: item.companyName,
      isCurrent: item.isCurrent,
      description: item.description
    })),
    certifications: (profile.licensesAndCertifications || []).map((item) => ({
      title: item.title,
      description: item.description
    })),
    achievements: (profile.achievements || []).map((item) => ({
      title: item.title,
      description: item.description
    })),
    careerAgentMemory: profile.careerAgentMemory || {},
    profileSignals: {
      hasPhone: Boolean(profile.phone),
      hasLinkedIn: Boolean(profile.linkedinUrl),
      hasGitHub: Boolean(profile.githubUrl),
      hasPortfolio: Boolean(profile.portfolioUrl),
      hasProjects: Boolean((profile.projects || []).length),
      hasExperience: Boolean((profile.experience || []).length),
      hasEducationHistory: Boolean((profile.education || []).length)
    }
  };
}

function compactJobsForAgent(jobs = []) {
  return jobs.slice(0, 2).map((job) => ({
    id: String(job._id),
    title: job.title,
    company: job.organizationId?.companyName || job.organizationName || "Unknown company",
    location: job.location,
    type: job.type,
    skillsRequired: (job.skillsRequired || []).slice(0, 5)
  }));
}

function compactHistoryForAgent(history = []) {
  return (Array.isArray(history) ? history : [])
    .slice(-3)
    .map((item) => ({
      role: item.role === "assistant" ? "assistant" : "user",
      content: String(item.content || "").slice(0, 200)
    }));
}

function compactAttachmentsForAgent(attachments = []) {
  return (Array.isArray(attachments) ? attachments : []).map((attachment) => ({
    index: attachment.index,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    size: attachment.size,
    extractedText: String(attachment.extractedText || "").slice(0, 8000),
    extractionQuality: attachment.extractionQuality,
    note: attachment.note || "",
    sentToModelAsInlineData: Boolean(attachment.inlineData)
  }));
}

function buildFocusAreas(questionType, profile = {}, message = "") {
  const targetRole = inferTargetRole(message);

  if (questionType === "skill_development" && targetRole && skillRoadmaps[targetRole]) {
    return skillRoadmaps[targetRole].slice(0, 4).map((item) => item.split(":")[0]);
  }

  return (profile.preferredRoles || []).length
    ? profile.preferredRoles
    : (profile.skills || []).slice(0, 6);
}

function selectAgentTools(message = "", questionType = inferQuestionType(message)) {
  const normalized = normalizeMessage(message);
  const tools = new Set();

  if (["greeting", "thanks", "goodbye"].includes(questionType)) {
    return [];
  }

  if (questionType === "platform_usage") {
    tools.add("platformHelp");
  }

  if (
    questionType === "profile_improvement" ||
    normalized.includes("missing") ||
    normalized.includes("complete profile") ||
    normalized.includes("profile")
  ) {
    tools.add("profileAnalyzer");
  }

  if (
    questionType === "skill_development" ||
    normalized.includes("learn") ||
    normalized.includes("skill") ||
    normalized.includes("roadmap")
  ) {
    tools.add("skillRoadmap");
  }

  if (
    questionType === "job_search" ||
    /\b(show|find|search|recommend|list)\b.*\b(job|jobs|opening|openings|role|roles)\b/.test(normalized) ||
    normalized.includes("opening") ||
    normalized.includes("company")
  ) {
    tools.add("jobSearch");
  }

  if (
    normalized.includes("application") ||
    normalized.includes("applied") ||
    normalized.includes("status") ||
    normalized.includes("withdraw") ||
    normalized.includes("accepted") ||
    normalized.includes("rejected")
  ) {
    tools.add("applicationTracker");
  }

  if (
    questionType === "resume_or_ats" ||
    normalized.includes("ats") ||
    normalized.includes("resume") ||
    normalized.includes("cv")
  ) {
    tools.add("resumeAdvisor");
    tools.add("profileAnalyzer");
  }

  if (questionType === "pro_features") {
    tools.add("proAdvisor");
    tools.add("profileAnalyzer");
  }

  if (questionType === "interview_prep") {
    tools.add("interviewPrep");
    tools.add("skillRoadmap");
  }

  // Only fall back to profileAnalyzer when the question is plausibly about the user themselves.
  // For genuine general-knowledge/general-career questions ("what does an SAP engineer do"),
  // adding it injects a "⚠️ Profile: X% complete, missing..." line into the prompt that has
  // nothing to do with what was asked and nudges the model to talk about the resume instead.
  if (!tools.size && !["general_knowledge", "general_career"].includes(questionType)) {
    tools.add("profileAnalyzer");
  }

  return [...tools];
}

function runAgentTool(toolName, { message, questionType, profile, jobs, applications }) {
  const targetRole = inferTargetRole(message);

  if (toolName === "platformHelp") {
    return {
      tool: toolName,
      result: getPlatformHelp(message)
    };
  }

  if (toolName === "profileAnalyzer") {
    return {
      tool: toolName,
      result: getProfileCompleteness(profile)
    };
  }

  if (toolName === "skillRoadmap") {
    return {
      tool: toolName,
      result: getSkillGapRoadmap(targetRole, profile)
    };
  }

  if (toolName === "jobSearch") {
    return {
      tool: toolName,
      result: {
        availableJobCount: (jobs || []).length,
        topJobs: (jobs || []).slice(0, 8).map((job) => ({
          id: job._id,
          title: job.title,
          company: job.organizationId?.companyName || job.organizationName || "Unknown company",
          location: job.location,
          type: job.type,
          industry: job.industry,
          skills: [...(job.skillsRequired || []), ...(job.skills || [])].filter(Boolean).slice(0, 16)
        }))
      }
    };
  }

  if (toolName === "applicationTracker") {
    return {
      tool: toolName,
      result: summarizeApplications(applications || [])
    };
  }

  if (toolName === "resumeAdvisor") {
    return {
      tool: toolName,
      result: {
        profileCompleteness: getProfileCompleteness(profile),
        targetRole,
        resumeInputsAvailable: {
          education: Boolean(profile.universityName || (profile.education || []).length),
          skills: Boolean((profile.skills || []).length || (profile.skillGroups || []).length),
          projects: Boolean((profile.projects || []).length),
          experience: Boolean((profile.experience || []).length),
          links: Boolean(profile.linkedinUrl || profile.githubUrl || profile.portfolioUrl)
        },
        advice:
          "Resume quality depends on matching the selected job with truthful profile evidence: education, skills, projects, experience, certifications, achievements, and links."
      }
    };
  }

  if (toolName === "proAdvisor") {
    return {
      tool: toolName,
      result: {
        isPro: Boolean(profile.isPro),
        autoApplyPreferences: profile.autoApplyPreferences,
        profileCompleteness: getProfileCompleteness(profile),
        advice: "Pro features work best after profile completion. Auto-apply should stay above the platform minimum threshold of 56."
      }
    };
  }

  if (toolName === "interviewPrep") {
    return {
      tool: toolName,
      result: {
        targetRole,
        likelyTopics: targetRole && skillRoadmaps[targetRole] ? skillRoadmaps[targetRole].slice(0, 5) : (profile.skills || []).slice(0, 8),
        projectStories: (profile.projects || []).slice(0, 4).map((project) => ({
          title: project.title,
          description: project.description
        }))
      }
    };
  }

  return {
    tool: toolName,
    result: null
  };
}

function runSelectedAgentTools({ message, questionType, profile, jobs, applications }) {
  const selectedTools = selectAgentTools(message, questionType);

  return {
    selectedTools,
    outputs: selectedTools.map((toolName) =>
      runAgentTool(toolName, { message, questionType, profile, jobs, applications })
    )
  };
}

function buildToolContext({ message, questionType, profile, jobs, applications }) {
  const targetRole = inferTargetRole(message);
  const toolRun = runSelectedAgentTools({ message, questionType, profile, jobs, applications });

  return {
    intent: questionType,
    targetRole,
    selectedTools: toolRun.selectedTools,
    toolOutputs: toolRun.outputs,
    profileCompleteness: toolRun.outputs.find((item) => item.tool === "profileAnalyzer")?.result || null,
    platformHelp: toolRun.outputs.find((item) => item.tool === "platformHelp")?.result || null,
    skillGapRoadmap: toolRun.outputs.find((item) => item.tool === "skillRoadmap")?.result || null,
    applicationSummary: toolRun.outputs.find((item) => item.tool === "applicationTracker")?.result || null,
    jobSearchContext: toolRun.outputs.find((item) => item.tool === "jobSearch")?.result || null
  };
}

function buildFallbackReply(message, profile = {}, jobs = [], toolContext = null, attachments = []) {
  const questionType = inferQuestionType(message);
  const normalizedMessage = normalizeMessage(message);
  const targetRole = inferTargetRole(message);
  const preferredRoles = (profile.preferredRoles || []).filter(Boolean);
  const skills = (profile.skills || []).slice(0, 8);
  const jobTitles = jobs.slice(0, 3).map((job) => job.title).filter(Boolean);
  const profileCompleteness = toolContext?.profileCompleteness || getProfileCompleteness(profile);
  const platformHelp = toolContext?.platformHelp;
  const applicationSummary = toolContext?.applicationSummary || summarizeApplications([]);
  const attachmentCount = Array.isArray(attachments) ? attachments.length : 0;
  const readableAttachments = (attachments || []).filter((attachment) => attachment.extractedText);

  if (attachmentCount && readableAttachments.length) {
    const snippets = readableAttachments
      .map((attachment) => `${attachment.fileName}: ${attachment.extractedText.slice(0, 600)}`)
      .join("\n\n");
    return `I reviewed the readable text from your attachment(s). Here are the main points I can use:\n\n${snippets}\n\nAsk me what you want to improve or compare, for example ATS fit, resume bullets, project wording, or job match.`;
  }

  if (attachmentCount && !readableAttachments.length) {
    return "I received your attachment, but I could not extract readable text from it. Please upload a text-based PDF/DOCX/TXT or paste the text you want me to review.";
  }

  if (questionType === "greeting") {
    if (/(how are you|how r u|how are u|how is it going|hows it going)/.test(normalizeMessage(message))) {
      return "I am doing well and ready to help. How are you doing? If you want, we can work on jobs, resumes, ATS score, interview prep, or your next career step.";
    }

    return "Hi! I am here and ready to help. Ask me about jobs, resumes, ATS score, profile gaps, interview prep, or auto-apply.";
  }

  if (questionType === "thanks") {
    return "You are welcome. Send me a role, job description, resume concern, or profile question and I will help with the next step.";
  }

  if (questionType === "goodbye") {
    return "Bye! Come back whenever you want help with jobs, resumes, applications, or interview preparation.";
  }

  if (/\b(weather|temperature|rain|raining|forecast)\b/.test(normalizedMessage)) {
    return "I do not have live weather access inside this app right now, so I cannot check today's real-time weather. Please check a weather app or search your city weather. If you want, I can still help you plan job-search tasks for today.";
  }

  if (/\bapi integration\b|\bapi\b.*\bintegration\b/.test(normalizedMessage)) {
    return "API integration means connecting one software system to another through an API, so they can exchange data or trigger actions. For example, a frontend can call a backend API to log in a user, fetch jobs, submit an application, upload a resume, or receive notifications. A good API integration usually includes authentication, request validation, clear response formats, error handling, retry/fallback behavior, and secure handling of secrets or tokens.";
  }

  if (/\bphotosynthesis\b/.test(normalizedMessage)) {
    return "Photosynthesis is the process plants, algae, and some bacteria use to convert sunlight into chemical energy. They take in carbon dioxide from the air and water from the soil, use chlorophyll to capture light energy, and produce glucose for energy while releasing oxygen as a byproduct. In simple terms: sunlight + water + carbon dioxide becomes food for the plant + oxygen.";
  }

  if (questionType === "skill_development") {
    if (targetRole && skillRoadmaps[targetRole]) {
      const roadmap = toolContext?.skillGapRoadmap?.roadmap || skillRoadmaps[targetRole];
      const projects = toolContext?.skillGapRoadmap?.recommendedProjects || [];
      return `For ${targetRole} jobs, build skills in this order:\n\n${roadmap.map((item) => `- ${item}`).join("\n")}\n\nProject ideas to prove these skills:\n${projects.map((item) => `- ${item}`).join("\n")}`;
    }

    return "Tell me the target role first, for example Backend Developer, QA Engineer, Data Analyst, or Frontend Developer. Then I can give you a focused skill roadmap. In general, build fundamentals, role-specific projects, Git, testing, deployment, and clear resume bullets.";
  }

  if (questionType === "platform_usage") {
    return platformHelp?.answer || "Inside SGETAI, use Profile for personal details, skills, education, projects, links, and background video. Use Search Jobs to apply, My Applications to track status, Resume Builder or Pro Tools for resume generation, ATS Checker for resume fit, and Pro Tools for auto-apply and the career agent.";
  }

  if (questionType === "resume_or_ats") {
    return `For resume or ATS improvement, compare the resume against the selected job. Put matching skills near the top, add project/experience bullets that prove those skills, include education, and avoid unsupported claims. Based on your profile, highlight ${skills.join(", ") || "your strongest relevant skills"}.`;
  }

  if (questionType === "job_search") {
    const jobSearchContext = toolContext?.jobSearchContext;
    const topJobs = jobSearchContext?.topJobs || [];

    const normalizedMsg = normalizeMessage(message);
    const wantsCompanies = /\b(compan|companies|company|employer|employers|who is hiring|who are hiring|organization|firm)\b/.test(normalizedMsg);
    const wantsLocations = /\b(location|locations|where|city|cities|remote|onsite|hybrid)\b/.test(normalizedMsg);
    const wantsTitles = /\b(role|roles|position|positions|title|titles|opening|openings|job|jobs)\b/.test(normalizedMsg);

    if (topJobs.length === 0) {
      return `No active job listings are available right now that match your profile. Try updating your preferred roles and skills so recommendations improve as new jobs are posted.`;
    }

    if (wantsCompanies && !wantsTitles) {
      const companies = [...new Set(topJobs.map((j) => j.company).filter((c) => c && c !== "Unknown company"))];
      if (!companies.length) {
        return `Company information is not available for the current job listings. Try viewing each job directly in Search Jobs for full company details.`;
      }
      return `Here are the companies currently hiring based on your profile:\n\n${companies.map((c, i) => `${i + 1}. ${c}`).join("\n")}\n\nYou can search for these in the Search Jobs page to view open roles and apply.`;
    }

    if (wantsLocations) {
      const locationLines = topJobs
        .filter((j) => j.location)
        .map((j) => `- ${j.title} at ${j.company !== "Unknown company" ? j.company : "a company"} — ${j.location}`);
      return `Here are the locations for current job openings:\n\n${locationLines.join("\n") || "Location data is not available for current listings."}`;
    }

    const jobLines = topJobs.slice(0, 6).map((j) => {
      const parts = [`**${j.title}**`];
      if (j.company && j.company !== "Unknown company") parts.push(`at ${j.company}`);
      if (j.location) parts.push(`— ${j.location}`);
      if (j.type) parts.push(`(${j.type})`);
      return `- ${parts.join(" ")}`;
    });

    return `Here are current job openings matched to your profile:\n\n${jobLines.join("\n")}\n\nOpen Search Jobs to apply. Tailor your resume to each job's required skills for best results.`;
  }

  if (questionType === "profile_improvement") {
    return `Your profile completeness is around ${profileCompleteness.score}%. Missing or weak sections: ${profileCompleteness.missing.join(", ") || "none"}. Complete these sections because they drive recommendations, resume generation, ATS scoring, and auto-apply quality.`;
  }

  if (applicationSummary?.total && /(application|applied|status)/.test(normalizeMessage(message))) {
    return `You currently have ${applicationSummary.total} application(s). Status split: ${Object.entries(applicationSummary.statusCounts).map(([status, count]) => `${status}: ${count}`).join(", ")}. Ask me about a specific application, resume score, job target, or skill gap and I can help you decide the next step.`;
  }

  if (questionType === "pro_features") {
    return "For Pro features, first make the profile complete. Auto-apply and AI resume generation work best when skills, preferred roles, projects, education, and links are filled in. Keep the auto-apply threshold above 55 so the system only applies to reasonable matches.";
  }

  if (questionType === "interview_prep") {
    return `For interview prep, prepare stories around your strongest evidence: ${skills.join(", ") || "your core skills"}, projects, and experience. Practice explaining what you built, why you chose the stack, tradeoffs, bugs solved, and measurable outcomes.`;
  }

  if (questionType === "general_knowledge") {
    return "My rule-based fallback does not have a built-in answer for that topic. The AI model (Ollama) should be answering this fully. If you are seeing this message, the Ollama service may be unavailable. Make sure Ollama is running: 'ollama serve'";
  }

  return "I can help with that. My AI backend seems temporarily unavailable or your question did not match a built-in topic. Please try again in a moment, or ask about jobs, resumes, skills, interview prep, or platform features and I will answer immediately.";
}

function buildFallbackResponse(message, profile = {}, jobs = [], applications = [], attachments = []) {
  const questionType = inferQuestionType(message);
  const toolContext = buildToolContext({ message, questionType, profile, jobs, applications });

  return {
    reply: buildFallbackReply(message, profile, jobs, toolContext, attachments),
    referencedJobs: questionType === "job_search"
      ? jobs.slice(0, 3).map((job) => ({ id: job._id, title: job.title }))
      : [],
    focusAreas: ["greeting", "thanks", "goodbye"].includes(questionType)
      ? []
      : buildFocusAreas(questionType, profile, message),
    reasoning: `Fallback response for ${questionType}; AI provider unavailable or returned invalid JSON.`,
    toolContext,
    selectedTools: toolContext.selectedTools,
    usedFallback: true,
    modelUsed: null
  };
}

// Phase 2: Lean context builder - selective, focused, fast
function buildSelectiveJobContext(jobs = [], questionType = "") {
  if (!jobs.length) return "";

  const isJobSearch = questionType === "job_search";

  // For job search, include full descriptions. For others, minimal.
  if (isJobSearch && jobs.length > 0) {
    return jobs.slice(0, 2).map((job, idx) => {
      const skills = (job.skillsRequired || []).slice(0, 5).join(", ");
      const desc = job.description ? job.description.slice(0, 300) : "";
      return `${idx + 1}. ${job.title} at ${job.organizationId?.companyName || "Unknown"}
   Location: ${job.location || "Remote"} | Type: ${job.type || "Full-time"}
   Skills: ${skills}${desc ? `\n   About: ${desc}...` : ""}`;
    }).join("\n\n");
  }

  // For other question types, minimal context
  return jobs.slice(0, 2).map((j, i) =>
    `${i + 1}. ${j.title} at ${j.organizationId?.companyName || "Unknown"}, ${j.location || "Remote"}`
  ).join("\n");
}

function buildAttachmentContextForPrompt(attachmentContext = []) {
  if (!Array.isArray(attachmentContext) || !attachmentContext.length) {
    return "";
  }

  return attachmentContext
    .map((attachment) => {
      if (attachment.extractedText) {
        // Include the full extracted resume text (already capped at 8000 chars upstream) so
        // the model can analyze every section rather than a truncated preview.
        return `File: ${attachment.fileName}\n"""\n${attachment.extractedText.slice(0, 8000)}\n"""`;
      }

      return `File: ${attachment.fileName} (no readable text extracted${attachment.note ? `: ${attachment.note}` : ""})`;
    })
    .join("\n\n");
}

function buildLeanToolContext(toolContext = null) {
  if (!toolContext) return "";

  const lines = [];

  // Only include critical info
  if (toolContext.profileCompleteness) {
    const pc = toolContext.profileCompleteness;
    if (pc.score < 70) {
      lines.push(`⚠️  Profile: ${pc.score}% complete. Missing: ${pc.missing.slice(0, 2).join(", ")}`);
    }
  }

  if (toolContext.jobSearchContext?.availableJobCount) {
    lines.push(`💼 Jobs: ${toolContext.jobSearchContext.availableJobCount} matches found`);
  }

  return lines.length > 0 ? "\nCONTEXT: " + lines.join(" | ") : "";
}

// Example responses for each intent type - teaches the model what "detailed" means
const exampleResponsesByIntent = {
  skill_development: {
    userQuestion: "What skills do I need to become a backend developer?",
    exampleResponse: {
      reply: "To become a backend developer, you should build expertise in 5 key areas:\n\n1. **Language & Fundamentals** - Master one backend language (Node.js, Java, Python, or Go). Learn OOP, async programming, and error handling deeply.\n\n2. **Database Design** - Understand both SQL (PostgreSQL, MySQL) and NoSQL (MongoDB). Learn schema design, indexing, query optimization, and transactions.\n\n3. **API Design & REST** - Build RESTful APIs with proper routing, validation, pagination, error handling, and status codes. Learn authentication (JWT, OAuth) and authorization.\n\n4. **Architecture Patterns** - Structure code with controllers, services, repositories, and middleware. Use design patterns for maintainability.\n\n5. **DevOps Basics** - Docker, CI/CD pipelines, environment management, logging, and basic deployment.\n\nIf you're starting from scratch, spend 2-3 months on Node.js fundamentals, then 2 months on Express + MongoDB, then 2 months building a real project. Document your learning path in your portfolio.",
      referencedJobs: [],
      focusAreas: ["Node.js", "REST APIs", "MongoDB", "Docker", "System Design"]
    }
  },
  job_search: {
    userQuestion: "What backend jobs are available for me?",
    exampleResponse: {
      reply: "I found 5 backend positions matching your profile based on your Node.js and React skills:\n\n1. **Senior Backend Engineer** at TechCorp — San Francisco, CA\nRequired: Node.js, PostgreSQL, Docker. Your match: 85% (you have all core skills)\nNext step: Review full job description and tailor resume to highlight your API design projects.\n\n2. **Backend Developer (Remote)** at StartupXYZ — Remote\nRequired: Node.js, MongoDB, REST APIs. Your match: 92% (strong fit)\nNext step: Perfect match! Apply today and highlight your experience with real-time features.\n\nFor each role, I'd recommend tailoring your resume to emphasize the required technologies and building a 1-sentence cover note about why the role excites you.",
      referencedJobs: [
        { id: "job1", title: "Senior Backend Engineer" },
        { id: "job2", title: "Backend Developer (Remote)" }
      ],
      focusAreas: ["Backend Development", "Node.js", "Database Design"]
    }
  },
  resume_or_ats: {
    userQuestion: "How do I improve my resume for ATS and recruiter review?",
    exampleResponse: {
      reply: "Your resume's ATS score improves when you align it with the job description. Here's a 3-step approach:\n\n**Step 1: Match Keywords** - Extract 10-15 required skills from the job posting. Ensure your resume includes these terms (even if implied). Example: if job requires 'REST API design', use that exact phrase, not just 'API'.\n\n**Step 2: Prioritize Relevant Evidence** - Put matching skills near the top of each bullet. Instead of 'Worked on various projects', write 'Built 3 REST APIs handling 10K+ daily requests using Node.js and PostgreSQL'.\n\n**Step 3: Structure Clearly** - Use standard sections: Contact, Summary, Experience, Education, Skills, Projects. ATS parsers work better with simple formatting (no columns, no graphics).\n\nBased on your profile, your key strengths are: Node.js (85% match), MongoDB (78% match), React (72% match). Front-load these in your experience bullets. Missing: Docker (appear in 45% of job posts). Consider adding a project that uses Docker to strengthen competitiveness.",
      referencedJobs: [],
      focusAreas: ["ATS Optimization", "Resume Keywords", "Skill Matching"]
    }
  },
  profile_improvement: {
    userQuestion: "What sections of my profile should I complete first?",
    exampleResponse: {
      reply: "Your profile is currently 68% complete. Completing these sections will have the biggest impact:\n\n**Priority 1 (Do This First):**\n- Add 3-4 key projects with descriptions and GitHub/portfolio links. This is the #1 signal recruiters look for.\n- List your top 8-10 technical skills with proficiency levels. This drives recommendations and ATS matching.\n\n**Priority 2 (Next):**\n- Write a 2-3 sentence career objective or headline. Example: 'Backend developer experienced with Node.js and MongoDB, seeking roles that challenge scalability and system design.'\n- Add any work experience, even internships or freelance work. Shows practical application of skills.\n\n**Priority 3 (Polish):**\n- Add education details (university, degree, graduation date).\n- Link to LinkedIn and GitHub profiles.\n- Record or write a brief video intro (optional but increases recruiter engagement by 40%).\n\nOnce you complete Priority 1 & 2, your profile score will jump to 92%, which unlocks better job recommendations and auto-apply matching. Estimated time: 45 minutes.",
      referencedJobs: [],
      focusAreas: ["Projects", "Skills", "Career Objective", "Experience"]
    }
  },
  interview_prep: {
    userQuestion: "How should I prepare for backend engineering interviews?",
    exampleResponse: {
      reply: "Backend interviews test 4 areas. Here's how to prepare each:\n\n**1. System Design (30% of interview)**\nStudy: Database scaling, caching, load balancing, microservices. Practice designing: user authentication system, real-time chat backend, e-commerce inventory system.\nYour advantage: MongoDB and REST API experience. Use these in your examples.\n\n**2. Coding & Problem-Solving (40%)**\nFocus: Data structures (arrays, trees, graphs), algorithms (sorting, searching), string manipulation. Practice on LeetCode Medium level.\nYour advantage: Node.js experience. Code solutions in JavaScript.\n\n**3. Technical Communication (20%)**\nAlways explain your approach before coding. Walk through examples. Ask clarifying questions.\nPrepare stories: 'Tell me about a project where you optimized database queries.' Use your portfolio projects.\n\n**4. Experience Deep Dives (10%)**\nPrepare to discuss your projects in detail: What did you build? Why that tech stack? What challenges? What would you do differently?\nYour projects: {projects from profile}. Practice explaining these with technical depth (5 min per project).\n\nAllocate 2 weeks: Week 1 - system design, Week 2 - coding practice. Interview is 1-2 weeks away. Start today.",
      referencedJobs: [],
      focusAreas: ["System Design", "Algorithms", "Backend Fundamentals"]
    }
  }
};

function formatToolContextForPrompt(toolContext) {
  if (!toolContext) return "";

  const parts = [];

  if (toolContext.profileCompleteness) {
    const pc = toolContext.profileCompleteness;
    parts.push(
      `Profile Status: ${pc.score}% complete. ` +
      `Completed: ${pc.completed.join(", ") || "none"}. ` +
      `Missing: ${pc.missing.join(", ") || "none"}. ` +
      `Impact: ${pc.recommendation}`
    );
  }

  if (toolContext.skillGapRoadmap) {
    const sg = toolContext.skillGapRoadmap;
    parts.push(
      `Target Role: ${sg.targetRole}. Skill Gaps: Already have ${sg.likelyPresent.length} of ${sg.roadmap.length} recommended skills. ` +
      `Recommended next steps: ${sg.roadmap.slice(0, 3).join(", ")}`
    );
  }

  if (toolContext.jobSearchContext?.topJobs?.length) {
    const jobs = toolContext.jobSearchContext.topJobs;
    parts.push(
      `Job Market: Found ${toolContext.jobSearchContext.availableJobCount} matching positions. ` +
      `Top matches: ${jobs.slice(0, 2).map(j => `${j.title} at ${j.company}`).join(", ")}`
    );
  }

  if (toolContext.applicationSummary?.total) {
    const as = toolContext.applicationSummary;
    parts.push(
      `Applications: ${as.total} total. Status: ${Object.entries(as.statusCounts).map(([s, c]) => `${s}(${c})`).join(", ")}`
    );
  }

  return parts.length > 0 ? "\n" + parts.join("\n") : "";
}

// Phase 2: Optimized prompt builder - faster, leaner, but richer
function buildCareerAgentPrompt({
  message,
  questionType,
  profileContext,
  historyContext,
  jobsContext,
  toolContext,
  attachmentContext
}) {
  const compactProfile = {
    name: (profileContext.name || "").trim().split(/\s+/)[0] || "",
    title: profileContext.currentRole || "",
    skills: Array.isArray(profileContext.skills) ? profileContext.skills.slice(0, 6) : [],
    experience: profileContext.yearsOfExperience || 0
  };

  // Phase 2: Only include MOST RECENT message (not 3) for lean prompt
  const compactHistory = Array.isArray(historyContext) && historyContext.length > 0
    ? [`${historyContext[historyContext.length - 1].role || "User"}: ${(historyContext[historyContext.length - 1].content || "").slice(0, 100)}`]
    : [];

  // Phase 2: Selective job context (lean or rich based on question type)
  const jobContextStr = buildSelectiveJobContext(jobsContext || [], questionType);

  // Lean tool context (only critical info)
  const toolContextStr = buildLeanToolContext(toolContext);

  // Attachment text (e.g. resume content) must reach the model to produce a real analysis
  const attachmentContextStr = buildAttachmentContextForPrompt(attachmentContext);
  const hasAttachment = Boolean(attachmentContextStr);

  const candidateLine = `${compactProfile.name || "User"} (${compactProfile.title || "Job seeker"}, ${compactProfile.experience}y exp${compactProfile.skills.length ? `, skills: ${compactProfile.skills.slice(0, 6).join(", ")}` : ""})`;

  // Only questions that are actually ABOUT the candidate's own resume/profile/attachment need the
  // strict "don't invent resume facts" grounding rule. A general-knowledge question like "how
  // does an ML engineer work" isn't asking the model to analyze the user's resume at all, so
  // forcing that rule onto it just makes the model uselessly refuse to answer / repeatedly point
  // out what's missing from their profile instead of actually answering the question. A
  // "remembered" document from an earlier turn keeps hasAttachment true for the rest of the
  // conversation, so it must not force grounding onto later, unrelated general-knowledge/small-talk
  // questions either — mirrors the same carve-out used for tool selection above.
  const isResumeGroundedIntent =
    ["resume_or_ats", "profile_improvement"].includes(questionType) ||
    (hasAttachment && !["general_knowledge", "general_career", "greeting", "thanks", "goodbye"].includes(questionType));

  // Free-form markdown prompt. We deliberately DO NOT ask for JSON: forcing a JSON grammar
  // on small local models makes them emit a one-line stub. Prose gives reliable, detailed output.
  const finalPrompt = `You are SGETAI's career advisor. Answer the user's question directly, in detailed and well-structured markdown (use ## headers and - bullet points).

STRICT RULES:
${isResumeGroundedIntent
    ? `- Ground every statement ONLY in the CANDIDATE PROFILE and ATTACHED DOCUMENT(S) below. Never invent projects, employers, technologies, dates, or metrics that are not written there. If the user asks about their own resume/profile and something specific is not present, say plainly that it is not in the resume/profile.`
    : `- This is a general career/knowledge question, not a request to analyze the candidate's resume. Answer it directly and informatively using your own knowledge. Only bring in the CANDIDATE PROFILE below if it's genuinely useful for personalizing the advice (e.g. relating it to their background) — do not refuse to answer, and do not repeatedly point out what is missing from their resume just because the topic isn't mentioned in it.`}
- Write the ACTUAL detailed answer. Never reply with only an introduction such as "Here's a breakdown..." and then stop — produce the full content itself.
- Refer to real names from the documents (actual project titles, companies, skills) when discussing the candidate's own background.
- If greeting the user, address them by their first name from the CANDIDATE PROFILE line below (e.g. "Hello ${compactProfile.name || "there"},"). SGETAI is the name of the platform, not the user — never greet the user as "SGETAI" or by the platform name.
- Length: aim for 200-500 words for analysis questions; keep greetings short.${hasAttachment ? `
- A document is attached. Read it carefully section by section (Objective, Education, Experience, Projects, Skills, Achievements, Certifications) before answering, and base your answer on its real contents.` : ""}

CANDIDATE PROFILE: ${candidateLine}${toolContextStr}
${compactHistory.length > 0 ? `\nPRIOR MESSAGE: ${compactHistory[0]}` : ""}${jobContextStr ? `\n\nRELEVANT JOBS:\n${jobContextStr}` : ""}${attachmentContextStr ? `\n\nATTACHED DOCUMENT(S):\n${attachmentContextStr}` : ""}

USER QUESTION: ${message}

Now write the detailed markdown answer:`;

  return finalPrompt;
}


async function chatWithCareerAgentOllama(message, history, profile, jobs, applications = [], attachments = []) {
  const questionType = inferQuestionType(message);
  const toolContext = buildToolContext({
    message,
    questionType,
    profile: profile || {},
    jobs: jobs || [],
    applications: applications || []
  });
  const attachmentContext = compactAttachmentsForAgent(attachments || []);
  const fallback = buildFallbackResponse(
    message,
    profile || {},
    jobs || [],
    applications || [],
    attachmentContext
  );

  try {
    const model = getCareerAgentModel();

    const prompt = buildCareerAgentPrompt({
      message,
      questionType,
      profileContext: compactProfileForAgent(profile || {}),
      historyContext: compactHistoryForAgent(history || []),
      jobsContext: compactJobsForAgent(jobs || []),
      toolContext,
      attachmentContext
    });

    const isShortFormIntent = ["greeting", "thanks", "goodbye"].includes(questionType);
    const MAX_ATTEMPTS = 2;

    // Providers are tried in order: Gemini (cloud) first when a usable API key is configured,
    // then the local Ollama model as a fallback. Each provider gets up to MAX_ATTEMPTS tries
    // before moving on. If every provider fails, we fall back to the rule-based canned reply.
    //
    // THE BUDGET IS TOTAL, NOT PER ATTEMPT. Per-attempt timeouts multiply: two providers times two
    // attempts each used to mean four full timeouts back to back, and with Ollama's old ten-minute
    // ceiling that was a request the browser could sit on for the better part of an hour. Nothing
    // in front of it waits that long, so the socket died and the user got "Failed to fetch" instead
    // of the rule-based reply this function is careful to always produce. Every provider call now
    // gets whatever is LEFT of the budget, and the loop stops the moment it is spent.
    const deadline = Date.now() + CAREER_AGENT_TOTAL_BUDGET_MS;
    const remainingMs = () => deadline - Date.now();

    const providers = [];
    if (hasGeminiKey()) {
      providers.push({
        name: "gemini",
        label: "Gemini",
        call: (timeoutMs) => generateCareerAgentReplyGemini(prompt, { timeoutMs })
      });
    }
    providers.push({
      name: "ollama",
      label: "Ollama",
      call: (timeoutMs) => generateCareerAgentReplyOllama(prompt, model, { timeoutMs })
    });

    let lastAttemptInfo = "no attempt completed";
    // Collected so the caller can tell the user something specific ("Ollama is not running")
    // rather than the generic canned line, and so the reason survives into the response body.
    const providerFailures = [];

    for (const provider of providers) {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        const budgetLeft = remainingMs();

        // A provider needs a workable slice to be worth starting at all. Firing one off with two
        // seconds left just burns the tail of the budget and guarantees a timeout.
        if (budgetLeft < MIN_PROVIDER_SLICE_MS) {
          lastAttemptInfo = `ran out of time before ${provider.label} could be tried (budget ${(CAREER_AGENT_TOTAL_BUDGET_MS / 1000).toFixed(0)}s exhausted).`;
          console.warn(`[CareerAgent] ${lastAttemptInfo}`);
          break;
        }

        console.log(`[CareerAgent] Calling ${provider.label} (attempt ${attempt}/${MAX_ATTEMPTS}, ${(budgetLeft / 1000).toFixed(0)}s of budget left)`);

        const { text: rawReply, failure } = await provider.call(budgetLeft);

        // FAIL FAST. A refused connection, a rejected API key or an exhausted quota will fail the
        // same way every time - retrying it only spends budget the NEXT provider needs. Only a
        // genuinely transient failure earns a second attempt.
        if (failure && !failure.retryable) {
          lastAttemptInfo = `${provider.label}: ${failure.message}`;
          console.warn(`[CareerAgent] ${lastAttemptInfo} - not retrying this provider.`);
          providerFailures.push({ provider: provider.name, kind: failure.kind, message: failure.message });
          break;
        }

        const trimmedReply = cleanModelText(rawReply).trim();

        if (!trimmedReply) {
          lastAttemptInfo = failure ? `${provider.label}: ${failure.message}` : `${provider.label} returned an empty response.`;
          console.warn(`[CareerAgent] ${lastAttemptInfo} (attempt ${attempt}/${MAX_ATTEMPTS})`);
          continue;
        }

        const replyWordCount = trimmedReply.split(/\s+/).filter(Boolean).length;
        // A small local model (Ollama) can pad past a word-count floor while only describing
        // what it's about to do (e.g. "I've used bullet points...") without ever using any, so
        // it needs a stricter check: require real structure (bullets/numbered items/bold
        // headers) unless the answer is long enough to stand on its own. Gemini is far less
        // prone to that failure mode and often gives a perfectly good plain-prose answer with no
        // markdown structure at all, so it only needs a basic non-trivial-length check.
        const structureMarkerCount =
          (trimmedReply.match(/(^|\n)\s*(-|\*|•|\d+\.)\s+/g) || []).length +
          (trimmedReply.match(/(^|\n)#{1,6}\s+/g) || []).length +
          (trimmedReply.match(/\*\*[^*]+\*\*/g) || []).length;
        const modelReplyIsUsable = Boolean(trimmedReply) && (
          isShortFormIntent ||
          (provider.name === "gemini"
            ? replyWordCount >= 15
            : replyWordCount >= 15 && (structureMarkerCount >= 1 || replyWordCount >= 150))
        );

        if (modelReplyIsUsable) {
          // Structured fields (referencedJobs/focusAreas) are derived deterministically from the
          // tool context, not parsed from the model — the model only produces the prose reply.
          return {
            reply: trimmedReply,
            referencedJobs: fallback.referencedJobs,
            focusAreas: fallback.focusAreas,
            reasoning: `AI response generated by ${provider.label}, grounded in profile and attachments.`,
            toolContext,
            selectedTools: toolContext.selectedTools,
            usedFallback: false,
            modelUsed: provider.name
          };
        }

        lastAttemptInfo = `${provider.label} returned an unusable reply (${replyWordCount} words, ${structureMarkerCount} structure markers).`;
        console.warn(`[CareerAgent] ${lastAttemptInfo} (attempt ${attempt}/${MAX_ATTEMPTS})`);
      }
    }

    return {
      ...fallback,
      reasoning: `${fallback.reasoning} ${lastAttemptInfo} (after trying: ${providers.map((provider) => provider.label).join(", ")})`,
      usedFallback: true,
      modelUsed: null,
      // Machine-readable so the widget can say WHICH thing is down instead of the generic canned
      // line. Never contains candidate data - only provider names and failure kinds.
      providerFailures
    };
  } catch (error) {
    console.error("[CareerAgent] Error calling AI provider:", error.message);
    return {
      ...fallback,
      reasoning: `${fallback.reasoning} AI request failed: ${error.message}`,
      usedFallback: true,
      modelUsed: null,
      providerFailures: [{ provider: "chain", kind: "error", message: error.message }]
    };
  }
}

async function chatWithRagAgent(message, history, profile, jobs, applications = [], attachments = []) {
  return chatWithCareerAgentOllama(message, history, profile, jobs, applications, attachments);
}

module.exports = {
  chatWithRagAgent,
  inferQuestionType,
  platformKnowledge,
  getProfileCompleteness,
  getSkillGapRoadmap,
  getPlatformHelp,
  compactProfileForAgent,
  compactJobsForAgent,
  compactHistoryForAgent,
  buildToolContext,
  selectAgentTools,
  runSelectedAgentTools,
  buildFallbackResponse
};
