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

/* Ties the last two words of a run of text together with a LaTeX non-breaking space, so a
 * paragraph can never end with one short word stranded on a line of its own — the "...Physics and
 * Chemistry in / Science" and lone-"C++" shapes.
 *
 * MUST run AFTER escapeLatex, never before: escapeLatex turns a literal ~ into \textasciitilde,
 * so a tie inserted first would be escaped into a visible tilde.
 *
 * Applied only when the trailing word is plain text. If it carries any LaTeX markup the tie is
 * skipped rather than risked, because the last space in "...used by \textbf{three desks}" sits
 * inside the braces and moving it would break the group. */
function tieFinalWord(latexText) {
  const text = String(latexText || "");
  const lastSpace = text.lastIndexOf(" ");

  if (lastSpace <= 0) {
    return text;
  }

  const tail = text.slice(lastSpace + 1);

  if (!tail || /[\\{}$]/.test(tail)) {
    return text;
  }

  return `${text.slice(0, lastSpace)}~${tail}`;
}

/* Joins a category's skills so the LAST TWO can never be split across lines.
 *
 * Every separator this template family uses ends in a space — ", " and " $|$ " — and that final
 * space is a legal break point like any other, which is how "Other: Data Structures, Object
 * Oriented Programming, C++" ended up wrapping with "C++" alone at the foot of a column. Turning
 * only the last separator's space into a tie (~) removes that one break opportunity and leaves
 * every earlier one alone, so the line still fills normally.
 *
 * Takes ALREADY-ESCAPED skills: the separator is raw LaTeX (" $|$ ") and escaping the joined
 * string would turn it into a literal "\$|\$". */
function joinSkillsWithTiedTail(escapedSkills, separator) {
  if (escapedSkills.length < 2) {
    return escapedSkills.join(separator);
  }

  const tiedSeparator = separator.replace(/ $/, "~");
  return escapedSkills.slice(0, -1).join(separator) + tiedSeparator + escapedSkills[escapedSkills.length - 1];
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

/* SANITY CEILINGS, NOT EDITORIAL CAPS.
 *
 * These used to be editorial: 4 bullets per entry, 4 experience entries, 3 projects, 8 merged
 * achievements, 12 courses, 4 activities. Every one of them silently deleted text the candidate
 * had deliberately written — a role with six bullets shipped four, and a candidate with five jobs
 * shipped four. The generator does not get to choose which of someone's accomplishments an
 * employer sees.
 *
 * What remains is a runaway-data guard and nothing else. A corrupt import or a malicious payload
 * with fifty thousand array entries must not hand pdflatex a document it will chew on for an hour,
 * so each list still has a ceiling — set an order of magnitude above anything a real resume
 * contains. No real profile reaches one. If a profile ever does, the ceiling is the bug, not the
 * profile.
 *
 * LENGTH IS SOLVED BY TYPOGRAPHY, NOT BY DELETION. A profile with more content produces a longer
 * document; compileFittedResumePdf then scales the whole vertical rhythm to fit it to whole pages.
 * That is the correct trade: a three-page resume that contains the candidate's work beats a
 * one-page resume that does not.
 */
const RESUME_CONTENT_LIMITS = {
  bulletsPerEntry: 40,
  experienceEntries: 40,
  projectEntries: 40,
  achievementsAndCertifications: 60,
  courseworkItems: 60,
  extracurricularEntries: 30,
  skills: 120
};

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
    .slice(0, RESUME_CONTENT_LIMITS.bulletsPerEntry);

  return finalBullets
    .map((line) => `\\resumeItem{${tieFinalWord(emphasizeBullet(escapeLatex(sentence(line)), emphasisTerms))}}`)
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

  return tieFinalWord(`${escapeLatex(degreeText || "Education")} in ${escapeLatex(fieldText)}`);
}

function extractLatexEntrySortYear(entry) {
  const years = String(entry || "").match(/\b(?:19|20)\d{2}\b/g) || [];
  return years.length ? Number(years[0]) : 0;
}

function splitEducationEntries(sectionBody) {
  const body = String(sectionBody || "");
  // \resumeEntryWithLine joined the list when Education moved to the one-line family layout. It
  // has to be here: without it this splitter finds zero entries, silently returns the body
  // unchanged, and the LaTeX-level newest-first safety net stops working with nothing to show for
  // it. \item stays for the fallback template and for any legacy stored LaTeX.
  const entryPattern = /(\\(?:item\b|cventry\b|educationentry\b|resumeEntryWithLine\b)[\s\S]*?)(?=\\(?:item\b|cventry\b|educationentry\b|resumeEntryWithLine\b)|$)/g;
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
  const body = String(sectionBody || "");
  const entries = splitEducationEntries(body);

  if (entries.length <= 1) {
    return body;
  }

  /* Whatever sits BEFORE the first entry is carried through untouched.
   *
   * It used to be discarded, because this returned only the entries it had matched. When the
   * caller took its no-itemize-wrapper branch that prefix was the \begin{itemize} line itself, so
   * sorting a candidate's education silently deleted the list environment around it — every entry
   * then compiled as a "Lonely \item" outside any list, lost the spacing the list was supplying,
   * and printed on top of the entry above. It only ever bit profiles with two or more degrees,
   * because with one entry this returns early and nothing is rewritten at all. */
  const prefix = body.slice(0, body.indexOf(entries[0]));

  return prefix + entries
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

// Skills are ranked, then bounded by RESUME_CONTENT_LIMITS.skills — a runaway-data guard, not an
// editorial cap. It was 20, which is under what several of the reference resumes list: Sai Kumar
// carries well over a hundred across nine categories, and truncating him at 20 would have deleted
// two thirds of his stated capability.

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
  return rankedSkills.slice(0, RESUME_CONTENT_LIMITS.skills).map((entry) => entry.skill);
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
//
// The optional leading month must be an ACTUAL month name. It was previously any capitalised word
// of three to nine letters, which made "Technical Lead, Coding Club 2021 - 2023" split into the
// title "Technical Lead, Coding" and the date "Club 2021 -- 2023" — the organisation's own name
// was moved into the date column and printed there, right-aligned, as though it were a date.
const TRAILING_DATE_RANGE_PATTERN =
  /[\s,(\[|-]+((?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December)\.?[\s-]+)?\d{4})\s*(?:-{1,2}|–|—|to|until|through)\s*((?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December)\.?[\s-]+)?\d{4}|Present|Current|Ongoing|Date)\s*[)\]]?\s*$/i;

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

