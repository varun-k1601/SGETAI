const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");
const {
  uploadAndProcessResume,
  deleteResume,
  listUserResumes,
  getResumeStatus,
  analyzeResumeJobMatch
} = require("../services/resumeRagService");
const { generateEmbedding } = require("../services/ollamaService");
const Application = require("../models/Application");
const Job = require("../models/Job");

const uploadResumeForRag = asyncHandler(async (req, res) => {
  if (req.user.role !== "seeker") {
    throw new ApiError(403, "Only job seekers can upload resumes.");
  }

  if (!req.file) {
    throw new ApiError(400, "No file provided. Please upload a resume.");
  }

  const result = await uploadAndProcessResume({
    userId: req.user.id,
    file: req.file,
    isDraft: false
  });

  return sendSuccess(res, {
    message: "Resume uploaded successfully. Processing in background...",
    resumeId: result.resumeId,
    status: result.status
  });
});

const getResumeStatusEndpoint = asyncHandler(async (req, res) => {
  if (req.user.role !== "seeker") {
    throw new ApiError(403, "Only job seekers can access resumes.");
  }

  const { resumeId } = req.params;

  const status = await getResumeStatus(resumeId, req.user.id);

  return sendSuccess(res, {
    message: "Resume status retrieved.",
    resume: status
  });
});

const listResumes = asyncHandler(async (req, res) => {
  if (req.user.role !== "seeker") {
    throw new ApiError(403, "Only job seekers can list resumes.");
  }

  const isDraft = req.query.isDraft === "true" ? true : req.query.isDraft === "false" ? false : null;

  const resumes = await listUserResumes(req.user.id, isDraft);

  return sendSuccess(res, {
    message: "Resumes retrieved successfully.",
    resumes: resumes.map((r) => ({
      resumeId: r.resumeId,
      filename: r.filename,
      status: r.status,
      uploadedAt: r.uploadedAt,
      totalChunks: r.totalChunks,
      textQuality: r.textQuality
    }))
  });
});

const deleteResumeEndpoint = asyncHandler(async (req, res) => {
  if (req.user.role !== "seeker") {
    throw new ApiError(403, "Only job seekers can delete resumes.");
  }

  const { resumeId } = req.params;

  const result = await deleteResume(resumeId, req.user.id);

  return sendSuccess(res, {
    message: "Resume deleted successfully.",
    ...result
  });
});

const quickAnalyzeResume = asyncHandler(async (req, res) => {
  if (req.user.role !== "seeker") {
    throw new ApiError(403, "Only job seekers can analyze resumes.");
  }

  const { resumeId, jobId, jobDescription } = req.body;

  if (!resumeId) {
    throw new ApiError(400, "Resume ID is required.");
  }

  let finalJobDescription = jobDescription || "";

  if (jobId) {
    const job = await Job.findById(jobId);
    if (!job) {
      throw new ApiError(404, "Job not found.");
    }
    finalJobDescription = job.description || `${job.title} at ${job.organizationId?.companyName || "Company"}`;
  }

  if (!finalJobDescription || finalJobDescription.length < 20) {
    throw new ApiError(400, "Job description is required and must be at least 20 characters.");
  }

  const jobEmbedding = await generateEmbedding(finalJobDescription);

  if (!jobEmbedding) {
    throw new ApiError(503, "Could not analyze resume. Ollama service may be unavailable. Please try again.");
  }

  const analysis = await analyzeResumeJobMatch({
    jobId,
    resumeId,
    jobDescription: finalJobDescription,
    jobEmbedding
  });

  return sendSuccess(res, {
    message: "Resume analysis completed successfully.",
    analysis: {
      matchScore: analysis.matchScore,
      matchTag: analysis.matchTag,
      skillsMatch: analysis.skillsMatch,
      strengths: analysis.strengths,
      weaknesses: analysis.weaknesses,
      recruiterSummary: analysis.recruiterSummary,
      retrievedChunks: analysis.retrievedChunks.map((chunk) => ({
        chunkId: chunk.chunkId,
        sectionType: chunk.sectionType,
        relevanceScore: chunk.relevanceScore,
        text: chunk.text
      }))
    }
  });
});

const analyzeApplicationWithRag = asyncHandler(async (req, res) => {
  if (req.user.role !== "seeker") {
    throw new ApiError(403, "Only job seekers can analyze applications.");
  }

  const { applicationId } = req.params;
  const { resumeId } = req.body;

  const application = await Application.findById(applicationId).populate("jobId");

  if (!application) {
    throw new ApiError(404, "Application not found.");
  }

  if (String(application.jobSeekerId) !== String(req.user.id)) {
    throw new ApiError(403, "You are not authorized to view this application.");
  }

  if (!application.jobId) {
    throw new ApiError(400, "Job information is missing for this application.");
  }

  const providedResumeId = resumeId || application.ragAnalysis?.resumeId;

  if (!providedResumeId) {
    throw new ApiError(400, "No resume provided for analysis. Please upload a resume or provide resumeId.");
  }

  const job = application.jobId;
  const jobDescription = job.description || `${job.title} at ${job.organizationId?.companyName || "Company"}`;

  if (!jobDescription || jobDescription.length < 20) {
    throw new ApiError(400, "Job description is too short for analysis.");
  }

  const jobEmbedding = await generateEmbedding(jobDescription);

  if (!jobEmbedding) {
    throw new ApiError(503, "Could not analyze resume. Ollama service may be unavailable. Please try again.");
  }

  const analysis = await analyzeResumeJobMatch({
    jobId: application.jobId,
    resumeId: providedResumeId,
    jobDescription,
    jobEmbedding
  });

  application.ragAnalysis = {
    resumeId: providedResumeId,
    matchScore: analysis.matchScore,
    matchTag: analysis.matchTag,
    skillsMatch: analysis.skillsMatch,
    strengths: analysis.strengths,
    weaknesses: analysis.weaknesses,
    recruiterSummary: analysis.recruiterSummary,
    retrievedChunks: analysis.retrievedChunks,
    analysisSource: "rag",
    analysisTimestamp: new Date()
  };

  await application.save();

  return sendSuccess(res, {
    message: "Resume analysis completed successfully.",
    analysis: {
      matchScore: analysis.matchScore,
      matchTag: analysis.matchTag,
      skillsMatch: analysis.skillsMatch,
      strengths: analysis.strengths,
      weaknesses: analysis.weaknesses,
      recruiterSummary: analysis.recruiterSummary,
      retrievedChunks: analysis.retrievedChunks.map((chunk) => ({
        chunkId: chunk.chunkId,
        sectionType: chunk.sectionType,
        relevanceScore: chunk.relevanceScore,
        text: chunk.text
      }))
    }
  });
});

module.exports = {
  uploadResumeForRag,
  getResumeStatusEndpoint,
  listResumes,
  deleteResumeEndpoint,
  quickAnalyzeResume,
  analyzeApplicationWithRag
};
