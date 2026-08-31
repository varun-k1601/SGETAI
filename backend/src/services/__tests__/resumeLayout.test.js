/* ===============================================================================================
   THE LAYOUT ACCEPTANCE GATE.
   ===============================================================================================
   "Looks good" is not testable; an overfull box is. Every layout defect that reached a real
   candidate — two education entries printed on top of each other, a date running through the
   degree beside it, "C++" stranded alone at the foot of a column — announced itself in the
   pdflatex log as an Overfull \hbox, and every one of them compiled without an error. Reading the
   log is what turns "compiles" into "is correctly laid out".

   WHY THIS IS A SEPARATE FILE. resumeGeneration.test.js owns content: what goes on the page and
   in what order. This owns geometry: whether the page holds it without collisions. They fail for
   different reasons and are read by different people.

   WHAT IS CHECKED, PER VARIANT PER FIXTURE:
     1. no LaTeX errors        — including the recoverable ones, see the note on -file-line-error
     2. no Overfull  \hbox/\vbox
     3. no Underfull \hbox/\vbox worse than UNDERFULL_BADNESS_LIMIT
     4. every section header lands on the same page as its first content line
     5. no page is left under a third full
     6. pdftotext recovers every section heading, in order

   Skipped wholesale when pdflatex is unavailable, so the suite still runs in a bare CI container.
   =============================================================================================== */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const {
  buildLatexResumeFromTemplate,
  buildProfileForTailoring,
  getResumeTemplate,
  withResumeDensityScale,
  RESUME_VARIANTS
} = require("../resumeGenerationService");
const { RESUME_DENSITY_SCALES } = require("../latexCompilerService");
const { fixtures, TARGET_JOB } = require("./resumeGeneration.fixtures");

const TOOLS = path.join(__dirname, "..", "..", "..", "..", "tools", "TinyTeX", "TinyTeX", "bin", "windows");
const PDFLATEX = process.env.PDFLATEX_PATH || path.join(TOOLS, "pdflatex.exe");

/* An Underfull \hbox is reported with a badness score; 10000 is TeX's "infinitely bad", which is
   what a line stretched to breaking point scores. Anything at or above this is a visible river of
   whitespace and fails. Below it, TeX is merely noting that a ragged line is ragged. */
const UNDERFULL_BADNESS_LIMIT = 10000;

/* A page holding less than this fraction of its text height is the "six lines and then nothing"
   shape: either the content should have been pulled back onto the previous page, or the layout is
   wasting a whole sheet. EVERY page of a multi-page document is held to it, the last one included
   — a second sheet carrying four lines is precisely the defect, and exempting the final page would
   exempt the only page that ever shows it. A ONE-page document is exempt, because a resume is
   allowed to be short. */
const MIN_PAGE_FILL = 1 / 3;

function pdftotextPath() {
  const candidates = [
    process.env.PDFTOTEXT_PATH,
    "pdftotext",
    "C:/Program Files/Git/mingw64/bin/pdftotext.exe"
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const out = execFileSync(candidate, ["-v"], { timeout: 15000, windowsHide: true, stdio: "pipe" });
      if (/pdftotext version/i.test(String(out))) {
        return candidate;
      }
    } catch (error) {
      // `pdftotext -v` prints its banner and exits 99, so a throw here is expected and says
      // nothing about whether the binary exists. The banner does.
      const combined = String(error.stdout || "") + String(error.stderr || "");
      if (/pdftotext version/i.test(combined)) {
        return candidate;
      }
    }
  }

  return null;
}

function compilerAvailable() {
  try {
    execFileSync(PDFLATEX, ["--version"], { timeout: 15000, windowsHide: true, stdio: "pipe" });
    return true;
  } catch (error) {
    return false;
  }
}

function build(profile, variant) {
  return buildLatexResumeFromTemplate(
    buildProfileForTailoring(profile),
    TARGET_JOB,
    null,
    { omitEmptySections: true, objective: "Objective text for the fixture.", variant }
  );
}

/* pdflatex hard-wraps its log at 79 columns, so "Overfull \hbox (12.47865pt too wide) in
   alignment at lines 234--234" can arrive split across two lines. Unwrapping first is what stops
   this gate passing vacuously on exactly the warnings it exists to catch. */
