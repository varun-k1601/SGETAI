/* ===============================================================================================
   Golden-file tests for resume generation.  Run: npm run test:resume
   ===============================================================================================
   Uses node:test — built into Node 18+, so no new dependency.

   Every fixture is asserted twice: once on the generated LaTeX (structure, escaping, no empty
   sections, no duplicates, most-recent role present), and once on the COMPILED PDF (it builds at
   all, and the page count is what we expect). A silent LaTeX failure fails the test — it does not
   fall through to a broken document, which is how a two-line page 2 shipped in the first place.
   =============================================================================================== */

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildLatexResumeFromTemplate,
  buildProfileForTailoring
} = require("../resumeGenerationService");
const { compileLatexToPdf, isLatexCompilerAvailable } = require("../latexCompilerService");
const { fixtures, TARGET_JOB } = require("./resumeGeneration.fixtures");

function build(profile) {
  return buildLatexResumeFromTemplate(
    buildProfileForTailoring(profile),
    TARGET_JOB,
    undefined,
    { omitEmptySections: true, objective: "Objective text for the fixture." }
  );
}

// Body = everything after \begin{document}, so the preamble's own \newcommand definitions (which
// legitimately contain #1..#4 and braces) are never mistaken for unescaped candidate data.
function documentBody(latex) {
  const index = latex.indexOf("\\begin{document}");
  return index === -1 ? latex : latex.slice(index);
}

function sectionNames(latex) {
  return [...latex.matchAll(/\\section\{([^}]*)\}/g)].map((match) => match[1]);
}

// The content a section actually renders, minus its heading and list scaffolding.
function sectionContent(latex, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  const match = latex.match(new RegExp(`\\\\section\\{${escaped}\\}([\\s\\S]*?)(?=\\\\section\\{|\\\\end\\{document\\})`));
  if (!match) return null;
  return match[1]
    .replace(/\\(begin|end)\{[^}]*\}(\[[^\]]*\])?/g, "")
    .replace(/\\vspace\{[^}]*\}/g, "")
    .trim();
}

