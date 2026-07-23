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

async function runPdfLatex(tempDir, texPath, compilerPath) {
  try {
    await execFileAsync(
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
    await runPdfLatex(tempDir, texPath, compilerPath);

    return {
      pdfBuffer: await fs.readFile(pdfPath),
      fileName: texFileName.replace(/\.tex$/i, ".pdf")
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

module.exports = {
  compileLatexToPdf,
  isLatexCompilerAvailable
};