function parseBoxWarnings(log) {
  const unwrapped = log.replace(/\r/g, "").replace(/\n(?=[^\n])/g, (match, offset, whole) => {
    const nextLineStart = whole.slice(offset + 1, offset + 12);
    return /^(Overfull|Underfull|LaTeX|Package|Output|\[|\)|\()/.test(nextLineStart) ? "\n" : " ";
  });

  const warnings = [];
  const pattern = /(Overfull|Underfull) \\([hv])box \(([^)]*)\)([^\n]*)/g;
  let match;
  while ((match = pattern.exec(unwrapped)) !== null) {
    const badness = /badness (\d+)/.exec(match[3]);
    warnings.push({
      kind: match[1],
      box: match[2],
      detail: match[3].trim(),
      badness: badness ? Number(badness[1]) : null,
      where: match[4].trim()
    });
  }
  return warnings;
}

/* -file-line-error prefixes errors with "file.tex:315:", so they no longer start with "! " —
   which is what a naive `/^! /m` check looks for, and why a run of "Lonely \item" errors sat in
   the log unnoticed while the suite reported success. Match both spellings. */
function parseErrors(log) {
  return [...log.replace(/\r/g, "").matchAll(/^(?:[^\n:]*:\d+: )?(?:! )?(LaTeX Error|Emergency stop|Undefined control sequence|Runaway argument)[^\n]*/gm)]
    .map((match) => match[0].trim());
}

