const { generateJsonCompletion } = require("./ollamaService");

const CURRENT_STATUS_VALUES = ["Student", "Professional", "Unemployed"];
const MAX_TEXT_CHARS = 8000;
const MAX_ATTEMPTS = 2;

function getParserModel() {
  return process.env.CAREER_AGENT_MODEL || process.env.OLLAMA_ANALYSIS_MODEL || "qwen2.5:7b";
}

// ---------------------------------------------------------------------------
// Deterministic backstop: contact details are extracted directly from the text
// with regex, so they fill reliably even when the local model output is weak.
// ---------------------------------------------------------------------------
function normalizeUrl(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function extractContactInfo(text = "") {
  const source = String(text || "");
  const contact = {};

  const emailMatch = source.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) {
    contact.email = emailMatch[0].trim();
  }

  const linkedinMatch = source.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/(?:in|pub)\/[A-Za-z0-9_%-]+\/?/i);
  if (linkedinMatch) {
    contact.linkedinUrl = normalizeUrl(linkedinMatch[0]);
  }

  const githubMatch = source.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[A-Za-z0-9_-]+\/?/i);
  if (githubMatch) {
    contact.githubUrl = normalizeUrl(githubMatch[0]);
  }

  // Phone: find candidate sequences, then keep the first with 10-13 digits so we
  // do not accidentally match years or GPAs.
  const phoneCandidates = source.match(/\+?\d[\d\s()\-]{7,}\d/g) || [];
  for (const candidate of phoneCandidates) {
    const digits = candidate.replace(/\D/g, "");
    if (digits.length >= 10 && digits.length <= 13) {
      contact.phone = candidate.trim().replace(/\s+/g, " ");
      break;
    }
  }

  // Portfolio: the first http(s) URL that is not linkedin/github.
  const urlCandidates = source.match(/https?:\/\/[^\s)]+/gi) || [];
  const portfolio = urlCandidates.find(
    (url) => !/linkedin\.com|github\.com/i.test(url)
  );
  if (portfolio) {
    contact.portfolioUrl = portfolio.trim().replace(/[.,;]+$/, "");
  }

  return contact;
}

// ---------------------------------------------------------------------------
// Value coercion helpers
// ---------------------------------------------------------------------------
function cleanString(value, maxLength = 500) {
  return String(value === null || value === undefined ? "" : value)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function cleanLongString(value, maxLength = 3000) {
  return String(value === null || value === undefined ? "" : value)
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxLength);
}

function cleanStringList(values = [], maxItems = 60, maxLength = 80) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => cleanString(value, maxLength))
      .filter(Boolean)
  )].slice(0, maxItems);
}

function toYear(value) {
  const match = String(value === null || value === undefined ? "" : value).match(/(19|20)\d{2}/);
  if (!match) return undefined;
  const year = Number(match[0]);
  return year >= 1950 && year <= 2100 ? year : undefined;
}

function toNumber(value, { min, max } = {}) {
  const num = Number(String(value === null || value === undefined ? "" : value).replace(/[^\d.]/g, ""));
  if (!Number.isFinite(num)) return undefined;
  if (min !== undefined && num < min) return undefined;
  if (max !== undefined && num > max) return undefined;
  return num;
}

const MONTHS = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12"
};

// Turn loose resume date strings into an ISO date (YYYY-MM-DD) for date inputs.
// "present"/"current"/"pursuing"/"ongoing" map to null (open-ended).
function parseLooseDate(value, { isEnd = false } = {}) {
  const raw = String(value === null || value === undefined ? "" : value).trim();
  if (!raw) return null;

  if (/present|current|pursuing|ongoing|now|till date|to date/i.test(raw)) {
    return null;
  }

  // Explicit YYYY-MM-DD already
  const iso = raw.match(/(19|20)\d{2}-\d{2}-\d{2}/);
  if (iso) return iso[0];

  // Month name + year, e.g. "Mar 2026" or "March 2026"
  const monthYear = raw.match(/([A-Za-z]{3,})\.?\s+((?:19|20)\d{2})/);
  if (monthYear) {
    const monthKey = monthYear[1].slice(0, 3).toLowerCase();
    const month = MONTHS[monthKey];
    if (month) {
      return `${monthYear[2]}-${month}-01`;
    }
  }

  // Bare year
  const year = toYear(raw);
  if (year) {
    return isEnd ? `${year}-12-31` : `${year}-01-01`;
  }

  return null;
}

function normalizeCurrentStatus(value) {
  const cleaned = cleanString(value, 40);
  const match = CURRENT_STATUS_VALUES.find(
    (status) => status.toLowerCase() === cleaned.toLowerCase()
  );
  return match || undefined;
}

