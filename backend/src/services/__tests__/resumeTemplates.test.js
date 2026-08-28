/* ===============================================================================================
   RULE ZERO GUARD — the template files carry LAYOUT ONLY, never content.
   ===============================================================================================
   The six layouts were derived from real resumes belonging to real people. What was taken from
   them is the LaTeX skeleton: margins, the section rule, the spacing constants, the two-column
   tabular, the bullet glyph, the section order. What must never be taken is a name, a phone
   number, an email, an employer, a university, a certification, a metric, a bullet or a phrase.

   This file fails the build if any of that ever appears. It matters more than a normal test,
   because a borrowed sentence in a template reads perfectly plausibly on the generated resume of
   somebody it does not describe — this codebase has already shipped that bug twice, with project
   bullets attached to the wrong project.

   THE PRIMARY GUARD IS STRUCTURAL, NOT A DENYLIST. Outside comments, the template files may
   contain nothing but LaTeX control sequences, placeholders and an approved vocabulary of section
   labels. A denylist would pass happily on a seventh person's data; an allowlist cannot.

   The six real names are checked as well, per the brief. They are stored as SALTED DIGESTS rather
   than plaintext, because "do not leave any real person's data in a fixture, a comment, or a test
   file" applies to this file too. A digest cannot be read by anyone scanning the repo. It is not a
   cryptographic secret — the salt is right here, so a determined reader with a name dictionary
   could confirm a guess — but it stores no readable name, which is the point.
   =============================================================================================== */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const {
  RESUME_VARIANTS,
  TEMPLATES_DIR,
  getResumeTemplate,
  resolveResumeVariant,
  buildLatexResumeFromTemplate,
  buildProfileForTailoring
} = require("../resumeGenerationService");
const { fixtures, TARGET_JOB } = require("./resumeGeneration.fixtures");

const NAME_HASH_SALT = "sgetai-resume-template-pii-guard-v1";

// Full names and adjacent word-pairs of the six source resumes' owners. Pairs and not single
// words: a lone common given name is not a leak, and blocking one would fail the build on an
// unrelated coincidence.
const FORBIDDEN_NAME_HASHES = new Set([
  "1aa437a50f8ae43373f9a73a6e5e95b1",
  "2cc415ba256fca19fbf2537031ada774",
  "2d50d7f0d31cf7f87523a597efb75c38",
  "513dc2b70664c2a819b0c1d6f78f6848",
  "57511f164a488d69f44f929f03534bf8",
  "64ce286083fcfba4bd720c6ee2d90519",
  "7575fa4677241ad4db7a520e3edb5993",
  "8540f9a891a827ff8c4803292d37455a",
  "8c8a37acfaaeb83cdac3d5f88a4d0670",
  "8ef31d4edd4f7eefa43fc020c410bb34",
  "a59e4376eacee6605498d0ae0be954c4",
  "b8c0b1524c652a8cb705e490ac3c75b6",
  "c75dff7883897a464788cd979527f7c4",
  "d0b0a6ea6415a75f0d0a016ace7cda64"
]);

function hashPhrase(value) {
  return crypto
    .createHash("sha256")
    .update(`${NAME_HASH_SALT}:${String(value).toLowerCase().replace(/\s+/g, " ").trim()}`)
    .digest("hex")
    .slice(0, 32);
}