test("escapeLatex covers every TeX special character", () => {
  const latex = build({
    firstName: "R&D",
    lastName: "C#_100%",
    email: "a@b.com",
    skills: ["C#", "R&D", "100% coverage"],
    skillGroups: [],
    education: [],
    experience: [],
    projects: [],
    achievements: [],
    licensesAndCertifications: []
  });

  assert.match(latex, /R\\&D/, "& must be escaped");
  assert.match(latex, /C\\#/, "# must be escaped");
  assert.match(latex, /100\\%/, "% must be escaped");
  assert.match(latex, /\\_/, "_ must be escaped");

  // The backslash-ordering bug: \ must not be double-processed into \textbackslash\{\}.
  const backslashLatex = build({
    firstName: "A",
    lastName: "B",
    email: "a@b.com",
    skills: [],
    skillGroups: [],
    education: [],
    experience: [{ companyName: "X", jobTitle: "Y", startDate: "2024-01-01", endDate: "2024-02-01", description: "Used \\newcommand and {braces} and ~tilde and ^caret." }],
    projects: [],
    achievements: [],
    licensesAndCertifications: []
  });
  assert.doesNotMatch(backslashLatex, /textbackslash\\\{/, "\\ must not be re-escaped into \\textbackslash\\{\\}");
  assert.match(backslashLatex, /\\textbackslash\{\}/, "\\ must render via \\textbackslash{}");
});

test("Core Concepts and Soft Skills filler is gone in both modes", () => {
  for (const omitEmptySections of [true, false]) {
    const latex = buildLatexResumeFromTemplate(
      buildProfileForTailoring(fixtures[1].profile),
      TARGET_JOB,
      undefined,
      { omitEmptySections, objective: "obj" }
    );
    assert.doesNotMatch(latex, /Core Concepts/i, `Core Concepts leaked (omitEmptySections=${omitEmptySections})`);
    assert.doesNotMatch(latex, /Soft Skills/i, `Soft Skills leaked (omitEmptySections=${omitEmptySections})`);
    assert.doesNotMatch(latex, /Problem Solving, Communication, Adaptability, Team Player/, "generic filler leaked");
  }
});

test("relevance never deletes the most recent role", () => {
  const latex = build(fixtures.find((f) => f.name === "five-short-roles").profile);
  // Nykaa is the newest role and scores ZERO against a Java/Selenium target job.
  assert.match(latex, /Nykaa/, "the most recent role must survive relevance filtering");
  const experience = sectionContent(latex, "Experience");
  const nykaaAt = experience.indexOf("Nykaa");
  const adpAt = experience.indexOf("ADP");
  assert.ok(nykaaAt !== -1 && (adpAt === -1 || nykaaAt < adpAt), "experience must read newest-first");
});

test("achievements and certifications are merged and deduplicated", () => {
  const latex = build(fixtures.find((f) => f.name === "five-short-roles").profile);

  assert.ok(!sectionNames(latex).includes("Achievements"), "the standalone Achievements section is gone");
  assert.ok(!sectionNames(latex).includes("Certifications"), "the standalone Certifications section is gone");
  assert.ok(sectionNames(latex).includes("Achievements/Certifications"), "merged section must exist");

  const hackerrankCount = (latex.match(/5 star badge in Problem Solving/g) || []).length;
  assert.equal(hackerrankCount, 1, "an item present in both arrays must render exactly once");
  const gateCount = (latex.match(/AIR 2174/g) || []).length;
  assert.equal(gateCount, 1, "the GATE rank must render exactly once");
});

test("experience uses \\resumeSubheading with company, dates, role and location", () => {
  const latex = build(fixtures.find((f) => f.name === "five-short-roles").profile);
  assert.match(latex, /\\newcommand\{\\resumeSubheading\}\[4\]/, "the 4-arg command must be defined");
  assert.match(
    latex,
    /\\resumeSubheading\{ADP\}\{Sep 2023 -- Jun 2024\}\{Member Technical\}\{Hyderabad\}/,
    "company/dates/role/location must all be passed"
  );
});

test("a multi-sentence description becomes multiple bullets", () => {
  const latex = build(fixtures.find((f) => f.name === "five-short-roles").profile);
  const experience = sectionContent(latex, "Experience");
  const adpBlock = experience.slice(experience.indexOf("ADP"));
  const bullets = (adpBlock.match(/\\resumeItem\{/g) || []).length;
  assert.ok(bullets >= 3, `ADP's three sentences must render as >=3 bullets, got ${bullets}`);
});

test("no section renders empty, and sparse profiles drop optional sections entirely", () => {
  for (const fixture of fixtures) {
    const latex = build(fixture.profile);
    for (const name of sectionNames(latex)) {
      const content = sectionContent(latex, name);
      assert.ok(content && content.length > 0, `[${fixture.name}] section "${name}" rendered empty`);
    }
  }

  const sparse = build(fixtures.find((f) => f.name === "sparse-minimal").profile);
  for (const absent of ["Experience", "Projects", "Relevant Coursework", "Extracurricular", "Achievements/Certifications"]) {
    assert.ok(!sectionNames(sparse).includes(absent), `sparse profile must not render "${absent}"`);
  }
});

test("GPA, coursework and project dates are emitted when present", () => {
  const dense = build(fixtures.find((f) => f.name === "five-short-roles").profile);
  assert.match(dense, /CGPA: 8\.68\/10/, "a 10-point GPA must render with its scale");

  const student = build(fixtures.find((f) => f.name === "student-projects-only").profile);
  assert.match(student, /\\begin\{multicols\}\{3\}/, "coursework must use the 3-column layout");
  assert.match(student, /Operating Systems/, "coursework entries must render");
  // The heading's first argument contains nested braces (\href{url}{\textbf{title}}), so match the
  // whole emitted line rather than trying to balance them with a character class.
  const heading = student.match(/\\resumeProjectHeading\{\\href.*/)[0];
  assert.match(heading, /\}\{Jan 2025 -- Apr 2025\}/, "project dates belong in the right slot");
  assert.doesNotMatch(heading, /\}\{https?:/, "a raw URL must never occupy the right-hand slot");
  assert.match(student, /\\faGithub/, "a repository link becomes a hyperlinked title");
});

test("skills split into at least two labelled categories and hedges are stripped", () => {
  const latex = build(fixtures.find((f) => f.name === "single-long-role").profile);
  const skills = sectionContent(latex, "Technical Skills");
  const labels = [...skills.matchAll(/\\textbf\{([^}]+):\}/g)].map((m) => m[1]);
  assert.ok(labels.length >= 2, `expected >=2 skill categories, got ${labels.length}: ${labels}`);
  assert.ok(!labels.includes("Skills"), 'the generic "Skills" bucket must not be used');
  assert.match(skills, /C\+\+/, "hedged skills must still appear");
  assert.doesNotMatch(skills, /Basics of/i, '"Basics of" must be stripped');
  assert.doesNotMatch(skills, /Familiar with/i, '"Familiar with" must be stripped');
});

test("metrics are bolded, and only within the candidate's own words", () => {
  const latex = build(fixtures.find((f) => f.name === "single-long-role").profile);
  assert.match(latex, /\\textbf\{[^}]*70\\%[^}]*\}|\\textbf\{70\\%\}/, "a percentage must be emphasised");
  // Emphasis must never introduce a term the candidate did not write.
  assert.doesNotMatch(latex, /\\textbf\{Kubernetes\}/, "a term absent from the bullet must not be bolded into it");
});

