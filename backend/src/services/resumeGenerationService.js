function escapeLatex(value) {
  return String(value || "")
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/&/g, "\\&")
    .replace(/%/g, "\\%")
    .replace(/\$/g, "\\$")
    .replace(/#/g, "\\#")
    .replace(/_/g, "\\_")
    .replace(/{/g, "\\{")
    .replace(/}/g, "\\}")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}");
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
function splitDescriptionBullets(description) {
  return String(description || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[•*\-–—]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);
}

function buildResumeItemBullets(description, fallbackText) {
  const bullets = splitDescriptionBullets(description);
  const finalBullets = bullets.length ? bullets : [sentence(description, fallbackText)];
  return finalBullets.map((line) => `\\resumeItem{${escapeLatex(sentence(line))}}`).join("\n");
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

  const rankedSkills = scoredSkills
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const directlyRelevantSkills = rankedSkills.filter((entry) => entry.score > 0);
  // Only fall back to the candidate's full skill list (score-0 included) when NOTHING is
  // relevant — mirrors selectRelevantItems' fallback below, rather than padding out an
  // already-relevant list with unrelated skills just to hit a minimum count.
  const finalSkills = directlyRelevantSkills.length ? directlyRelevantSkills : rankedSkills;

  return finalSkills.slice(0, 18).map((entry) => entry.skill);
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

function categorizeSkills(skills) {
  const grouped = skillCategoryRules.reduce((accumulator, category) => {
    accumulator[category.label] = [];
    return accumulator;
  }, { Other: [] });

  skills.forEach((skill) => {
    const category = skillCategoryRules.find((rule) =>
      rule.patterns.some((pattern) => pattern.test(skill))
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
  const groupedFromProfile = (profile.skillGroups || [])
    .map((group) => ({
      label: sentence(group.category, "Skills"),
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
  const uncategorizedSelectedSkills = selectedSkills.filter((skill) => !groupedSkillSet.has(skill.toLowerCase()));

  return [
    ...groupedFromProfile,
    ...categorizeSkills(uncategorizedSelectedSkills)
  ];
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

const defaultResumeTemplate = String.raw`%-------------------------
% Resume in Latex
%------------------------

\documentclass[letterpaper,11pt]{article}

\usepackage{latexsym}
\usepackage[empty]{fullpage}
\usepackage{titlesec}
\usepackage{marvosym}
\usepackage[usenames,dvipsnames]{color}
\usepackage{verbatim}
\usepackage{enumitem}
\usepackage[hidelinks]{hyperref}
\usepackage{fancyhdr}
\usepackage[english]{babel}
\usepackage{tabularx}
\usepackage{fontawesome5}
\usepackage{multicol}
\usepackage{graphicx}
\setlength{\multicolsep}{-3.0pt}
\setlength{\columnsep}{-1pt}
\input{glyphtounicode}

\pagestyle{fancy}
\fancyhf{}
\fancyfoot{}
\renewcommand{\headrulewidth}{0pt}
\renewcommand{\footrulewidth}{0pt}

% Margins
\addtolength{\oddsidemargin}{-0.6in}
\addtolength{\evensidemargin}{-0.5in}
\addtolength{\textwidth}{1.19in}
\addtolength{\topmargin}{-.7in}
\addtolength{\textheight}{1.4in}

\urlstyle{same}
\raggedbottom
\raggedright
\setlength{\tabcolsep}{0in}
\pdfgentounicode=1

% Sections
\titleformat{\section}{
  \vspace{-4pt}\scshape\raggedright\large\bfseries
}{}{0em}{}[\color{black}\titlerule \vspace{-5pt}]
\titlespacing*{\section}{0pt}{8pt}{8pt}

\newcommand{\resumedash}{\raisebox{0.25ex}{\scalebox{0.9}{\textbf{--}}}}
\newcommand{\resumeItem}[1]{\item\small{{#1 \vspace{-2pt}}}}

\newcommand{\resumeProjectHeading}[2]{
\item[]
\begin{tabular*}{1.001\textwidth}{l@{\extracolsep{\fill}}r}
\small#1 & \textbf{\small #2}\\
\end{tabular*}\vspace{-7pt}
}

\newcommand{\resumeItemListStart}{\begin{itemize}[leftmargin=*, label=\resumedash]}
\newcommand{\resumeItemListEnd}{\end{itemize}\vspace{-5pt}}

\begin{document}

\begin{center}
{\Huge \scshape NAME} \\ \vspace{1pt}
LOCATION_OR_UNIVERSITY \\ \vspace{1pt}
\small
\faPhone\ PHONE ~
\href{mailto:EMAIL}{\faEnvelope\ \underline{EMAIL}} ~
\href{LINKEDIN}{\faLinkedin\ \underline{LINKEDIN_LABEL}} ~
\href{GITHUB}{\faGithub\ \underline{GITHUB_LABEL}}
\vspace{-8pt}
\end{center}

\section{Objective}
\begin{itemize}[leftmargin=0.0in, label={}]
\item\small{OBJECTIVE}
\end{itemize}

\section{Education}
\begin{itemize}[leftmargin=0.0in, label={}]
EDUCATION
\end{itemize}

\section{Experience}
\begin{itemize}[leftmargin=0.0in, label={}]
EXPERIENCE
\end{itemize}

\section{Projects}
\begin{itemize}[leftmargin=0pt, itemsep=2pt, topsep=2pt, label={}]
PROJECTS
\end{itemize}

\section{Technical Skills}
\vspace{2pt}
\small
TECHNICAL_SKILLS

\section{Achievements}
\begin{itemize}[leftmargin=0.0in, label={}]
ACHIEVEMENTS
\end{itemize}

\section{Certifications}
\begin{itemize}[leftmargin=0.0in, label={}]
CERTIFICATIONS
\end{itemize}

\end{document}`;

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

function selectRelevantItems(items, targetTerms, limit = 4) {
  const scoredItems = (items || [])
    .map((item, index) => ({
      item,
      index,
      score: itemRelevanceScore(item, targetTerms)
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const relevantItems = scoredItems.filter((entry) => entry.score > 0);

  return (relevantItems.length ? relevantItems : scoredItems)
    .slice(0, limit)
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

  const experienceItems = selectRelevantItems(profile.experience || [], targetTerms, 4).map((item) => {
    const dates = [formatDate(item.startDate), item.isCurrent ? "Present" : formatDate(item.endDate)]
      .filter(Boolean)
      .join(" -- ");
    return [
      `\\item \\textbf{${escapeLatex(item.jobTitle || "Experience")}} ${dates ? `\\hfill ${escapeLatex(dates)}` : ""} \\\\`,
      `${escapeLatex(item.companyName || "Company")}`,
      "\n\\resumeItemListStart\n",
      buildResumeItemBullets(item.description, `Applied relevant skills to responsibilities aligned with ${roleTitle}.`),
      "\n\\resumeItemListEnd"
    ].join("");
  });

  const projectItems = selectRelevantItems(profile.projects || [], targetTerms, 2).map((item) => {
    const techStack = (item.technologies || item.techStack || [])
      .map((tech) => String(tech).trim())
      .filter(Boolean)
      .join(", ");
    const links = [item.projectUrl, item.repositoryUrl, item.liveUrl, item.githubUrl].filter(Boolean).join(" | ");
    return [
      `\\resumeProjectHeading{\\textbf{${escapeLatex(item.title || "Project")}}${techStack ? ` $|$ \\emph{${escapeLatex(techStack)}}` : ""}}{${escapeLatex(links)}}`,
      "\\resumeItemListStart\n",
      buildResumeItemBullets(item.description, `Built a project aligned with ${roleTitle} requirements.`),
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
  const educationItems = educationEntries.map(({ item }) => {
      const dates = [formatDate(item.startDate), formatDate(item.endDate)].filter(Boolean).join(" -- ");
      const year = dates || item.graduationYear;
      const gpa = item.currentGPA ? ` \\hfill CGPA: ${escapeLatex(item.currentGPA)}` : "";
      return [
        `\\item\\textbf{${formatDegreeWithField(item.degree, item.fieldOfStudy)}} ${year ? `\\hfill ${escapeLatex(year)}` : ""} \\\\`,
        `${escapeLatex(item.institution || "Institution")}${gpa}`
      ].join("");
    });

  const certificationItems = (profile.licensesAndCertifications || [])
    .slice(0, 5)
    .map((item) => `\\item ${escapeLatex(item.title || "Certification")}${item.description ? `, ${escapeLatex(item.description)}` : ""}`);
  const achievementItems = (profile.achievements || [])
    .slice(0, 5)
    .map((item) => `\\item ${escapeLatex(item.title || "Achievement")}${item.description ? `: ${escapeLatex(item.description)}` : ""}`);
  const categorizedSkills = categorizeResumeSkills(profile, skills);
  const technicalLines = categorizedSkills.length
    ? categorizedSkills.map((category) =>
      `\\textbf{${escapeLatex(category.label)}:} ${escapeLatex(category.skills.join(", "))} \\\\[3pt]`
    )
    : (omitEmptySections ? [] : [`\\textbf{Skills:} Relevant technical skills \\\\[3pt]`]);
  if (!omitEmptySections) {
    // "Core Concepts" is derived from the job posting (not the candidate's own profile data) and
    // "Soft Skills" is a generic filler list — both are fine for the legacy job-based generator,
    // but they must NOT appear when a section is only allowed to contain real profile data.
    technicalLines.push(
      `\\textbf{Core Concepts:} ${escapeLatex(jobSkills.slice(0, 8).join(", ") || "Data Structures, Algorithms, Object-Oriented Programming")} \\\\[3pt]`,
      "\\textbf{Soft Skills:} Problem Solving, Communication, Adaptability, Team Player"
    );
  }

  return {
    NAME: escapeLatex(name),
    LOCATION_OR_UNIVERSITY: escapeLatex(institutionLine),
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
    TECHNICAL_SKILLS: technicalLines.join("\n"),
    ACHIEVEMENTS: achievementItems.length
      ? achievementItems.join("\n")
      : (omitEmptySections ? "" : "\\item Relevant achievements available on request."),
    CERTIFICATIONS: certificationItems.length
      ? certificationItems.join("\n")
      : (omitEmptySections ? "" : "\\item Relevant certifications available on request.")
  };
}

const OMITTABLE_SECTION_LABELS_BY_CONTENT_KEY = {
  EDUCATION: "Education",
  EXPERIENCE: "Experience",
  PROJECTS: "Projects",
  TECHNICAL_SKILLS: "Technical Skills",
  ACHIEVEMENTS: "Achievements",
  CERTIFICATIONS: "Certifications"
};

function buildLatexResumeFromTemplate(profile, job, template = defaultResumeTemplate, options = {}) {
  const content = buildResumeContent(profile || {}, job || {}, options);

  let latex = Object.entries(content).sort(([left], [right]) => right.length - left.length).reduce(
    (compiled, [key, value]) => compiled.replaceAll(key, value),
    template || defaultResumeTemplate
  ).trim();

  if (options.omitEmptySections) {
    const emptySectionLabels = Object.entries(OMITTABLE_SECTION_LABELS_BY_CONTENT_KEY)
      .filter(([contentKey]) => !String(content[contentKey] || "").trim())
      .map(([, label]) => label);

    latex = stripEmptyLatexSections(latex, emptySectionLabels);
  }

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
