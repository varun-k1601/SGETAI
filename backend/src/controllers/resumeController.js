const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");
const { requireNonEmptyString, optionalString } = require("../utils/validation");
const { buildJobText } = require("../utils/textBuilders");
const { evaluateCandidateMatch, evaluateResumeFileMatch, hasUsableApiKey } = require("../services/geminiService");
const { getAtsHeuristic } = require("../services/atsCheckerService");
const { tagFromScore } = require("../services/matchService");
const {
  extractResumeText,
  cleanText,
  getResumeTextQuality,
  isReadableResumeText
} = require("../utils/resumeTextExtractor");
const Job = require("../models/Job");

function uniqueStrings(values = []) {
  return [...new Set(
    values
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  )];
}

function buildAtsImprovementSuggestions({ result, job }) {
  const reasoning = result.reasoning || {};
  const missingSkills = uniqueStrings(reasoning.missingSkills || []);
  const missingKeywords = uniqueStrings(reasoning.missingKeywords || []);
  const matchedSkills = uniqueStrings(reasoning.matchedSkills || []);
  const suggestions = [];

  if (missingSkills.length) {
    suggestions.push(
      `Add truthful evidence for the most important missing skills: ${missingSkills.slice(0, 5).join(", ")}. Put them in Skills only if you can explain them, and also prove them in projects or experience.`
    );
  }

  if (missingKeywords.length) {
    suggestions.push(
      `Rewrite one project or experience bullet using relevant JD wording such as: ${missingKeywords.slice(0, 5).join(", ")}. Do this only where it honestly matches your work.`
    );
  }

  if (reasoning.requiredExperienceYears && !reasoning.meetsExperienceRequirement) {
    suggestions.push(
      `The JD asks for about ${reasoning.requiredExperienceYears} years of experience. Since your resume appears lower than that, strengthen project/internship bullets with measurable outcomes, responsibilities, and tools used.`
    );
  }

  if (reasoning.requiredEducationYears && !reasoning.meetsEducationRequirement) {
    suggestions.push(
      `The JD asks for ${reasoning.requiredEducationYears} years of education. Add complete education date ranges so the system can calculate schooling plus higher education correctly.`
    );
  }

  if (matchedSkills.length) {
    suggestions.push(
      `Keep the matched skills visible near the top of the resume: ${matchedSkills.slice(0, 6).join(", ")}. Recruiters and ATS systems should not need to search for them.`
    );
  }

  suggestions.push("Add 2-4 impact bullets under each relevant project: what you built, tools used, problem solved, and measurable result.");

  return uniqueStrings(suggestions).slice(0, 6);
}

const checkResumeAts = asyncHandler(async (req, res) => {
  if (req.user.role !== "seeker") {
    throw new ApiError(403, "Only applicants can check resume ATS score.");
  }

  const pastedResumeText = optionalString(req.body.resumeText);
  const extractedText = req.file ? extractResumeText(req.file) : "";
  const resumeText = cleanText([pastedResumeText, extractedText].filter(Boolean).join("\n\n"));
  const hasReadableText = isReadableResumeText(resumeText);
  const readableResumeText = hasReadableText
    ? resumeText
    : cleanText(pastedResumeText);
  const canUseFileAi = Boolean(req.file && hasUsableApiKey());

  if ((!readableResumeText || readableResumeText.length < 80) && !canUseFileAi) {
    throw new ApiError(
      400,
      "Could not extract readable resume text from this file. Upload DOCX/TXT, paste resume text, or configure Gemini so PDFs can be evaluated directly."
    );
  }

  let jobText = optionalString(req.body.jobDescription);
  let job = null;

  if (req.body.jobId) {
    job = await Job.findById(req.body.jobId);
    if (!job) {
      throw new ApiError(404, "Selected job was not found.");
    }
    jobText = buildJobText(job);
  }

  jobText = requireNonEmptyString(jobText, "jobDescription or jobId");

  const heuristic = readableResumeText && readableResumeText.length >= 80
    ? getAtsHeuristic(readableResumeText, jobText, job)
    : {
        score: 0,
        tag: "Low fit",
        reasoning: {
          matchedSkills: [],
          missingSkills: [],
          matchedKeywords: [],
          missingKeywords: [],
          extractionQuality: getResumeTextQuality(resumeText)
        },
        suggestions: []
      };
  const [textAiMatch, fileAiMatch] = await Promise.all([
    readableResumeText && readableResumeText.length >= 80
      ? evaluateCandidateMatch(readableResumeText, jobText, null)
      : Promise.resolve(null),
    req.file ? evaluateResumeFileMatch(req.file, jobText, null) : Promise.resolve(null)
  ]);

  if (!hasReadableText && req.file && !fileAiMatch?.score) {
    throw new ApiError(
      400,
      "This PDF could not be read reliably, and AI document review did not return a usable score. Please upload DOCX/TXT or paste the resume text."
    );
  }
  let score = heuristic.score;
  let aiReasoning = textAiMatch?.reasoning || null;

  if (textAiMatch?.score) {
    // Trust the heuristic more when it found solid explicit-skill evidence to back it up, and
    // defer more to the AI score when it didn't — that's exactly the scenario where a stale
    // skills whitelist or a missed JD skills list would otherwise silently undercount matches.
    const matchedSkillsCount = (heuristic.reasoning?.matchedSkills || []).length;
    const heuristicWeight = matchedSkillsCount >= 5 ? 0.75 : matchedSkillsCount >= 2 ? 0.6 : 0.5;
    score = Math.round(score * heuristicWeight + textAiMatch.score * (1 - heuristicWeight));
  }

  if (fileAiMatch?.score && fileAiMatch.score > score) {
    score = heuristic.score < 25
      ? fileAiMatch.score
      : Math.round(score * 0.45 + fileAiMatch.score * 0.55);
    aiReasoning = fileAiMatch.reasoning || aiReasoning;
  }

  score = Math.max(0, Math.min(100, Math.round(score || 0)));

  const result = {
    ...heuristic,
    score,
    tag: tagFromScore(score),
    reasoning: {
      ...(heuristic.reasoning || {}),
      matchedKeywords: uniqueStrings([
        ...(heuristic.reasoning?.matchedKeywords || []),
        ...(fileAiMatch?.matchedKeywords || [])
      ]),
      missingKeywords: fileAiMatch?.score && fileAiMatch.score > heuristic.score
        ? uniqueStrings(fileAiMatch.missingKeywords || [])
        : heuristic.reasoning?.missingKeywords || [],
      aiReasoning,
      extractionQuality: getResumeTextQuality(resumeText),
      fileAiMatchedKeywords: fileAiMatch?.matchedKeywords || [],
      fileAiMissingKeywords: fileAiMatch?.missingKeywords || [],
      scoringSource: fileAiMatch?.score && fileAiMatch.score > heuristic.score
        ? "resume-file-ai-assisted"
        : "resume-text"
    }
  };
  result.suggestions = buildAtsImprovementSuggestions({
    result,
    job
  });

  return sendSuccess(res, {
    message: "Resume ATS check completed successfully.",
    result,
    resume: {
      extractedCharacters: readableResumeText?.length || resumeText.length,
      extractionQuality: getResumeTextQuality(resumeText),
      fileName: req.file?.originalname || null
    },
    job: job
      ? {
          _id: job._id,
          title: job.title,
          organizationId: job.organizationId
        }
      : null
  });
});

module.exports = {
  checkResumeAts
};
