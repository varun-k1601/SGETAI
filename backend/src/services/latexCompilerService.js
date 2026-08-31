const { execFile } = require("child_process");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { promisify } = require("util");

const ApiError = require("../utils/ApiError");

const execFileAsync = promisify(execFile);

function getPdfLatexCandidates() {
  return [
    process.env.PDFLATEX_PATH,
    path.join(__dirname, "..", "..", "..", "tools", "TinyTeX", "TinyTeX", "bin", "windows", "pdflatex.exe"),
    path.join(__dirname, "..", "..", "..", "tools", "TinyTeX", "bin", "windows", "pdflatex.exe"),
    "pdflatex"
  ].filter(Boolean);
}

async function resolvePdfLatex() {
  for (const candidate of getPdfLatexCandidates()) {
    try {
      await execFileAsync(candidate, ["--version"], {
        timeout: 10000,
        windowsHide: true
      });
      return candidate;
    } catch (error) {
      // Try the next candidate; the project can use either local TinyTeX or system PATH.
    }
  }

  return null;
}

async function isLatexCompilerAvailable() {
  return Boolean(await resolvePdfLatex());
}

function normalizeTexFileName(fileName) {
  const safeName = String(fileName || "sgetai-resume.tex")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);

  return safeName.endsWith(".tex") ? safeName : `${safeName || "sgetai-resume"}.tex`;
}

/* pdflatex prints "Output written on x.pdf (2 pages, 96607 bytes)". The page tree itself is not
   greppable in the PDF bytes because pdflatex writes compressed object streams, so this line is
   the only cheap way to know how long a resume came out. The density fitter below needs it. */
function readPageCount(output) {
  const match = String(output || "").match(/Output written on [^(]*\((\d+) pages?/);
  return match ? Number(match[1]) : 0;
}

async function runPdfLatex(tempDir, texPath, compilerPath) {
  try {
    return await execFileAsync(
      compilerPath,
      [
        "-interaction=nonstopmode",
        "-halt-on-error",
        "-file-line-error",
        "-output-directory",
        tempDir,
        texPath
      ],
      {
        cwd: tempDir,
        timeout: 90000,
        windowsHide: true,
        maxBuffer: 1024 * 1024 * 8
      }
    );
  } catch (error) {
    const output = [error.stdout, error.stderr].filter(Boolean).join("\n").slice(-3000);
    throw new ApiError(
      500,
      "LaTeX failed to compile this resume. Check generated resume content for invalid LaTeX.",
      output
    );
  }
}

async function compileLatexToPdf(latex, fileName) {
  if (!String(latex || "").trim()) {
    throw new ApiError(400, "LaTeX content is required to generate a PDF.");
  }

  const compilerPath = await resolvePdfLatex();

  if (!compilerPath) {
    throw new ApiError(
      503,
      "LaTeX compiler is not installed. Install MiKTeX or TeX Live so pdflatex is available."
    );
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "sgetai-resume-"));
  const texFileName = normalizeTexFileName(fileName);
  const texPath = path.join(tempDir, texFileName);
  const pdfPath = texPath.replace(/\.tex$/i, ".pdf");

  try {
    await fs.writeFile(texPath, latex, "utf8");
    await runPdfLatex(tempDir, texPath, compilerPath);
    const second = await runPdfLatex(tempDir, texPath, compilerPath);

    return {
      pdfBuffer: await fs.readFile(pdfPath),
      fileName: texFileName.replace(/\.tex$/i, ".pdf"),
      pages: readPageCount(second && second.stdout)
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

/* THE DENSITY LADDER.
 *
 * A resume is either one page or it is not, and no single fixed spacing choice can be right for
 * both. A profile that spills four lines past the first page should be pulled back onto it; one
 * that genuinely needs two pages should spread out so the second page carries a real share of the
 * content rather than six lines above a blank half-sheet. Those are opposite adjustments, so the
 * only way to make the right one is to compile and look.
 *
 * PAGE COUNT IS THE ONLY SIGNAL USED, and it comes from pdflatex's own log. Measuring how FULL a
 * page is would need Ghostscript, which is not a dependency this service can assume in
 * production. It turns out not to be needed: "spread out as far as possible without buying
 * another page" maximises the last page's fill by construction.
 *
 *   TIGHTER, to try to recover a single page. 0.8 first because it is barely visible; 0.55 only
 *   if that was not enough, since it is a real squeeze and should not be spent when 0.8 would do.
 *
 *   AIRIER, once the extra page is certain, to balance the last one. Tried LARGEST FIRST and taken
 *   as soon as one holds the page count, which is what "spread as far as possible" means in
 *   practice — the smaller steps are fallbacks for content that the larger ones would push onto a
 *   further page. A profile that runs four lines past page one needs the top of this range to put
 *   a real share of itself on page two; one that runs most of a page past it settles near the
 *   bottom on its own.
 *
 *   THE CEILING IS 3.2 AND IT IS NOT ARBITRARY. Multiplied through the base rhythm that is a
 *   19pt gap above a section header against the reference family's 4-7pt, which is as loose as
 *   this layout can be and still read as one of the six. Going higher would fill the last page
 *   further at the cost of no longer being the same document family, and the family is the point.
 *
 * Between one and seven compiles. Exactly one for a resume that already fits on a page, which is
 * the overwhelmingly common case. `buildLatex(scale)` rebuilds from the profile; this module never
 * learns what a profile is.
 */
const RESUME_DENSITY_SCALES = {
  normal: 1,
  tighter: [0.8, 0.55],
  airier: [3.2, 2.6, 2, 1.5]
};

async function compileFittedResumePdf(buildLatex, fileName) {
  const atNormal = await compileLatexToPdf(buildLatex(RESUME_DENSITY_SCALES.normal), fileName);

  if (!atNormal.pages || atNormal.pages <= 1) {
    return { ...atNormal, densityScale: RESUME_DENSITY_SCALES.normal };
  }

  try {
    // Squeeze, least aggressive first, and stop the moment a page is recovered.
    for (const scale of RESUME_DENSITY_SCALES.tighter) {
      const tighter = await compileLatexToPdf(buildLatex(scale), fileName);
      if (tighter.pages && tighter.pages < atNormal.pages) {
        return { ...tighter, densityScale: scale };
      }
    }

    // The extra page is real. Spread out to fill it, taking the most generous spacing that does
    // not buy a further page — trading one badly filled last page for another helps nobody.
    for (const scale of RESUME_DENSITY_SCALES.airier) {
      const airier = await compileLatexToPdf(buildLatex(scale), fileName);
      if (airier.pages === atNormal.pages) {
        return { ...airier, densityScale: scale };
      }
    }
  } catch (error) {
    // A refit failing is not a reason to fail the request: the normal-density PDF is already in
    // hand and is a correct document, just not the best-balanced one.
    console.warn("[Resume] density refit failed; using the standard spacing:", error.message);
  }

  return { ...atNormal, densityScale: RESUME_DENSITY_SCALES.normal };
}

module.exports = {
  compileLatexToPdf,
  compileFittedResumePdf,
  isLatexCompilerAvailable,
  readPageCount,
  RESUME_DENSITY_SCALES
};