/* ===============================================================================================
   SIX LAYOUT VARIANTS
   ===============================================================================================
   utils/resume-templates/ holds one _preamble.tex (every visual constant and command definition),
   one _sections.tex (the scaffolding for each section, defined once) and six variant-*.tex files
   that do nothing but declare a section ORDER and whether a headline line is present. They are
   assembled here rather than by LaTeX \input, because a real \input would need the shared files
   copied next to the .tex in whatever temp directory compileLatexToPdf creates — a failure mode
   with no upside.

   The template files contain PLACEHOLDERS ONLY. No name, employer, institution, metric, phone
   number or email address appears in any of them; resumeTemplates.test.js fails the build if one
   ever does. Every word of a generated resume comes from the target candidate's own stored
   profile.
   =============================================================================================== */
const path = require("path");
const fs = require("fs");

const TEMPLATES_DIR = path.join(__dirname, "..", "utils", "resume-templates");

const RESUME_VARIANTS = ["a", "b", "c", "d", "e", "f"];

/* The two ARRANGEMENT axes a .tex skeleton cannot express, because they decide what the content
   builder emits rather than how the template renders it.

     skillSeparator     what joins the skills within one category. Both spellings appear in the
                        reference set. `$|$` and not a bare `|`, which the default OT1 encoding
                        renders as an em-dash.
     projectTechLayout  "inline" puts the tech stack on the title line after a pipe; "block"
                        (variant D only) gives it its own bold "Technologies:" line beneath.

   THERE IS NO entryLayout ANY MORE. It used to choose between one-line and two-line experience
   entries — company bold on line one with the role italicised beneath, for variants B, D and E.
   All six references put the whole thing on one line ("Role | Company, Location" bold-left, dates
   bold-right); the stacked shape belongs to a different template family, cost a line per role,
   and was the clearest tell that the generated resume was not one of the six. Every variant now
   uses the single-line shape.

   The remaining axes are elsewhere, where they belong: section order and the headline in the
   variant-*.tex files, masthead alignment and the masthead rule and the coursework arrangement in
   _styles.tex. Nothing about the visual grammar — header treatment, bullet, entry shape, skills
   shape, rhythm — differs by variant at all. */
const VARIANT_STYLE = {
  a: { skillSeparator: " $|$ ", projectTechLayout: "inline" },
  b: { skillSeparator: ", ", projectTechLayout: "inline" },
  c: { skillSeparator: ", ", projectTechLayout: "inline" },
  d: { skillSeparator: " $|$ ", projectTechLayout: "block" },
  e: { skillSeparator: ", ", projectTechLayout: "inline" },
  f: { skillSeparator: " $|$ ", projectTechLayout: "inline" }
};

// Last resort only, for an environment where the template directory is unreadable. Deliberately
// minimal, and loud in the logs — a silent fall-through to a stub document is how a two-line
// page 2 shipped once already.
const FALLBACK_TEMPLATE = String.raw`\documentclass[letterpaper,11pt]{article}
\usepackage[empty]{fullpage}
\usepackage{enumitem}
\begin{document}
\begin{center}{\Huge NAME}\end{center}
SUMMARY
\end{document}`;

function parseMarkerBlocks(source, marker) {
  // split() on a capturing group yields [leading-comment, name, body, name, body, ...].
  const parts = String(source).split(new RegExp(`^%%${marker} ([a-z]+)%%$`, "m"));
  const blocks = new Map();

  for (let index = 1; index < parts.length; index += 2) {
    blocks.set(parts[index], String(parts[index + 1]).trim());
  }

  return blocks;
}

function assembleVariantTemplate(variant, preamble, styleBlocks, sectionBlocks) {
  const skeleton = readTemplateFile(`variant-${variant}.tex`);

  // Function replacements throughout: a `$&` or `$1` occurring inside the preamble, a style block
  // or a section body would otherwise be interpreted as a replacement pattern.
  return skeleton
    .replace(/^%%PREAMBLE%%$/m, () => preamble)
    .replace(/^%%STYLE ([a-z]+)%%$/m, (_match, name) => {
      const block = styleBlocks.get(name);

      if (block === undefined) {
        throw new Error(`variant-${variant}.tex names style "${name}", which _styles.tex does not define.`);
      }

      return block;
    })
    .replace(/^%%SECTION ([a-z]+)%%$/gm, (_match, name) => {
      const block = sectionBlocks.get(name);

      if (block === undefined) {
        throw new Error(`variant-${variant}.tex names section "${name}", which _sections.tex does not define.`);
      }

      return block;
    })
    .trim();
}