// ---------------------------------------------------------------------------
// Array section normalizers
// ---------------------------------------------------------------------------
function normalizeEducation(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      institution: cleanString(item.institution),
      degree: cleanString(item.degree),
      fieldOfStudy: cleanString(item.fieldOfStudy || item.major),
      startDate: parseLooseDate(item.startDate),
      endDate: parseLooseDate(item.endDate, { isEnd: true })
    }))
    .filter((item) => item.institution || item.degree || item.fieldOfStudy)
    .slice(0, 10);
}

function normalizeExperience(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const endDate = parseLooseDate(item.endDate, { isEnd: true });
      const isCurrent =
        Boolean(item.isCurrent) ||
        /present|current|ongoing|now/i.test(String(item.endDate || ""));
      return {
        jobTitle: cleanString(item.jobTitle || item.title),
        companyName: cleanString(item.companyName || item.company),
        startDate: parseLooseDate(item.startDate),
        endDate: isCurrent ? null : endDate,
        isCurrent,
        description: cleanLongString(item.description)
      };
    })
    .filter((item) => item.jobTitle || item.companyName)
    .slice(0, 15);
}

function normalizeProjects(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      title: cleanString(item.title || item.name),
      description: cleanLongString(item.description),
      projectUrl: item.projectUrl ? normalizeUrl(item.projectUrl) : "",
      repositoryUrl: item.repositoryUrl ? normalizeUrl(item.repositoryUrl) : ""
    }))
    .filter((item) => item.title)
    .slice(0, 15);
}

function normalizeSkillGroups(groups = []) {
  return (Array.isArray(groups) ? groups : [])
    .map((group) => ({
      category: cleanString(group.category, 60),
      skills: cleanStringList(group.skills, 40)
    }))
    .filter((group) => group.category || group.skills.length)
    .slice(0, 12);
}

function normalizeTitledList(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      title: cleanString(typeof item === "string" ? item : item.title, 160),
      description: cleanLongString(typeof item === "string" ? "" : item.description, 800)
    }))
    .filter((item) => item.title)
    .slice(0, 15);
}

// A custom-section entry can be a bare term (e.g. a course name — only "title" fills) or a
// dated role/activity (title + organization + dates + description), so every field beyond
// "title" is optional and simply stays blank for the flat-list shape.
function normalizeCustomSectionEntry(item) {
  if (typeof item === "string") {
    return {
      title: cleanString(item, 160),
      organization: "",
      startDate: null,
      endDate: null,
      description: ""
    };
  }

  return {
    title: cleanString(item?.title || item?.name, 160),
    organization: cleanString(item?.organization, 160),
    startDate: parseLooseDate(item?.startDate),
    endDate: parseLooseDate(item?.endDate, { isEnd: true }),
    description: cleanLongString(item?.description, 800)
  };
}

