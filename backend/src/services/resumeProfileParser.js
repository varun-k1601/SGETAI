const { generateJsonCompletion: generateJsonCompletionOllama } = require("./ollamaService");
const {
  generateJsonCompletion: generateJsonCompletionGemini,
  hasUsableApiKey: hasGeminiKey
} = require("./geminiGenerativeService");

const CURRENT_STATUS_VALUES = ["Student", "Professional", "Unemployed"];
const MAX_TEXT_CHARS = 8000;
const MAX_ATTEMPTS = 2;

/* TOTAL wall-clock budget for extracting a resume, across every provider and every attempt.
   It is the rung of the timeout ladder that this file owns:

     Gemini 60s / Ollama (whatever is left)  <  THIS 110s  <  nginx proxy_read_timeout 150s
                                                           <  frontend DEFAULT_TIMEOUT_MS 180s

   THE BUDGET IS TOTAL, NOT PER ATTEMPT, and that is the whole point. This used to be MAX_ATTEMPTS
   multiplied by ollamaService's 140s per-request ceiling, so a parse could legitimately run for
   280 SECONDS before falling back - measured, not estimated, on a real two-page resume. Nothing in
   front of it waits that long: nginx cuts the connection at 150s and answers with its own 504,
   which carries none of the backend's CORS headers, so the browser cannot read it and reports a
   bare "Failed to fetch". The user got a dead request with no server-side error at all.

   110s keeps 40s of headroom under nginx so the INNERMOST layer always fires first and the
   candidate gets a real message. Raising it means raising proxy_read_timeout in nginx.conf and
   DEFAULT_TIMEOUT_MS in frontend/src/services/api.js, in that order - change one rung and you must
   re-check the rest. */
const RESUME_PARSE_TOTAL_BUDGET_MS = Number(process.env.RESUME_PARSE_TOTAL_BUDGET_MS) || 110000;

// Below this much remaining budget a provider cannot plausibly finish, so we stop rather than
// start a call we already know will time out. 12s because Gemini's API rejects any deadline under
// 10s outright - a thinner slice can only produce a wasted attempt, never an answer.
const MIN_PROVIDER_SLICE_MS = Number(process.env.RESUME_PARSE_MIN_PROVIDER_SLICE_MS) || 12000;