function compile(latex, name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "resume-layout-"));
  const texPath = path.join(dir, `${name}.tex`);
  fs.writeFileSync(texPath, latex, "utf8");

  // Two passes, as the production compiler does: the first settles the page breaks the second
  // reports on.
  for (let pass = 0; pass < 2; pass += 1) {
    try {
      execFileSync(PDFLATEX, ["-interaction=nonstopmode", "-file-line-error", "-output-directory", dir, texPath],
        { cwd: dir, timeout: 120000, windowsHide: true, stdio: "pipe" });
    } catch (error) {
      // nonstopmode keeps going and writes the log; failures are read from the log below rather
      // than from the exit code, which is also non-zero for warnings on some builds.
    }
  }

  const logPath = path.join(dir, `${name}.log`);
  const log = fs.existsSync(logPath) ? fs.readFileSync(logPath, "latin1") : "";
  const pdfPath = path.join(dir, `${name}.pdf`);
  const pdf = fs.existsSync(pdfPath) ? fs.readFileSync(pdfPath) : null;

  return {
    dir,
    pdfPath,
    pdf,
    log,
    pages: Number((log.match(/Output written on [^(]*\((\d+) pages?/) || [])[1] || 0),
    warnings: parseBoxWarnings(log),
    errors: parseErrors(log)
  };
}

function describe(warnings) {
  return warnings.map((w) => `      ${w.kind} \\${w.box}box (${w.detail}) ${w.where}`).join("\n");
}

test("no variant overfills or underfills a box, for any fixture profile", { concurrency: 1 }, async (t) => {
  if (!compilerAvailable()) {
    t.skip("pdflatex unavailable in this environment");
    return;
  }

  const failures = [];

  for (const fixture of fixtures) {
    for (const variant of RESUME_VARIANTS) {
      const name = `${fixture.name}__${variant}`;
      const result = compile(build(fixture.profile, variant), name);

      try {
        if (result.errors.length) {
          failures.push(`[${name}] LaTeX errors:\n      ${result.errors.slice(0, 4).join("\n      ")}`);
          continue;
        }

        if (!result.pdf) {
          failures.push(`[${name}] produced no PDF`);
          continue;
        }

        const overfull = result.warnings.filter((w) => w.kind === "Overfull");
        if (overfull.length) {
          failures.push(`[${name}] ${overfull.length} overfull box(es):\n${describe(overfull.slice(0, 4))}`);
        }

        const underfull = result.warnings.filter(
          (w) => w.kind === "Underfull" && (w.badness === null || w.badness >= UNDERFULL_BADNESS_LIMIT)
        );
        if (underfull.length) {
          failures.push(`[${name}] ${underfull.length} underfull box(es) at or above badness ${UNDERFULL_BADNESS_LIMIT}:\n${describe(underfull.slice(0, 4))}`);
        }
      } finally {
        fs.rmSync(result.dir, { recursive: true, force: true });
      }
    }
  }

  assert.deepEqual(failures, [], `layout gate failed:\n  ${failures.join("\n  ")}`);
});

test("every section header stays on the page as its first content line", { concurrency: 1 }, async (t) => {
  if (!compilerAvailable()) {
    t.skip("pdflatex unavailable in this environment");
    return;
  }

  const pdftotext = pdftotextPath();
  if (!pdftotext) {
    t.skip("pdftotext unavailable in this environment");
    return;
  }

  const failures = [];
  // Only the fixtures that actually run to more than one page can strand a header.
  const multiPage = fixtures.filter((f) => f.name === "multi-education-and-coursework");

  for (const fixture of multiPage) {
    for (const variant of RESUME_VARIANTS) {
      const name = `${fixture.name}__${variant}`;
      const result = compile(build(fixture.profile, variant), name);

      try {
        if (!result.pdf) {
          failures.push(`[${name}] produced no PDF`);
          continue;
        }

        const txtPath = result.pdfPath.replace(/\.pdf$/, ".txt");
        execFileSync(pdftotext, [result.pdfPath, txtPath], { timeout: 60000, windowsHide: true, stdio: "pipe" });
        // Form feed is pdftotext's page separator.
        const pages = fs.readFileSync(txtPath, "utf8").split("\f");

        const HEADINGS = [
          "Summary", "Skills", "Experience", "Education",
          "Certifications and Achievements", "Projects", "Relevant Coursework", "Extracurricular"
        ];

        pages.forEach((page, index) => {
          const lines = page.split("\n").map((line) => line.trim()).filter(Boolean);
          const last = lines[lines.length - 1];
          if (last && HEADINGS.includes(last) && index < pages.length - 1) {
            failures.push(`[${name}] "${last}" is the last line of page ${index + 1}; its content is on the next page`);
          }
        });
      } finally {
        fs.rmSync(result.dir, { recursive: true, force: true });
      }
    }
  }

  assert.deepEqual(failures, [], `orphaned section headers:\n  ${failures.join("\n  ")}`);
});

test("text extraction recovers every section heading, in reading order", { concurrency: 1 }, async (t) => {
  if (!compilerAvailable()) {
    t.skip("pdflatex unavailable in this environment");
    return;
  }

  const pdftotext = pdftotextPath();
  if (!pdftotext) {
    t.skip("pdftotext unavailable in this environment");
    return;
  }

  const failures = [];
  const fixture = fixtures.find((f) => f.name === "multi-education-and-coursework");

  for (const variant of RESUME_VARIANTS) {
    const name = `${fixture.name}__${variant}`;
    const result = compile(build(fixture.profile, variant), name);

    try {
      const txtPath = result.pdfPath.replace(/\.pdf$/, ".txt");
      execFileSync(pdftotext, [result.pdfPath, txtPath], { timeout: 60000, windowsHide: true, stdio: "pipe" });
      const text = fs.readFileSync(txtPath, "utf8");

      /* Every heading must be present and in order. An ATS reads this stream, not the page: a
         heading that extracts as glyph indices, or out of order because it was set in a floating
         box, is invisible to the parser however good it looks printed.

         The order is READ FROM THE VARIANT'S OWN TEMPLATE, not hard-coded. Section order is one of
         the axes the six variants differ on — A puts Experience above Skills and the others do
         not — so a single fixed list would fail A for being exactly what it is designed to be. */
      const expected = [...getResumeTemplate(variant).matchAll(/\\section\{([^}]+)\}/g)]
        .map((match) => match[1])
        .filter((heading) => text.includes(heading));
      let cursor = 0;
      for (const heading of expected) {
        const at = text.indexOf(heading, cursor);
        if (at === -1) {
          failures.push(`[${name}] heading "${heading}" missing from extracted text (or out of order)`);
          break;
        }
        cursor = at + heading.length;
      }

      // Dates and bullet text must survive too, not just headings.
      for (const anchor of ["Morgan Stanley", "May 2025", "CGPA: 3.81/4", "Distributed Systems", "Smart India Hackathon"]) {
        if (!text.includes(anchor)) {
          failures.push(`[${name}] "${anchor}" did not survive text extraction`);
        }
      }
    } finally {
      fs.rmSync(result.dir, { recursive: true, force: true });
    }
  }

  assert.deepEqual(failures, [], `text extraction defects:\n  ${failures.join("\n  ")}`);
});

