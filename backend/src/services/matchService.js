const {
  calculateEducationYears,
  calculateEducationYearsFromText,
  extractRequiredEducationYears
} = require("../utils/educationMetrics");

const STOPWORDS = new Set([
  "about",
  "above",
  "abilities",
  "ability",
  "across",
  "after",
  "again",
  "against",
  "additional",
  "also",
  "analytical",
  "and",
  "any",
  "application",
  "applications",
  "are",
  "at",
  "based",
  "been",
  "being",
  "both",
  "build",
  "candidate",
  "collaboration",
  "communication",
  "company",
  "design",
  "details",
  "develop",
  "development",
  "each",
  "excellent",
  "experience",
  "from",
  "fundamentals",
  "good",
  "have",
  "help",
  "for",
  "full",
  "in",
  "into",
  "information",
  "is",
  "knowledge",
  "language",
  "job",
  "must",
  "need",
  "of",
  "minimum",
  "office",
  "our",
  "plus",
  "position",
  "problem-solving",
  "programming",
  "required",
  "requirements",
  "responsibilities",
  "role",
  "should",
  "skills",
  "strong",
  "team",
  "technical",
  "test",
  "that",
  "the",
  "their",
  "this",
  "time",
  "troubleshooting",
  "understanding",
  "using",
  "various",
  "web",
  "with",
  "work",
  "will",
  "year",
  "years",
  "you",
  "your"
]);

const LOCATION_STOPWORDS = new Set([
  "hyderabad",
  "bengaluru",
  "bangalore",
  "pune",
  "mumbai",
  "delhi",
  "noida",
  "gurgaon",
  "chennai",
  "remote"
]);

const KNOWN_SKILLS = [
  "javascript",
  "typescript",
  "python",
  "java",
  "core java",
  "c++",
  "c#",
  "c",
  "html",
  "css",
  "react.js",
  "node.js",
  "express.js",
  "next.js",
  "mongodb",
  "mysql",
  "postgresql",
  "sql",
  "rest api",
  "api integration",
  "graphql",
  "tailwind css",
  "bootstrap",
  "git",
  "github",
  "docker",
  "kubernetes",
  "jenkins",
  "ci/cd",
  "linux",
  "aws",
  "amazon web services",
  "azure",
  "gcp",
  "google cloud",
  "spring boot",
  "spring",
  "jdbc",
  "hibernate",
  "salesforce",
  "oracle cpq",
  "cpq",
  "machine learning",
  "computer vision",
  "reinforcement learning",
  "data structures",
  "algorithms",
  "object oriented programming",
  "selenium",
  "playwright",
  "cypress",
  "cucumber",
  "junit",
  "testng",
  "postman",
  "jira"
];

const SKILL_FAMILIES = {
  frontend: [
    "html",
    "css",
    "javascript",
    "typescript",
    "react.js",
    "next.js",
    "tailwind css",
    "bootstrap",
    "ui",
    "responsive"
  ],
  backend: [
    "node.js",
    "express.js",
    "java",
    "python",
    "rest api",
    "api integration",
    "mongodb",
    "mysql",
    "postgresql",
    "sql",
    "jwt",
    "authentication"
  ],
  qa: [
    "testing",
    "selenium",
    "playwright",
    "cypress",
    "automation",
    "postman",
    "regression",
    "bug"
  ],
  data: [
    "python",
    "sql",
    "machine learning",
    "artificial intelligence",
    "pandas",
    "numpy",
    "analytics",
    "data",
    "model"
  ],
  cloud: [
    "aws",
    "azure",
    "docker",
    "kubernetes",
    "ci/cd",
    "deployment",
    "devops",
    "cloud"
  ],
  productSupport: [
    "customer success",
    "communication",
    "analytics",
    "saas",
    "crm",
    "sql",
    "support"
  ]
};

const ROLE_TERMS = [
  "frontend",
  "backend",
  "full stack",
  "fullstack",
  "developer",
  "engineer",
  "qa",
  "automation",
  "tester",
  "data",
  "analyst",
  "machine learning",
  "ml",
  "cloud",
  "devops",
  "customer success",
  "support"
];

const SKILL_ALIASES = new Map([
  ["js", "javascript"],
  ["node", "node.js"],
  ["nodejs", "node.js"],
  ["reactjs", "react.js"],
  ["react", "react.js"],
  ["nextjs", "next.js"],
  ["next", "next.js"],
  ["expressjs", "express.js"],
  ["express", "express.js"],
  ["mongo", "mongodb"],
  ["postgres", "postgresql"],
  ["postgre", "postgresql"],
  ["tailwindcss", "tailwind css"],
  ["ml", "machine learning"],
  ["ai", "artificial intelligence"],
  ["genai", "generative ai"],
  ["restapi", "rest api"],
  ["apis", "api"],
  ["ci cd", "ci/cd"],
  ["cicd", "ci/cd"],
  ["oop", "object oriented programming"],
  ["object oriented programming", "object oriented programming"],
  ["object-oriented programming", "object oriented programming"],
  ["k8s", "kubernetes"],
  ["amazon web services", "aws"],
  ["google cloud platform", "gcp"],
  ["google cloud", "gcp"],
  ["springboot", "spring boot"],
  ["ts", "typescript"]
]);

