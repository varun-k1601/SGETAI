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
  buildProfileForTailoring,
  getResumeTemplate,
  RESUME_VARIANTS
} = require("../resumeGenerationService");
const { compileLatexToPdf, isLatexCompilerAvailable } = require("../latexCompilerService");
const { fixtures, TARGET_JOB } = require("./resumeGeneration.fixtures");

function build(profile, variant = "c") {
  return buildLatexResumeFromTemplate(
    buildProfileForTailoring(profile),
    TARGET_JOB,
    null,
    { omitEmptySections: true, objective: "Objective text for the fixture.", variant }
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
  assert.ok(sectionNames(latex).includes("Certifications and Achievements"), "merged section must exist");

  const hackerrankCount = (latex.match(/5 star badge in Problem Solving/g) || []).length;
  assert.equal(hackerrankCount, 1, "an item present in both arrays must render exactly once");
  const gateCount = (latex.match(/AIR 2174/g) || []).length;
  assert.equal(gateCount, 1, "the GATE rank must render exactly once");
});

test("experience is ONE line: role, company and location left, dates right", () => {
  // Replaces the two-line \resumeSubheading, where the company sat bold on one line with the role
  // in italics beneath it. The reference family puts both on a single bold line with the dates
  // right-aligned — a third of a line shorter per entry, and it reads as one unit.
  const latex = build(fixtures.find((f) => f.name === "five-short-roles").profile);
  assert.match(latex, /\\newcommand\{\\resumeEntry\}\[2\]/, "the 2-arg command must be defined");
  assert.doesNotMatch(documentBody(latex), /\\resumeSubheading/, "the two-line entry must be gone");
  assert.match(
    latex,
    /\\resumeEntry\{Member Technical \$\|\$ ADP, Hyderabad\}\{Sep 2023 -- Jun 2024\}/,
    "role, company and location share the left cell; dates go right"
  );

  // A role with no recorded location must collapse rather than emit a trailing comma.
  const noLocation = build({
    firstName: "Test", lastName: "Candidate", email: "t@example.com",
    skills: ["Java"], skillGroups: [], education: [], projects: [],
    achievements: [], licensesAndCertifications: [],
    experience: [{ companyName: "Acme", jobTitle: "Engineer", startDate: "2024-01-01", endDate: "2024-06-01", description: "Shipped things." }]
  });
  assert.match(noLocation, /\\resumeEntry\{Engineer \$\|\$ Acme\}/, "a missing location must not leave a dangling comma");
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
  for (const absent of ["Experience", "Projects", "Relevant Coursework", "Extracurricular", "Certifications and Achievements"]) {
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
  const skills = sectionContent(latex, "Skills");
  const labels = [...skills.matchAll(/\\resumeSkillEntry\{([^}]+)\}/g)].map((m) => m[1]);
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

test("each variant's order is FIXED, and never reshuffles by which sections have data", () => {
  // A variant is a fixed spine, not a preference. A resume whose Experience sometimes precedes and
  // sometimes follows Skills reads as broken, and regenerating must not move anything — which is
  // also why selection hashes the candidate id rather than drawing per call.
  for (const variant of RESUME_VARIANTS) {
    const declared = [...getResumeTemplate(variant).matchAll(/\\section\{([^}]*)\}/g)].map((match) => match[1]);

    for (const fixture of fixtures) {
      const rendered = sectionNames(build(fixture.profile, variant));
      // Whatever survives stripping must appear in the template's own declared order — a subset,
      // never a reordering.
      assert.deepEqual(
        rendered,
        declared.filter((name) => rendered.includes(name)),
        `[${fixture.name}/${variant}] order drifted: ${rendered.join(" -> ")}`
      );
    }
  }

  // With every section populated, variant C renders the full set in its declared order.
  const dense = sectionNames(build(fixtures.find((f) => f.name === "five-short-roles").profile, "c"));
  assert.deepEqual(dense, [
    "Summary", "Skills", "Experience", "Education",
    "Certifications and Achievements", "Projects", "Extracurricular"
  ], `unexpected full section order: ${dense.join(" -> ")}`);

  // Coursework is an optional tail on every variant, after Projects.
  const withCoursework = sectionNames(build(fixtures.find((f) => f.name === "student-projects-only").profile, "c"));
  assert.equal(
    withCoursework[withCoursework.indexOf("Projects") + 1],
    "Relevant Coursework",
    `coursework misplaced: ${withCoursework.join(" -> ")}`
  );

  // Two variants that differ only in where Certifications sits must actually differ once a
  // candidate HAS certifications — otherwise the six are five.
  const certified = fixtures.find((f) => f.name === "headline-and-location").profile;
  assert.notDeepEqual(
    sectionNames(build(certified, "b")),
    sectionNames(build(certified, "e")),
    "B and E rendered identically for a certified candidate"
  );
  assert.notDeepEqual(
    sectionNames(build(certified, "e")),
    sectionNames(build(certified, "f")),
    "E and F rendered identically for a certified candidate"
  );
});

test("a candidate's certifications survive whichever layout they are assigned", () => {
  // The failure this guards against: hard-omitting the Certifications block from the variants
  // whose reference layout shows none would mean a certified candidate losing every licence they
  // hold, purely because their id hashed to variant A.
  const certified = fixtures.find((f) => f.name === "headline-and-location").profile;

  for (const variant of RESUME_VARIANTS) {
    const latex = build(certified, variant);
    assert.ok(
      sectionNames(latex).includes("Certifications and Achievements"),
      `[${variant}] dropped the certifications section for a candidate who has one`
    );
    assert.match(latex, /Certified Kubernetes Application Developer/, `[${variant}] lost the certification itself`);
  }
});

test("the headline renders only for the variants that declare it, and only when there is one", () => {
  const withHeadline = fixtures.find((f) => f.name === "headline-and-location").profile;
  const withoutHeadline = fixtures.find((f) => f.name === "sparse-minimal").profile;
  const headlineOf = (latex) => (documentBody(latex).match(/\\resumeHeadline\{([^}]*)\}/) || [])[1] || "";

  for (const variant of ["b", "e", "f"]) {
    const headline = headlineOf(build(withHeadline, variant));
    assert.ok(headline, `[${variant}] declares a headline but rendered none`);
    // Built from the candidate's OWN preferred roles and skills — never the target job's title.
    assert.match(headline, /Backend Engineer/, `[${variant}] headline lost the candidate's own role`);
    assert.doesNotMatch(headline, /Software Engineer/, `[${variant}] headline borrowed the JOB's title`);

    // No tagline and no preferred roles: the layout must close up, not print an empty bold line.
    assert.equal(headlineOf(build(withoutHeadline, variant)), "", `[${variant}] printed an empty headline`);
  }

  for (const variant of ["a", "c", "d"]) {
    assert.equal(headlineOf(build(withHeadline, variant)), "", `[${variant}] rendered a headline it does not declare`);
  }
});