test("no page is left under a third full", { concurrency: 1 }, async (t) => {
  if (!compilerAvailable()) {
    t.skip("pdflatex unavailable in this environment");
    return;
  }

  const gs = path.join(TOOLS, "rungs.exe");
  try {
    execFileSync(gs, ["--version"], { timeout: 15000, windowsHide: true, stdio: "pipe" });
  } catch (error) {
    t.skip("ghostscript unavailable in this environment");
    return;
  }

  const failures = [];

  for (const fixture of fixtures) {
    for (const variant of RESUME_VARIANTS) {
      const name = `${fixture.name}__${variant}`;

      /* Walk the SAME ladder compileFittedResumePdf walks, so this measures the document a user
         actually receives rather than an unfitted intermediate. Testing the raw build would fail
         on documents the shipping code already fixes, and would pass on ones it does not. */
      const baseLatex = build(fixture.profile, variant);
      let scale = RESUME_DENSITY_SCALES.normal;
      let result = compile(withResumeDensityScale(baseLatex, scale), name);

      if (result.pages > 1) {
        const basePages = result.pages;
        let settled = false;

        for (const candidate of RESUME_DENSITY_SCALES.tighter) {
          const tighter = compile(withResumeDensityScale(baseLatex, candidate), name);
          if (tighter.pages && tighter.pages < basePages) {
            fs.rmSync(result.dir, { recursive: true, force: true });
            result = tighter;
            scale = candidate;
            settled = true;
            break;
          }
          fs.rmSync(tighter.dir, { recursive: true, force: true });
        }

        if (!settled) {
          for (const candidate of RESUME_DENSITY_SCALES.airier) {
            const airier = compile(withResumeDensityScale(baseLatex, candidate), name);
            if (airier.pages === basePages) {
              fs.rmSync(result.dir, { recursive: true, force: true });
              result = airier;
              scale = candidate;
              break;
            }
            fs.rmSync(airier.dir, { recursive: true, force: true });
          }
        }
      }

      try {
        if (!result.pdf || result.pages < 2) {
          // A single page is allowed to end wherever the content ends; the rule is about a SECOND
          // sheet carrying almost nothing.
          continue;
        }

        /* Ink extent per page, straight from Ghostscript's bbox device. Measuring the ink rather
           than counting lines is what catches the real defect: a page holding six lines and then
           three-quarters of a blank sheet. Each page is compared against the FULLEST page in the
           same document, which sidesteps having to hard-code this template's text height. */
        // The bbox device writes to STDERR, not stdout, so both streams are captured and joined.
        const proc = require("node:child_process").spawnSync(
          gs, ["-dNOPAUSE", "-dBATCH", "-sDEVICE=bbox", result.pdfPath],
          { timeout: 60000, windowsHide: true, encoding: "utf8" }
        );
        const combined = String(proc.stdout || "") + String(proc.stderr || "");
        const heights = [...combined.matchAll(/%%HiResBoundingBox: \S+ (\S+) \S+ (\S+)/g)]
          .map((match) => Number(match[2]) - Number(match[1]));

        if (heights.length < 2) {
          continue;
        }

        const tallest = Math.max(...heights);
        heights.forEach((height, index) => {
          const fill = height / tallest;
          if (fill < MIN_PAGE_FILL) {
            failures.push(`[${name}] page ${index + 1} of ${heights.length} is only ${(fill * 100).toFixed(0)}% full (density ${scale})`);
          }
        });
      } catch (error) {
        failures.push(`[${name}] page-fill measurement failed: ${error.message}`);
      } finally {
        fs.rmSync(result.dir, { recursive: true, force: true });
      }
    }
  }

  assert.deepEqual(failures, [], `underfilled pages:\n  ${failures.join("\n  ")}`);
});

module.exports = { parseBoxWarnings, parseErrors, UNDERFULL_BADNESS_LIMIT, MIN_PAGE_FILL };