/* Template files are read with LF line endings NO MATTER how they are stored on disk.
 *
 * This is not cosmetic. Every regex that later inspects the assembled LaTeX — the marker split
 * below, and sortLatexEducationSection's `\begin{itemize}[...]\n` — matches a bare \n. A file
 * saved with CRLF puts a \r in front of it and each of those matches silently fails. The failure
 * is invisible until a candidate has TWO education entries: sortEducationSectionBody only rewrites
 * the body when there is something to sort, so with one entry nothing happens and everything looks
 * fine, while with two it falls into the branch that keeps only the matched entries and DROPS the
 * \begin{itemize} line. The compiled result is a run of "Lonely \item" errors, education entries
 * rendered outside any list, and — because a list is what was supplying their spacing — entries
 * printed on top of one another.
 *
 * Normalising here fixes every downstream matcher at once, and costs one pass over ~25KB at
 * module load. */
function readTemplateFile(name) {
  return fs.readFileSync(path.join(TEMPLATES_DIR, name), "utf8").replace(/\r\n?/g, "\n");
}

function loadResumeTemplates() {
  try {
    const preamble = readTemplateFile("_preamble.tex").trim();
    // Same marker-split as the section blocks. The style block is what makes each variant a
    // different-looking document rather than the same one with its sections shuffled.
    const styleBlocks = parseMarkerBlocks(readTemplateFile("_styles.tex"), "STYLE");
    const sectionBlocks = parseMarkerBlocks(readTemplateFile("_sections.tex"), "SECTION");

    return Object.fromEntries(
      RESUME_VARIANTS.map((variant) => {
        const template = assembleVariantTemplate(variant, preamble, styleBlocks, sectionBlocks);

        if (!template.includes("begin{document}")) {
          throw new Error(`variant-${variant}.tex assembled without a \\begin{document}.`);
        }

        return [variant, template];
      })
    );
  } catch (error) {
    console.error("Resume templates could not be assembled; falling back to the stub layout:", error.message);
    return Object.fromEntries(RESUME_VARIANTS.map((variant) => [variant, FALLBACK_TEMPLATE]));
  }
}

const resumeTemplatesByVariant = loadResumeTemplates();

function normalizeResumeVariant(value) {
  const variant = String(value || "").trim().toLowerCase();
  return RESUME_VARIANTS.includes(variant) ? variant : "";
}

/* FNV-1a, 32-bit. Deterministic across processes, machines and Node versions, which is the whole
   point — a hash that varies would reintroduce exactly the per-call randomness this avoids. */
function hashVariantSeed(seed) {
  const text = String(seed);
  let hash = 0x811c9dc5;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash;
}

/* SELECTION ROTATES PER GENERATION, FROM A PER-CANDIDATE STARTING POINT.
 *
 *     index = (hash(seed) + rotation) % 6
 *
 * ROTATE, DO NOT RANDOMISE. With six options a random draw repeats the previous layout about one
 * time in six — which is the exact symptom this replaces, and would read as the change never
 * having landed. Stepping guarantees all six appear before any repeat and spreads usage evenly.
 *
 * THE HASH STILL EARNS ITS PLACE, for one job: it sets WHERE each candidate starts. Without it
 * every candidate's first resume would be variant A, so a whole signup cohort would move through
 * the six in lockstep. With it the six are evenly occupied at every rotation step.
 *
 * Both inputs are passed IN. This function performs no I/O and never reaches into profile._id,
 * which is what makes all six layouts testable without inventing an id that hashes just so, and
 * without a database.
 *
 *   variant      an explicit override — a candidate's saved preference, or a test pinning one.
 *                It wins outright and does not rotate; a pinned layout is a pinned layout.
 *   variantSeed  the stable identifier that fixes the starting offset.
 *   rotation     how many resumes this candidate has already generated. Anything that is not a
 *                finite, non-negative number is treated as 0 rather than propagating NaN — a NaN
 *                here would make `(start + NaN) % 6` NaN, index into nothing, and collapse every
 *                generation onto the fallback template.
 */
function resolveResumeVariant({ variant, variantSeed, rotation = 0 } = {}) {
  const explicit = normalizeResumeVariant(variant);

  if (explicit) {
    return explicit;
  }

  const seed = String(variantSeed === null || variantSeed === undefined ? "" : variantSeed).trim();
  const start = seed ? hashVariantSeed(seed) % RESUME_VARIANTS.length : 0;

  const parsedRotation = Number(rotation);
  const steps = Number.isFinite(parsedRotation) && parsedRotation > 0 ? Math.trunc(parsedRotation) : 0;

  return RESUME_VARIANTS[(start + steps) % RESUME_VARIANTS.length];
}

function getResumeTemplate(variant) {
  return resumeTemplatesByVariant[normalizeResumeVariant(variant) || RESUME_VARIANTS[0]];
}