test("the section spine appears in exact order, regardless of which sections have data", () => {
  // The spine is FIXED. It must never reorder based on which sections happen to be populated —
  // a resume whose Experience sometimes precedes and sometimes follows Projects reads as broken.
  const SPINE = ["Objective", "Education", "Experience", "Projects", "Technical Skills", "Achievements/Certifications"];

  for (const fixture of fixtures) {
    const order = sectionNames(build(fixture.profile));
    const spineOrder = order.filter((name) => SPINE.includes(name));
    const expected = SPINE.filter((name) => spineOrder.includes(name));
    assert.deepEqual(spineOrder, expected, `[${fixture.name}] spine out of order: ${order.join(" -> ")}`);
  }

  // With every section populated, the full order — spine plus the optional sections in their
  // fixed slots — must be exactly this.
  const dense = sectionNames(build(fixtures.find((f) => f.name === "five-short-roles").profile));
  assert.deepEqual(dense, [
    "Objective", "Education", "Experience", "Projects", "Technical Skills",
    "Achievements/Certifications", "Extracurricular"
  ], `unexpected full section order: ${dense.join(" -> ")}`);

  // Relevant Coursework sits immediately after Technical Skills when present.
  const withCoursework = sectionNames(build(fixtures.find((f) => f.name === "student-projects-only").profile));
  const skillsAt = withCoursework.indexOf("Technical Skills");
  assert.equal(withCoursework[skillsAt + 1], "Relevant Coursework", `coursework misplaced: ${withCoursework.join(" -> ")}`);
});

test("an optional section drops out cleanly without leaving a gap or a stray rule", () => {
  const sparse = build(fixtures.find((f) => f.name === "sparse-minimal").profile);
  assert.doesNotMatch(sparse, /\n{3,}/, "removing a section must not leave a doubled blank line");
  assert.doesNotMatch(sparse, /\\titlerule\s*\n\s*\\section/, "a stray section rule was left behind");
  // Nothing may survive a stripped section: no heading, no scaffolding, no unreplaced placeholder.
  assert.doesNotMatch(sparse, /COURSEWORK|EXTRACURRICULAR|ACHIEVEMENTS_CERTIFICATIONS/, "an unreplaced placeholder leaked");
  assert.doesNotMatch(sparse, /\\begin\{multicols\}/, "the coursework multicols block outlived its section");
});