function normalizeTerm(value) {
  const normalized = String(value || "")
    .toLowerCase()
    .replace(/\breact\s*js\b/g, "reactjs")
    .replace(/\bnode\s*js\b/g, "nodejs")
    .replace(/\bnext\s*js\b/g, "nextjs")
    .replace(/\bexpress\s*js\b/g, "expressjs")
    .replace(/[^a-z0-9+#./\s-]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[./\s-]+|[./\s-]+$/g, "")
    .trim();

  return SKILL_ALIASES.get(normalized.replace(/[.\s/-]/g, "")) || SKILL_ALIASES.get(normalized) || normalized;
}

function normalizeTokens(values = []) {
  return values
    .flatMap((value) =>
      String(value || "")
        .split(/[,;|/]+/)
        .map((part) => normalizeTerm(part))
    )
    .filter(Boolean);
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function isUsefulTerm(term) {
  const normalized = normalizeTerm(term);

  if (!normalized) {
    return false;
  }

  // A curated skill (e.g. "object oriented programming") is always useful, even though one of
  // its individual words (e.g. "programming") is a stopword when it appears generically —
  // being a stopword-as-a-standalone-word doesn't make the whole compound skill noise.
  if (KNOWN_SKILLS.includes(normalized)) {
    return true;
  }

  if (STOPWORDS.has(normalized)) {
    return false;
  }

  if (/^\d+$/.test(normalized)) {
    return false;
  }

  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.some((token) => STOPWORDS.has(token) || LOCATION_STOPWORDS.has(token) || /^\d+$/.test(token))) {
    return false;
  }

  return normalized.length >= 3;
}

function tokenizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9+#./\s-]/g, " ")
    .split(/\s+/)
    .map((token) => normalizeTerm(token))
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

function ngrams(tokens, min = 2, max = 3) {
  const phrases = [];

  for (let size = min; size <= max; size += 1) {
    for (let index = 0; index <= tokens.length - size; index += 1) {
      const phrase = tokens.slice(index, index + size).join(" ");
      if (!phrase.split(" ").some((token) => STOPWORDS.has(token))) {
        phrases.push(phrase);
      }
    }
  }

  return phrases;
}

function extractImportantTerms(text, limit = 28) {
  const tokens = tokenizeText(text);
  const counts = [...tokens, ...ngrams(tokens, 2, 2)].reduce((accumulator, token) => {
    if (isUsefulTerm(token)) {
      accumulator[token] = (accumulator[token] || 0) + 1;
    }
    return accumulator;
  }, {});

  return Object.entries(counts)
    .sort((left, right) => right[1] - left[1] || right[0].length - left[0].length)
    .slice(0, limit)
    .map(([term]) => term);
}

function extractKnownSkills(text) {
  return KNOWN_SKILLS.filter((skill) => hasTerm(text, skill));
}

function skillFamiliesForTerm(term) {
  const normalized = normalizeTerm(term);

  return Object.entries(SKILL_FAMILIES)
    .filter(([, skills]) => skills.some((skill) => normalizeTerm(skill) === normalized || hasTerm(normalized, skill)))
    .map(([family]) => family);
}

function extractSkillFamilies(text) {
  const normalized = normalizeTerm(text);
  return Object.entries(SKILL_FAMILIES)
    .filter(([family, skills]) =>
      normalized.includes(family.toLowerCase()) ||
      skills.some((skill) => hasTerm(normalized, skill))
    )
    .map(([family]) => family);
}

function getRelatedSkillMatches(missingSkills, candidateText) {
  const candidateFamilies = new Set(extractSkillFamilies(candidateText));

  return unique(missingSkills).filter((skill) => {
    const families = skillFamiliesForTerm(skill);
    return families.some((family) => candidateFamilies.has(family));
  });
}

function getRoleSimilarity(jobText, candidateText) {
  const jobRoles = ROLE_TERMS.filter((term) => hasTerm(jobText, term));
  const candidateRoles = ROLE_TERMS.filter((term) => hasTerm(candidateText, term));
  const matchedRoles = jobRoles.filter((term) => candidateRoles.includes(term));
  const jobFamilies = extractSkillFamilies(jobText);
  const candidateFamilies = extractSkillFamilies(candidateText);
  const matchedFamilies = jobFamilies.filter((family) => candidateFamilies.includes(family));
  const totalSignals = Math.max(unique([...jobRoles, ...jobFamilies]).length, 1);
  const matchedSignals = unique([...matchedRoles, ...matchedFamilies]).length;

  return {
    matchedRoles,
    matchedFamilies,
    score: Math.round((matchedSignals / totalSignals) * 10)
  };
}

function hasWorkEvidence(text) {
  return /project|projects|experience|intern|engineer|developer|built|developed|implemented|integrated|designed|tested|automated|analyzed|deployed|optimized|managed|created/i.test(text);
}

function clampScore(score) {
  return Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
}

function extractRequiredExperienceYears(text) {
  const source = String(text || "").toLowerCase();
  const patterns = [
    /(\d{1,2})\s*(?:\+)?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:relevant\s+)?experience/g,
    /experience\s+(?:of\s+)?(\d{1,2})\s*(?:\+)?\s*(?:years?|yrs?)/g,
    /minimum\s+(\d{1,2})\s*(?:\+)?\s*(?:years?|yrs?)/g
  ];
  let requiredYears = 0;

  patterns.forEach((pattern) => {
    let match;
    while ((match = pattern.exec(source))) {
      const context = source.slice(Math.max(0, match.index - 35), match.index + match[0].length + 35);
      if (!/education|school|college|degree|full[-\s]?time/.test(context)) {
        requiredYears = Math.max(requiredYears, Number(match[1]) || 0);
      }
    }
  });

  return requiredYears;
}

function monthToIndex(value) {
  const source = String(value || "").toLowerCase().slice(0, 3);
  return ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(source);
}

function calculateExperienceYearsFromText(text) {
  const source = String(text || "");
  const sectionMatch = source.match(/experience([\s\S]*?)(projects|education|technical skills|skills|certifications|achievements|$)/i);
  const section = sectionMatch ? sectionMatch[1] : source;
  const currentYear = new Date().getFullYear();
  const ranges = [];
  const monthRangePattern = /\b([A-Za-z]{3,9})\s+((?:19|20)\d{2})\s*(?:--|-|to|–|—)\s*(?:(present)|([A-Za-z]{3,9})\s+((?:19|20)\d{2}))\b/gi;
  const yearRangePattern = /\b((?:19|20)\d{2})\s*(?:--|-|to|–|—)\s*((?:19|20)\d{2}|present)\b/gi;
  let match;

  while ((match = monthRangePattern.exec(section))) {
    const startMonth = monthToIndex(match[1]);
    const startYear = Number(match[2]);
    const endMonth = match[3] ? new Date().getMonth() : monthToIndex(match[4]);
    const endYear = match[3] ? currentYear : Number(match[5]);

    if (startMonth >= 0 && endMonth >= 0 && endYear >= startYear) {
      ranges.push(Math.max(0, (endYear - startYear) + (endMonth - startMonth) / 12));
    }
  }

  while ((match = yearRangePattern.exec(section))) {
    const startYear = Number(match[1]);
    const endYear = match[2].toLowerCase() === "present" ? currentYear : Number(match[2]);

    if (startYear && endYear && endYear > startYear) {
      ranges.push(endYear - startYear);
    }
  }

  const explicitExperience = source.match(/\b(\d{1,2})\s*(?:\+)?\s*(?:years?|yrs?)\s+(?:of\s+)?experience\b/i);
  if (explicitExperience) {
    ranges.push(Number(explicitExperience[1]) || 0);
  }

  return Math.round(ranges.reduce((total, years) => total + years, 0) * 10) / 10;
}

function flattenSkillGroups(groups = []) {
  return (Array.isArray(groups) ? groups : [])
    .flatMap((group) => group.skills || [])
    .map((skill) => normalizeTerm(skill))
    .filter(Boolean);
}

function buildCandidateEvidence(seeker) {
  const educationYears = calculateEducationYears(seeker.education || []);
  const educationText = (seeker.education || [])
    .map((item) => [item.institution, item.degree, item.fieldOfStudy, item.startDate, item.endDate].filter(Boolean).join(" "))
    .join(" ");
  const projectText = (seeker.projects || [])
    .map((item) => [
      item.title,
      item.description,
      ...(item.links || []),
      ...(item.technologies || []),
      ...(item.techStack || [])
    ].filter(Boolean).join(" "))
    .join(" ");
  const experienceText = (seeker.experience || [])
    .map((item) => [item.jobTitle, item.companyName, item.description].filter(Boolean).join(" "))
    .join(" ");
  const certificationText = (seeker.licensesAndCertifications || [])
    .map((item) => [item.title, item.description].filter(Boolean).join(" "))
    .join(" ");
  const achievementText = (seeker.achievements || [])
    .map((item) => [item.title, item.description].filter(Boolean).join(" "))
    .join(" ");

  return {
    explicitSkills: unique([
      ...flattenSkillGroups(seeker.skillGroups),
      ...normalizeTokens(seeker.skills || [])
    ]),
    roleTerms: unique(normalizeTokens(seeker.preferredRoles || [])),
    fullText: [
      seeker.firstName,
      seeker.lastName,
      seeker.tagline,
      seeker.bio,
      seeker.careerObjective,
      seeker.currentStatus,
      educationText,
      educationYears ? `${educationYears} years full time education formal education` : "",
      projectText,
      experienceText,
      certificationText,
      achievementText,
      ...(seeker.skills || []),
      ...flattenSkillGroups(seeker.skillGroups),
      ...(seeker.preferredRoles || [])
    ].filter(Boolean).join(" "),
    projectText,
    experienceText,
    educationYears
  };
}

function buildJobEvidence(job) {
  const explicitSkills = unique(normalizeTokens([
    ...(job.skillsRequired || []),
    ...(job.skills || []),
    ...extractKnownSkills([
      job.title,
      job.description,
      ...(job.requirements || [])
    ].filter(Boolean).join(" "))
  ])).filter(isUsefulTerm);
  const requirementTerms = unique([
    ...extractImportantTerms((job.requirements || []).join(" "), 18)
  ]).filter((term) => isUsefulTerm(term) && !explicitSkills.includes(term));
  const descriptionTerms = extractImportantTerms([
    job.title,
    job.description,
    job.industry,
    job.type
  ].filter(Boolean).join(" "), 24).filter((term) => isUsefulTerm(term) && !explicitSkills.includes(term));

  return {
    explicitSkills,
    requirementTerms,
    descriptionTerms,
    fullText: [
      job.title,
      job.description,
      job.industry,
      job.type,
      ...(job.requirements || []),
      ...(job.skillsRequired || []),
      ...(job.skills || [])
    ].filter(Boolean).join(" ")
  };
}

function hasTerm(text, term) {
  const normalizedText = ` ${normalizeTerm(text)} `;
  const normalizedTerm = normalizeTerm(term);

  if (!normalizedTerm) {
    return false;
  }

  if (normalizedText.includes(` ${normalizedTerm} `)) {
    return true;
  }

  const textTokenSet = new Set(tokenizeText(normalizedText));

  // tokenizeText() runs each individual token through normalizeTerm() too, so a short-form
  // alias in the text (e.g. "OOP") already shows up in this set as its canonical, spelled-out
  // form (e.g. "object oriented programming") — checking for that directly covers the
  // abbreviation-in-text case without needing a separate alias lookup.
  if (textTokenSet.has(normalizedTerm)) {
    return true;
  }

  const termTokens = normalizedTerm
    .split(/\s+/)
    .map((token) => normalizeTerm(token))
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
  if (termTokens.length > 1 && termTokens.every((token) => textTokenSet.has(token))) {
    return true;
  }
  // If the token-set check above failed, fall through — a hyphenated phrase like
  // "object-oriented programming" tokenizes as one token ("object-oriented") and would
  // otherwise never match a space-separated multi-word term, even though it's the same phrase.

  const compactText = normalizedText.replace(/[^a-z0-9+#]/g, "");
  const compactTerm = normalizedTerm.replace(/[^a-z0-9+#]/g, "");
  return compactTerm.length > 2 && compactText.includes(compactTerm);
}

function matchTerms(terms, text) {
  return unique(terms).filter((term) => hasTerm(text, term));
}

// Extracts a "Skills:"/"Requirements:" header's content from freeform JD text — handling both
// inline content on the header line ("Skills: Java, Docker") and a multi-line bulleted/dashed
// list under the header ("Skills:\n- Java\n- Docker\n- Jenkins"), which a single-line regex
// like /(?:skills?|requirements?)[:\s-]+([^\n.]+)/ can't see past the header's own newline.
function extractSkillsSectionTerms(jobText) {
  const lines = String(jobText || "").split(/\r?\n/);
  const headerPattern = /^\s*(?:required\s+)?(?:key\s+)?(?:skills?|requirements?)\s*[:\-]?\s*(.*)$/i;
  const bulletPattern = /^\s*(?:[-*•]|\d+[.)])\s*(.+)$/;
  const collected = [];

  for (let index = 0; index < lines.length; index += 1) {
    const headerMatch = lines[index].match(headerPattern);
    if (!headerMatch) {
      continue;
    }

    const inline = headerMatch[1].trim();
    if (inline) {
      collected.push(inline);
    }

    // Walk subsequent lines while they look like list items, stopping at a blank line or
    // anything that looks like the start of a new section.
    for (let next = index + 1; next < lines.length; next += 1) {
      const line = lines[next];
      if (!line || !line.trim()) {
        break;
      }

      const bulletMatch = line.match(bulletPattern);
      if (bulletMatch) {
        collected.push(bulletMatch[1].trim());
        continue;
      }

      const trimmed = line.trim();
      const looksLikeBareListItem =
        !inline &&
        trimmed.split(/\s+/).length <= 6 &&
        /^[A-Za-z0-9][A-Za-z0-9+#./\s-]*$/.test(trimmed);
      if (looksLikeBareListItem) {
        collected.push(trimmed);
        continue;
      }

      break;
    }
  }

  return collected;
}

function scoreCoverage(matched, total, maxScore) {
  return total ? Math.round((matched / total) * maxScore) : 0;
}

function tagFromScore(score) {
  if (score >= 80) {
    return "Strong fit";
  }
  if (score >= 60) {
    return "Good fit";
  }
  if (score >= 40) {
    return "Moderate fit";
  }
  return "Low fit";
}

function buildSuggestions(missingSkills, missingKeywords) {
  const suggestions = [];

  if (missingSkills.length) {
    suggestions.push(`Add truthful evidence for these required skills: ${missingSkills.slice(0, 8).join(", ")}.`);
  }

  if (missingKeywords.length) {
    suggestions.push(`Mirror these job keywords in projects or experience where accurate: ${missingKeywords.slice(0, 8).join(", ")}.`);
  }

  suggestions.push("Put the strongest matching project or experience bullet near the top of the resume.");
  suggestions.push("Use the same wording as the job description for tools, frameworks, and responsibilities when it is truthful.");

  return suggestions;
}

function calculateProfileExperienceYears(experience = []) {
  const currentDate = new Date();
  const totalYears = (Array.isArray(experience) ? experience : []).reduce((total, item) => {
    if (!item?.startDate) {
      return total;
    }

    const startDate = new Date(item.startDate);
    const endDate = item.isCurrent || !item.endDate ? currentDate : new Date(item.endDate);

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
      return total;
    }

    return total + ((endDate - startDate) / (1000 * 60 * 60 * 24 * 365.25));
  }, 0);

  return Math.round(totalYears * 10) / 10;
}

function jaccardScore(leftValues = [], rightValues = []) {
  const left = new Set(unique(leftValues.map(normalizeTerm)).filter(Boolean));
  const right = new Set(unique(rightValues.map(normalizeTerm)).filter(Boolean));

  if (!left.size && !right.size) {
    return 0;
  }

  const intersection = [...left].filter((item) => right.has(item)).length;
  const union = new Set([...left, ...right]).size || 1;
  return Math.round((intersection / union) * 100);
}

// Standard cosine similarity for two equal-length embedding vectors. Returns null (not 0) on
// any malformed/missing input — 0 would be indistinguishable from "genuinely dissimilar
// vectors" for a caller deciding whether to fall back to keyword-based scoring.
function cosineSimilarity(vectorA, vectorB) {
  if (!Array.isArray(vectorA) || !Array.isArray(vectorB)) {
    return null;
  }

  if (!vectorA.length || vectorA.length !== vectorB.length) {
    return null;
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let index = 0; index < vectorA.length; index += 1) {
    const a = Number(vectorA[index]);
    const b = Number(vectorB[index]);

    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      return null;
    }

    dotProduct += a * b;
    magnitudeA += a * a;
    magnitudeB += b * b;
  }

  if (magnitudeA === 0 || magnitudeB === 0) {
    return null;
  }

  const similarity = dotProduct / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
  // Clamp defensively against floating-point drift outside the mathematical [-1, 1] range.
  return Math.max(-1, Math.min(1, similarity));
}

// Accepts either a raw cosine similarity ([-1, 1]) or an already-normalized [0, 1] score (e.g.
// Atlas's $vectorSearchScore) and maps both onto a 0-100 scale.
function normalizeVectorScore(vectorScore) {
  const score = Number(vectorScore);

  if (!Number.isFinite(score)) {
    return 0;
  }

  if (score < 0) {
    return clampScore(((score + 1) / 2) * 100);
  }

  if (score <= 1) {
    return clampScore(score * 100);
  }

  return clampScore(score);
}

function computeHiddenRoleBoost(seeker = {}, job = {}) {
  const seekerRoles = new Set((seeker.hiddenRoles || []).map(normalizeTerm));
  const jobRoles = (job.hiddenRoles || []).map(normalizeTerm).filter(Boolean);

  if (!seekerRoles.size || !jobRoles.length) {
    return 0;
  }

  return jobRoles.some((role) => seekerRoles.has(role)) ? 100 : 0;
}

function computeAutoApplyCompositeMatch(seeker, job, options = {}) {
  const baseMatch = computeCandidateMatch(seeker, job);
  const candidate = buildCandidateEvidence(seeker || {});
  const target = buildJobEvidence(job || {});
  // Skills demonstrated in project/experience bullet text but not tagged in the flat
  // skills/skillGroups fields still count as evidence — baseMatch (below) already credits them,
  // so skillOverlapScore should too, instead of only looking at explicitly-tagged skills.
  const demonstratedSkills = unique([
    ...extractKnownSkills(candidate.projectText),
    ...extractKnownSkills(candidate.experienceText)
  ]);
  const seekerSkills = unique([
    ...candidate.explicitSkills,
    ...demonstratedSkills,
    ...(seeker?.preferredRoles || []),
    ...(seeker?.autoApplyPreferences?.rolePreferences || [])
  ]);
  const jobSkills = unique([
    ...target.explicitSkills,
    ...target.requirementTerms,
    ...(job?.hiddenRoles || [])
  ]).filter(isUsefulTerm);
  const skillOverlapScore = jaccardScore(seekerSkills, jobSkills);
  const requiredExperienceYears = extractRequiredExperienceYears(target.fullText);
  const seekerExperienceYears = calculateProfileExperienceYears(seeker?.experience || []);
  const experienceScore = requiredExperienceYears
    ? clampScore((seekerExperienceYears / requiredExperienceYears) * 100)
    : 75;
  const hiddenRoleScore = computeHiddenRoleBoost(seeker, job);

  // options.vectorScore is the caller's directly-computed cosine similarity for this specific
  // seeker+job pair (see autoApplyWorker.js) — null/undefined means no usable embedding exists
  // yet for one side of the pair, NOT "similarity of zero". Only treat vector similarity as the
  // dominant signal when it's actually present; otherwise fall back to the keyword-dominant
  // weighting so a missing embedding doesn't masquerade as "semantically dissimilar".
  const hasVectorScore =
    options.vectorScore !== null &&
    options.vectorScore !== undefined &&
    Number.isFinite(Number(options.vectorScore));
  const vectorScore = hasVectorScore ? normalizeVectorScore(options.vectorScore) : null;

  const weightedCompositeScore = hasVectorScore
    ? clampScore(
        vectorScore * 0.55 +
        baseMatch.score * 0.2 +
        experienceScore * 0.15 +
        hiddenRoleScore * 0.05 +
        skillOverlapScore * 0.05
      )
    : clampScore(
        baseMatch.score * 0.45 +
        skillOverlapScore * 0.2 +
        experienceScore * 0.15 +
        hiddenRoleScore * 0.1
      );

  // When a real embedding-based score exists, it IS the primary signal — capping it at
  // baseMatch.score (pure keyword overlap) would let a semantically weak but keyword-dense
  // resume push through, and would cap a semantically strong but keyword-sparse resume for no
  // good reason. The max-of-two-scores safety net only makes sense as a fallback when there's
  // no vector score to trust yet.
  const score = hasVectorScore
    ? weightedCompositeScore
    : clampScore(Math.max(baseMatch.score, weightedCompositeScore));

  return {
    score,
    tag: tagFromScore(score),
    reasoning: {
      ...(baseMatch.reasoning || {}),
      autoApplyBreakdown: {
        baseScore: baseMatch.score,
        weightedCompositeScore,
        skillOverlapScore,
        experienceScore,
        hiddenRoleScore,
        vectorScore,
        hasVectorScore,
        requiredExperienceYears,
        seekerExperienceYears
      }
    },
    suggestions: baseMatch.suggestions || []
  };
}

function computeCandidateMatch(seeker, job) {
  const candidate = buildCandidateEvidence(seeker || {});
  const target = buildJobEvidence(job || {});
  const candidateText = candidate.fullText;
  const requiredEducationYears = extractRequiredEducationYears(target.fullText);
  const meetsEducationRequirement = !requiredEducationYears || candidate.educationYears >= requiredEducationYears;

  const matchedSkills = matchTerms(target.explicitSkills, candidateText);
  const missingSkills = target.explicitSkills.filter((term) => !matchedSkills.includes(term));
  const matchedRequirements = matchTerms(target.requirementTerms, candidateText);
  const missingRequirementKeywords = target.requirementTerms.filter((term) => !matchedRequirements.includes(term));
  if (requiredEducationYears && !meetsEducationRequirement) {
    missingRequirementKeywords.push(`${requiredEducationYears} years full time education`);
  }
  const matchedDescriptionKeywords = matchTerms(target.descriptionTerms, candidateText);
  const roleMatches = candidate.roleTerms.filter((role) => hasTerm(target.fullText, role));
  const projectExperienceMatches = unique([
    ...matchTerms([...target.explicitSkills, ...target.requirementTerms], candidate.projectText),
    ...matchTerms([...target.explicitSkills, ...target.requirementTerms], candidate.experienceText)
  ]);

  const skillScore = target.explicitSkills.length
    ? scoreCoverage(matchedSkills.length, target.explicitSkills.length, 55)
    : scoreCoverage(matchedDescriptionKeywords.length, Math.max(target.descriptionTerms.length, 1), 25);
  const requirementScore = scoreCoverage(matchedRequirements.length, Math.max(target.requirementTerms.length, 1), 25);
  const descriptionScore = scoreCoverage(matchedDescriptionKeywords.length, Math.max(target.descriptionTerms.length, 1), 10);
  const roleScore = roleMatches.length ? 5 : 0;
  const evidenceScore = projectExperienceMatches.length ? 5 : 0;
  const educationScore = requiredEducationYears ? (meetsEducationRequirement ? 5 : -10) : 0;
  const score = Math.max(0, Math.min(100, skillScore + requirementScore + descriptionScore + roleScore + evidenceScore + educationScore));

  return {
    score,
    tag: tagFromScore(score),
    reasoning: {
      matchedSkills,
      missingSkills,
      matchedRequirements,
      missingRequirementKeywords,
      matchedDescriptionKeywords,
      roleMatches,
      projectExperienceMatches,
      educationYears: candidate.educationYears,
      requiredEducationYears,
      meetsEducationRequirement,
      keywordCoverage: {
        skills: target.explicitSkills.length ? Math.round((matchedSkills.length / target.explicitSkills.length) * 100) : 0,
        requirements: target.requirementTerms.length ? Math.round((matchedRequirements.length / target.requirementTerms.length) * 100) : 0,
        description: target.descriptionTerms.length ? Math.round((matchedDescriptionKeywords.length / target.descriptionTerms.length) * 100) : 0
      }
    },
    suggestions: buildSuggestions(missingSkills, missingRequirementKeywords)
  };
}

function computeResumeTextMatch(resumeText, jobText) {
  const candidateText = String(resumeText || "");
  const requiredEducationYears = extractRequiredEducationYears(jobText);
  const requiredExperienceYears = extractRequiredExperienceYears(jobText);
  const educationYears = calculateEducationYearsFromText(candidateText);
  const experienceYears = calculateExperienceYearsFromText(candidateText);
  const meetsEducationRequirement = !requiredEducationYears || educationYears >= requiredEducationYears;
  const meetsExperienceRequirement = !requiredExperienceYears || experienceYears >= requiredExperienceYears;
  const extractedTerms = extractImportantTerms(jobText, 40)
    .filter((term) => term.split(" ").length <= 2);
  const explicitSkills = unique([
    ...extractKnownSkills(jobText),
    ...extractedTerms,
    ...normalizeTokens(extractSkillsSectionTerms(jobText))
  ]).filter(isUsefulTerm).slice(0, 28);
  const jobKeywords = extractedTerms.slice(0, 28);
  const matchedSkills = matchTerms(explicitSkills, candidateText);
  const missingSkills = explicitSkills.filter((term) => !matchedSkills.includes(term));
  const relatedSkillMatches = getRelatedSkillMatches(missingSkills, candidateText);
  const matchedKeywords = matchTerms(jobKeywords, candidateText);
  const missingKeywords = jobKeywords.filter((term) => !matchedKeywords.includes(term));
  const roleSimilarity = getRoleSimilarity(jobText, candidateText);
  const skillUnits = matchedSkills.length + relatedSkillMatches.length * 0.5;
  const skillScore = scoreCoverage(skillUnits, Math.max(explicitSkills.length, 1), 35);
  const keywordScore = scoreCoverage(matchedKeywords.length, Math.max(jobKeywords.length, 1), 20);
  const evidenceScore = hasWorkEvidence(candidateText) ? 10 : 0;
  const roleScore = Math.min(10, roleSimilarity.score);
  const educationScore = requiredEducationYears
    ? (meetsEducationRequirement ? 8 : -8)
    : (/\beducation|degree|b\.?tech|m\.?s|bachelor|master|university|college\b/i.test(candidateText) ? 5 : 0);
  const experienceScore = requiredExperienceYears
    ? (meetsExperienceRequirement ? 5 : -15)
    : 0;
  const baselineScore = 5;
  const rawTotal = skillScore + keywordScore + evidenceScore + roleScore + educationScore + experienceScore + baselineScore;
  const educationMax = requiredEducationYears ? 8 : 5;
  const experienceMax = requiredExperienceYears ? 5 : 0;
  const actualMaxPossible = 35 + 20 + 10 + 10 + educationMax + experienceMax + baselineScore;
  const score = clampScore((rawTotal / actualMaxPossible) * 100);
  const educationMissing = requiredEducationYears && !meetsEducationRequirement
    ? [`${requiredEducationYears} years full time education`]
    : [];
  const experienceMissing = requiredExperienceYears && !meetsExperienceRequirement
    ? [`${requiredExperienceYears} years experience`]
    : [];

  return {
    score,
    tag: tagFromScore(score),
    reasoning: {
      keywordCoverage: jobKeywords.length ? Math.round((matchedKeywords.length / jobKeywords.length) * 100) : 0,
      skillCoverage: explicitSkills.length ? Math.round((matchedSkills.length / explicitSkills.length) * 100) : 0,
      matchedSkills,
      missingSkills,
      relatedSkillMatches,
      matchedKeywords,
      missingKeywords: unique([...missingKeywords, ...educationMissing, ...experienceMissing]),
      roleSimilarity,
      scoreBreakdown: {
        skillScore,
        keywordScore,
        evidenceScore,
        roleScore,
        educationScore,
        experienceScore,
        baselineScore
      },
      educationYears,
      requiredEducationYears,
      meetsEducationRequirement,
      experienceYears,
      requiredExperienceYears,
      meetsExperienceRequirement
    },
    suggestions: buildSuggestions(
      missingSkills,
      unique([...missingKeywords, ...educationMissing, ...experienceMissing])
    )
  };
}

function computeResumeJobMatch(resumeText, job) {
  const candidateText = String(resumeText || "");
  const target = buildJobEvidence(job || {});
  const requiredEducationYears = extractRequiredEducationYears(target.fullText);
  const requiredExperienceYears = extractRequiredExperienceYears(target.fullText);
  const educationYears = calculateEducationYearsFromText(candidateText);
  const experienceYears = calculateExperienceYearsFromText(candidateText);
  const meetsEducationRequirement = !requiredEducationYears || educationYears >= requiredEducationYears;
  const meetsExperienceRequirement = !requiredExperienceYears || experienceYears >= requiredExperienceYears;

  const matchedSkills = matchTerms(target.explicitSkills, candidateText);
  const missingSkills = target.explicitSkills.filter((term) => !matchedSkills.includes(term));
  const relatedSkillMatches = getRelatedSkillMatches(missingSkills, candidateText);
  const matchedRequirements = matchTerms(target.requirementTerms, candidateText);
  const missingRequirementKeywords = target.requirementTerms.filter((term) => !matchedRequirements.includes(term));
  const matchedDescriptionKeywords = matchTerms(target.descriptionTerms, candidateText);
  const missingDescriptionKeywords = target.descriptionTerms.filter((term) => !matchedDescriptionKeywords.includes(term));
  const matchedKeywords = unique([...matchedRequirements, ...matchedDescriptionKeywords]);
  const missingKeywords = unique([
    ...missingRequirementKeywords,
    ...missingDescriptionKeywords
  ]);
  const roleSimilarity = getRoleSimilarity(target.fullText, candidateText);
  const skillUnits = matchedSkills.length + relatedSkillMatches.length * 0.5;
  const skillScore = target.explicitSkills.length
    ? scoreCoverage(skillUnits, target.explicitSkills.length, 35)
    : scoreCoverage(matchedDescriptionKeywords.length, Math.max(target.descriptionTerms.length, 1), 25);
  const requirementScore = scoreCoverage(matchedRequirements.length, Math.max(target.requirementTerms.length, 1), 15);
  const descriptionScore = scoreCoverage(matchedDescriptionKeywords.length, Math.max(target.descriptionTerms.length, 1), 10);
  const evidenceScore = hasWorkEvidence(candidateText) ? 10 : 0;
  const roleScore = Math.min(10, roleSimilarity.score);
  const educationScore = requiredEducationYears
    ? (meetsEducationRequirement ? 8 : -8)
    : (/\beducation|degree|b\.?tech|m\.?s|bachelor|master|university|college\b/i.test(candidateText) ? 5 : 0);
  const experienceScore = requiredExperienceYears
    ? (meetsExperienceRequirement ? 5 : -15)
    : 0;
  const baselineScore = 5;
  const rawTotal = skillScore + requirementScore + descriptionScore + evidenceScore + roleScore + educationScore + experienceScore + baselineScore;
  const skillMax = target.explicitSkills.length ? 35 : 25;
  const educationMax = requiredEducationYears ? 8 : 5;
  const experienceMax = requiredExperienceYears ? 5 : 0;
  const actualMaxPossible = skillMax + 15 + 10 + 10 + 10 + educationMax + experienceMax + baselineScore;
  const score = clampScore((rawTotal / actualMaxPossible) * 100);
  const educationMissing = requiredEducationYears && !meetsEducationRequirement
    ? [`${requiredEducationYears} years full time education`]
    : [];
  const experienceMissing = requiredExperienceYears && !meetsExperienceRequirement
    ? [`${requiredExperienceYears} years experience`]
    : [];

  return {
    score,
    tag: tagFromScore(score),
    reasoning: {
      keywordCoverage: matchedKeywords.length || missingKeywords.length
        ? Math.round((matchedKeywords.length / Math.max(matchedKeywords.length + missingKeywords.length, 1)) * 100)
        : 0,
      skillCoverage: target.explicitSkills.length ? Math.round((matchedSkills.length / target.explicitSkills.length) * 100) : 0,
      matchedSkills,
      missingSkills,
      relatedSkillMatches,
      matchedKeywords,
      missingKeywords: unique([...missingKeywords, ...educationMissing, ...experienceMissing]),
      roleSimilarity,
      scoreBreakdown: {
        skillScore,
        requirementScore,
        descriptionScore,
        evidenceScore,
        roleScore,
        educationScore,
        experienceScore,
        baselineScore
      },
      educationYears,
      requiredEducationYears,
      meetsEducationRequirement,
      experienceYears,
      requiredExperienceYears,
      meetsExperienceRequirement
    },
    suggestions: buildSuggestions(missingSkills, unique([...missingKeywords, ...educationMissing, ...experienceMissing]))
  };
}

module.exports = {
  computeCandidateMatch,
  computeAutoApplyCompositeMatch,
  computeResumeJobMatch,
  computeResumeTextMatch,
  getTopKeywords: extractImportantTerms,
  tagFromScore,
  cosineSimilarity
};
