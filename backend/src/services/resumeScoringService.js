const { evaluateCandidateMatch } = require("./geminiService");
const { computeResumeJobMatch, tagFromScore } = require("./matchService");
const { buildJobText } = require("../utils/textBuilders");
const { cleanText } = require("../utils/resumeTextExtractor");

function latexToPlainText(latex) {
  return cleanText(
    String(latex || "")
      .replace(/\\href\{[^}]*\}\{([^}]*)\}/g, " $1 ")
      .replace(/\\resumeItem\{([^}]*)\}/g, " $1 ")
      .replace(/\\resumeProjectHeading\{([^}]*)\}\{([^}]*)\}/g, " $1 $2 ")
      .replace(/\\section\{([^}]*)\}/g, "\n$1\n")
      .replace(/\\textbf\{([^}]*)\}/g, " $1 ")
      .replace(/\\emph\{([^}]*)\}/g, " $1 ")
      .replace(/\\underline\{([^}]*)\}/g, " $1 ")
      .replace(/\\[a-zA-Z]+(?:\[[^\]]*\])?(?:\{[^}]*\})?/g, " ")
      .replace(/[{}$&_%#~^]/g, " ")
      .replace(/\\\\/g, "\n")
  );
}

async function scoreResumeAgainstJob(resumeText, job) {
  const normalizedResumeText = cleanText(resumeText);
  const jobText = buildJobText(job);
  const heuristic = computeResumeJobMatch(normalizedResumeText, job);
  const aiMatch = await evaluateCandidateMatch(normalizedResumeText, jobText, null);

  if (!aiMatch?.score) {
    return {
      ...heuristic,
      reasoning: {
        ...(heuristic.reasoning || {}),
        scoringSource: "resume"
      }
    };
  }

  const score = Math.round(heuristic.score * 0.75 + aiMatch.score * 0.25);

  return {
    ...heuristic,
    score,
    tag: tagFromScore(score),
    reasoning: {
      ...(heuristic.reasoning || {}),
      aiReasoning: aiMatch.reasoning || null,
      scoringSource: "resume"
    }
  };
}

module.exports = {
  latexToPlainText,
  scoreResumeAgainstJob
};