/* REGRESSION. buildResumeHeadline returns an array of PARTS on every path except one: when the
   profile has a tagline it returned the bare STRING, and the caller does
   `formatResumeHeadline(headline)` -> `parts.map(escapeLatex)`. That threw "parts.map is not a
   function" and 500'd the whole request, so ANY seeker with a tagline set could not generate a
   tailored resume — no Pro manual apply, no auto-apply, for them.

   The test above never caught it because both its fixtures reach the headline through
   preferredRoles; neither carries a tagline. The `headline.length ?` guard at the call site does
   not catch it either, since a non-empty string has a length too. */
test("a profile whose headline comes from its TAGLINE renders instead of throwing", () => {
  const base = fixtures.find((f) => f.name === "headline-and-location").profile;
  const withTagline = { ...base, tagline: "Platform Engineer | Kubernetes & Go" };
  const headlineOf = (latex) => (documentBody(latex).match(/\\resumeHeadline\{([^}]*)\}/) || [])[1] || "";

  for (const variant of ["b", "e", "f"]) {
    let latex;
    assert.doesNotThrow(() => {
      latex = build(withTagline, variant);
    }, `[${variant}] a tagline must not crash headline rendering`);

    const headline = headlineOf(latex);
    // The tagline is the headline, verbatim — a single-part array joins to exactly itself, so no
    // separator is introduced and nothing is dropped.
    assert.match(headline, /Platform Engineer/, `[${variant}] the tagline must reach the headline`);
    assert.doesNotMatch(headline, /\$\|\$/, `[${variant}] a one-part headline must not gain a separator`);
    // The tagline wins over preferredRoles, which this fixture also has.
    assert.doesNotMatch(headline, /Backend Engineer/, `[${variant}] preferredRoles must not override the tagline`);
  }
});

test("the contact line is built from profile data, with separators collapsing around gaps", () => {
  const full = documentBody(build(fixtures.find((f) => f.name === "headline-and-location").profile));
  assert.match(full, /Pune, India/, "location must come from the profile");
  assert.match(full, /\+91 99000 22334/, "the profile's own phone, country code included");
  assert.match(full, /ananya@example\.com/, "email");
  assert.match(full, /linkedin\.com\/in\/ananyaiyer/, "LinkedIn");
  assert.match(full, /ananya\.example\.dev/, "portfolio");

  // Nothing is invented for a profile that has almost none of it.
  const sparse = documentBody(build(fixtures.find((f) => f.name === "single-name-no-links").profile));
  assert.doesNotMatch(sparse, /linkedin\.com/i, "a missing LinkedIn must not be substituted");
  assert.doesNotMatch(sparse, /github\.com/i, "a missing GitHub must not be substituted");
  assert.doesNotMatch(sparse, /Phone not available|email-not-available/, "a fake contact detail was emitted");
  assert.doesNotMatch(sparse, /~\s*~/, "a missing field left a doubled separator");
  assert.doesNotMatch(sparse, /Meenakshi\s+\}/, "a single-name candidate left a trailing space in the name");

  // A profile with no contact details at all emits no line, rather than a bare `\\`.
  const nothing = documentBody(build({
    firstName: "Anon", lastName: "", skills: ["Python"], skillGroups: [],
    education: [], experience: [], projects: [], achievements: [], licensesAndCertifications: []
  }));
  assert.doesNotMatch(nothing, /\\faPhone|\\faEnvelope|\\faLinkedin/, "contact glyphs with nothing behind them");
});

