// Order matters and it was wrong before: `\` was replaced with `\textbackslash{}` FIRST, and the
// later `{`/`}` rules then escaped the braces that replacement had just introduced, yielding
// `\textbackslash\{\}`. Every special is now mapped in a single pass so no replacement can be
// re-processed by a later one. Covers & % $ # _ { } ~ ^ \ — so "R&D", "C#" and "100%" are safe.
const LATEX_ESCAPES = {
  "\\": "\\textbackslash{}",
  "&": "\\&",
  "%": "\\%",
  $: "\\$",
  "#": "\\#",
  _: "\\_",
  "{": "\\{",
  "}": "\\}",
  "~": "\\textasciitilde{}",
  "^": "\\textasciicircum{}"
};

function escapeLatex(value) {
  return String(value === null || value === undefined ? "" : value)
    .replace(/[\\&%$#_{}~^]/g, (character) => LATEX_ESCAPES[character]);
}

function stripLatexFence(value) {
  return String(value || "")
    .replace(/^```(?:latex|tex)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

function formatDate(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function extractYearFromValue(value) {
  if (!value) {
    return 0;
  }

  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return date.getFullYear();
  }

  const match = String(value).match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : 0;
}

function sentence(value, fallback = "") {
  return String(value || fallback).replace(/\s+/g, " ").trim();
}

// Experience/project descriptions come from a free-form multi-line textarea, so a candidate who
// typed several bullet points (one per line, optionally prefixed with •/-/1.) expects each to
// render as its own bullet — not get flattened into one run-on line, which is what sentence()'s
// whitespace collapsing (newlines included) used to do before this split happened.
// Splits a sentence run into individual sentences WITHOUT breaking on the periods inside decimals
// ("3.68"), abbreviations ("e.g.") or version/tech strings ("Node.js", "ASP.NET"). Only a period,
// question mark or exclamation followed by whitespace and a capital/digit starts a new sentence.
function splitSentences(line) {
  return String(line || "")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((part) => part.trim())
    .filter(Boolean);
}

const MAX_BULLETS_PER_ENTRY = 4;

// A candidate who typed one bullet per line expects one \resumeItem per line. A candidate who
// typed a paragraph expects it BROKEN UP, not rendered as a single run-on dash item — that was the
// ADP entry, three sentences crushed into one. So: split on newlines first (explicit intent), and
// where a line still holds several sentences, split those out too.
//
// Nothing is invented or reworded here. The words are the candidate's; only where they break is
// decided by this function.
function splitDescriptionBullets(description) {
  const lines = String(description || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[•*\-–—]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);

  return lines.flatMap((line) => {
    const sentences = splitSentences(line);
    // A single long sentence stays whole; only genuinely multi-sentence lines are broken up.
    return sentences.length > 1 ? sentences : [line];
  });
}

// Emphasis, NOT generation. This bolds spans that are already present in the candidate's own text:
//   1. metrics — a number carrying %, x, ms, s, +, or a ratio like 89/100
//   2. named technologies that appear in the target job's keyword set
// It can never introduce a term the candidate did not write, because every replacement is anchored
// to a match inside the existing string. Capped at MAX_EMPHASIS_SPANS because past three bolded
// runs per bullet the emphasis stops reading as emphasis.
const MAX_EMPHASIS_SPANS = 3;
// NOTE the optional `\\?` before % — this runs on ALREADY-ESCAPED LaTeX, where a percentage is
// "70\%", not "70%". Without it every percentage in every bullet silently missed emphasis, which
// is the single most common metric on a resume.
const METRIC_PATTERN =
  /\b\d[\d,.]*\s*(?:\\?%|x\b|ms\b|s\b|k\b|m\b|bn\b|hrs?\b|hours?\b|mins?\b|minutes?\b|\/\s*\d+)|\b\d[\d,.]*\s*(?:to|->|→)\s*\d[\d,.]*\s*(?:\\?%|x|ms|s)?/gi;

function escapeRegExpLiteral(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function emphasizeBullet(text, emphasisTerms = []) {
  // Applied to ALREADY-ESCAPED LaTeX, so the \textbf{} wrappers we add are the only braces with
  // meaning; the candidate's own braces were turned into \{ \} before we got here.
  let result = String(text || "");
  let used = 0;

  result = result.replace(METRIC_PATTERN, (match) => {
    if (used >= MAX_EMPHASIS_SPANS) {
      return match;
    }
    used += 1;
    // Trailing whitespace must stay OUTSIDE the bold span, or "40 to 8 minutes" renders as
    // "\textbf{40 to 8 }minutes" — the space bolded and the unit left behind.
    const trailing = match.match(/\s+$/)?.[0] || "";
    return `\\textbf{${match.slice(0, match.length - trailing.length)}}${trailing}`;
  });

  for (const term of emphasisTerms) {
    if (used >= MAX_EMPHASIS_SPANS) {
      break;
    }
    const literal = escapeRegExpLiteral(escapeLatex(term));
    if (!literal || literal.length < 2) {
      continue;
    }
    // Word-boundary-ish: not already inside a \textbf{...} we just added.
    const pattern = new RegExp(`(?<!\\\\textbf\\{)\\b(${literal})\\b`, "i");
    if (pattern.test(result)) {
      result = result.replace(pattern, "\\textbf{$1}");
      used += 1;
    }
  }

  return result;
}

function buildResumeItemBullets(description, fallbackText, emphasisTerms = []) {
  const bullets = splitDescriptionBullets(description);
  const finalBullets = (bullets.length ? bullets : [sentence(description, fallbackText)])
    .filter(Boolean)
    .slice(0, MAX_BULLETS_PER_ENTRY);

  return finalBullets
    .map((line) => `\\resumeItem{${emphasizeBullet(escapeLatex(sentence(line)), emphasisTerms)}}`)
    .join("\n");
}

function getEducationSortYear(item = {}) {
  return (
    extractYearFromValue(item.startDate) ||
    extractYearFromValue(item.endDate) ||
    extractYearFromValue(item.graduationYear) ||
    0
  );
}

function sortEducationEntries(entries = []) {
  return [...entries].sort((left, right) => {
    const yearDifference = getEducationSortYear(right.item) - getEducationSortYear(left.item);
    return yearDifference || left.index - right.index;
  });
}

function normalizeForCompare(value) {
  return String(value || "").trim().toLowerCase();
}

// Detects when a synthesized top-level education entry (from legacy scalar profile fields)
// describes the same degree as one already present in the structured education array, so we
// don't render the same degree twice.
function isSameEducationEntry(left = {}, right = {}) {
  const institutionLeft = normalizeForCompare(left.institution);
  const institutionRight = normalizeForCompare(right.institution);
  if (!institutionLeft || !institutionRight || institutionLeft !== institutionRight) {
    return false;
  }

  const degreeLeft = normalizeForCompare(left.degree);
  const degreeRight = normalizeForCompare(right.degree);
  const fieldLeft = normalizeForCompare(left.fieldOfStudy);
  const fieldRight = normalizeForCompare(right.fieldOfStudy);

  return (Boolean(degreeLeft) && degreeLeft === degreeRight) || (Boolean(fieldLeft) && fieldLeft === fieldRight);
}

// Renders "{degree} in {fieldOfStudy}" but omits the suffix when the degree text already
// contains the field of study (e.g. degree "Masters in Computer Science" + fieldOfStudy
// "Computer Science" would otherwise duplicate "Computer Science").
function formatDegreeWithField(degree, fieldOfStudy) {
  const degreeText = String(degree || "").trim();
  const fieldText = String(fieldOfStudy || "").trim();

  if (!fieldText) {
    return escapeLatex(degreeText || "Education");
  }

  if (degreeText.toLowerCase().includes(fieldText.toLowerCase())) {
    return escapeLatex(degreeText || "Education");
  }

  return `${escapeLatex(degreeText || "Education")} in ${escapeLatex(fieldText)}`;
}

function extractLatexEntrySortYear(entry) {
  const years = String(entry || "").match(/\b(?:19|20)\d{2}\b/g) || [];
  return years.length ? Number(years[0]) : 0;
}

function splitEducationEntries(sectionBody) {
  const body = String(sectionBody || "");
  const entryPattern = /(\\(?:item\b|cventry\b|educationentry\b)[\s\S]*?)(?=\\(?:item\b|cventry\b|educationentry\b)|$)/g;
  const entries = [];
  let match;

  while ((match = entryPattern.exec(body))) {
    const entry = match[1].trim();
    if (entry) {
      entries.push(entry);
    }
  }

  return entries;
}

function sortEducationSectionBody(sectionBody) {
  const entries = splitEducationEntries(sectionBody);

  if (entries.length <= 1) {
    return sectionBody;
  }

  return entries
    .map((entry, index) => ({ entry, index, year: extractLatexEntrySortYear(entry) }))
    .sort((left, right) => (right.year - left.year) || left.index - right.index)
    .map(({ entry }) => entry)
    .join("\n\n");
}

function sortLatexEducationSection(latex) {
  const source = String(latex || "");
  const sectionMatch = source.match(/\\section\*?\{Education\}/i);

  if (!sectionMatch) {
    return source;
  }

  const sectionStart = sectionMatch.index;
  const nextSectionMatch = source.slice(sectionStart + sectionMatch[0].length).match(/\n\\section\*?\{/);
  const sectionEnd = nextSectionMatch
    ? sectionStart + sectionMatch[0].length + nextSectionMatch.index
    : source.length;
  const section = source.slice(sectionStart, sectionEnd);
  const itemizeMatch = section.match(/(\\begin\{itemize\}(?:\[[^\]]*\])?\n)([\s\S]*?)(\n\\end\{itemize\})/);

  let sortedSection = section;
  if (itemizeMatch) {
    sortedSection = section.replace(
      itemizeMatch[0],
      `${itemizeMatch[1]}${sortEducationSectionBody(itemizeMatch[2])}${itemizeMatch[3]}`
    );
  } else {
    const headerEnd = sectionMatch[0].length;
    sortedSection = `${section.slice(0, headerEnd)}\n${sortEducationSectionBody(section.slice(headerEnd))}`;
  }

  return `${source.slice(0, sectionStart)}${sortedSection}${source.slice(sectionEnd)}`;
}

function postProcessLatexResume(latex) {
  return stripLatexFence(sortLatexEducationSection(latex)).trim();
}

// Removes a whole \section{Label}...\end{itemize-or-block} block (header included) from
// compiled LaTeX, up to the next \section{} or \end{document}. Used to hard-guarantee that a
// section with no real profile data never reaches the compiled PDF, instead of leaving behind
// an empty or placeholder-filled section.
function findLatexSectionBounds(latex, label) {
  const escapedLabel = String(label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headerPattern = new RegExp(`\\\\section\\*?\\{${escapedLabel}\\}`, "i");
  const headerMatch = latex.match(headerPattern);

  if (!headerMatch) {
    return null;
  }

  const start = headerMatch.index;
  const afterHeader = start + headerMatch[0].length;
  const rest = latex.slice(afterHeader);
  const boundaryMatch = rest.match(/\n\\(?:section\*?\{|end\{document\})/);
  const end = boundaryMatch ? afterHeader + boundaryMatch.index : latex.length;

  return { start, end };
}

function stripEmptyLatexSections(latex, labels = []) {
  const result = labels.reduce((current, label) => {
    const bounds = findLatexSectionBounds(current, label);
    return bounds ? `${current.slice(0, bounds.start)}${current.slice(bounds.end)}` : current;
  }, String(latex || ""));

  return result.replace(/\n{3,}/g, "\n\n").trim();
}

function normalizeResumeTerm(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\breact\s*js\b/g, "react.js")
    .replace(/\bnode\s*js\b/g, "node.js")
    .replace(/\bexpress\s*js\b/g, "express.js")
    .replace(/\bnext\s*js\b/g, "next.js")
    .replace(/\bml\b/g, "machine learning")
    .replace(/\bai\b/g, "artificial intelligence")
    .replace(/[^a-z0-9+#.\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeResumeText(value) {
  const stopwords = new Set([
    "and",
    "are",
    "for",
    "from",
    "have",
    "into",
    "job",
    "role",
    "skills",
    "that",
    "the",
    "this",
    "using",
    "with",
    "work",
    "will"
  ]);

  return normalizeResumeTerm(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !stopwords.has(token));
}

function buildTargetTerms(job) {
  const explicitTerms = [
    job.title,
    job.industry,
    ...(job.skillsRequired || []),
    ...(job.skills || []),
    ...(job.requirements || [])
  ];
  const textTerms = tokenizeResumeText([job.title, job.description, job.industry, ...(job.requirements || [])].join(" "));
  const phraseTerms = normalizeResumeTerm([job.title, ...(job.skillsRequired || []), ...(job.skills || [])].join(" "))
    .split(/[,;|/]+/)
    .map((term) => term.trim())
    .filter(Boolean);

  return [...new Set([
    ...explicitTerms.flatMap((term) => [normalizeResumeTerm(term), ...tokenizeResumeText(term)]),
    ...phraseTerms,
    ...textTerms
  ].filter((term) => term.length > 2))];
}

function containsResumeTerm(text, term) {
  const normalizedText = ` ${normalizeResumeTerm(text)} `;
  const normalizedTerm = normalizeResumeTerm(term);

  if (!normalizedTerm) {
    return false;
  }

  if (normalizedText.includes(` ${normalizedTerm} `)) {
    return true;
  }

  const termTokens = normalizedTerm.split(/\s+/).filter(Boolean);
  if (termTokens.length > 1) {
    const textTokenSet = new Set(tokenizeResumeText(normalizedText));
    return termTokens.every((token) => textTokenSet.has(token));
  }

  return normalizedText.replace(/[^a-z0-9+#]/g, "").includes(normalizedTerm.replace(/[^a-z0-9+#]/g, ""));
}

function flattenSkillGroups(groups = []) {
  return (Array.isArray(groups) ? groups : [])
    .flatMap((group) => group.skills || [])
    .map((skill) => String(skill).trim())
    .filter(Boolean);
}

// A resume's skills line is a summary, not an inventory: past ~20 entries it stops being read
// and starts costing vertical space that bullets need. Ranking decides WHICH 20, never how many.
const MAX_RESUME_SKILLS = 20;

function pickRelevantSkills(profile, job) {
  const profileSkills = [...new Set([
    ...flattenSkillGroups(profile.skillGroups),
    ...(profile.skills || [])
  ].map((skill) => String(skill).trim()).filter(Boolean))];
  const targetTerms = buildTargetTerms(job);
  const relatedGroupSkillSet = new Set();

  (profile.skillGroups || []).forEach((group) => {
    const groupSkills = (group.skills || []).map((skill) => String(skill).trim()).filter(Boolean);
    const groupText = [group.category, ...groupSkills].join(" ");
    const groupMatchesJob = targetTerms.some((term) =>
      containsResumeTerm(groupText, term) || containsResumeTerm(term, groupText)
    );

    if (groupMatchesJob) {
      groupSkills.forEach((skill) => relatedGroupSkillSet.add(skill.toLowerCase()));
    }
  });

  const scoredSkills = profileSkills.map((skill, index) => {
    const normalizedSkill = normalizeResumeTerm(skill);
    const score = targetTerms.reduce((total, term) => {
      if (containsResumeTerm(normalizedSkill, term) || containsResumeTerm(term, normalizedSkill)) {
        return total + (term.includes(" ") ? 3 : 1);
      }
      return total;
    }, relatedGroupSkillSet.has(skill.toLowerCase()) ? 1 : 0);

    return { skill, index, score };
  });

  // Relevance ORDERS the list; it must never shorten it. The previous implementation discarded
  // every score-0 skill the moment a SINGLE skill matched the posting, so a MERN job erased
  // Docker, Kubernetes and Jenkins from a DevOps candidate's resume outright. Score 0 does not
  // mean "irrelevant" — it means "did not textually match this posting's keyword list", which is
  // true of most of a strong candidate's skill set. This is the same defect class as relevance
  // deleting the most recent role: filtering before capping silently destroys real credentials.
  const rankedSkills = scoredSkills
    .sort((left, right) => right.score - left.score || left.index - right.index);

  // Top N out of ALL skills — matched ones first, so a recruiter skimming the line sees the fit
  // immediately, with the remainder following in the candidate's own stored order.
  return rankedSkills.slice(0, MAX_RESUME_SKILLS).map((entry) => entry.skill);
}

function getResumeProfileReadiness(profile) {
  const objectiveText = sentence(profile.careerObjective || profile.bio || profile.tagline);
  const educationCount =
    (profile.education || []).length +
    ([profile.degree, profile.major, profile.universityName].filter(Boolean).length ? 1 : 0);
  const experienceCount = (profile.experience || []).length;
  const projectCount = (profile.projects || []).length;
  const skillCount = [...flattenSkillGroups(profile.skillGroups), ...(profile.skills || [])].filter(Boolean).length;
  const certificationCount = (profile.licensesAndCertifications || []).length;
  const achievementCount = (profile.achievements || []).length;
  const missingSections = [];

  // Objective and Experience are optional/non-blocking: buildTargetedResumeObjective already
  // generates a real objective line from currentStatus/skills/target role when careerObjective
  // is blank, and an empty Experience section is correctly omitted (not fabricated) via
  // omitEmptySections in buildLatexResumeFromTemplate.
  if (!educationCount) {
    missingSections.push("education");
  }

  if (!skillCount) {
    missingSections.push("skills");
  }

  if (!projectCount) {
    missingSections.push("projects");
  }

  return {
    ready: missingSections.length === 0,
    missingSections,
    profileSectionsUsed: {
      objective: Boolean(objectiveText),
      educationCount,
      experienceCount,
      projectCount,
      skillCount,
      certificationCount,
      achievementCount
    }
  };
}

function buildLatexList(items) {
  const normalized = items.map((item) => sentence(item)).filter(Boolean);

  if (!normalized.length) {
    return "\\item Details available on request.";
  }

  return normalized.map((item) => `\\item ${escapeLatex(item)}`).join("\n");
}

const skillCategoryRules = [
  {
    label: "Web Development",
    patterns: [
      /\bhtml5?\b/i, /\bcss3?\b/i, /sass/i, /scss/i, /less/i, /javascript/i, /\bjs\b/i,
      /typescript/i, /\bts\b/i, /react/i, /redux/i, /next\.?js/i, /node\.?js/i, /\bnode\b/i,
      /express/i, /nest\.?js/i, /angular/i, /vue/i, /nuxt/i, /svelte/i, /astro/i,
      /tailwind/i, /bootstrap/i, /material ui/i, /\bmui\b/i, /chakra/i, /jquery/i,
      /vite/i, /webpack/i, /babel/i, /rest api/i, /\brest\b/i, /graphql/i,
      /api integration/i, /websocket/i, /frontend/i, /backend/i, /full.?stack/i,
      /django/i, /flask/i, /fastapi/i, /spring boot/i, /laravel/i, /asp\.?net/i,
      /ruby on rails/i, /\brails\b/i, /wordpress/i, /web development/i
    ]
  },
  {
    label: "Programming",
    patterns: [
      /^java$/i, /^python$/i, /^c$/i, /^c\+\+$/i, /^c#$/i, /^go(lang)?$/i, /^rust$/i,
      /^php$/i, /^ruby$/i, /^swift$/i, /^kotlin$/i, /^scala$/i, /^r$/i, /^matlab$/i,
      /^perl$/i, /^dart$/i, /^lua$/i, /^elixir$/i, /^erlang$/i, /^haskell$/i,
      /^clojure$/i, /^f#$/i, /^objective-?c$/i, /^visual basic$/i, /^vb\.?net$/i,
      /^shell scripting$/i, /^bash$/i, /^zsh$/i, /^powershell$/i, /^solidity$/i,
      /^assembly$/i, /^asm$/i, /^groovy$/i, /^delphi$/i, /^fortran$/i, /^cobol$/i,
      /^julia$/i, /^scratch$/i
    ]
  },
  {
    label: "Mobile Development",
    patterns: [
      /android/i, /\bios\b/i, /react native/i, /flutter/i, /swiftui/i, /xcode/i,
      /android studio/i, /mobile development/i, /mobile app/i, /jetpack compose/i,
      /kotlin multiplatform/i, /cordova/i, /ionic/i
    ]
  },
  {
    label: "Databases",
    patterns: [
      /mongo/i, /mysql/i, /postgres/i, /sql\b/i, /sqlite/i, /redis/i, /oracle/i,
      /mariadb/i, /cassandra/i, /dynamodb/i, /neo4j/i, /elasticsearch/i, /opensearch/i,
      /database/i, /firebase/i, /firestore/i, /supabase/i, /prisma/i, /mongoose/i,
      /sequelize/i, /typeorm/i, /knex/i, /snowflake/i, /bigquery/i, /redshift/i,
      /data warehouse/i
    ]
  },
  {
    label: "AI & Data",
    patterns: [
      /machine learning/i, /\bml\b/i, /deep learning/i, /\bai\b/i, /generative ai/i,
      /data science/i, /data analysis/i, /analytics/i, /business intelligence/i, /\bbi\b/i,
      /pandas/i, /numpy/i, /tensorflow/i, /pytorch/i, /keras/i, /scikit/i, /sklearn/i,
      /matplotlib/i, /seaborn/i, /power bi/i, /tableau/i, /excel analytics/i, /nlp/i,
      /computer vision/i, /opencv/i, /hugging face/i, /transformer/i, /llm/i, /rag/i,
      /prompt engineering/i, /statistics/i, /big data/i, /spark/i, /hadoop/i, /etl/i,
      /data engineering/i, /airflow/i, /databricks/i
    ]
  },
  {
    label: "Cloud & DevOps",
    patterns: [
      /aws/i, /azure/i, /gcp/i, /google cloud/i, /docker/i, /kubernetes/i, /\bk8s\b/i,
      /jenkins/i, /github actions/i, /gitlab ci/i, /ci\/cd/i, /devops/i, /terraform/i,
      /ansible/i, /linux/i, /ubuntu/i, /nginx/i, /apache/i, /vercel/i, /netlify/i,
      /heroku/i, /render/i, /cloudflare/i, /prometheus/i, /grafana/i, /helm/i,
      /serverless/i, /lambda/i, /ec2/i, /s3/i, /cloudfront/i, /firebase hosting/i
    ]
  },
  {
    label: "Testing & QA",
    patterns: [
      /testing/i, /\bqa\b/i, /quality assurance/i, /selenium/i, /cypress/i, /playwright/i,
      /jest/i, /vitest/i, /mocha/i, /chai/i, /junit/i, /testng/i, /pytest/i, /postman testing/i,
      /manual testing/i, /automation testing/i, /unit testing/i, /integration testing/i,
      /api testing/i, /istqb/i, /bug tracking/i
    ]
  },
  {
    label: "Design & UI/UX",
    patterns: [
      /ui\/ux/i, /\bui\b/i, /\bux\b/i, /wireframe/i, /prototype/i, /design system/i,
      /user research/i, /canva/i, /figma/i, /adobe xd/i, /photoshop/i, /illustrator/i,
      /framer/i
    ]
  },
  {
    label: "Tools",
    patterns: [
      /git\b/i, /github/i, /gitlab/i, /bitbucket/i, /postman/i, /swagger/i, /openapi/i,
      /jira/i, /notion/i, /trello/i, /slack/i, /vs\s?code/i, /visual studio/i, /intellij/i,
      /eclipse/i, /pycharm/i, /excel/i, /microsoft office/i
    ]
  },
  {
    label: "Soft Skills",
    patterns: [
      /communication/i, /leadership/i, /teamwork/i, /problem solving/i, /adaptability/i,
      /collaboration/i, /time management/i, /critical thinking/i, /presentation/i,
      /ownership/i, /creativity/i, /decision making/i, /attention to detail/i
    ]
  }
];

// The language patterns are strictly anchored (/^java$/), so a perfectly ordinary label like
// "Core Java" or "Advanced Python" fell through to "Other". This strips a leading qualifier FOR
// MATCHING ONLY — the displayed label keeps the candidate's own wording.
const SKILL_QUALIFIER_PATTERN = /^(?:core|advanced|modern|proficient(?:\s+in)?|strong|expert(?:\s+in)?|hands[- ]on(?:\s+with)?)\s+/i;

function categoryMatchKey(skill) {
  return String(skill || "").trim().replace(SKILL_QUALIFIER_PATTERN, "").trim();
}

function categorizeSkills(skills) {
  const grouped = skillCategoryRules.reduce((accumulator, category) => {
    accumulator[category.label] = [];
    return accumulator;
  }, {});
  // "Other" is created LAST so it renders last. Previously it was seeded first and a profile whose
  // strongest skills happened to be uncategorised led its Technical Skills block with "Other:".
  grouped.Other = [];

  skills.forEach((skill) => {
    const key = categoryMatchKey(skill);
    const category = skillCategoryRules.find((rule) =>
      rule.patterns.some((pattern) => pattern.test(skill) || pattern.test(key))
    );

    grouped[category?.label || "Other"].push(skill);
  });

  return Object.entries(grouped)
    .filter(([, values]) => values.length)
    .map(([label, values]) => ({ label, skills: [...new Set(values)] }));
}

function categorizeResumeSkills(profile, selectedSkills) {
  const selectedSet = new Set(selectedSkills.map((skill) => skill.toLowerCase()));
  const selectedIndexBySkill = new Map(
    selectedSkills.map((skill, index) => [skill.toLowerCase(), index])
  );
  // A skillGroup with an EMPTY category is the common shape — the parser emits one unlabelled
  // group holding every skill. Falling back to the literal label "Skills" (the old behaviour) is
  // what collapsed a whole profile into a single generic "Skills:" line. An unlabelled group is
  // now handed to the pattern-based categoriser instead, which splits it into real buckets
  // ("Programming Languages", "Databases", "Testing & QA", ...).
  const labelledGroups = (profile.skillGroups || []).filter((group) => sentence(group?.category));
  const unlabelledGroupSkills = (profile.skillGroups || [])
    .filter((group) => !sentence(group?.category))
    .flatMap((group) => group?.skills || []);

  const groupedFromProfile = labelledGroups
    .map((group) => ({
      label: sentence(group.category),
      skills: [...new Set((group.skills || [])
        .map((skill) => String(skill || "").trim())
        .filter((skill) => selectedSet.has(skill.toLowerCase()))
      )]
    }))
    .filter((group) => group.skills.length)
    .sort((left, right) => {
      const leftBestIndex = Math.min(...left.skills.map((skill) => selectedIndexBySkill.get(skill.toLowerCase()) ?? 999));
      const rightBestIndex = Math.min(...right.skills.map((skill) => selectedIndexBySkill.get(skill.toLowerCase()) ?? 999));
      return leftBestIndex - rightBestIndex;
    });

  const groupedSkillSet = new Set(
    groupedFromProfile.flatMap((group) => group.skills.map((skill) => skill.toLowerCase()))
  );
  // Everything not claimed by a labelled group — including every skill from unlabelled groups —
  // goes through the pattern categoriser.
  const uncategorizedSelectedSkills = [
    ...selectedSkills,
    ...unlabelledGroupSkills.map((skill) => String(skill || "").trim())
  ].filter(
    (skill, index, all) =>
      skill &&
      selectedSet.has(skill.toLowerCase()) &&
      !groupedSkillSet.has(skill.toLowerCase()) &&
      all.findIndex((other) => other.toLowerCase() === skill.toLowerCase()) === index
  );

  return [...groupedFromProfile, ...categorizeSkills(uncategorizedSelectedSkills)]
    .map((group) => ({
      label: group.label,
      // Hedges are stripped at render time so "Basics of C++" prints as "C++", without rewriting
      // what the candidate stored in their profile.
      skills: [...new Set(group.skills.map(normalizeSkillLabel).filter(Boolean))]
    }))
    .filter((group) => group.skills.length);
}

// "3.684" -> "3.68/4", "8.68" -> "8.68/10", "88" -> "88%". The scale is inferred from the value's
// own magnitude, never invented: a GPA the profile stores as 3.684 is a 4-point scale by
// construction. The number itself is only rounded for display, never altered.
function formatGpa(value) {
  const raw = String(value === null || value === undefined ? "" : value).trim();
  if (!raw) {
    return "";
  }

  // Already carries its own scale ("8.68/10", "3.68 / 4") — pass through untouched.
  if (/\//.test(raw)) {
    return raw;
  }

  const numeric = Number(raw.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return raw;
  }

  const rounded = Math.round(numeric * 100) / 100;
  if (numeric <= 5) {
    return `${rounded}/4`;
  }
  if (numeric <= 10) {
    return `${rounded}/10`;
  }
  return `${rounded}%`;
}

function normalizeTitleKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Collapses entries that are the same achievement written twice — across the achievements and
// certifications arrays, which this codebase populates from one parser pass and therefore
// routinely duplicates. First occurrence wins, so ordering (achievements first) is preserved.
function dedupeTitledItems(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    const key = normalizeTitleKey(item?.title);
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function flattenProjectTechStack(item = {}) {
  const raw = item.technologies || item.techStack || item.tools || item.stack || [];
  const values = Array.isArray(raw) ? raw : String(raw).split(/[,;|]/);
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))].join(", ");
}

const COURSEWORK_SECTION_PATTERN = /coursework|courses|subjects studied/i;
const EXTRACURRICULAR_SECTION_PATTERN = /extra[- ]?curricular|volunteer|activities|clubs?|societ|leadership|community/i;

function getCustomSections(profile = {}) {
  return [...(profile.customSections || []), ...(profile.additionalSections || [])].filter(Boolean);
}

// Coursework is a flat list of titles. It comes from whichever custom/additional section the
// parser filed it under, or from an explicit `coursework` field if one exists.
function collectCoursework(profile = {}) {
  const explicit = Array.isArray(profile.coursework) ? profile.coursework : [];
  const fromSections = getCustomSections(profile)
    .filter((section) => COURSEWORK_SECTION_PATTERN.test(section.title || section.sectionTitle || ""))
    .flatMap((section) => (section.entries || []).map((entry) => entry.title));

  return [...new Set([...explicit, ...fromSections].map((value) => sentence(value)).filter(Boolean))];
}

// Pulls a trailing date RANGE off the end of a heading: "NSS 2019 - 2022" -> { text: "NSS",
// dates: "2019 -- 2022" }. Ranges only — a bare trailing year is left alone, because it is just
// as likely to be part of the name itself ("Hack 2024", "IEEE 802.11"). Nothing is invented: the
// digits are the candidate's own, only relocated into the column built to hold them.
const TRAILING_DATE_RANGE_PATTERN =
  /[\s,(\[|-]+((?:[A-Z][a-z]{2,8}\.?[\s-]+)?\d{4})\s*(?:-{1,2}|–|—|to|until|through)\s*((?:[A-Z][a-z]{2,8}\.?[\s-]+)?\d{4}|Present|Current|Ongoing|Date)\s*[)\]]?\s*$/i;

function splitTrailingDateRange(value) {
  const text = sentence(value);
  if (!text) {
    return { text: "", dates: "" };
  }

  const match = text.match(TRAILING_DATE_RANGE_PATTERN);
  if (!match) {
    return { text, dates: "" };
  }

  const remaining = text.slice(0, match.index).replace(/[\s,(\[|-]+$/, "").trim();
  // Only split when something meaningful is left behind. A heading that is nothing BUT a date
  // range keeps its text, rather than collapsing the entry to an empty organisation.
  if (!remaining) {
    return { text, dates: "" };
  }

  return { text: remaining, dates: `${match[1].trim()} -- ${match[2].trim()}` };
}

function collectExtracurricular(profile = {}) {
  const fromSections = getCustomSections(profile)
    .filter((section) => EXTRACURRICULAR_SECTION_PATTERN.test(section.title || section.sectionTitle || ""))
    .flatMap((section) => section.entries || []);

  return fromSections.filter((entry) => sentence(entry?.title) || sentence(entry?.organization));
}

// "Basics of C++" -> "C++", "Familiar with Docker" -> "Docker". A resume states what the candidate
// can do; a hedge in the skill string undersells it and reads as filler. Only leading hedges are
// stripped — the skill itself is never reworded.
const SKILL_HEDGE_PATTERN = /^(?:basics?\s+(?:of|in)|basic|familiar(?:ity)?\s+with|beginner\s+(?:in|at|level)|working\s+knowledge\s+of|knowledge\s+of|exposure\s+to|intro(?:duction)?\s+to|some|elementary)\s+/i;

function normalizeSkillLabel(skill) {
  const cleaned = String(skill || "").trim().replace(SKILL_HEDGE_PATTERN, "").trim();
  return cleaned || String(skill || "").trim();
}

function hasMeaningfulContent(item = {}, fields = []) {
  return fields.some((field) => sentence(item[field]));
}

// Sanitizes a seeker profile for the "tailor from pasted job description" flow: strips
// blank/placeholder-only entries so downstream section-emptiness checks (and therefore the
// omitEmptySections hard filter in buildResumeContent) are based on real data only, and so the
// Gemini objective prompt never sees junk entries it could echo back.
function buildProfileForTailoring(seeker = {}) {
  const profile = { ...seeker };

  profile.projects = (seeker.projects || []).filter((item) =>
    hasMeaningfulContent(item, ["title", "description"])
  );
  profile.experience = (seeker.experience || []).filter((item) =>
    hasMeaningfulContent(item, ["jobTitle", "companyName", "description"])
  );
  profile.education = (seeker.education || []).filter((item) =>
    hasMeaningfulContent(item, ["institution", "degree", "fieldOfStudy"])
  );
  profile.licensesAndCertifications = (seeker.licensesAndCertifications || []).filter((item) =>
    hasMeaningfulContent(item, ["title", "description"])
  );
  profile.achievements = (seeker.achievements || []).filter((item) =>
    hasMeaningfulContent(item, ["title", "description"])
  );
  profile.skillGroups = (seeker.skillGroups || [])
    .map((group) => ({
      ...group,
      skills: (group.skills || []).map((skill) => String(skill || "").trim()).filter(Boolean)
    }))
    .filter((group) => group.skills.length);
  profile.skills = (seeker.skills || []).map((skill) => String(skill || "").trim()).filter(Boolean);

  return profile;
}

// ONE template, read from utils/resume.template.txt at module load. The inline copy that used to
// live here had already drifted from the file (2562 vs 2523 characters), so which layout you got
// depended on which caller you came through. The file wins; the literal below is only a last-resort
// fallback for an environment where the file is unreadable, and is intentionally minimal.
const path = require("path");
const fs = require("fs");

const TEMPLATE_PATH = path.join(__dirname, "..", "utils", "resume.template.txt");

const FALLBACK_TEMPLATE = String.raw`\documentclass[letterpaper,11pt]{article}
\usepackage[empty]{fullpage}
\usepackage{enumitem}
\begin{document}
\begin{center}{\Huge NAME}\end{center}
OBJECTIVE
\end{document}`;

function loadResumeTemplate() {
  try {
    const contents = fs.readFileSync(TEMPLATE_PATH, "utf8");
    if (String(contents || "").includes("begin{document}")) {
      return contents;
    }
  } catch {
    // Fall through to the built-in fallback.
  }
  return FALLBACK_TEMPLATE;
}

const defaultResumeTemplate = loadResumeTemplate();

function linkLabel(url) {
  return String(url || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function firstPresent(...values) {
  return values.find((value) => sentence(value));
}

function rawUrl(value) {
  return String(value || "").trim().replace(/[{}]/g, "");
}

function itemRelevanceScore(item, jobText) {
  const itemText = [
    item.title,
    item.jobTitle,
    item.companyName,
    item.description,
    ...(item.technologies || item.techStack || [])
  ]
    .filter(Boolean)
    .join(" ");
  const targetTerms = Array.isArray(jobText) ? jobText : tokenizeResumeText(jobText);
  const itemTokens = tokenizeResumeText(itemText);
  const exactScore = targetTerms.reduce((score, term) => {
    if (containsResumeTerm(itemText, term)) {
      return score + (String(term).includes(" ") ? 4 : 2);
    }

    return score;
  }, 0);
  const tokenScore = itemTokens.reduce((score, token) => score + (targetTerms.includes(token) ? 1 : 0), 0);

  return exactScore + tokenScore;
}

function sortByJobRelevance(items, targetTerms) {
  return [...items].sort((a, b) => itemRelevanceScore(b, targetTerms) - itemRelevanceScore(a, targetTerms));
}

function getRecencySortValue(item = {}) {
  if (item.isCurrent || item.currentlyWorking) {
    return Number.MAX_SAFE_INTEGER;
  }

  const end = new Date(item.endDate);
  if (!Number.isNaN(end.getTime())) {
    return end.getTime();
  }

  const start = new Date(item.startDate);
  if (!Number.isNaN(start.getTime())) {
    return start.getTime();
  }

  return extractYearFromValue(item.endDate || item.startDate || item.graduationYear) * 1000;
}

// How many of the newest entries are protected from relevance filtering, regardless of score.
const PROTECTED_RECENT_ITEMS = 3;

// RELEVANCE MAY REORDER EMPHASIS; IT MUST NOT DELETE EMPLOYMENT HISTORY.
//
// The previous implementation scored every entry against the target job's keywords, kept only
// entries scoring > 0, then sliced. A recent Data Science internship measured against a
// Java/Selenium posting scores zero and silently vanished — leaving a hole in the timeline, which
// a recruiter reads as concealment, not as tailoring.
//
// Now the newest PROTECTED_RECENT_ITEMS entries are always included. Relevance decides the ORDER
// of what remains and which of the older, less relevant entries get dropped when the limit binds.
function selectRelevantItems(items, targetTerms, limit = 4, options = {}) {
  const protectRecent = options.protectRecent === undefined ? PROTECTED_RECENT_ITEMS : options.protectRecent;

  const scoredItems = (items || []).map((item, index) => ({
    item,
    index,
    score: itemRelevanceScore(item, targetTerms),
    recency: getRecencySortValue(item)
  }));

  if (!scoredItems.length) {
    return [];
  }

  const byRecency = [...scoredItems].sort(
    (left, right) => right.recency - left.recency || left.index - right.index
  );
  const protectedEntries = byRecency.slice(0, Math.max(0, protectRecent));
  const protectedIndexes = new Set(protectedEntries.map((entry) => entry.index));

  const byRelevance = [...scoredItems]
    .filter((entry) => !protectedIndexes.has(entry.index))
    .sort((left, right) => right.score - left.score || left.index - right.index);

  // Fill any remaining slots with the most relevant of the unprotected entries; entries that score
  // zero are still eligible once the relevant ones are exhausted, so nothing is dropped unless the
  // limit genuinely binds.
  const remainingSlots = Math.max(0, limit - protectedEntries.length);
  const selected = [...protectedEntries, ...byRelevance.slice(0, remainingSlots)];

  // Present newest-first — the shape a recruiter expects to read.
  return selected
    .sort((left, right) => right.recency - left.recency || left.index - right.index)
    .map((entry) => entry.item);
}

function buildTargetedResumeObjective(profile, job, skills = []) {
  const jobSkills = [...(job.skillsRequired || []), ...(job.skills || [])].filter(Boolean);
  const roleTitle = job.title || (profile.preferredRoles || [])[0] || "Target Role";
  const strongestSkills = skills.slice(0, 5).join(", ") || jobSkills.slice(0, 5).join(", ") || "role-relevant technical skills";
  const jobRequirementFocus = (job.requirements || [])
    .slice(0, 2)
    .map((item) => sentence(item))
    .filter(Boolean)
    .join("; ");

  return sentence(
    `${profile.currentStatus || "Professional"} candidate targeting ${roleTitle} roles with strengths in ${strongestSkills}. Seeking to apply relevant project, experience, and education background to ${jobRequirementFocus || `deliver outcomes aligned with ${roleTitle} requirements`}.`
  );
}

function buildResumeContent(profile, job, options = {}) {
  const omitEmptySections = Boolean(options.omitEmptySections);
  const name = sentence(`${profile.firstName || ""} ${profile.lastName || ""}`, "Applicant");
  const skills = pickRelevantSkills(profile, job);
  const jobSkills = [...(job.skillsRequired || []), ...(job.skills || [])].filter(Boolean);
  const roleTitle = job.title || (profile.preferredRoles || [])[0] || "Target Role";
  const targetTerms = buildTargetTerms(job);
  const institutionLine = firstPresent(
    profile.universityName,
    profile.collegeName,
    profile.college,
    profile.institution,
    profile.education?.[0]?.institution,
    profile.headquartersLocation,
    profile.location
  ) || "";
  const phone = firstPresent(profile.phone, profile.mobile, profile.mobileNumber, profile.phoneNumber) || "";
  const email = firstPresent(profile.email, profile.userEmail, profile.contactEmail) || "";
  const linkedinUrl = firstPresent(profile.linkedinUrl, profile.linkedInUrl, profile.linkedin, profile.linkedIn) || "";
  const githubUrl = firstPresent(profile.githubUrl, profile.github, profile.gitHubUrl, profile.gitHub) || "";
  const objective = sentence(options.objective, buildTargetedResumeObjective(profile, job, skills));

  // Terms eligible for bold emphasis inside bullets: the target job's keywords, longest first so
  // "Spring Boot" wins over "Spring". These only ever EMPHASISE text the candidate already wrote.
  const emphasisTerms = [...new Set(jobSkills.map((skill) => String(skill || "").trim()).filter(Boolean))]
    .sort((left, right) => right.length - left.length)
    .slice(0, 40);

  // Company leads (bold, left) with dates on the right; role and location on the italic second
  // line. Location was previously never passed at all, which is why it never appeared.
  const experienceItems = selectRelevantItems(profile.experience || [], targetTerms, 4).map((item) => {
    const dates = [formatDate(item.startDate), item.isCurrent ? "Present" : formatDate(item.endDate)]
      .filter(Boolean)
      .join(" -- ");
    const location = firstPresent(item.location, item.city, item.jobLocation) || "";
    return [
      `\\resumeSubheading{${escapeLatex(item.companyName || "Company")}}{${escapeLatex(dates)}}{${escapeLatex(item.jobTitle || item.role || item.title || "")}}{${escapeLatex(location)}}`,
      "\n\\resumeItemListStart\n",
      buildResumeItemBullets(
        item.description,
        `Applied relevant skills to responsibilities aligned with ${roleTitle}.`,
        emphasisTerms
      ),
      "\n\\resumeItemListEnd"
    ].join("");
  });

  // The right-hand slot holds the DATE RANGE, not a raw URL. Where a repository link exists the
  // title becomes a \faGithub hyperlink instead, so the link is present without eating the margin.
  const projectItems = selectRelevantItems(profile.projects || [], targetTerms, 3, { protectRecent: 1 }).map((item) => {
    const techStack = flattenProjectTechStack(item);
    const dates = [formatDate(item.startDate), item.isCurrent ? "Present" : formatDate(item.endDate)]
      .filter(Boolean)
      .join(" -- ");
    const link = firstPresent(item.repositoryUrl, item.githubUrl, item.projectUrl, item.liveUrl) || "";
    const escapedTitle = escapeLatex(item.title || "Project");
    const titleMarkup = link
      ? `\\href{${rawUrl(link)}}{\\textbf{${escapedTitle}} \\faGithub}`
      : `\\textbf{${escapedTitle}}`;
    return [
      `\\resumeProjectHeading{${titleMarkup}${techStack ? ` $|$ \\emph{${escapeLatex(techStack)}}` : ""}}{${escapeLatex(dates)}}`,
      "\\resumeItemListStart\n",
      buildResumeItemBullets(
        item.description,
        `Built a project aligned with ${roleTitle} requirements.`,
        emphasisTerms
      ),
      "\n\\resumeItemListEnd"
    ].join("");
  });

  const structuredEducationEntries = (profile.education || []).map((item, index) => ({ item, index }));
  const topLevelEducationCandidate = [profile.degree, profile.major, profile.universityName].filter(Boolean).length
    ? {
        degree: profile.degree,
        fieldOfStudy: profile.major,
        institution: profile.universityName,
        graduationYear: profile.graduationYear,
        currentGPA: profile.currentGPA
      }
    : null;
  const topLevelEducationEntry =
    topLevelEducationCandidate &&
    !structuredEducationEntries.some(({ item }) => isSameEducationEntry(item, topLevelEducationCandidate))
      ? { item: topLevelEducationCandidate, index: structuredEducationEntries.length }
      : null;
  const educationEntries = sortEducationEntries([
    ...structuredEducationEntries,
    ...(topLevelEducationEntry ? [topLevelEducationEntry] : [])
  ]);
  // The whole-profile GPA lives on the top-level `currentGPA` scalar, not on each education
  // subdocument, so an entry-level lookup alone found nothing and no GPA was ever emitted. It is
  // attributed to the most recent entry only — the one the top-level scalar describes.
  const mostRecentEducationItem = educationEntries[0]?.item;
  const educationItems = educationEntries.map(({ item }) => {
      const dates = [formatDate(item.startDate), formatDate(item.endDate)].filter(Boolean).join(" -- ");
      const year = dates || item.graduationYear;
      const gpaValue = firstPresent(
        item.currentGPA,
        item.gpa,
        item.cgpa,
        item === mostRecentEducationItem ? profile.currentGPA : undefined
      );
      const gpa = gpaValue ? ` \\hfill CGPA: ${escapeLatex(formatGpa(gpaValue))}` : "";
      return [
        `\\item\\textbf{${formatDegreeWithField(item.degree, item.fieldOfStudy)}} ${year ? `\\hfill ${escapeLatex(year)}` : ""} \\\\`,
        `${escapeLatex(item.institution || "Institution")}${gpa}`
      ].join("");
    });

  // ONE merged section, matching the reference. The two arrays routinely hold the same entries —
  // this candidate's "5 star badge in Problem Solving - HackerRank" and GATE rank were in both, and
  // rendered twice. Merging removes the failure mode rather than just papering over it, and
  // dedupeTitledItems collapses near-identical titles (case/punctuation/whitespace insensitive).
  const achievementCertificationItems = dedupeTitledItems([
    ...(profile.achievements || []),
    ...(profile.licensesAndCertifications || [])
  ])
    .slice(0, 8)
    .map((item) => {
      const title = escapeLatex(item.title || "Achievement");
      const detail = item.description ? `: ${escapeLatex(sentence(item.description))}` : "";
      return `\\item \\small{${emphasizeBullet(`${title}${detail}`, emphasisTerms)}}`;
    });

  const courseworkItems = collectCoursework(profile)
    .slice(0, 12)
    .map((course) => `\\item \\small{${escapeLatex(course)}}`);

  const extracurricularItems = collectExtracurricular(profile)
    .slice(0, 4)
    .map((item) => {
      // Argument order matches Experience: organisation bold-left, dates right, role italic-left,
      // place italic-right. This was inverted — `organization` (the ROLE, e.g. "Volunteer") was
      // passed as the bold organisation and `title` (the actual body, e.g. "NSS") as the italic
      // role, so the entry read upside down against every other entry on the page.
      const explicitDates = [formatDate(item.startDate), formatDate(item.endDate)].filter(Boolean).join(" -- ");
      // Parsers routinely fuse the dates into the title ("NSS 2019 - 2022") because a flat
      // activity line has nowhere else to put them. Splitting a trailing date RANGE back out is
      // unambiguous, so the dates reach their own column instead of sitting inside the heading.
      const splitTitle = splitTrailingDateRange(item.title);
      const organisation = splitTitle.text || sentence(item.organization) || "Activity";
      const role = splitTitle.text ? sentence(item.organization) : "";
      const dates = explicitDates || splitTitle.dates;
      const heading = `\\resumeSubheading{${escapeLatex(organisation)}}{${escapeLatex(dates)}}{${escapeLatex(role)}}{${escapeLatex(item.location || "")}}`;
      if (!sentence(item.description)) {
        return heading;
      }
      return [
        heading,
        "\n\\resumeItemListStart\n",
        buildResumeItemBullets(item.description, "", emphasisTerms),
        "\n\\resumeItemListEnd"
      ].join("");
    });

  // The line break is a SEPARATOR, not a suffix. Appending `\\[3pt]` to every line put one after
  // the last one too, and when Technical Skills happened to be the final section — a sparse profile
  // with no experience, projects or achievements — that trailing `\\` had no line to end and
  // pdflatex aborted with "There's no line here to end". The resume simply failed to build.
  const categorizedSkills = categorizeResumeSkills(profile, skills);
  const technicalLines = categorizedSkills.length
    ? categorizedSkills.map((category) =>
      `\\textbf{${escapeLatex(category.label)}:} ${escapeLatex(category.skills.join(", "))}`
    )
    : (omitEmptySections ? [] : [`\\textbf{Skills:} Relevant technical skills`]);

  // REMOVED, permanently: a "Core Concepts" line built from `jobSkills` — the EMPLOYER'S OWN
  // stated requirements — attributed the job posting's wish-list to the candidate as if it were
  // their skill set. That is a factual misrepresentation on a document an employer relies on, and
  // it was emitted on every resume generated with omitEmptySections=false. The "Soft Skills"
  // line beneath it was fixed generic filler ("Problem Solving, Communication, Adaptability, Team
  // Player") identical on every candidate's resume, which weakens rather than strengthens it.
  // Neither is reinstatable behind a flag: both are gone.

  return {
    NAME: escapeLatex(name),
    // Carries its OWN line break, so an empty value emits nothing at all. Previously the template
    // hard-coded `LOCATION_OR_UNIVERSITY \ space{1pt}`, and a profile with no university or
    // location left a line containing only `\` — which pdflatex rejects outright with
    // "There's no line here to end". The resume did not render badly; it failed to build.
    LOCATION_OR_UNIVERSITY: institutionLine
      ? `${escapeLatex(institutionLine)} \\\\ \\vspace{1pt}\n`
      : "",
    PHONE: escapeLatex(phone || "Phone not available"),
    EMAIL: escapeLatex(email || "email-not-available@example.com"),
    LINKEDIN: rawUrl(linkedinUrl || "https://linkedin.com"),
    LINKEDIN_LABEL: escapeLatex(linkLabel(linkedinUrl || "linkedin.com")),
    GITHUB: rawUrl(githubUrl || "https://github.com"),
    GITHUB_LABEL: escapeLatex(linkLabel(githubUrl || "github.com")),
    OBJECTIVE: escapeLatex(objective),
    EDUCATION: educationItems.length
      ? educationItems.join("\n\n")
      : (omitEmptySections ? "" : "\\item\\textbf{Education details available on request}"),
    EXPERIENCE: experienceItems.length
      ? experienceItems.join("\n\n")
      : (omitEmptySections ? "" : `\\item \\textbf{Relevant Experience} \\hfill ${escapeLatex(roleTitle)} \\\\\n\\resumeItemListStart\n\\resumeItem{${escapeLatex(`Applied profile skills to responsibilities aligned with ${roleTitle}.`)}}\n\\resumeItemListEnd`),
    PROJECTS: projectItems.length
      ? projectItems.join("\n\n")
      : (omitEmptySections ? "" : `\\resumeProjectHeading{\\textbf{Role-Aligned Project} $|$ \\emph{${escapeLatex((jobSkills.length ? jobSkills : skills).slice(0, 4).join(", ") || roleTitle)}}}{}\n\\resumeItemListStart\n\\resumeItem{${escapeLatex(`Project details can be tailored around ${roleTitle} requirements.`)}}\n\\resumeItemListEnd`),
    TECHNICAL_SKILLS: technicalLines.join(" \\\\[3pt]\n"),
    ACHIEVEMENTS_CERTIFICATIONS: achievementCertificationItems.length
      ? achievementCertificationItems.join("\n")
      : "",
    // Both are new sections with no legacy placeholder text: a profile with no coursework or no
    // extracurricular data renders NOTHING, and stripEmptyLatexSections removes the heading.
    COURSEWORK: courseworkItems.join("\n"),
    EXTRACURRICULAR: extracurricularItems.join("\n")
  };
}

// Sections whose heading is removed outright when the corresponding content key is empty.
// COURSEWORK, EXTRACURRICULAR and ACHIEVEMENTS_CERTIFICATIONS are stripped UNCONDITIONALLY — they
// have no placeholder fallback, so an empty one would render as a bare heading over blank space.
const ALWAYS_OMITTED_WHEN_EMPTY = {
  COURSEWORK: "Relevant Coursework",
  EXTRACURRICULAR: "Extracurricular",
  ACHIEVEMENTS_CERTIFICATIONS: "Achievements/Certifications"
};

const OMITTABLE_SECTION_LABELS_BY_CONTENT_KEY = {
  EDUCATION: "Education",
  EXPERIENCE: "Experience",
  PROJECTS: "Projects",
  TECHNICAL_SKILLS: "Technical Skills",
  ...ALWAYS_OMITTED_WHEN_EMPTY
};

function buildLatexResumeFromTemplate(profile, job, template = defaultResumeTemplate, options = {}) {
  const content = buildResumeContent(profile || {}, job || {}, options);

  let latex = Object.entries(content).sort(([left], [right]) => right.length - left.length).reduce(
    (compiled, [key, value]) => compiled.replaceAll(key, value),
    template || defaultResumeTemplate
  ).trim();

  // These three never have placeholder text, so an empty one is always stripped — regardless of
  // the omitEmptySections flag, which only governs the legacy sections that DO have fallbacks.
  const alwaysStripped = Object.entries(ALWAYS_OMITTED_WHEN_EMPTY)
    .filter(([contentKey]) => !String(content[contentKey] || "").trim())
    .map(([, label]) => label);

  const conditionallyStripped = options.omitEmptySections
    ? Object.entries(OMITTABLE_SECTION_LABELS_BY_CONTENT_KEY)
        .filter(([contentKey]) => !String(content[contentKey] || "").trim())
        .map(([, label]) => label)
    : [];

  latex = stripEmptyLatexSections(latex, [...new Set([...alwaysStripped, ...conditionallyStripped])]);

  return postProcessLatexResume(latex);
}

function buildFallbackLatexResume(profile, job) {
  return buildLatexResumeFromTemplate(profile, job, defaultResumeTemplate);
}

function buildResumeFileName(profile, job, extension) {
  const base = [profile.firstName, profile.lastName, job.title, "resume"]
    .filter(Boolean)
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

  return `${base || "sgetai-resume"}.${extension}`;
}

module.exports = {
  stripLatexFence,
  buildFallbackLatexResume,
  buildLatexResumeFromTemplate,
  buildResumeFileName,
  buildTargetedResumeObjective,
  buildProfileForTailoring,
  getResumeProfileReadiness,
  postProcessLatexResume
};