function getParserModel() {
  return process.env.RESUME_PARSER_MODEL || process.env.CAREER_AGENT_MODEL || process.env.OLLAMA_ANALYSIS_MODEL || "qwen2.5:7b";
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

/* Takes the FIRST numeric token, rather than stripping every non-digit and reading what is left.
   That distinction is load-bearing for a GPA, which almost always arrives carrying its scale.
   Stripping turns "3.68/4" into the string "3.684" and then into the number 3.684 - a value the
   candidate never had, silently wrong in the last digit, and impossible to spot by eye. It is the
   value currently stored on a real profile. Reading the first token instead gives 3.68 from
   "3.68/4", 8.68 from "8.68/10" and 78.4 from "78.4%".

   The scalar is inherently lossy this way - 8.68 alone cannot say whether the scale was 10 or 4 -
   which is exactly why education[].gpa keeps the STRING untouched. This scalar exists only to
   satisfy the legacy `currentGPA` Number field. */
function toNumber(value, { min, max } = {}) {
  const match = String(value === null || value === undefined ? "" : value).match(/\d+(?:\.\d+)?/);
  if (!match) return undefined;
  const num = Number(match[0]);
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
/* `gpa` is kept as a STRING and never converted. A resume states "8.68/10", "3.68/4", "78.4%" or
   "First Class with Distinction", and the scale is half the fact: 8.68 parsed to a Number is
   indistinguishable from a 4-point GPA that would be impossible. cleanString trims and bounds the
   length; nothing else touches it, so whatever scale the candidate wrote survives to the PDF. */
function normalizeEducation(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      institution: cleanString(item.institution),
      degree: cleanString(item.degree),
      fieldOfStudy: cleanString(item.fieldOfStudy || item.major),
      gpa: cleanString(item.gpa || item.cgpa || item.grade || item.percentage, 40),
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
- You are TRANSCRIBING, not writing. Every value you output must be COPIED VERBATIM from the
  resume text. You are not permitted to summarise, paraphrase, improve, correct, complete or
  "clean up" anything.
- COPY EXACTLY, CHARACTER FOR CHARACTER: every number, percentage, rank, score, GPA, date, date
  range, employer name, institution name, job title, credential name and metric. Changing a single
  digit of an exam rank or a percentage is a serious error — it misrepresents the candidate on a
  document an employer will rely on. If a number is "AIR 2174", write "AIR 2174", never "AIR 2034".
- If you cannot read a section clearly, output an EMPTY string for it. NEVER write a plausible
  substitute. An empty description is correct; an invented one is a failure.
- Do NOT write generic accomplishment bullets. If the resume does not state that someone "led a
  migration", "mentored N engineers", "reduced deploy time" or "supported N concurrent users",
  those words must not appear in your output. A description you compose yourself, however
  realistic, is fabrication.
- Every description you output must consist of words that appear in the resume text.
- Use ONLY information present in the resume text. Do NOT invent or guess any value.
- If a field is not present, use an empty string "" (or an empty array [] for lists). Never fabricate.
- Copy names, companies, institutions, and technologies exactly as written.
- currentStatus must be exactly one of: "Student", "Professional", "Unemployed" (infer from the resume; if unsure use "").
- If the resume has a section that clearly doesn't belong in any of the fixed fields above (e.g. "Relevant Coursework", "Extracurricular Activities", "Publications", "Volunteer Experience", "Languages"), put it in "additionalSections" using its own heading as "sectionTitle". Do NOT duplicate content already captured by education/experience/projects/certifications/achievements/skills there.
- In an "additionalSections" entry, "title" is the ORGANISATION, body, club, course or activity name ("NSS", "Data Structures", "Chess Club") and "organization" is the candidate's ROLE or position within it ("Volunteer", "Secretary", "Captain"). Do not swap them. Put any date range in "startDate"/"endDate" - never inside "title".
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
  "education": [{ "institution": "", "degree": "", "fieldOfStudy": "", "gpa": "", "startDate": "", "endDate": "" }],
  "experience": [{ "jobTitle": "", "companyName": "", "startDate": "", "endDate": "", "isCurrent": false, "description": "" }],
  "projects": [{ "title": "", "description": "", "projectUrl": "", "repositoryUrl": "" }],
  "certifications": [{ "title": "", "description": "" }],
  "achievements": [{ "title": "", "description": "" }],
  "additionalSections": [{ "sectionTitle": "", "entries": [{ "title": "", "organization": "", "startDate": "", "endDate": "", "description": "" }] }]
}

Notes:
- "universityName"/"degree"/"major"/"graduationYear"/"currentGPA" describe the most recent or highest education; also include every institution in the "education" array.
- Each entry in "education" has its OWN "gpa". Copy it EXACTLY as printed, INCLUDING THE SCALE: "8.68/10", "3.68/4", "78.4%", "First Class". Never convert between scales and never drop the "/10" or the "%" - a grade without its scale is unreadable. A resume commonly prints a different grade for each degree; fill in every one you can see, and leave "gpa" empty for any degree that shows none.
- Put each "Category: skill, skill" line from a Skills section into "skillGroups", and also list every individual skill in "skills".
- "skills" must ALSO include every technology, tool, framework, library, platform or database NAMED anywhere in the experience and project descriptions - those are skills the candidate demonstrated, and a Skills section rarely repeats them. Copy each name exactly as written. Do NOT add any technology the resume does not name.
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

/* ===============================================================================================
   GROUNDING VERIFICATION — the enforcement behind the prompt's "copy verbatim" rule.
   ===============================================================================================
   A prompt instruction is a request, not a constraint. A local model asked to extract a resume
   will, when it cannot read a section cleanly, quietly emit a fluent and entirely invented one
   instead of an empty string. This was observed in production: one candidate's stored profile
   contained "Led migration of legacy REST APIs to GraphQL, cutting average response time by 35%"
   under an employer whose real bullets were about performance counters, and a project titled
   "Sign Language Recognition" whose description was about a real-time chat app. Neither string
   exists anywhere in the source resume.

   So every extracted free-text and numeric value is now checked back against the source text:

     NUMERIC GROUNDING   Every number in an extracted string must occur in the source. This is what
                         catches single-digit drift in an exam rank ("AIR 2034" for "AIR 2174") —
                         the kind of error a human never makes and a language model makes often.

     LEXICAL GROUNDING   A description's content words must substantially occur in the source. A
                         wholly invented paragraph shares almost no rare words with the document it
                         claims to summarise, so it scores far below the threshold and is dropped.

   Dropping is deliberately the failure mode: an empty description the candidate fills in
   themselves is recoverable; a fabricated one they never notice is what costs them the offer.
   =============================================================================================== */

// Digit runs, keeping decimals and separators together: "123,967", "2174", "3.68", "35".
const NUMBER_TOKEN_PATTERN = /\d[\d,.]*/g;

function normalizeForGrounding(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ");
}

function extractNumberTokens(value) {
  return (String(value || "").match(NUMBER_TOKEN_PATTERN) || [])
    .map((token) => token.replace(/[.,]+$/, ""))
    .filter(Boolean);
}

// A number is grounded if it appears in the source, with or without thousands separators, so
// "123,967" matches a source that wrote "123967" and vice versa.
function isNumberGrounded(token, sourceText, sourceDigits) {
  if (sourceText.includes(token.toLowerCase())) {
    return true;
  }
  const bare = token.replace(/[,]/g, "");
  return Boolean(bare) && sourceDigits.includes(bare);
}

function findUngroundedNumbers(value, sourceText, sourceDigits) {
  return extractNumberTokens(value).filter((token) => !isNumberGrounded(token, sourceText, sourceDigits));
}

const GROUNDING_STOPWORDS = new Set([
  "a", "an", "and", "the", "to", "of", "in", "on", "for", "with", "by", "from", "at", "as", "is",
  "was", "were", "be", "been", "are", "that", "this", "it", "its", "into", "using", "used", "use",
  "via", "per", "over", "under", "across", "within", "while", "during", "including", "such"
]);

function contentWords(value) {
  return normalizeForGrounding(value)
    .replace(/[^a-z0-9+#. ]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3 && !GROUNDING_STOPWORDS.has(word));
}

// Fraction of a string's content words that actually occur in the source document.
function lexicalOverlap(value, sourceText) {
  const words = [...new Set(contentWords(value))];
  if (!words.length) {
    return 1;
  }
  const present = words.filter((word) => sourceText.includes(word)).length;
  return present / words.length;
}

// A faithful transcription overlaps almost completely (>0.9 typically). A genuinely invented
// paragraph overlaps on little more than incidental vocabulary. 0.6 sits well clear of both.
const MIN_LEXICAL_OVERLAP = 0.6;

function verifyLongTextAgainstSource(value, sourceText, sourceDigits, label, warnings) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  const ungrounded = findUngroundedNumbers(text, sourceText, sourceDigits);
  const overlap = lexicalOverlap(text, sourceText);

  if (overlap < MIN_LEXICAL_OVERLAP) {
    warnings.push(
      `We removed the ${label} description because it did not match your uploaded resume — please add it yourself.`
    );
    return "";
  }

  if (ungrounded.length) {
    warnings.push(
      `Check the ${label} description: ${ungrounded.slice(0, 3).join(", ")} ${
        ungrounded.length === 1 ? "does" : "do"
      } not appear in your uploaded resume.`
    );
  }

  return text;
}

function verifyShortFieldAgainstSource(value, sourceText, sourceDigits, label, warnings) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  const ungrounded = findUngroundedNumbers(text, sourceText, sourceDigits);
  if (ungrounded.length) {
    warnings.push(
      `Check "${text.slice(0, 60)}" under ${label}: ${ungrounded.slice(0, 3).join(", ")} ${
        ungrounded.length === 1 ? "does" : "do"
      } not appear in your uploaded resume.`
    );
  }

  return text;
}

// Walks the whole draft, dropping ungrounded descriptions and flagging ungrounded numbers.
function verifyDraftAgainstSource(draft, text) {
  const warnings = [];
  const sourceText = normalizeForGrounding(text);
  const sourceDigits = String(text || "").replace(/[^\d]/g, "");
  const verified = { ...draft };

  verified.experience = (draft.experience || []).map((item) => ({
    ...item,
    description: verifyLongTextAgainstSource(
      item.description,
      sourceText,
      sourceDigits,
      `${item.companyName || item.jobTitle || "experience"} experience`,
      warnings
    )
  }));

  verified.projects = (draft.projects || []).map((item) => ({
    ...item,
    description: verifyLongTextAgainstSource(
      item.description,
      sourceText,
      sourceDigits,
      `"${item.title || "project"}" project`,
      warnings
    )
  }));

  // Titles are short and number-bearing (ranks, scores, dates) — exactly where digit drift shows.
  ["achievements", "certifications"].forEach((key) => {
    verified[key] = (draft[key] || []).map((item) => ({
      ...item,
      title: verifyShortFieldAgainstSource(item.title, sourceText, sourceDigits, key, warnings)
    }));
  });

  verified.education = (draft.education || []).map((item) => ({
    ...item,
    institution: verifyShortFieldAgainstSource(item.institution, sourceText, sourceDigits, "education", warnings)
      || item.institution
  }));

  return { verified, warnings };
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

/* PROVIDER CHAIN, in the order careerAgentService already established: Gemini first when a key is
   configured, the local Ollama model as fallback, and the deterministic regex backstop last.

   The parser used to import from ollamaService ALONE. One provider meant one point of failure, and
   on CPU-only hardware that provider cannot do this job at all: a two-page resume is a ~9,700-char
   prompt asking for ~2,000 tokens of JSON, measured here at over 280s against a 140s ceiling. So
   every real resume degraded to the regex backstop and the candidate got a draft holding a phone
   number and an email. The same prompt through Gemini measures 25.7s and comes back complete, with
   every role, project, date and skill present.

   Gemini leads on quality as well as speed: the local model's characteristic failure on this task
   is to invent a fluent replacement for a section it could not read, which is the origin of the
   fabricated bullets verifyDraftAgainstSource exists to catch. */
function buildParserProviders(model, prompt) {
  const providers = [];

  if (hasGeminiKey()) {
    providers.push({
      name: "gemini",
      label: "Gemini",
      call: (timeoutMs) => generateJsonCompletionGemini(prompt, { timeoutMs })
    });
  }

  providers.push({
    name: "ollama",
    label: `Ollama (${model})`,
    call: (timeoutMs) => generateJsonCompletionOllama(prompt, model, { timeoutMs })
  });

  return providers;
}

async function parseResumeToProfile(text) {
  const contact = extractContactInfo(text);
  const model = getParserModel();
  const warnings = [];
  let draft = null;

  const deadline = Date.now() + RESUME_PARSE_TOTAL_BUDGET_MS;
  const remainingMs = () => deadline - Date.now();
  const providers = buildParserProviders(model, buildResumeParsePrompt(text));
  const providerFailures = [];
  let modelUsed = null;

  outer: for (const provider of providers) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const budgetLeft = remainingMs();

      // A provider needs a workable slice to be worth starting at all. Firing one off with two
      // seconds left burns the tail of the budget and guarantees a timeout.
      if (budgetLeft < MIN_PROVIDER_SLICE_MS) {
        console.warn(`[ResumeParser] Out of budget before ${provider.label} could be tried (${(RESUME_PARSE_TOTAL_BUDGET_MS / 1000).toFixed(0)}s spent).`);
        providerFailures.push({ provider: provider.name, kind: "timeout", message: `Ran out of time before ${provider.label} could be tried.` });
        break;
      }

      console.log(`[ResumeParser] Parsing resume with ${provider.label} (attempt ${attempt}/${MAX_ATTEMPTS}, ${(budgetLeft / 1000).toFixed(0)}s of budget left)`);

      const { json, failure } = await provider.call(budgetLeft);

      if (json) {
        const candidate = normalizeParsedProfile(json);
        if (isUsableDraft(candidate)) {
          draft = candidate;
          modelUsed = provider.name;
          break outer;
        }
        console.warn(`[ResumeParser] ${provider.label} returned a draft too thin to use (attempt ${attempt}/${MAX_ATTEMPTS}).`);
        continue;
      }

      if (failure) {
        providerFailures.push({ provider: provider.name, kind: failure.kind, message: failure.message });
        // FAIL FAST. A refused connection, a missing model, a rejected key or an exhausted quota
        // fails the same way every time - retrying only spends budget the NEXT provider needs.
        if (!failure.retryable) {
          console.warn(`[ResumeParser] ${provider.label}: ${failure.message} - not retrying this provider.`);
          break;
        }
        console.warn(`[ResumeParser] ${provider.label}: ${failure.message} (attempt ${attempt}/${MAX_ATTEMPTS})`);
      }
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

  // Enforcement pass. Runs on every successful parse — a model that ignored the prompt's
  // copy-verbatim rule is caught here rather than silently writing fiction into the profile.
  if (!usedFallback) {
    const { verified, warnings: groundingWarnings } = verifyDraftAgainstSource(draft, text);
    draft = verified;
    warnings.push(...groundingWarnings);
  }

  /* Recover the technologies named in the candidate's own project and role descriptions, AND in
     the uploaded document itself. Runs AFTER grounding verification on purpose: a fabricated
     description is already blanked by this point, so it cannot contribute a skill the candidate
     never claimed.

     `text` is passed as a second source because the failure this exists to catch is the model
     under-reading the Skills SECTION, and when that happens the technologies are missing from the
     draft entirely — there is no narrative left to harvest them from. The uploaded document is the
     candidate's own text by definition, so recognising a name in it is transcription, not
     inference; and the lexicon match is literal, so nothing can be recovered that the document
     does not spell out. */
  const { skills: harvestedSkills, harvested } = harvestSkillsFromNarrative(draft, text);
  draft.skills = harvestedSkills;
  if (harvested.length) {
    warnings.push(
      `Added ${harvested.length} skill${harvested.length === 1 ? "" : "s"} mentioned in your experience and projects but missing from your skills list: ${harvested.join(", ")}. Remove any you'd rather not list.`
    );
  }

  if (!draft.firstName && !draft.lastName) {
    warnings.push("Couldn't detect your name — please add it.");
  }
  if (!draft.education.length && !draft.universityName) {
    warnings.push("Couldn't detect education details — please review that section.");
  }

  /* Name what came back empty. A draft holding a name and nothing else used to be reported as a
     plain success ("We extracted what we could…"), which reads to the candidate as a broken
     feature rather than as a list of things to type in themselves. Reporting the empty sections
     BY NAME is the difference between a vague apology and an actionable one - and it is honest
     about a partial result instead of dropping the gap silently. */
  const missingSections = findEmptyDraftSections(draft);
  if (missingSections.length) {
    warnings.push(
      `Nothing was imported for: ${missingSections.join(", ")}. Please add ${missingSections.length === 1 ? "it" : "them"} manually below.`
    );
  }

  return { draft, warnings, usedFallback, missingSections, modelUsed, providerFailures };
}

// Section labels the candidate will recognise from the form, in the order they appear in it.
const DRAFT_SECTION_LABELS = [
  ["education", (draft) => draft.education.length || draft.universityName],
  ["work experience", (draft) => draft.experience.length],
  ["projects", (draft) => draft.projects.length],
  ["skills", (draft) => draft.skills.length],
  ["certifications", (draft) => draft.certifications.length],
  ["achievements", (draft) => draft.achievements.length]
];

function findEmptyDraftSections(draft) {
  return DRAFT_SECTION_LABELS.filter(([, isPresent]) => !isPresent(draft)).map(([label]) => label);
}

/* ===============================================================================================
   SKILL HARVESTING FROM THE CANDIDATE'S OWN NARRATIVE
   ===============================================================================================
   Models transcribe the "Technical Skills" line and stop there. Everything the candidate
   demonstrated in a project or role — "deployed with Jenkins, Docker, Kubernetes and Ansible" —
   never reaches `skills`, so the strongest evidence on the resume is the part that goes missing.
   One real profile came through holding exactly the nine items from its Skills line while its
   project descriptions named ten more.

   This is recognition, not inference. A term is added ONLY when its name literally occurs in text
   the candidate wrote, matched whole-word against a fixed lexicon. Nothing is derived from a job
   posting, and no model is consulted. It runs AFTER verifyDraftAgainstSource, so a fabricated
   description has already been blanked and can never contribute a skill the candidate never had.
   =============================================================================================== */

// Canonical spellings. Deliberately excludes ambiguous one- and two-character names ("R", "C",
// "Go", "D"), which collide with ordinary prose far too often to match safely on word boundaries.
const TECHNOLOGY_LEXICON = [
  // Languages
  "JavaScript", "TypeScript", "Python", "Java", "Kotlin", "Swift", "Scala", "Ruby", "PHP", "Perl",
  "Rust", "Golang", "MATLAB", "Haskell", "Elixir", "Dart", "Groovy", "Bash", "Shell", "PowerShell",
  "SQL", "PL/SQL", "HTML", "CSS", "SASS", "SCSS", "XML", "JSON", "YAML", "LaTeX", "Assembly",
  "C++", "C#", "Objective-C", "VBA", "COBOL", "Fortran",
  // Web / frontend
  "React", "React.js", "Redux", "Angular", "Vue", "Vue.js", "Svelte", "Next.js", "Nuxt",
  "jQuery", "Bootstrap", "Tailwind", "Material UI", "Webpack", "Vite", "Babel", "Three.js",
  // Backend / APIs
  "Node.js", "Express", "Express.js", "Django", "Flask", "FastAPI", "Spring", "Spring Boot",
  "Hibernate", "JDBC", "Servlets", "ASP.NET", ".NET", "Laravel", "Rails", "GraphQL", "REST",
  "gRPC", "WebSocket", "Socket.IO", "Microservices", "RabbitMQ", "Kafka", "Celery",
  // Data stores
  "MySQL", "PostgreSQL", "MongoDB", "SQLite", "Oracle", "Redis", "Cassandra", "DynamoDB",
  "Elasticsearch", "Neo4j", "Firebase", "Supabase", "Snowflake", "BigQuery", "Hadoop", "Hive",
  // Data / ML
  "NumPy", "Pandas", "SciPy", "Scikit-Learn", "TensorFlow", "PyTorch", "Keras", "OpenCV",
  "Matplotlib", "Seaborn", "Plotly", "PySpark", "Spark", "Airflow", "dbt", "Tableau", "Power BI",
  "NLTK", "spaCy", "Hugging Face", "Transformers", "LangChain", "DSPy", "OpenAI", "LLM",
  "Machine Learning", "Deep Learning", "Reinforcement Learning", "Computer Vision",
  "Natural Language Processing", "Data Analysis", "Data Visualization", "Neural Network",
  "Convolutional Neural Network", "CNN", "Inverse Reinforcement Learning", "Q-learning",
  // Cloud / DevOps
  "AWS", "Azure", "GCP", "Google Cloud", "Docker", "Kubernetes", "Jenkins", "Ansible",
  "Terraform", "Helm", "OpenShift", "Nginx", "Apache", "Linux", "Unix", "Ubuntu", "Git",
  "GitHub", "GitLab", "Bitbucket", "CI/CD", "Prometheus", "Grafana", "Datadog", "Splunk",
  "Serverless", "Lambda", "Microsoft Power Platform",
  // Testing / QA
  "Selenium", "Cypress", "Playwright", "Jest", "Mocha", "Chai", "JUnit", "TestNG", "Cucumber",
  "Pytest", "Postman", "SoapUI", "Appium", "JMeter", "LoadRunner",
  // Practices / platforms
  "Agile", "Scrum", "Kanban", "JIRA", "Confluence", "Salesforce", "Oracle CPQ", "SAP",
  "ServiceNow", "Figma", "Data Structures", "Algorithms", "Object Oriented Programming",
  "Operating Systems", "Computer Networks", "Database Management", "System Design",
  "Socket Programming", "Multithreading", "Process Synchronization"
];

function escapeForRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Whole-token match that tolerates the punctuation real technology names carry. "C++" must match
// in "wrote C++ code" but never inside "C++11"; "Java" must never match inside "JavaScript".
const TECHNOLOGY_MATCHERS = TECHNOLOGY_LEXICON.map((term) => ({
  term,
  pattern: new RegExp(`(^|[^A-Za-z0-9+#.])${escapeForRegex(term)}(?![A-Za-z0-9+#])`, "i")
}));

// True when `longer` contains `term` as a whole name and is more specific than it. The trailing
// class deliberately omits "." so "React" is recognised inside "React.js", while "Java" is still
// NOT recognised inside "JavaScript" — the next character there is alphanumeric.
function subsumesSkill(longer, term) {
  if (String(longer).length <= String(term).length) {
    return false;
  }
  return new RegExp(`(^|[^A-Za-z0-9+#])${escapeForRegex(term)}(?![A-Za-z0-9+#])`, "i").test(longer);
}

// Only text the candidate authored. Titles and descriptions of their own roles, projects and
// custom sections — never the objective (which is AI-authored downstream) and never job data.
function collectNarrativeText(draft = {}) {
  const parts = [];

  (draft.experience || []).forEach((item) => parts.push(item.description));
  (draft.projects || []).forEach((item) => {
    parts.push(item.title, item.description);
    const stack = item.technologies || item.techStack || item.stack;
    if (Array.isArray(stack)) parts.push(stack.join(", "));
    else if (stack) parts.push(String(stack));
  });
  (draft.additionalSections || []).forEach((section) => {
    (section.entries || []).forEach((entry) => parts.push(entry.title, entry.description));
  });

  return parts.filter(Boolean).join("\n");
}

/* `sourceText` is the raw uploaded resume, optional so existing callers and tests keep working.
   Two sources, not one: the draft narrative catches technologies the model transcribed into
   descriptions, and the source document catches the case that actually loses the most — a Skills
   SECTION the model under-read, where the names never reached the draft at all and there is no
   narrative to recover them from. */
function harvestSkillsFromNarrative(draft = {}, sourceText = "") {
  const narrative = [collectNarrativeText(draft), String(sourceText || "")].filter(Boolean).join("\n");
  if (!narrative.trim()) {
    return { skills: draft.skills || [], harvested: [] };
  }

  const stored = (draft.skills || []).map((skill) => String(skill).trim()).filter(Boolean);
  const seen = new Set(stored.map((skill) => skill.toLowerCase()));
  const matched = [];

  TECHNOLOGY_MATCHERS.forEach(({ term, pattern }) => {
    const key = term.toLowerCase();
    if (seen.has(key) || !pattern.test(narrative)) {
      return;
    }
    seen.add(key);
    matched.push(term);
  });

  // A shorter name nests inside a longer one — "React" inside "React.js", "Spring" inside
  // "Spring Boot", "Oracle" inside "Oracle CPQ", "Java" inside a stored "Core Java" — and both
  // match the same words of the same sentence. Keep the more specific term only; listing both
  // pads the skills line with what looks like two credentials but is one.
  const candidates = [...stored, ...matched];
  const harvested = matched.filter(
    (term) => !candidates.some((other) => other !== term && subsumesSkill(other, term))
  );

  // The candidate's own Skills-section ordering leads; harvested terms follow it.
  return { skills: [...stored, ...harvested], harvested };
}

module.exports = {
  parseResumeToProfile,
  harvestSkillsFromNarrative,
  RESUME_PARSE_TOTAL_BUDGET_MS,
  // exported for unit testing
  buildResumeParsePrompt,
  findEmptyDraftSections,
  extractContactInfo,
  normalizeParsedProfile,
  parseLooseDate,
  verifyDraftAgainstSource,
  findUngroundedNumbers,
  lexicalOverlap
};