test("an optional section drops out cleanly without leaving a gap or a stray rule", () => {
  /* Scoped to the BODY. The preamble legitimately mentions \titlerule and \begin{multicols} in
     the command definitions the coursework arrangement is built from; those are always present
     and say nothing about whether a stripped section left scaffolding behind. */
  const sparse = documentBody(build(fixtures.find((f) => f.name === "sparse-minimal").profile));
  assert.doesNotMatch(sparse, /\n{3,}/, "removing a section must not leave a doubled blank line");
  assert.doesNotMatch(sparse, /\\titlerule\s*\n\s*\\section/, "a stray section rule was left behind");
  // Nothing may survive a stripped section: no heading, no scaffolding, no unreplaced placeholder.
  assert.doesNotMatch(sparse, /COURSEWORK|EXTRACURRICULAR|CERTIFICATIONS/, "an unreplaced placeholder leaked");
  assert.doesNotMatch(sparse, /\\resumeCourseworkStart|\\begin\{multicols\}/,
    "the coursework block outlived its section");
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
  const skills = sectionContent(latex, "Skills");

  for (const zeroScoring of ["Docker", "Kubernetes", "Jenkins", "Ansible", "Pandas", "Linux"]) {
    assert.ok(skills.includes(zeroScoring), `"${zeroScoring}" scores 0 against this job and must still appear`);
  }
  // Ranking must still put the matching skills first.
  assert.ok(skills.indexOf("React") < skills.indexOf("Docker"), "job-relevant skills must rank ahead of the rest");
  // And the categories those skills belong to must materialise.
  const labels = [...skills.matchAll(/\\resumeSkillEntry\{([^}]+)\}/g)].map((m) => m[1]);
  assert.ok(labels.some((label) => /DevOps/.test(label)), `expected a Cloud & DevOps category, got: ${labels}`);
});