test("relevance orders skills but never deletes them", () => {
  // The regression: one matching skill used to discard every score-0 skill, so a MERN posting
  // erased Docker, Kubernetes and Jenkins from a DevOps candidate entirely.
  const profile = {
    firstName: "Test", lastName: "Candidate", email: "t@example.com",
    skills: ["React", "Node.js", "MongoDB", "Express", "Docker", "Kubernetes", "Jenkins", "Ansible", "Pandas", "Linux"],
    skillGroups: [], education: [], experience: [], projects: [], achievements: [], licensesAndCertifications: []
  };
  const mernJob = {
    title: "MERN Stack Developer",
    skillsRequired: ["React", "Node.js", "MongoDB", "Express"],
    requirements: ["Build React front-ends", "Ship Node.js APIs"]
  };

  const latex = buildLatexResumeFromTemplate(
    buildProfileForTailoring(profile), mernJob, undefined,
    { omitEmptySections: true, objective: "Objective." }
  );
  const skills = sectionContent(latex, "Technical Skills");

  for (const zeroScoring of ["Docker", "Kubernetes", "Jenkins", "Ansible", "Pandas", "Linux"]) {
    assert.ok(skills.includes(zeroScoring), `"${zeroScoring}" scores 0 against this job and must still appear`);
  }
  // Ranking must still put the matching skills first.
  assert.ok(skills.indexOf("React") < skills.indexOf("Docker"), "job-relevant skills must rank ahead of the rest");
  // And the categories those skills belong to must materialise.
  const labels = [...skills.matchAll(/\\textbf\{([^}]+):\}/g)].map((m) => m[1]);
  assert.ok(labels.some((label) => /DevOps/.test(label)), `expected a Cloud & DevOps category, got: ${labels}`);
});

test("extracurricular renders organisation-first, matching the Experience convention", () => {
  const latex = build(fixtures.find((f) => f.name === "five-short-roles").profile);
  // Organisation bold-left, dates right, role italic-left — NOT the role bold with the body italic.
  assert.match(
    latex,
    /\\resumeSubheading\{NSS\}\{[^}]*2020[^}]*\}\{Volunteer\}\{\}/,
    "extracurricular arguments are inverted"
  );
});

test("a date range fused into the heading is moved into the dates column", () => {
  // Parsers routinely emit "NSS 2019 - 2022" as the title because a flat activity line has
  // nowhere else to put the dates.
  const base = {
    firstName: "Test", lastName: "Candidate", email: "t@example.com",
    skills: ["Python"], skillGroups: [], education: [], experience: [], projects: [],
    achievements: [], licensesAndCertifications: []
  };
  const latex = build({
    ...base,
    customSections: [{ title: "Extracurricular", entries: [{ title: "NSS 2019 - 2022", organization: "Volunteer", description: "" }] }]
  });
  assert.match(latex, /\\resumeSubheading\{NSS\}\{2019 -- 2022\}\{Volunteer\}\{\}/, "the fused date range was not split out");

  // A heading that is nothing BUT a date range keeps its text rather than collapsing to empty.
  const bare = build({
    ...base,
    customSections: [{ title: "Extracurricular", entries: [{ title: "2019 - 2022", organization: "Volunteer" }] }]
  });
  assert.match(bare, /\\resumeSubheading\{2019 - 2022\}/, "a date-only heading must not be emptied");
});