function linkLabel(url) {
  return String(url || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function firstPresent(...values) {
  return values.find((value) => sentence(value));
}

function rawUrl(value) {
  return String(value || "").trim().replace(/[{}]/g, "");
}

/* ===============================================================================================
   THE CONTACT LINE IS BUILT FROM PROFILE DATA. NOTHING IS ASSUMED AND NOTHING IS INVENTED.
   ===============================================================================================
   The reference layouts this family is modelled on all open with "USA (Open to Relocate) | +1 …".
   None of that is hardcoded here, and none of it may be: this platform's candidates are largely in
   India, with Indian institutions and +91 numbers, and stamping a US location or a +1 country code
   onto their resume would be a factual claim they never made.

   Only the fields the profile actually holds are emitted, and the separators collapse with them —
   the parts are collected into an array and joined, so a missing LinkedIn leaves no dangling
   separator. Absent fields now render NOTHING. The previous template substituted
   "Phone not available", "email-not-available@example.com" and a bare "https://linkedin.com" for
   missing values, which put a fake contact address on a document an employer replies to. No
   contact line at all is better than a wrong one.
   =============================================================================================== */
function readProfileLocation(profile = {}) {
  return (
    firstPresent(
      profile.location,
      profile.currentLocation,
      profile.city,
      Array.isArray(profile.locationPreferences) ? profile.locationPreferences[0] : undefined,
      profile.headquartersLocation
    ) || ""
  );
}

function buildContactLine(profile = {}) {
  const location = readProfileLocation(profile);
  const phone = firstPresent(profile.phone, profile.mobile, profile.mobileNumber, profile.phoneNumber) || "";
  const email = firstPresent(profile.email, profile.userEmail, profile.contactEmail) || "";
  const linkedinUrl = firstPresent(profile.linkedinUrl, profile.linkedInUrl, profile.linkedin, profile.linkedIn) || "";
  const githubUrl = firstPresent(profile.githubUrl, profile.github, profile.gitHubUrl, profile.gitHub) || "";
  const portfolioUrl = firstPresent(profile.portfolioUrl, profile.websiteUrl, profile.website) || "";

  const parts = [
    location ? `\\small ${escapeLatex(location)}` : "",
    phone ? `\\small \\faPhone\\ ${escapeLatex(phone)}` : "",
    email ? `\\small \\href{mailto:${rawUrl(email)}}{\\faEnvelope\\ \\underline{${escapeLatex(email)}}}` : "",
    linkedinUrl
      ? `\\small \\href{${rawUrl(linkedinUrl)}}{\\faLinkedin\\ \\underline{${escapeLatex(linkLabel(linkedinUrl))}}}`
      : "",
    githubUrl
      ? `\\small \\href{${rawUrl(githubUrl)}}{\\faGithub\\ \\underline{${escapeLatex(linkLabel(githubUrl))}}}`
      : "",
    portfolioUrl
      ? `\\small \\href{${rawUrl(portfolioUrl)}}{\\faGlobe\\ \\underline{${escapeLatex(linkLabel(portfolioUrl))}}}`
      : ""
  ].filter(Boolean);

  // Wrapped in \resumeContact rather than carrying its own trailing line break, so each variant's
  // style block decides how the contact line sits in the header. An absent contact line emits
  // NOTHING — no command, no break — which is what lets a variant lay the header out freely.
  return parts.length ? `\\resumeContact{${parts.join(" ~ ")}}\n` : "";
}

/* The optional positioning line beneath the name — present in variants B, E and F.
 *
 * Built ONLY from what the candidate stored about themselves: their tagline, or their preferred
 * roles plus their own top skills. Never the target job's title, and never the posting's
 * requirements — that is the same mistake as the removed "Core Concepts" line, which attributed an
 * employer's wish-list to the candidate.
 *
 * Requires a tagline or a preferred role to exist. A bare list of skills is not a positioning
 * line, and a headline that reads "Python | SQL | Git" says less than no headline at all — so when
 * there is nothing to say, this returns "" and the header closes up rather than printing an empty
 * bold line (which pdflatex would reject anyway, given the \\ that follows it).
 */
/* One dated entry: "Role | Company, Location" bold-left, the date range bold-right, on ONE line.
 *
 * The same shape in all six variants, because that is the shape all six references use. The empty
 * cases are resolved HERE rather than with a LaTeX \ifx test, because the caller knows which
 * fields the profile actually holds: a role with no recorded company must not emit a dangling
 * " $|$ ", and neither side can produce the "There's no line here to end" abort that a `\\` after
 * an absent field used to cause.
 */
function buildEntryHeading(role, company, dates) {
  const heading = [role, company].filter(Boolean).map(escapeLatex).join(" $|$ ") || escapeLatex("Experience");
  return `\\resumeEntry{${heading}}{${escapeLatex(dates)}}`;
}

function buildResumeHeadline(profile = {}, categorizedSkills = []) {
  const tagline = sentence(profile.tagline);

  if (tagline) {
    /* Wrapped in an array. Every other return from this function is an array of PARTS, and the
       caller does `formatResumeHeadline(headline)` -> `parts.map(escapeLatex)`. Returning the bare
       string threw "parts.map is not a function" and took the whole request down with a 500 — and
       the `headline.length ?` guard at the call site does not catch it, because a non-empty string
       has a length too. Any seeker with a tagline set therefore could not generate a tailored
       resume at all, which meant no Pro manual apply and no auto-apply for them. A single-part
       array joins to exactly the tagline, so the rendered output is unchanged for everyone whose
       resume did build. */
    return [tagline];
  }

  /* THE HEADLINE IS A TARGET POSITIONING, NOT A JOB HISTORY.
     Every reference leads with where the candidate is going — "Salesforce Developer | Salesforce
     Administrator | Apex | LWC | Flow Automation", "AI/ML Engineer | Generative AI | LLMs | RAG |
     MLOps". The one source for that is what the candidate said they are targeting: their tagline,
     handled above, or their preferredRoles.

     THE MOST RECENT JOB TITLE IS NOT A SUBSTITUTE, and used to be the fallback here. It produced
     "Summer Intern | Spring Boot | Core Java | SQL | Machine Learning" under a masters candidate's
     name — a headline that leads with the least senior thing about them and positions them for the
     job they already have. Where a candidate holds a title that IS their positioning, they will
     have said so in preferredRoles or their tagline.

     The target JOB's title is deliberately absent too. Putting the employer's role title under the
     candidate's name would be the same misattribution as the removed "Core Concepts" line, which
     credited a posting's wish-list to the candidate. */
  const roles = [...new Set((profile.preferredRoles || []).map((role) => sentence(role)).filter(Boolean))].slice(0, 2);

  /* ONE SKILL PER CATEGORY, not the top four overall. Four entries from a single bucket reads as
     a fragment of the skills section ("Java | Python | C++ | Go"); one from each reads as a
     positioning line ("Backend Engineer | Spring Boot | PostgreSQL | Docker"), which is what the
     reference layouts do.

     This four is COMPOSITION, not truncation: the headline is a synthesised one-line positioning
     statement, not stored content, and nothing is lost by bounding it — every skill still appears
     in full in the Skills section below. It matches the references, which run two roles plus four
     specialisms ("Salesforce Developer | Salesforce Administrator | Apex | LWC | Flow Automation |
     Integration"). A headline that listed everything would wrap to three lines and stop being a
     headline. */
  const specialisms = categorizedSkills
    .map((category) => sentence((category.skills || [])[0]))
    .filter((skill) => skill && !roles.some((role) => role.toLowerCase() === skill.toLowerCase()))
    .slice(0, 4);

  const parts = [...roles, ...specialisms];

  /* A ROLE IS REQUIRED. Skills alone are not a positioning line: "Spring Boot | Core Java | SQL |
     Machine Learning" under a name is just the first row of the Skills section moved to the top,
     and it says less than nothing. Omit the line entirely rather than emit a weak one — every
     variant's header closes up cleanly when this returns nothing. */
  if (!roles.length || parts.length < 2) {
    return [];
  }

  return parts;
}

/* Returns the PARTS, not a joined string, because the separator has to survive escaping. A literal
   `|` in OT1 text mode renders as an EM DASH — "Backend Engineer — Spring Boot" — so the pipe has
   to be `$|$`, and escapeLatex would turn a pre-joined `$|$` into `\$|\$`. Escape each part, then
   join with the raw separator. */
function formatResumeHeadline(parts = []) {
  return parts.map(escapeLatex).join(" $|$ ");
}

/* Work-authorisation status is a LEGAL FACT about a person. The reference resumes carry lines like
 * "Authorized to work in the U.S. on F1 OPT with STEM extension eligibility", and the summary is
 * the one field on this document that passes through a language model — so it is the one place a
 * status could be invented. A sentence claiming one is dropped unless the candidate's own stored
 * text says the same thing, in which case there is nothing to invent.
 */
const WORK_AUTHORISATION_PATTERN =
  /\b(F-?1|H-?1B|OPT|CPT|STEM extension|green card|work(?:ing)? (?:visa|permit|authoriz|authoris)|authoriz(?:ed|ation) to work|authoris(?:ed|ation) to work|EAD|TN visa|permanent resident)\b/i;

function stripUnsupportedWorkAuthorisation(summary, profile = {}) {
  if (!WORK_AUTHORISATION_PATTERN.test(summary)) {
    return summary;
  }

  const ownText = [
    profile.careerObjective,
    profile.bio,
    profile.tagline,
    ...(profile.experience || []).map((item) => item.description),
    ...(profile.achievements || []).map((item) => `${item.title || ""} ${item.description || ""}`),
    ...(profile.licensesAndCertifications || []).map((item) => `${item.title || ""} ${item.description || ""}`)
  ]
    .filter(Boolean)
    .join(" ");

  const kept = splitSentences(summary).filter(
    (line) => !WORK_AUTHORISATION_PATTERN.test(line) || WORK_AUTHORISATION_PATTERN.test(ownText)
  );

  return sentence(kept.join(" "));
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
//
// THE LIMIT NO LONGER BINDS IN PRACTICE. Callers pass a RESUME_CONTENT_LIMITS ceiling of 40, so
// this now reorders and returns everything for any real profile. The default here is deliberately
// Infinity rather than the 4 it used to be: a caller that forgets to pass a limit should get the
// candidate's whole history, not silently lose all but four entries.
function selectRelevantItems(items, targetTerms, limit = Infinity, options = {}) {
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
  const style = VARIANT_STYLE[normalizeResumeVariant(options.variant) || RESUME_VARIANTS[0]];
  // A single-name candidate is a real shape, not a data error — the join collapses rather than
  // leaving a trailing space, and "Applicant" is used only when there is no name at all.
  const name = sentence(`${profile.firstName || ""} ${profile.lastName || ""}`, "Applicant");
  const skills = pickRelevantSkills(profile, job);
  const jobSkills = [...(job.skillsRequired || []), ...(job.skills || [])].filter(Boolean);
  const roleTitle = job.title || (profile.preferredRoles || [])[0] || "Target Role";
  const targetTerms = buildTargetTerms(job);
  const summary = stripUnsupportedWorkAuthorisation(
    sentence(options.objective, buildTargetedResumeObjective(profile, job, skills)),
    profile
  );

  /* Terms eligible for bold emphasis inside bullets: the TARGET JOB's keywords, longest first so
     "Spring Boot" wins over "Spring". These only ever EMPHASISE text the candidate already wrote —
     nothing here can add, remove or alter a word of the resume.

     This cap is therefore not content truncation and was never dropping profile content: it bounds
     the POSTING's vocabulary, not the candidate's. It is raised rather than removed because
     over-bolding is its own defect — a bullet where every third word is bold reads as no emphasis
     at all — and because the match is run per term per bullet. */
  const emphasisTerms = [...new Set(jobSkills.map((skill) => String(skill || "").trim()).filter(Boolean))]
    .sort((left, right) => right.length - left.length)
    .slice(0, 80);

  /* ONE LINE PER ROLE: "Role | Company, Location" bold-left, dates bold-right.
     This replaces the two-line \resumeSubheading, where the company sat bold on one line with the
     role in italics beneath it. The pieces are assembled into an array and joined, so a role with
     no recorded location — or an entry that has a company but no title — collapses cleanly instead
     of emitting a stray "|" or a trailing comma. */
  const experienceItems = selectRelevantItems(profile.experience || [], targetTerms, RESUME_CONTENT_LIMITS.experienceEntries).map((item) => {
    const dates = [formatDate(item.startDate), item.isCurrent ? "Present" : formatDate(item.endDate)]
      .filter(Boolean)
      .join(" -- ");
    const location = firstPresent(item.location, item.city, item.jobLocation) || "";
    const role = sentence(item.jobTitle || item.role || item.title);
    const company = [sentence(item.companyName), sentence(location)].filter(Boolean).join(", ");
    return [
      buildEntryHeading(role, company, dates),
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
  const projectItems = selectRelevantItems(profile.projects || [], targetTerms, RESUME_CONTENT_LIMITS.projectEntries, { protectRecent: 1 }).map((item) => {
    const techStack = flattenProjectTechStack(item);
    const dates = [formatDate(item.startDate), item.isCurrent ? "Present" : formatDate(item.endDate)]
      .filter(Boolean)
      .join(" -- ");
    const link = firstPresent(item.repositoryUrl, item.githubUrl, item.projectUrl, item.liveUrl) || "";
    const escapedTitle = escapeLatex(item.title || "Project");
    const titleMarkup = link
      ? `\\href{${rawUrl(link)}}{\\textbf{${escapedTitle}} \\faGithub}`
      : `\\textbf{${escapedTitle}}`;

    // Variant D breaks the tech stack onto its own bold "Technologies:" line; every other variant
    // keeps it inline after a pipe. Either way the stack is the candidate's own stored list —
    // flattenProjectTechStack never reads the job posting.
    const inlineTech = style.projectTechLayout === "inline" && techStack
      ? ` $|$ \\emph{${escapeLatex(techStack)}}`
      : "";
    const blockTech = style.projectTechLayout === "block" && techStack
      ? `\n\\resumeProjectTech{${escapeLatex(techStack)}}`
      : "";

    return [
      `\\resumeProjectHeading{${titleMarkup}${inlineTech}}{${escapeLatex(dates)}}`,
      blockTech,
      "\n\\resumeItemListStart\n",
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
  /* GRADE RESOLUTION, PER ENTRY.
     `education[].gpa` is the entry's own grade and always wins. `profile.currentGPA` is a
     whole-profile scalar describing ONE degree, so it is offered only to the MOST RECENT entry —
     printing it against a bachelor's degree it does not describe would be a fabricated credential.

     That fallback is why an existing profile keeps rendering exactly as it does today: before the
     per-entry field existed, `currentGPA` was the only grade in the model, and a candidate with
     two degrees could record one grade and no more. Their second degree rendered blank because
     there was nowhere to store its grade — not because the generator dropped it. */
  const mostRecentEducationItem = educationEntries[0]?.item;
  const educationItems = educationEntries.map(({ item }) => {
      const dates = [formatDate(item.startDate), formatDate(item.endDate)].filter(Boolean).join(" -- ");
      const year = dates || item.graduationYear;
      const gpaValue = firstPresent(
        item.gpa,
        item.cgpa,
        item.currentGPA,
        item.grade,
        item === mostRecentEducationItem ? profile.currentGPA : undefined
      );
      /* Degree bold-left, dates bold-right, institution on the line beneath with the grade opposite
         it — the family's education shape. Both right-hand cells accept an empty string, so an
         undated degree or a missing grade leaves a blank cell rather than a dangling \hfill.

         The "CGPA:" label is applied only to a value on a points scale. Now that a grade can be
         anything the candidate's transcript says, the label has to fit what it labels: "CGPA:
         78.4%" and "CGPA: First Class" are both wrong, and the second is not even a number. A
         percentage or a classification stands on its own. */
      const formattedGpa = formatGpa(gpaValue);
      const gpa = formattedGpa
        ? escapeLatex(/\//.test(formattedGpa) ? `CGPA: ${formattedGpa}` : formattedGpa)
        : "";
      return `\\resumeEntryWithLine{${formatDegreeWithField(item.degree, item.fieldOfStudy)}}{${year ? escapeLatex(year) : ""}}{${escapeLatex(item.institution || "Institution")}}{${gpa}}`;
    });

  // ONE merged section, matching the reference. The two arrays routinely hold the same entries —
  // this candidate's "5 star badge in Problem Solving - HackerRank" and GATE rank were in both, and
  // rendered twice. Merging removes the failure mode rather than just papering over it, and
  // dedupeTitledItems collapses near-identical titles (case/punctuation/whitespace insensitive).
  const achievementCertificationItems = dedupeTitledItems([
    ...(profile.achievements || []),
    ...(profile.licensesAndCertifications || [])
  ])
    .slice(0, RESUME_CONTENT_LIMITS.achievementsAndCertifications)
    .map((item) => {
      const title = escapeLatex(item.title || "Achievement");
      const detail = item.description ? `: ${escapeLatex(sentence(item.description))}` : "";
      return `\\item \\small{${emphasizeBullet(`${title}${detail}`, emphasisTerms)}}`;
    });

  /* \resumeCourseItem, not a bare \item: variants B, C and F run coursework as one inline list
     rather than three columns, and an inline arrangement is not a list at all, so it has no \item
     to attach to. Naming the command lets the template choose the arrangement without the content
     builder knowing which is in force — the same split the skills block already uses. */
  const courseworkItems = collectCoursework(profile)
    .slice(0, RESUME_CONTENT_LIMITS.courseworkItems)
    .map((course) => `\\resumeCourseItem{${escapeLatex(course)}}`);

  const extracurricularItems = collectExtracurricular(profile)
    .slice(0, RESUME_CONTENT_LIMITS.extracurricularEntries)
    .map((item) => {
      // Reads in the same order as an Experience entry — "Role | Organisation" bold-left, dates
      // bold-right. The stored fields were being passed inverted before: `organization` (the ROLE,
      // e.g. "Volunteer") led as the organisation and `title` (the body, e.g. "NSS") followed as
      // the role, so the entry read upside down against every other entry on the page.
      const explicitDates = [formatDate(item.startDate), formatDate(item.endDate)].filter(Boolean).join(" -- ");
      // Parsers routinely fuse the dates into the title ("NSS 2019 - 2022") because a flat
      // activity line has nowhere else to put them. Splitting a trailing date RANGE back out is
      // unambiguous, so the dates reach their own column instead of sitting inside the heading.
      const splitTitle = splitTrailingDateRange(item.title);
      const organisation = splitTitle.text || sentence(item.organization) || "Activity";
      const role = splitTitle.text ? sentence(item.organization) : "";
      const dates = explicitDates || splitTitle.dates;
      const left = [role, organisation, sentence(item.location)]
        .filter(Boolean)
        .map(escapeLatex)
        .join(" $|$ ");
      const heading = `\\resumeEntry{${left}}{${escapeLatex(dates)}}`;
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
  /* One \resumeSkillEntry per category. Whether those render as lines, two columns, a flowing
     paragraph or a label table is the VARIANT's business, decided in _styles.tex — this only says
     what the categories ARE. That split is why the skills block can differ visually across the six
     without the content builder growing a branch per layout.

     Each skill is escaped INDIVIDUALLY and then joined with the variant's raw separator; joining
     first and escaping after would turn variant A's `$|$` into a literal `\$|\$`. */
  const categorizedSkills = categorizeResumeSkills(profile, skills);
  const technicalLines = categorizedSkills.length
    ? categorizedSkills.map((category) =>
      `\\resumeSkillEntry{${escapeLatex(category.label)}}{${joinSkillsWithTiedTail(category.skills.map(escapeLatex), style.skillSeparator)}}`
    )
    : (omitEmptySections ? [] : [`\\resumeSkillEntry{Skills}{Relevant technical skills}`]);

  // REMOVED, permanently: a "Core Concepts" line built from `jobSkills` — the EMPLOYER'S OWN
  // stated requirements — attributed the job posting's wish-list to the candidate as if it were
  // their skill set. That is a factual misrepresentation on a document an employer relies on, and
  // it was emitted on every resume generated with omitEmptySections=false. The "Soft Skills"
  // line beneath it was fixed generic filler ("Problem Solving, Communication, Adaptability, Team
  // Player") identical on every candidate's resume, which weakens rather than strengthens it.
  // Neither is reinstatable behind a flag: both are gone.

  const headline = buildResumeHeadline(profile, categorizedSkills);

  return {
    NAME: escapeLatex(name),
    /* HEADLINE and CONTACT_LINE emit a COMMAND CALL or nothing at all — never markup with a
       trailing line break baked in. That is what lets each variant's style block arrange the
       header freely (centred, left-aligned, over a rule, under a rule) without inheriting a `\\`
       that belongs to a different layout. An absent field emits no command, so there is no stray
       break to produce the "There's no line here to end" abort.

       Superseded: the old placeholder set (LOCATION_OR_UNIVERSITY / PHONE / EMAIL / LINKEDIN /
       GITHUB) substituted "Phone not available" and "email-not-available@example.com" for missing
       values. That put a fake contact address on a document an employer replies to; a missing
       field now renders nothing at all. */
    HEADLINE: headline.length ? `\\resumeHeadline{${formatResumeHeadline(headline)}}\n` : "",
    CONTACT_LINE: buildContactLine(profile),
    SUMMARY: escapeLatex(summary),
    EDUCATION: educationItems.length
      ? educationItems.join("\n\n")
      : (omitEmptySections ? "" : "\\item\\textbf{Education details available on request}"),
    EXPERIENCE: experienceItems.length
      ? experienceItems.join("\n\n")
      : (omitEmptySections ? "" : `\\resumeEntry{Relevant Experience}{${escapeLatex(roleTitle)}}\n\\resumeItemListStart\n\\resumeItem{${escapeLatex(`Applied profile skills to responsibilities aligned with ${roleTitle}.`)}}\n\\resumeItemListEnd`),
    PROJECTS: projectItems.length
      ? projectItems.join("\n\n")
      : (omitEmptySections ? "" : `\\resumeProjectHeading{\\textbf{Role-Aligned Project} $|$ \\emph{${escapeLatex((jobSkills.length ? jobSkills : skills).slice(0, 4).join(", ") || roleTitle)}}}{}\n\\resumeItemListStart\n\\resumeItem{${escapeLatex(`Project details can be tailored around ${roleTitle} requirements.`)}}\n\\resumeItemListEnd`),
    // Joined with a plain newline, not a `\\` separator: each \resumeSkillEntry now ends itself
    // (with \par, a tabular row, or nothing at all) according to the variant's arrangement, so
    // there is no separator-versus-suffix hazard left for the last line to trip over.
    SKILLS: technicalLines.join("\n"),
    CERTIFICATIONS: achievementCertificationItems.length
      ? achievementCertificationItems.join("\n")
      : "",
    // Both are new sections with no legacy placeholder text: a profile with no coursework or no
    // extracurricular data renders NOTHING, and stripEmptyLatexSections removes the heading.
    COURSEWORK: courseworkItems.join("\n"),
    EXTRACURRICULAR: extracurricularItems.join("\n")
  };
}

// Sections whose heading is removed outright when the corresponding content key is empty.
// CERTIFICATIONS, COURSEWORK and EXTRACURRICULAR are stripped UNCONDITIONALLY — they have no
// placeholder fallback, so an empty one would render as a bare heading over blank space.
//
// This matters more with six layouts than it did with one. Every variant carries the whole set of
// blocks; which of them a given resume shows is decided entirely HERE, by what the profile holds.
// The alternative — hard-omitting Certifications from the variants whose reference layout shows
// none — would mean a certified candidate silently losing every licence they hold because their
// id happened to hash to variant A. The reference layouts show no Certifications section because
// those people listed none, which is exactly what this stripping reproduces.
const ALWAYS_OMITTED_WHEN_EMPTY = {
  COURSEWORK: "Relevant Coursework",
  EXTRACURRICULAR: "Extracurricular",
  CERTIFICATIONS: "Certifications and Achievements"
};

const OMITTABLE_SECTION_LABELS_BY_CONTENT_KEY = {
  EDUCATION: "Education",
  EXPERIENCE: "Experience",
  PROJECTS: "Projects",
  SKILLS: "Skills",
  SUMMARY: "Summary",
  ...ALWAYS_OMITTED_WHEN_EMPTY
};

/* ONE PASS, and it has to be one pass.
 *
 * The previous implementation reduced over the content entries longest-key-first, calling
 * replaceAll for each. Key length ordering stops "SKILLS" matching inside "TECHNICAL_SKILLS", but
 * it does nothing about the real hazard: a replacement's own TEXT being rescanned by a later key.
 * A candidate at a company called "NAME Corp", or a project titled "SUMMARY", would have had that
 * word substituted away inside their own already-inserted content. A single regex pass never
 * revisits what it has written. */
const PLACEHOLDER_PATTERN =
  /\b(?:NAME|HEADLINE|CONTACT_LINE|SUMMARY|SKILLS|EXPERIENCE|EDUCATION|CERTIFICATIONS|PROJECTS|COURSEWORK|EXTRACURRICULAR)\b/g;

/* Applies a whole-document density scale to already-built LaTeX, by inserting (or replacing) one
 * \resumeScaleRhythm call immediately after \begin{document} — after the variant's style block
 * has set the rhythm, so it multiplies whatever that block chose.
 *
 * A STRING operation on purpose. The density fitter compiles the same resume two or three times at
 * different scales, and rebuilding from the profile each time would re-run the model call that
 * writes the objective — three times, for three identical objectives. Scaling is the only thing
 * that differs between those attempts, and this is all it takes.
 *
 * A scale of 1 emits nothing, so the common path is byte-identical to a build that never asked. */
function withResumeDensityScale(latex, scale) {
  const source = String(latex || "");
  const stripped = source.replace(/\n?\\resumeScaleRhythm\{[^}]*\}/g, "");
  const value = Number(scale);

  if (!Number.isFinite(value) || value <= 0 || value === 1) {
    return stripped;
  }

  return stripped.replace(
    /\\begin\{document\}/,
    `\\begin{document}\n\\resumeScaleRhythm{${value.toFixed(3)}}`
  );
}

function buildLatexResumeFromTemplate(profile, job, template = null, options = {}) {
  const variant = resolveResumeVariant(options);
  const content = buildResumeContent(profile || {}, job || {}, { ...options, variant });

  let latex = String(template || getResumeTemplate(variant))
    .replace(PLACEHOLDER_PATTERN, (token) => content[token] ?? "")
    .trim();

  latex = withResumeDensityScale(latex, options.densityScale);

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

function buildFallbackLatexResume(profile, job, options = {}) {
  return buildLatexResumeFromTemplate(profile, job, null, options);
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
  withResumeDensityScale,
  stripLatexFence,
  buildFallbackLatexResume,
  buildLatexResumeFromTemplate,
  buildResumeFileName,
  buildTargetedResumeObjective,
  buildProfileForTailoring,
  getResumeProfileReadiness,
  postProcessLatexResume,
  RESUME_VARIANTS,
  TEMPLATES_DIR,
  normalizeResumeVariant,
  resolveResumeVariant,
  getResumeTemplate,
  buildContactLine,
  buildResumeHeadline,
  /* Exported unchanged for profileMergeService, which decides whether an imported résumé entry is
     one the profile already holds. Both answer the same question — "are these two titles the same
     thing written differently?" — so they share one normalizer rather than two that can disagree
     about punctuation or case. dedupeTitledItems itself is not exported: it collapses repeats
     within ONE list, which mergeSection's keyed merge already subsumes. */
  normalizeTitleKey
};