// Every 2-, 3- and 4-word run of capitalised words in the text — the shape a pasted human name
// takes. Cheap on files this size.
function findForbiddenNames(text) {
  const words = String(text).match(/[A-Z][A-Za-z'À-ɏ-]+/g) || [];
  const hits = [];

  for (let start = 0; start < words.length; start += 1) {
    for (let length = 2; length <= 4 && start + length <= words.length; length += 1) {
      const phrase = words.slice(start, start + length).join(" ");
      if (FORBIDDEN_NAME_HASHES.has(hashPhrase(phrase))) {
        hits.push(phrase);
      }
    }
  }

  return hits;
}

function templateFiles() {
  return fs
    .readdirSync(TEMPLATES_DIR)
    .filter((file) => file.endsWith(".tex"))
    .map((file) => ({ file, source: fs.readFileSync(path.join(TEMPLATES_DIR, file), "utf8") }));
}

function nonCommentLines(source) {
  return source
    .split("\n")
    .filter((line) => !/^\s*%/.test(line))
    .join("\n");
}

/* The complete vocabulary permitted outside comments once LaTeX commands and bracket options are
   removed: placeholder tokens, section labels, package names and length units. Adding a word here
   should require a deliberate decision — that is the whole mechanism. If a template ever gains a
   company, a university, a metric or a sentence, it will not be in this list. */
const ALLOWED_TEMPLATE_WORDS = new Set([
  // Placeholders.
  "NAME", "HEADLINE", "CONTACT", "LINE", "SUMMARY", "SKILLS", "EXPERIENCE", "EDUCATION",
  "CERTIFICATIONS", "PROJECTS", "COURSEWORK", "EXTRACURRICULAR",
  // Rendered section labels and the one fixed content word.
  "Summary", "Skills", "Experience", "Education", "Certifications", "and", "Achievements",
  "Projects", "Relevant", "Coursework", "Extracurricular", "Technologies",
  // LaTeX packages, environments, class options and units.
  "article", "babel", "center", "color", "document", "em", "enumitem", "ex", "fancy", "fancyhdr",
  "fontawesome", "fullpage", "glyphtounicode", "graphicx", "hyperref", "in", "itemize",
  "latexsym", "marvosym", "multicol", "multicols", "pt", "same", "tabular", "tabularx",
  "titlesec", "verbatim",
  // enumitem keys, from the per-variant density settings in _styles.tex.
  "itemsep", "parsep", "partopsep", "topsep"
]);

test("every template file contains layout only — no name, contact detail or prose", () => {
  const files = templateFiles();
  assert.equal(
    files.length,
    9,
    `expected 6 variants plus _preamble, _sections and _styles, got ${files.length}`
  );

  for (const { file, source } of files) {
    // "@" cannot simply be banned: `l@{\extracolsep{\fill}}r` is LaTeX's column-separator syntax
    // and appears in every entry command. So both halves are asserted — no email-shaped string
    // anywhere, and every literal "@" is the column-separator form and nothing else.
    assert.doesNotMatch(
      source,
      /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
      `[${file}] contains an email address`
    );
    const strayAt = [...source.matchAll(/@(?!\{)/g)].map((match) => source.slice(match.index - 12, match.index + 12));
    assert.deepEqual(strayAt, [], `[${file}] has an "@" that is not a tabular column separator`);

    // Phone-shaped: seven or more digits once the separators a phone number uses are removed.
    const digitRuns = source.match(/[+(]?[\d][\d\s().-]{5,}\d/g) || [];
    const phoneLike = digitRuns.filter((run) => run.replace(/\D/g, "").length >= 7);
    assert.deepEqual(phoneLike, [], `[${file}] contains a phone-number-shaped digit run`);

    assert.doesNotMatch(source, /https?:\/\//, `[${file}] contains a URL`);
    assert.deepEqual(findForbiddenNames(source), [], `[${file}] contains one of the six source-resume names`);

    const stray = [
      ...new Set(
        (nonCommentLines(source)
          .replace(/\\[a-zA-Z]+\*?/g, " ")
          .replace(/\[[^\]]*\]/g, " ")
          .match(/[A-Za-z]{2,}/g) || []
        ).filter((word) => !ALLOWED_TEMPLATE_WORDS.has(word))
      )
    ];
    assert.deepEqual(stray, [], `[${file}] has free text outside comments: ${stray.join(", ")}`);
  }
});

test("no source-resume name survives in the fixtures or the test files", () => {
  const dir = __dirname;

  for (const file of fs.readdirSync(dir).filter((name) => name.endsWith(".js"))) {
    const source = fs.readFileSync(path.join(dir, file), "utf8");
    assert.deepEqual(
      findForbiddenNames(source),
      [],
      `[${file}] contains one of the six source-resume names`
    );
  }
});

test("all six templates assemble from the shared preamble and section blocks", () => {
  for (const variant of RESUME_VARIANTS) {
    const template = getResumeTemplate(variant);

    assert.ok(template.includes("\\begin{document}"), `variant ${variant} has no \\begin{document}`);
    assert.ok(template.includes("\\end{document}"), `variant ${variant} has no \\end{document}`);
    // The shared preamble really was inlined, rather than the marker being left for LaTeX.
    assert.ok(template.includes("\\newcommand{\\resumeEntry}"), `variant ${variant} is missing the shared preamble`);
    assert.doesNotMatch(template, /%%(PREAMBLE|SECTION)/, `variant ${variant} has an unsubstituted marker`);
  }
});

test("each variant declares its own section order", () => {
  const orderOf = (variant) =>
    [...getResumeTemplate(variant).matchAll(/\\section\{([^}]*)\}/g)].map((match) => match[1]);

  const CERTS = "Certifications and Achievements";
  // Coursework and Extracurricular are optional tails on every variant; they strip when empty,
  // which is the common case, so a profile without them renders the reference shape exactly.
  const TAIL = ["Relevant Coursework", "Extracurricular"];

  assert.deepEqual(orderOf("a"), ["Summary", "Experience", "Skills", "Education", CERTS, "Projects", ...TAIL]);
  assert.deepEqual(orderOf("b"), ["Summary", "Skills", "Experience", "Education", "Projects", CERTS, ...TAIL]);
  assert.deepEqual(orderOf("c"), ["Summary", "Skills", "Experience", "Education", CERTS, "Projects", ...TAIL]);
  assert.deepEqual(orderOf("d"), ["Summary", "Skills", "Experience", "Education", CERTS, "Projects", ...TAIL]);
  assert.deepEqual(orderOf("e"), ["Summary", "Skills", "Experience", "Education", CERTS, "Projects", ...TAIL]);
  assert.deepEqual(orderOf("f"), ["Summary", "Skills", "Experience", CERTS, "Education", "Projects", ...TAIL]);

  // B, C, D and E share an opening; the axes that separate them must actually differ.
  assert.notDeepEqual(orderOf("b"), orderOf("e"), "B and E would be indistinguishable");
  assert.ok(getResumeTemplate("b").includes("{HEADLINE}"), "B carries a headline");
  assert.ok(!getResumeTemplate("c").includes("{HEADLINE}"), "C carries no headline");
  assert.ok(!getResumeTemplate("d").includes("{HEADLINE}"), "D carries no headline");
  assert.ok(getResumeTemplate("e").includes("{HEADLINE}"), "E carries a headline");
  assert.ok(getResumeTemplate("f").includes("{HEADLINE}"), "F carries a headline");
  assert.ok(!getResumeTemplate("a").includes("{HEADLINE}"), "A carries no headline");
});

test("consecutive generations rotate through all six before any repeat", () => {
  const ids = [
    "6a5c84654a43d4f19f848a2b",
    "6a0ae26fbf471833360a43cf",
    "507f1f77bcf86cd799439011",
    "000000000000000000000000"
  ];

  for (const id of ids) {
    // Seven generations: six distinct layouts, then the cycle restarts.
    const sequence = Array.from({ length: 7 }, (_unused, rotation) =>
      resolveResumeVariant({ variantSeed: id, rotation })
    );

    assert.equal(
      new Set(sequence.slice(0, 6)).size,
      6,
      `[${id}] the first six generations must all differ: ${sequence.join(" ")}`
    );
    assert.equal(sequence[6], sequence[0], `[${id}] the seventh must restart the cycle: ${sequence.join(" ")}`);

    // The point of the change: no generation repeats the one before it.
    for (let index = 1; index < sequence.length; index += 1) {
      assert.notEqual(
        sequence[index],
        sequence[index - 1],
        `[${id}] generation ${index + 1} repeated the previous layout: ${sequence.join(" ")}`
      );
    }

    // Rotation is a step, not a re-roll: the same count always yields the same layout, so a
    // resume can be re-rendered from what was stored.
    for (let rotation = 0; rotation < 20; rotation += 1) {
      assert.equal(
        resolveResumeVariant({ variantSeed: id, rotation }),
        sequence[rotation % 6],
        `[${id}] rotation ${rotation} is not reproducible`
      );
    }

    // A Mongo ObjectId and its string form must agree; the callers pass the raw _id.
    assert.equal(
      resolveResumeVariant({ variantSeed: { toString: () => id }, rotation: 3 }),
      sequence[3],
      "ObjectId and string disagree"
    );
  }
});

test("different candidates do not all start on variant A", () => {
  // Without a per-candidate starting offset every first-ever resume would be variant A, and a
  // whole signup cohort would then move through the six in lockstep.
  //
  // Measured over a POPULATION, not over a handful of ids: six ids landing in six buckets are
  // expected to occupy only about four of them, so "all six appear" is the wrong bar and would
  // flake. What must hold is that first-generation layouts are spread evenly and that no single
  // layout — least of all A — absorbs the cohort.
  const SAMPLE = 6000;
  const firstGeneration = Object.fromEntries(RESUME_VARIANTS.map((variant) => [variant, 0]));

  for (let index = 0; index < SAMPLE; index += 1) {
    const id = crypto.randomBytes(12).toString("hex");
    firstGeneration[resolveResumeVariant({ variantSeed: id, rotation: 0 })] += 1;
  }

  for (const variant of RESUME_VARIANTS) {
    assert.ok(
      firstGeneration[variant] > SAMPLE / 6 * 0.7 && firstGeneration[variant] < SAMPLE / 6 * 1.3,
      `first-generation layouts are clustered: ${JSON.stringify(firstGeneration)}`
    );
  }

  // The named ids are checked for the concrete property instead: they do not all agree, and they
  // are not all variant A.
  const named = ids2().map((id) => resolveResumeVariant({ variantSeed: id, rotation: 0 }));
  assert.ok(new Set(named).size > 1, `every sample candidate got the same first layout: ${JSON.stringify(named)}`);
  assert.ok(!named.every((variant) => variant === "a"), "every sample candidate started on variant A");
});

function ids2() {
  return [
    "6a5c84654a43d4f19f848a2b",
    "6a0ae26fbf471833360a43cf",
    "507f1f77bcf86cd799439011",
    "000000000000000000000000",
    "ffffffffffffffffffffffff",
    "6a8c10e173b9c6a8f8dda638"
  ];
}

test("an explicit override pins the layout and ignores the rotation", () => {
  const id = "6a5c84654a43d4f19f848a2b";

  for (const variant of RESUME_VARIANTS) {
    for (let rotation = 0; rotation < 8; rotation += 1) {
      assert.equal(
        resolveResumeVariant({ variant, variantSeed: id, rotation }),
        variant,
        `override "${variant}" was overtaken by the rotation at step ${rotation}`
      );
    }
  }

  // A junk override falls back to the rotation rather than to a broken template.
  assert.equal(
    resolveResumeVariant({ variant: "z", variantSeed: id, rotation: 2 }),
    resolveResumeVariant({ variantSeed: id, rotation: 2 })
  );
});

test("a missing or malformed rotation count degrades to the candidate's own offset, never to NaN", () => {
  const id = "6a5c84654a43d4f19f848a2b";
  const base = resolveResumeVariant({ variantSeed: id, rotation: 0 });

  // A count read that fails must not produce `(start + NaN) % 6`, which indexes into nothing and
  // would collapse every generation onto the fallback template.
  for (const broken of [undefined, null, NaN, "", "abc", -3, Infinity, -Infinity, {}, []]) {
    const variant = resolveResumeVariant({ variantSeed: id, rotation: broken });
    assert.ok(
      RESUME_VARIANTS.includes(variant),
      `rotation ${JSON.stringify(String(broken))} produced "${variant}", which is not a variant`
    );
    assert.equal(variant, base, `rotation ${JSON.stringify(String(broken))} did not degrade to the candidate's offset`);
  }

  // A fractional count (a bad read, not a real one) truncates rather than producing undefined.
  assert.equal(resolveResumeVariant({ variantSeed: id, rotation: 2.9 }), resolveResumeVariant({ variantSeed: id, rotation: 2 }));

  // Degrading must land on THIS candidate's offset, not on variant A for everyone — the specific
  // collapse the brief warns about when a count read fails mid-incident.
  const degraded = ids2().map((seed) => resolveResumeVariant({ variantSeed: seed, rotation: NaN }));
  assert.ok(new Set(degraded).size > 1, `a failed count put every candidate on one layout: ${JSON.stringify(degraded)}`);
  assert.ok(!degraded.every((variant) => variant === "a"), "a failed count collapsed everyone onto variant A");
});

test("all six variants are exercised across a realistic id population", () => {
  const counts = Object.fromEntries(RESUME_VARIANTS.map((variant) => [variant, 0]));

  for (let index = 0; index < 6000; index += 1) {
    // Shaped like a real ObjectId: 24 lowercase hex characters.
    const id = crypto.randomBytes(12).toString("hex");
    counts[resolveResumeVariant({ variantSeed: id })] += 1;
  }

  for (const variant of RESUME_VARIANTS) {
    assert.ok(counts[variant] > 0, `variant ${variant} was never selected`);
    // Even distribution is the actual goal of "random". 6000/6 = 1000; allow a wide band so this
    // never flakes, while still catching a hash that collapses onto two or three buckets.
    assert.ok(
      counts[variant] > 700 && counts[variant] < 1300,
      `variant ${variant} got ${counts[variant]} of 6000 — distribution is skewed: ${JSON.stringify(counts)}`
    );
  }
});

test("no generated resume can contain a source-resume name or invented US boilerplate", () => {
  for (const fixture of fixtures) {
    for (const variant of RESUME_VARIANTS) {
      const latex = buildLatexResumeFromTemplate(
        buildProfileForTailoring(fixture.profile),
        TARGET_JOB,
        null,
        { omitEmptySections: true, objective: "Objective text for the fixture.", variant }
      );

      assert.deepEqual(
        findForbiddenNames(latex),
        [],
        `[${fixture.name}/${variant}] a source-resume name reached the output`
      );
      // The reference layouts all open "USA (Open to Relocate) | +1 (…)". None of it is hardcoded.
      assert.doesNotMatch(latex, /Open to Relocate/i, `[${fixture.name}/${variant}] hardcoded US location`);
      assert.doesNotMatch(
        latex,
        /\bF-?1\b|\bH-?1B\b|STEM extension|OPT\b|authoriz(?:ed|ation) to work/i,
        `[${fixture.name}/${variant}] emitted a work-authorisation claim the profile never made`
      );
      // A country code may appear ONLY because the profile holds it. One fixture genuinely has a
      // +1 number and one has +91 — neither may be assumed, substituted or normalised.
      const emittedCodes = [...new Set((latex.match(/\+\d{1,3}(?=[\s(-])/g) || []))];
      for (const code of emittedCodes) {
        assert.ok(
          String(fixture.profile.phone || "").includes(code),
          `[${fixture.name}/${variant}] emitted country code ${code}, which this profile does not have`
        );
      }
    }
  }
});