test("the parser harvests technologies from the candidate's own narrative only", () => {
  const { harvestSkillsFromNarrative } = require("../resumeProfileParser");

  const { skills, harvested } = harvestSkillsFromNarrative({
    skills: ["Core Java", "Spring Boot", "Selenium"],
    experience: [{ description: "Automated the sales website built on Oracle CPQ and Salesforce." }],
    projects: [{ title: "Sign Language Recognition", description: "Deployed a CNN with Jenkins, Docker, Kubernetes and Ansible on Linux; preprocessed with NumPy and Pandas." }]
  });

  for (const expected of ["Docker", "Kubernetes", "Jenkins", "Ansible", "NumPy", "Pandas", "Linux"]) {
    assert.ok(harvested.includes(expected), `"${expected}" is named in the candidate's own text and must be harvested`);
  }
  // Stored skills always lead, and are never removed or reworded.
  assert.deepEqual(skills.slice(0, 3), ["Core Java", "Spring Boot", "Selenium"]);

  // Subsumption: a term nested inside a longer one is not listed twice.
  assert.ok(!harvested.includes("Java"), '"Java" is subsumed by the stored "Core Java"');
  assert.ok(!harvested.includes("Oracle"), '"Oracle" is subsumed by "Oracle CPQ"');

  // NOTHING may be harvested from a description grounding verification has blanked — that is the
  // guard that stops a fabricated bullet laundering itself into a skills claim.
  const blanked = harvestSkillsFromNarrative({
    skills: ["Python"],
    experience: [{ description: "" }],
    projects: [{ title: "Untitled", description: "" }]
  });
  assert.deepEqual(blanked.harvested, [], "a blanked description must contribute no skills");
});

// pdflatex writes compressed object streams, so the page tree is not greppable in the PDF bytes.
// It does, however, report the count itself: "Output written on x.pdf (2 pages, 96607 bytes)".
async function compileAndCountPages(latex, name) {
  const { execFile } = require("node:child_process");
  const { promisify } = require("node:util");
  const fsp = require("node:fs/promises");
  const os = require("node:os");
  const path = require("node:path");
  const execFileAsync = promisify(execFile);

  const compiler =
    process.env.PDFLATEX_PATH ||
    path.join(__dirname, "..", "..", "..", "..", "tools", "TinyTeX", "TinyTeX", "bin", "windows", "pdflatex.exe");

  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "resume-golden-"));
  const texPath = path.join(dir, `${name}.tex`);
  try {
    await fsp.writeFile(texPath, latex, "utf8");
    const { stdout } = await execFileAsync(
      compiler,
      ["-interaction=nonstopmode", "-halt-on-error", "-output-directory", dir, texPath],
      { timeout: 60000, windowsHide: true, maxBuffer: 20 * 1024 * 1024 }
    );
    const match = stdout.match(/Output written on .*?\((\d+) pages?,/);
    return { pages: match ? Number(match[1]) : 0, stdout };
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

test("every fixture compiles to a PDF with the expected page count", async (t) => {
  if (!(await isLatexCompilerAvailable())) {
    t.skip("pdflatex unavailable in this environment");
    return;
  }

  for (const fixture of fixtures) {
    const latex = build(fixture.profile);

    // 1. The PRODUCTION path must succeed. A LaTeX failure fails the test loudly rather than
    //    falling through to a broken document.
    let result;
    try {
      result = await compileLatexToPdf(latex, `${fixture.name}.tex`);
    } catch (error) {
      assert.fail(`[${fixture.name}] LaTeX compilation FAILED: ${error.message}`);
    }
    assert.ok(result.pdfBuffer.length > 1000, `[${fixture.name}] produced a suspiciously small PDF`);

    // 2. Page count, read from pdflatex's own report.
    const { pages } = await compileAndCountPages(latex, fixture.name);
    assert.ok(pages > 0, `[${fixture.name}] could not determine a page count`);
    assert.ok(
      pages >= fixture.expect.minPages && pages <= fixture.expect.maxPages,
      `[${fixture.name}] expected ${fixture.expect.minPages}-${fixture.expect.maxPages} pages, got ${pages}`
    );
  }
});