test("extracurricular renders organisation-first, matching the Experience convention", () => {
  const latex = build(fixtures.find((f) => f.name === "five-short-roles").profile);
  // Organisation bold-left, dates right, role italic-left — NOT the role bold with the body italic.
  assert.match(
    latex,
    /\\resumeEntry\{Volunteer \$\|\$ NSS\}\{[^}]*2020[^}]*\}/,
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
  assert.match(latex, /\\resumeEntry\{Volunteer \$\|\$ NSS\}\{2019 -- 2022\}/, "the fused date range was not split out");

  // A heading that is nothing BUT a date range keeps its text rather than collapsing to empty.
  const bare = build({
    ...base,
    customSections: [{ title: "Extracurricular", entries: [{ title: "2019 - 2022", organization: "Volunteer" }] }]
  });
  assert.match(bare, /\\resumeEntry\{Volunteer \$\|\$ 2019 - 2022\}/, "a date-only heading must not be emptied");
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

  /* THE UNDER-READ SKILLS SECTION — the case the draft narrative alone cannot recover.
     When the model reads the "Technical Skills" line badly, the technologies never reach the draft
     at all: `skills` is short AND there is no description to harvest them from, so harvesting the
     draft finds nothing. One real profile came through holding nine skills while its source
     document listed ten more. The uploaded text is the candidate's own document, so recognising a
     name in it is transcription; the match is literal against a fixed lexicon, so nothing can be
     recovered that the document does not spell out. */
  const underRead = { skills: ["Core Java", "Python", "SQL"], experience: [], projects: [] };
  const sourceText = [
    "TECHNICAL SKILLS",
    "Languages: Core Java, Python, SQL",
    "DevOps: Docker, Kubernetes, Jenkins, Ansible, Linux",
    "Data: Pandas, NumPy, Scikit-Learn, PySpark, DSPy"
  ].join("\n");

  assert.deepEqual(
    harvestSkillsFromNarrative(underRead).harvested, [],
    "with no narrative there is nothing to harvest from the draft — this is the gap the source text closes"
  );

  const recovered = harvestSkillsFromNarrative(underRead, sourceText);
  for (const expected of ["Docker", "Kubernetes", "Jenkins", "Ansible", "Pandas", "NumPy", "Scikit-Learn", "PySpark", "Linux", "DSPy"]) {
    assert.ok(
      recovered.harvested.includes(expected),
      `"${expected}" is printed in the uploaded resume and must be recovered when the model misses it`
    );
  }
  assert.deepEqual(recovered.skills.slice(0, 3), ["Core Java", "Python", "SQL"], "stored skills still lead");

  // And still nothing is invented: a technology absent from the document is absent from the result.
  assert.ok(!recovered.skills.some((skill) => /terraform/i.test(skill)), "a technology the document never names must not appear");
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

test("EVERY variant compiles to a PDF for EVERY fixture profile", async (t) => {
  if (!(await isLatexCompilerAvailable())) {
    t.skip("pdflatex unavailable in this environment");
    return;
  }

  // Six layouts multiply the surface a LaTeX error can hide in: a spacing constant that is fine
  // when Skills follows Experience can abort the build when it leads, and a section that strips
  // cleanly in the middle of a document can leave a dangling rule at the end of another. A silent
  // fallback is never acceptable here — a failure fails the test loudly.
  const failures = [];

  for (const fixture of fixtures) {
    for (const variant of RESUME_VARIANTS) {
      const latex = build(fixture.profile, variant);
      const name = `${fixture.name}-${variant}`;

      try {
        const { pages } = await compileAndCountPages(latex, name);
        assert.ok(pages > 0, `[${name}] produced no pages`);
        assert.ok(
          pages >= fixture.expect.minPages && pages <= fixture.expect.maxPages,
          `[${name}] expected ${fixture.expect.minPages}-${fixture.expect.maxPages} pages, got ${pages}`
        );
      } catch (error) {
        // Collect rather than throw, so one broken variant does not hide the other five.
        const reason = String(error.stdout || error.message).match(/^! .*$/m);
        failures.push(`${name}: ${reason ? reason[0] : error.message.split("\n")[0]}`);
      }
    }
  }

  assert.deepEqual(failures, [], `variants failed to compile:\n  ${failures.join("\n  ")}`);
});

test("every fix from the previous two passes survives in ALL SIX layouts", () => {
  // The earlier assertions in this file exercise one variant. Section order, the skills separator
  // and the project tech layout all changed underneath them, so each invariant is re-checked
  // against every layout rather than assumed to carry over.
  const dense = fixtures.find((f) => f.name === "five-short-roles").profile;
  const longRole = fixtures.find((f) => f.name === "single-long-role").profile;

  for (const variant of RESUME_VARIANTS) {
    const latex = build(dense, variant);
    const body = documentBody(latex);
    const label = `[${variant}]`;

    // 1. The most recent role is never dropped by relevance filtering.
    assert.match(latex, /Nykaa/, `${label} the newest role was filtered out`);
    const experience = sectionContent(latex, "Experience");
    assert.ok(
      experience.indexOf("Nykaa") !== -1 && experience.indexOf("Nykaa") < experience.indexOf("ADP"),
      `${label} experience is not newest-first`
    );

    // 2. Multiple bullets per role, never one run-on paragraph.
    const adpBullets = (experience.slice(experience.indexOf("ADP")).match(/\\resumeItem\{/g) || []).length;
    assert.ok(adpBullets >= 3, `${label} ADP's three sentences collapsed to ${adpBullets} bullet(s)`);

    // 3. Emphasis is capped and never invents a term.
    // One bullet = everything between a \resumeItem{ and the next one (or the end of the list).
    // A lazy `[\s\S]*?\}` runs straight past the closing brace to the next \vspace many bullets
    // later, which counts the whole list's emphasis as one bullet's.
    for (const chunk of body.split("\\resumeItem{").slice(1)) {
      const bullet = chunk.split(/\\resumeItem\{|\\resumeItemListEnd/)[0];
      const spans = (bullet.match(/\\textbf\{/g) || []).length;
      assert.ok(spans <= 3, `${label} a bullet carries ${spans} bold spans: ${bullet.slice(0, 90)}`);
    }
    assert.doesNotMatch(body, /\\textbf\{Kubernetes\}/, `${label} bolded a term the candidate never wrote`);

    // 4. Achievements and certifications are merged and deduplicated.
    assert.equal((latex.match(/5 star badge in Problem Solving/g) || []).length, 1, `${label} duplicate achievement`);
    assert.equal((latex.match(/AIR 2174/g) || []).length, 1, `${label} duplicate GATE rank`);

    // 5. No job-posting filler.
    assert.doesNotMatch(latex, /Core Concepts|Soft Skills/i, `${label} job-posting filler returned`);

    // 6. Hedges stripped, and score-0 skills kept.
    const skills = sectionContent(build(longRole, variant), "Skills");
    assert.doesNotMatch(skills, /Basics of|Familiar with/i, `${label} a hedge survived`);
    assert.match(skills, /C\+\+/, `${label} the hedged skill itself was lost`);
    for (const zeroScoring of ["React", "MongoDB", "Git", "Linux"]) {
      assert.ok(skills.includes(zeroScoring), `${label} "${zeroScoring}" scores 0 and was deleted`);
    }

    // 7. escapeLatex still covers every special, in every layout.
    const hostile = documentBody(build(fixtures.find((f) => f.name === "latex-hostile-and-dense").profile, variant));
    assert.match(hostile, /R\\&D/, `${label} & unescaped`);
    assert.match(hostile, /C\\#/, `${label} # unescaped`);
    assert.doesNotMatch(hostile, /textbackslash\\\{/, `${label} backslash double-escaped`);

    // 8. No section renders empty, in any layout.
    for (const name of sectionNames(latex)) {
      const content = sectionContent(latex, name);
      assert.ok(content && content.length > 0, `${label} section "${name}" rendered empty`);
    }
  }
});

/* Splits a stored description the way the generator does, so the EXPECTED bullet count is derived
   from the profile rather than hard-coded. Mirrors splitDescriptionBullets: explicit line breaks
   first, then sentence boundaries within a line. */
function expectedBulletCount(description) {
  const lines = String(description || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[•*\-–—]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);
  if (!lines.length) return 1;
  return lines.reduce(
    (total, line) => total + Math.max(1, line.split(/(?<=[.!?])\s+(?=[A-Z0-9])/).filter((part) => part.trim()).length),
    0
  );
}

// The bullets belonging to one \resumeEntry / \resumeProjectHeading — everything between that
// heading's \resumeItemListStart and its matching \resumeItemListEnd.
function bulletBlocks(latex) {
  const body = documentBody(latex);
  const blocks = [];
  const pattern = /\\(?:resumeEntry|resumeProjectHeading)\{([\s\S]*?)\}\{[^}]*\}([\s\S]*?)\\resumeItemListEnd/g;
  for (const match of body.matchAll(pattern)) {
    blocks.push({
      heading: match[1].replace(/\\[a-zA-Z]+|[{}]/g, "").replace(/\$\|\$/g, "|").trim(),
      bullets: (match[2].match(/\\resumeItem\{/g) || []).length
    });
  }
  return blocks;
}

test("every bullet the candidate wrote reaches the resume — none is capped away", () => {
  /* THE REGRESSION GUARD FOR THE CONTENT CAPS.
     MAX_BULLETS_PER_ENTRY was 4, so a role or project described in five or six sentences shipped
     four of them and silently discarded the rest. The entry-count caps did the same at the level
     of whole jobs: four experience entries and three projects, so a candidate with five roles lost
     one entirely — a hole in the timeline a recruiter reads as concealment.

     The generator does not get to decide which of someone's accomplishments an employer sees. This
     asserts the counts MATCH, not that they are "close enough". */
  const profile = {
    firstName: "Test", lastName: "Candidate", email: "t@example.com",
    skills: ["Java", "Docker"], skillGroups: [], education: [], achievements: [], licensesAndCertifications: [],
    experience: [
      { companyName: "Six Bullets Ltd", jobTitle: "Engineer", startDate: "2024-01-01", isCurrent: true,
        description: "Shipped the alpha.\n- Shipped the beta.\n- Shipped the gamma.\n- Shipped the delta.\n- Shipped the epsilon.\n- Shipped the zeta." },
      { companyName: "Second", jobTitle: "Engineer", startDate: "2023-01-01", endDate: "2023-12-01", description: "Ran the pipeline. Fixed the flake. Cut the runtime." },
      { companyName: "Third", jobTitle: "Analyst", startDate: "2022-01-01", endDate: "2022-12-01", description: "Wrote the report." },
      { companyName: "Fourth", jobTitle: "Intern", startDate: "2021-01-01", endDate: "2021-12-01", description: "Learned the stack." },
      { companyName: "Fifth", jobTitle: "Trainee", startDate: "2020-01-01", endDate: "2020-12-01", description: "Sat the induction." },
      { companyName: "Sixth", jobTitle: "Volunteer", startDate: "2019-01-01", endDate: "2019-12-01", description: "Helped out." }
    ],
    projects: [
      { title: "Alpha", description: "One.\n- Two.\n- Three.\n- Four.\n- Five." },
      { title: "Beta", description: "Only one thing." },
      { title: "Gamma", description: "First thing. Second thing." },
      { title: "Delta", description: "A single line." },
      { title: "Epsilon", description: "Another single line." }
    ]
  };

  for (const variant of RESUME_VARIANTS) {
    const blocks = bulletBlocks(build(profile, variant));

    // Every entry and every project is present — no whole entry dropped.
    for (const item of [...profile.experience, ...profile.projects]) {
      const name = item.companyName || item.title;
      assert.ok(
        blocks.some((block) => block.heading.includes(name)),
        `[${variant}] "${name}" was dropped entirely; ${blocks.length} of ${profile.experience.length + profile.projects.length} entries rendered`
      );
    }

    // And every bullet within each of them.
    for (const item of [...profile.experience, ...profile.projects]) {
      const name = item.companyName || item.title;
      const block = blocks.find((entry) => entry.heading.includes(name));
      const expected = expectedBulletCount(item.description);
      assert.equal(
        block.bullets, expected,
        `[${variant}] "${name}" rendered ${block.bullets} bullets, profile holds ${expected}`
      );
    }
  }
});

test("bullets, achievements and education are the candidate's text VERBATIM", () => {
  /* Only the Summary is AI-authored. Everything else is transcription, and the permitted
     transformations are exactly three: LaTeX escaping, splitting a multi-sentence description into
     separate bullets, and bolding a metric or technology ALREADY PRESENT in the text. Rewording,
     summarising, shortening, merging or synthesising is not permitted, and this asserts it by
     stripping the permitted markup back off and requiring what remains to be a literal substring
     of the stored field. */
  const strip = (latex) =>
    String(latex)
      .replace(/\\textbf\{([^{}]*)\}/g, "$1")   // emphasis
      .replace(/\\emph\{([^{}]*)\}/g, "$1")
      .replace(/\\&/g, "&").replace(/\\%/g, "%").replace(/\\\$/g, "$").replace(/\\#/g, "#")
      .replace(/\\_/g, "_").replace(/\\\{/g, "{").replace(/\\\}/g, "}")
      .replace(/\\textasciicircum\{\}/g, "^")
      .replace(/\\textbackslash\{\}/g, "\\")
      /* ORDER MATTERS HERE. A bare ~ is the non-breaking tie the builder inserts between the last
         two words; a tilde the CANDIDATE typed is escaped to \textasciitilde{} and contains no
         bare ~. Unescaping first would turn "used by ~40 teams" into a tie and then into a space,
         and the test would report the generator as having reworded text it copied exactly. */
      .replace(/~/g, " ")
      .replace(/\\textasciitilde\{\}/g, "~")
      .replace(/\s+/g, " ")
      .trim();

  const normalise = (value) => String(value || "").replace(/\s+/g, " ").trim();

  for (const fixture of fixtures) {
    const profile = fixture.profile;
    const sourceText = normalise([
      ...(profile.experience || []).map((item) => item.description),
      ...(profile.projects || []).map((item) => item.description),
      ...(profile.achievements || []).map((item) => `${item.title || ""} ${item.description || ""}`),
      ...(profile.licensesAndCertifications || []).map((item) => `${item.title || ""} ${item.description || ""}`),
      ...(profile.education || []).map((item) => `${item.degree || ""} ${item.fieldOfStudy || ""} ${item.institution || ""}`),
      ...(profile.customSections || []).flatMap((section) =>
        (section.entries || []).map((entry) => `${entry.title || ""} ${entry.organization || ""} ${entry.description || ""}`))
    ].join("  "));

    for (const variant of RESUME_VARIANTS) {
      const body = documentBody(build(profile, variant));

      for (const match of body.matchAll(/\\resumeItem\{([\s\S]*?)\}\n/g)) {
        const rendered = strip(match[1]);
        // Generated placeholders for an entry with no description at all are the one exception,
        // and they are only reachable when the candidate wrote nothing to transcribe.
        if (/^(Applied relevant skills|Built a project aligned|Project details can be)/.test(rendered)) continue;
        assert.ok(
          sourceText.includes(rendered),
          `[${fixture.name}/${variant}] a bullet is not the candidate's own text:\n  rendered: ${rendered}`
        );
      }
    }
  }
});

test("all six variants share ONE visual grammar, and differ only by arrangement", () => {
  /* THIS TEST WAS INVERTED, DELIBERATELY.

     It used to demand six DIFFERENT section-header treatments, four different bullet glyphs
     including one variant with none at all, and four different skills arrangements — an earlier
     instruction that offered shaded background bars and rules-above-and-below as ways to tell the
     variants apart. Measured against the six reference resumes this family is modelled on, all of
     that was invention: the references share one header treatment (bold label, thin full-width
     rule beneath), one round bullet, one entry shape and one rhythm, and differ only in which
     sections they carry and in what order. The old assertions were therefore actively enforcing
     the defect. They now enforce the opposite. */
  const preambleOf = (variant) => {
    const template = getResumeTemplate(variant);
    return template.slice(0, template.indexOf("\\begin{document}"));
  };

  // 1. ONE section-header treatment, byte-identical in all six.
  const headerFormats = RESUME_VARIANTS.map((variant) =>
    (preambleOf(variant).match(/\\titleformat\{\\section\}[^\n]*/g) || []).join("\n"));
  assert.equal(new Set(headerFormats).size, 1,
    `variants no longer share a section-header treatment:\n${[...new Set(headerFormats)].join("\n")}`);
  assert.match(headerFormats[0], /\\large\\bfseries/, "the section label must be bold at the family's size");
  assert.match(headerFormats[0], /\[\\resumeSectionRule\]/, "the label must be followed by the shared rule");
  assert.match(preambleOf("a"), /\\newcommand\{\\resumeSectionRule\}\{\\vspace\{\\resumeRuleGap\}\\titlerule\[0\.8pt\]\}/,
    "the section rule must be a thin FULL-WIDTH \\titlerule");

  /* 2. The specific ornament that made the generated resume identifiable at a glance. Each of
        these shipped at least once and none appears in any reference. */
  const banned = [
    [/\\colorbox/, "a shaded bar behind a section header"],
    [/\\rule\{0?\.\d+\\(?:text|line)width\}/, "a partial-width accent rule under a header"],
    [/\\titleline/, "a rule on its own line above the section label"],
    [/\\rule\[[^\]]*\]\{[\d.]+pt\}/, "a vertical accent bar beside the section label"],
    [/\\resumesquare|\\ding\{|\\textasteriskcentered/, "a square, star or asterisk bullet"]
  ];
  for (const variant of RESUME_VARIANTS) {
    for (const [pattern, what] of banned) {
      assert.doesNotMatch(preambleOf(variant), pattern, `[${variant}] reintroduced ${what}`);
    }
  }

  // 3. ONE bullet glyph, defined once and never overridden.
  const bulletDefs = RESUME_VARIANTS.map((variant) =>
    (preambleOf(variant).match(/\\(?:re)?newcommand\{\\resumebullet\}\{[^\n]*/g) || []).join("\n"));
  assert.equal(new Set(bulletDefs).size, 1, "a variant redefined the bullet glyph");
  assert.match(bulletDefs[0], /\\textbullet/, "the bullet must be the round \\textbullet, scaled down");
  assert.doesNotMatch(bulletDefs[0], /\\renewcommand/, "the bullet is defined once, in the shared preamble");

  /* 4. Every list is either bulleted with THAT glyph or is an entry list carrying no marker.
        A variant with no marker at all rendered its bullets as bare indented text that read as
        wrapped prose; there is no third option. */
  for (const variant of RESUME_VARIANTS) {
    const labels = [...getResumeTemplate(variant).matchAll(/label=([^,\]]+)/g)].map((m) => m[1].trim());
    assert.ok(labels.length, `[${variant}] declares no list labels at all`);
    for (const label of labels) {
      assert.ok(label === "{}" || label === "\\resumebullet",
        `[${variant}] uses an unapproved list marker: ${label}`);
    }
  }

  /* 5. IDENTICAL RHYTHM. Density used to be a per-variant axis — A normal, B and E airy, C and F
        tight. It is not one any more: the references are recognisably one family precisely
        because their spacing matches. A document may still be scaled as a whole to fit its page
        count (\resumeScaleRhythm), which moves every gap by the same factor. */
  const rhythm = (variant, length) => {
    const matches = [...preambleOf(variant).matchAll(
      new RegExp("\\\\setlength\\{\\\\" + length + "\\}\\{(\\d+(?:\\.\\d+)?)pt\\}", "g")
    )];
    assert.ok(matches.length, `[${variant}] never sets ${length}; the rhythm is no longer declared`);
    return matches[matches.length - 1][1];
  };
  for (const length of ["resumeSectionSep", "resumeHeadSep", "resumeEntrySep", "resumeEntryLead", "resumeBulletSep"]) {
    const values = RESUME_VARIANTS.map((variant) => rhythm(variant, length));
    assert.equal(new Set(values).size, 1,
      `${length} differs by variant (${values.join("/")}); density is not an arrangement axis`);
  }

  // 6. ONE skills arrangement: bulleted, bold label, colon, values on the same line.
  const skillEntries = RESUME_VARIANTS.map((variant) =>
    (preambleOf(variant).match(/\\(?:re)?newcommand\{\\resumeSkillEntry\}\[2\]\{[^\n]*/g) || []).join("\n"));
  assert.equal(new Set(skillEntries).size, 1, "a variant redefined the skills arrangement");
  assert.match(skillEntries[0], /\\item \\small\{\\textbf\{#1:\} #2\}/,
    "skills must be one bulleted line per category, label and values together");

  // 7. ONE entry shape, on one line, in every variant.
  for (const variant of RESUME_VARIANTS) {
    assert.doesNotMatch(preambleOf(variant), /\\resumeEntryStacked/,
      `[${variant}] still defines the two-line company-over-role entry`);
  }

  /* 8. No ad-hoc vertical space anywhere outside the rhythm. A single stray negative \vspace is
        how two education entries ended up printed on top of each other, so this is a hard rule
        and not a style preference. */
  for (const variant of RESUME_VARIANTS) {
    const offenders = preambleOf(variant)
      .split("\n")
      .filter((line) => !line.trim().startsWith("%"))
      .filter((line) => /\\vspace\{-|\\vskip\s*-/.test(line));
    assert.deepEqual(offenders, [], `[${variant}] reintroduced negative vertical space:\n  ${offenders.join("\n  ")}`);
  }

  // 9. Base font size is never shrunk to buy density.
  for (const variant of RESUME_VARIANTS) {
    assert.match(getResumeTemplate(variant), /\\documentclass\[letterpaper,11pt\]/, `[${variant}] changed the base size`);
  }

  /* 10. The arrangement switches that replaced the ornament are actually USED. Without this the
         six could satisfy every assertion above by being identical, which is the opposite failure
         and just as wrong. */
  // The optional \[n\] matters: \resumeCourseItem takes an argument, and a pattern that assumed
  // none matched nothing at all and reported every variant as identical.
  const switchValue = (variant, command) => {
    const matches = [...preambleOf(variant).matchAll(
      new RegExp("\\\\(?:re)?newcommand\\{\\\\" + command + "\\}(?:\\[\\d\\])?\\{([^\\n]*)\\}", "g")
    )];
    return matches.length ? matches[matches.length - 1][1] : "(default)";
  };
  assert.ok(new Set(RESUME_VARIANTS.map((v) => switchValue(v, "resumeNameAlign"))).size >= 2,
    "every variant centres its masthead; the alignment switch is unused");
  assert.ok(new Set(RESUME_VARIANTS.map((v) => switchValue(v, "resumeHeaderRule"))).size >= 2,
    "no variant closes its masthead with a rule; the rule switch is unused");
  assert.ok(new Set(RESUME_VARIANTS.map((v) => switchValue(v, "resumeCourseItem"))).size >= 2,
    "every variant runs coursework the same way; the coursework switch is unused");
});

test("no two variants render the same document, even for a profile with no optional data", () => {
  /* D used to be byte-identical to C for any profile whose projects recorded no tech stack — its
     only differentiator was contingent on data most profiles do not have. Every pair must now
     differ for the SPARSEST profile in the fixture set, which exercises none of the optional
     fields at all. */
  for (const fixtureName of ["sparse-minimal", "single-name-no-links", "five-short-roles"]) {
    const profile = fixtures.find((f) => f.name === fixtureName).profile;
    const rendered = new Map(RESUME_VARIANTS.map((variant) => [variant, build(profile, variant)]));

    for (const left of RESUME_VARIANTS) {
      for (const right of RESUME_VARIANTS) {
        if (left >= right) continue;
        assert.notEqual(
          rendered.get(left),
          rendered.get(right),
          `[${fixtureName}] variants ${left} and ${right} render identically`
        );
      }
    }
  }

  // And specifically the case that motivated this: projects present, tech stack absent.
  const noTechStack = {
    firstName: "Test", lastName: "Candidate", email: "t@example.com",
    skills: ["Java", "SQL"], skillGroups: [], education: [], experience: [],
    achievements: [], licensesAndCertifications: [],
    projects: [{ title: "A Project", description: "Did a thing." }]
  };
  assert.notEqual(
    build(noTechStack, "c"),
    build(noTechStack, "d"),
    "D is still identical to C when a project has no tech stack"
  );
});

test("the headline is built from the candidate's own claimed role, never the target job's", () => {
  const headlineOf = (latex) => (documentBody(latex).match(/\\resumeHeadline\{([^}]*)\}/) || [])[1] || "";

  // A profile with preferred roles: those lead, then one skill per category.
  const withRoles = build(fixtures.find((f) => f.name === "headline-and-location").profile, "e");
  assert.match(headlineOf(withRoles), /Backend Engineer/, "the candidate's own preferred role is missing");
  assert.doesNotMatch(headlineOf(withRoles), /Software Engineer/, "the TARGET JOB's title leaked into the headline");

  // Separated by math-mode pipes: a literal | renders as an em dash in this font encoding.
  assert.match(headlineOf(withRoles), /\$\|\$/, "the headline separator must be $|$, not a literal pipe");

  /* A PROFILE WITH NO STATED TARGET GETS NO HEADLINE, even when it has a rich work history.
     This used to fall back to the job title of the most recent role, which produced "Summer Intern
     | Spring Boot | Core Java | SQL | Machine Learning" under a masters candidate's name: a line
     that leads with the least senior thing about them and positions them for the job they already
     have. Every reference headline is a TARGET — "Salesforce Developer | Salesforce Administrator
     | Apex | LWC", "AI/ML Engineer | Generative AI | LLMs | RAG | MLOps" — and the only stored
     source for that is the candidate's own tagline or preferredRoles. */
  const noStatedTarget = build({
    firstName: "Test", lastName: "Candidate", email: "t@example.com",
    skills: ["Java", "Spring Boot", "PostgreSQL", "Docker"], skillGroups: [],
    education: [], projects: [], achievements: [], licensesAndCertifications: [],
    experience: [
      { companyName: "Newer", jobTitle: "Summer Intern", startDate: "2024-01-01", isCurrent: true, description: "Ran things." },
      { companyName: "Older", jobTitle: "Intern", startDate: "2021-01-01", endDate: "2021-06-01", description: "Learned things." }
    ]
  }, "e");
  assert.equal(headlineOf(noStatedTarget), "",
    "a job title was used as a target positioning; omit the line rather than emit a weak one");

  /* Nor do skills alone make a headline. "Java | Spring Boot | PostgreSQL | Docker" under a name
     is the first row of the Skills section moved to the top and says less than nothing. */
  const skillsOnly = build({
    firstName: "Test", lastName: "Candidate", email: "t@example.com",
    skills: ["Java", "Spring Boot", "PostgreSQL", "Docker", "Kubernetes"], skillGroups: [],
    education: [], experience: [], projects: [], achievements: [], licensesAndCertifications: []
  }, "e");
  assert.equal(headlineOf(skillsOnly), "", "a bare skills list was emitted as a positioning line");

  // And the header closes up rather than printing an empty bold line.
  assert.doesNotMatch(documentBody(skillsOnly), /\\resumeHeadline/, "an empty headline command was emitted");
});