function normalizeAdditionalSections(sections = []) {
  return (Array.isArray(sections) ? sections : [])
    .map((section) => ({
      title: cleanString(section?.sectionTitle || section?.title, 120),
      entries: (Array.isArray(section?.entries) ? section.entries : [])
        .map(normalizeCustomSectionEntry)
        .filter((entry) => entry.title)
        .slice(0, 30)
    }))
    .filter((section) => section.title && section.entries.length)
    .slice(0, 8);
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------
function buildResumeParsePrompt(text) {
  return `You are a precise resume parser. Read the RESUME TEXT and extract the candidate's details into JSON.

STRICT RULES:
- Use ONLY information present in the resume text. Do NOT invent or guess any value.
- If a field is not present, use an empty string "" (or an empty array [] for lists). Never fabricate.
- Copy names, companies, institutions, and technologies exactly as written.
- currentStatus must be exactly one of: "Student", "Professional", "Unemployed" (infer from the resume; if unsure use "").
- If the resume has a section that clearly doesn't belong in any of the fixed fields above (e.g. "Relevant Coursework", "Extracurricular Activities", "Publications", "Volunteer Experience", "Languages"), put it in "additionalSections" using its own heading as "sectionTitle". Do NOT duplicate content already captured by education/experience/projects/certifications/achievements/skills there.
- A flat list section (e.g. course names with no dates or descriptions) should produce entries with only "title" filled — leave "organization"/"startDate"/"endDate"/"description" empty. A dated role/activity entry should fill whichever of those fields the resume actually states.

Return ONLY this JSON object (no extra text):
{
  "firstName": "",
  "lastName": "",
  "phone": "",
  "email": "",
  "careerObjective": "",
  "currentStatus": "",
  "linkedinUrl": "",
  "githubUrl": "",
  "portfolioUrl": "",
  "universityName": "",
  "degree": "",
  "major": "",
  "graduationYear": "",
  "currentGPA": "",
  "skills": [],
  "preferredRoles": [],
  "skillGroups": [{ "category": "", "skills": [] }],
  "education": [{ "institution": "", "degree": "", "fieldOfStudy": "", "startDate": "", "endDate": "" }],
  "experience": [{ "jobTitle": "", "companyName": "", "startDate": "", "endDate": "", "isCurrent": false, "description": "" }],
  "projects": [{ "title": "", "description": "", "projectUrl": "", "repositoryUrl": "" }],
  "certifications": [{ "title": "", "description": "" }],
  "achievements": [{ "title": "", "description": "" }],
  "additionalSections": [{ "sectionTitle": "", "entries": [{ "title": "", "organization": "", "startDate": "", "endDate": "", "description": "" }] }]
}

Notes:
- "universityName"/"degree"/"major"/"graduationYear"/"currentGPA" describe the most recent or highest education; also include every institution in the "education" array.
- Put each "Category: skill, skill" line from a Skills section into "skillGroups", and also list every individual skill in "skills".
- Dates may be years like "2020" or "Mar 2026"; keep them as written. Use "Present" for ongoing.

RESUME TEXT:
"""
${String(text || "").slice(0, MAX_TEXT_CHARS)}
"""`;
}

// ---------------------------------------------------------------------------
// Normalization of the full parsed object
// ---------------------------------------------------------------------------
function normalizeParsedProfile(raw = {}) {
  const skillGroups = normalizeSkillGroups(raw.skillGroups);
  const groupedSkills = skillGroups.flatMap((group) => group.skills);

  return {
    firstName: cleanString(raw.firstName, 80),
    lastName: cleanString(raw.lastName, 80),
    phone: cleanString(raw.phone, 40),
    email: cleanString(raw.email, 160),
    careerObjective: cleanLongString(raw.careerObjective, 1200),
    currentStatus: normalizeCurrentStatus(raw.currentStatus),
    linkedinUrl: raw.linkedinUrl ? normalizeUrl(raw.linkedinUrl) : "",
    githubUrl: raw.githubUrl ? normalizeUrl(raw.githubUrl) : "",
    portfolioUrl: raw.portfolioUrl ? normalizeUrl(raw.portfolioUrl) : "",
    universityName: cleanString(raw.universityName, 160),
    degree: cleanString(raw.degree, 120),
    major: cleanString(raw.major, 120),
    graduationYear: toYear(raw.graduationYear),
    currentGPA: toNumber(raw.currentGPA, { min: 0, max: 100 }),
    skills: cleanStringList([...(Array.isArray(raw.skills) ? raw.skills : []), ...groupedSkills]),
    preferredRoles: cleanStringList(raw.preferredRoles, 12),
    skillGroups,
    education: normalizeEducation(raw.education),
    experience: normalizeExperience(raw.experience),
    projects: normalizeProjects(raw.projects),
    certifications: normalizeTitledList(raw.certifications),
    achievements: normalizeTitledList(raw.achievements),
    additionalSections: normalizeAdditionalSections(raw.additionalSections)
  };
}

// A parse is "usable" if the model returned enough real structure to be worth showing.
function isUsableDraft(draft) {
  if (!draft) return false;
  const filledScalars = [
    draft.firstName,
    draft.lastName,
    draft.careerObjective,
    draft.universityName
  ].filter(Boolean).length;
  const filledArrays =
    draft.skills.length +
    draft.education.length +
    draft.experience.length +
    draft.projects.length;
  return filledScalars >= 1 || filledArrays >= 2;
}

// Contact fields from the deterministic backstop win only where the model left blanks.
function applyContactBackstop(draft, contact) {
  const merged = { ...draft };
  ["phone", "email", "linkedinUrl", "githubUrl", "portfolioUrl"].forEach((field) => {
    if (!merged[field] && contact[field]) {
      merged[field] = contact[field];
    }
  });
  return merged;
}

function emptyDraft() {
  return normalizeParsedProfile({});
}

async function parseResumeToProfile(text) {
  const contact = extractContactInfo(text);
  const model = getParserModel();
  const warnings = [];
  let draft = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    console.log(`[ResumeParser] Parsing resume with ${model} (attempt ${attempt}/${MAX_ATTEMPTS})`);
    const raw = await generateJsonCompletion(buildResumeParsePrompt(text), model);
    const candidate = raw ? normalizeParsedProfile(raw) : null;

    if (candidate && isUsableDraft(candidate)) {
      draft = candidate;
      break;
    }
  }

  let usedFallback = false;
  if (!draft) {
    usedFallback = true;
    draft = emptyDraft();
    warnings.push(
      "We couldn't automatically read most of your resume. We filled in the contact details we could detect — please complete the rest manually."
    );
  }

  draft = applyContactBackstop(draft, contact);

  if (!draft.firstName && !draft.lastName) {
    warnings.push("Couldn't detect your name — please add it.");
  }
  if (!draft.education.length && !draft.universityName) {
    warnings.push("Couldn't detect education details — please review that section.");
  }

  return { draft, warnings, usedFallback };
}

module.exports = {
  parseResumeToProfile,
  // exported for unit testing
  extractContactInfo,
  normalizeParsedProfile,
  parseLooseDate
};
