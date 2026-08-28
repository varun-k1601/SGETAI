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
  const sparse = build(fixtures.find((f) => f.name === "sparse-minimal").profile);
  assert.doesNotMatch(sparse, /\n{3,}/, "removing a section must not leave a doubled blank line");
  assert.doesNotMatch(sparse, /\\titlerule\s*\n\s*\\section/, "a stray section rule was left behind");
  // Nothing may survive a stripped section: no heading, no scaffolding, no unreplaced placeholder.
  assert.doesNotMatch(sparse, /COURSEWORK|EXTRACURRICULAR|CERTIFICATIONS/, "an unreplaced placeholder leaked");
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

test("each variant carries its own visual identity, not just a section order", () => {
  /* The complaint this guards against: six documents that differ only in the order of their
     blocks, inside an identical visual shell. Every axis below fires for EVERY profile — none is
     contingent on optional data, which is what let D become byte-identical to C whenever a
     project happened to record no tech stack. */
  const preambleOf = (variant) => {
    const template = getResumeTemplate(variant);
    return template.slice(0, template.indexOf("\\begin{document}"));
  };

  // 1. Section header treatment: six different \titleformat outcomes.
  const headerTreatments = RESUME_VARIANTS.map((variant) => {
    const preamble = preambleOf(variant);
    const formats = [...preamble.matchAll(/\\titleformat\{\\section\}[\s\S]*?\n/g)].map((m) => m[0]);
    return formats[formats.length - 1];
  });
  assert.equal(
    new Set(headerTreatments).size,
    RESUME_VARIANTS.length,
    "two variants share a section-header treatment"
  );

  // 2. Bullet glyph: at least four distinct, including one with none at all.
  const bullets = RESUME_VARIANTS.map((variant) => {
    const matches = [...preambleOf(variant).matchAll(/\{\\resumebullet\}\{([^\n]*)\}\n/g)];
    return matches.length ? matches[matches.length - 1][1] : "(default)";
  });
  assert.ok(new Set(bullets).size >= 4, `bullet glyphs are too alike: ${JSON.stringify(bullets)}`);
  assert.ok(bullets.includes(""), "no variant drops the bullet glyph entirely");

  // 3. Name block: every variant defines its own header, and they are not all the same.
  const headers = RESUME_VARIANTS.map((variant) => {
    const matches = [...preambleOf(variant).matchAll(/\{\\resumeHeader\}\[3\]\{([\s\S]*?)\n\}/g)];
    return matches[matches.length - 1][1];
  });
  assert.ok(new Set(headers).size >= 5, `name blocks are too alike: ${new Set(headers).size} distinct`);

  // 4. Density: the airy variants really are looser than the tight ones.
  // `{topsep=` and not a bare `topsep=`: "partopsep=0pt" contains "topsep=0pt" as a substring, so
  // a loose match reads every variant's density as zero and the comparisons below all pass
  // vacuously.
  const topsep = (variant) => Number(preambleOf(variant).match(/\{topsep=(\d+)pt/)[1]);
  assert.ok(topsep("b") > topsep("a"), "B must be airier than A");
  assert.ok(topsep("e") > topsep("a"), "E must be airier than A");
  assert.ok(topsep("c") < topsep("a"), "C must be tighter than A");
  assert.ok(topsep("f") < topsep("a"), "F must be tighter than A");

  // 5. Skills arrangement: at least four distinct treatments.
  const skillLayouts = RESUME_VARIANTS.map((variant) => {
    const matches = [...preambleOf(variant).matchAll(/\{\\resumeSkillEntry\}\[2\]\{([^\n]*)\}\n/g)];
    return matches[matches.length - 1][1];
  });
  assert.ok(new Set(skillLayouts).size >= 4, `skills blocks are too alike: ${new Set(skillLayouts).size} distinct`);

  // 6. Base font size is never shrunk to buy density.
  for (const variant of RESUME_VARIANTS) {
    assert.match(getResumeTemplate(variant), /\\documentclass\[letterpaper,11pt\]/, `[${variant}] changed the base size`);
  }
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

  /* A profile with NO preferred roles and no tagline still gets a headline, from the job title of
     its most recent role — a title the candidate has actually held. This is the case that used to
     render nothing at all, silently collapsing B, E and F toward C. */
  const fromExperience = build({
    firstName: "Test", lastName: "Candidate", email: "t@example.com",
    skills: ["Java", "Spring Boot", "PostgreSQL", "Docker"], skillGroups: [],
    education: [], projects: [], achievements: [], licensesAndCertifications: [],
    experience: [
      { companyName: "Newer", jobTitle: "Platform Engineer", startDate: "2024-01-01", isCurrent: true, description: "Ran things." },
      { companyName: "Older", jobTitle: "Intern", startDate: "2021-01-01", endDate: "2021-06-01", description: "Learned things." }
    ]
  }, "e");
  const derived = headlineOf(fromExperience);
  assert.ok(derived, "a profile with experience but no preferred role rendered no headline");
  assert.match(derived, /Platform Engineer/, "the MOST RECENT job title should lead");
  assert.doesNotMatch(derived, /Intern/, "an older job title must not be used");

  // Separated by math-mode pipes: a literal | renders as an em dash in this font encoding.
  assert.match(derived, /\$\|\$/, "the headline separator must be $|$, not a literal pipe");

  // Genuinely nothing to say: no tagline, no roles, no experience, one skill. The line is omitted
  // and the header closes up rather than printing an empty bold line.
  const nothing = build({
    firstName: "Test", lastName: "Candidate", email: "t@example.com",
    skills: ["Python"], skillGroups: [], education: [], experience: [], projects: [],
    achievements: [], licensesAndCertifications: []
  }, "e");
  assert.equal(headlineOf(nothing), "", "a profile with nothing to say still emitted a headline");
  assert.doesNotMatch(documentBody(nothing), /\\resumeHeadline/, "an empty headline command was emitted");
});
