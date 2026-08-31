const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");

const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { sendSuccess } = require("../utils/apiResponse");
const Job = require("../models/Job");
const JobSeeker = require("../models/JobSeeker");
const AutoApplyRun = require("../models/AutoApplyRun");
const Application = require("../models/Application");
const GeneratedArtifact = require("../models/GeneratedArtifact");
const RecruiterIntroduction = require("../models/RecruiterIntroduction");
const { buildJobText, buildSeekerText } = require("../utils/textBuilders");
const {
  cleanText,
  extractResumeText,
  getResumeTextQuality
} = require("../utils/resumeTextExtractor");
const {
  buildResumeFileName,
  withResumeDensityScale,
  getResumeProfileReadiness,
  buildProfileForTailoring
} = require("../services/resumeGenerationService");
const { claimResumeVariant } = require("../services/resumeVariantRotation");
const { fireAndForget } = require("../services/aiSyncService");
const { computeCandidateMatch } = require("../services/matchService");
const { attachOrganizations } = require("./recommendationController");
const { oauthProviders, exchangeOAuthCode } = require("./authController");
const { uploadFile, getSignedFileUrl } = require("../utils/supabaseService");
const {
  evaluatePreApply,
  generateLatexResume,
  generateLinkedInPost,
  generateRecruiterDm
} = require("../services/geminiGenerativeService");
const {
  chatWithRagAgent,
  inferQuestionType,
  compactProfileForAgent,
  compactJobsForAgent,
  compactHistoryForAgent,
  buildToolContext
} = require("../services/careerAgentService");
const {
  getCareerAgentContext,
  saveCareerAgentTurn,
  rememberUploadedDocument
} = require("../services/careerAgentMemoryService");
const { compileLatexToPdf, compileFittedResumePdf } = require("../services/latexCompilerService");
const { runAutoApplyForSeeker } = require("../workers/autoApplyWorker");
const {
  getProAutoApplyPolicy,
  getProRecruiterIntroPolicy
} = require("../services/platformSettingsService");
const {
  requireArrayOfStrings,
  requireNonEmptyString
} = require("../utils/validation");


function parseJsonArrayField(value, fallback = []) {
  if (Array.isArray(value)) {
    return value;
  }

  if (!value) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (error) {
    return fallback;
  }
}

function isInlineAiSupportedFile(file) {
  const mimeType = String(file?.mimetype || "").toLowerCase();
  return (
    mimeType.startsWith("image/") ||
    mimeType.startsWith("video/") ||
    mimeType === "application/pdf" ||
    mimeType === "text/plain"
  );
}

function buildAttachmentPart(file, index, extractedText = "") {
  const fileName = file.originalname || `attachment-${index + 1}`;
  const mimeType = file.mimetype || "application/octet-stream";

  return {
    index: index + 1,
    fileName,
    mimeType,
    size: file.size || file.buffer?.length || 0,
    extractedText: cleanText(extractedText).slice(0, 8000),
    extractionQuality: extractedText ? getResumeTextQuality(extractedText) : null,
    inlineData: isInlineAiSupportedFile(file) && file.buffer?.length <= 8 * 1024 * 1024
      ? {
          mimeType,
          data: file.buffer.toString("base64")
        }
      : null
  };
}

function buildUnsupportedAttachmentPart(file, index, error) {
  return {
    index: index + 1,
    fileName: file.originalname || `attachment-${index + 1}`,
    mimeType: file.mimetype || "application/octet-stream",
    size: file.size || file.buffer?.length || 0,
    extractedText: "",
    extractionQuality: null,
    inlineData: isInlineAiSupportedFile(file) && file.buffer?.length <= 8 * 1024 * 1024
      ? {
          mimeType: file.mimetype || "application/octet-stream",
          data: file.buffer.toString("base64")
        }
      : null,
    note: error?.message || "This attachment could not be converted to text."
  };
}

async function buildAgentAttachmentContext(files = []) {
  const fileList = (Array.isArray(files) ? files : []).slice(0, 5);

  return Promise.all(
    fileList.map(async (file, index) => {
      try {
        const extractedText = await extractResumeText(file);
        const part = buildAttachmentPart(file, index, extractedText);

        if (!extractedText || !part.extractionQuality?.isReadable) {
          part.note =
            "Text extraction produced low-quality or empty output for this file. " +
            "If this is an image-based PDF or scanned document, Gemini vision " +
            "will attempt to read it directly via inlineData.";
        }

        return part;
      } catch (error) {
        return buildUnsupportedAttachmentPart(file, index, error);
      }
    })
  );
}

const getSeekerAndJob = async (userId, jobId) => {
  const [seeker, job] = await Promise.all([
    JobSeeker.findById(userId).select("+hiddenRoles +embedding"),
    Job.findById(jobId).select("+hiddenRoles +embedding")
  ]);

  if (!seeker) {
    throw new ApiError(404, "Job seeker not found.");
  }

  if (!job) {
    throw new ApiError(404, "Job not found.");
  }

  return { seeker, job };
};

async function buildCareerAgentRequestContext({ userId, message, history = [] }) {
  const seeker = await JobSeeker.findById(userId).select("+embedding +hiddenRoles");
  if (!seeker) {
    throw new ApiError(404, "Job seeker not found.");
  }

  const agentContext = await getCareerAgentContext(userId);
  let jobs = [];
  let textMatchedJobs = [];

  try {
    textMatchedJobs = await Job.find(
      {
        status: "Active",
        $text: { $search: message }
      },
      { score: { $meta: "textScore" } }
    )
      .sort({ score: { $meta: "textScore" }, createdAt: -1 })
      .limit(2)
      .lean();
  } catch (error) {
    textMatchedJobs = [];
  }

  if (Array.isArray(seeker.embedding) && seeker.embedding.length) {
    try {
      jobs = await Job.aggregate([
        {
          $vectorSearch: {
            index: "vector_index",
            path: "embedding",
            queryVector: seeker.embedding,
            numCandidates: 20,
            limit: 2,
            filter: { status: "Active" }
          }
        }
      ]);
    } catch (error) {
      jobs = [];
    }
  }

  if (textMatchedJobs.length) {
    const seenJobIds = new Set();
    jobs = [...textMatchedJobs, ...jobs].filter((job) => {
      const id = String(job._id);
      if (seenJobIds.has(id)) {
        return false;
      }
      seenJobIds.add(id);
      return true;
    }).slice(0, 2);
  }

  if (!jobs.length) {
    jobs = await Job.find({ status: "Active" }).sort({ createdAt: -1 }).limit(2).lean();
  }

  jobs = await Job.populate(jobs, {
    path: "organizationId",
    select: "companyName"
  });

  const applications = await Application.find({ jobSeekerId: userId })
    .sort({ createdAt: -1 })
    .limit(12)
    .populate("jobId", "title location type industry status")
    .populate("organizationId", "companyName industry")
    .lean();

  const mergedHistory = [
    ...(agentContext.recentMessages || []),
    ...history
  ].slice(-40);
  const seekerContext = {
    ...seeker.toObject(),
    careerAgentMemory: agentContext.memory
  };

  return {
    seeker,
    seekerContext,
    jobs,
    applications,
    mergedHistory,
    agentContext
  };
}

const preApplyCheck = asyncHandler(async (req, res) => {
  if (req.user.role !== "seeker") {
    throw new ApiError(403, "Only job seekers can run a pre-apply check.");
  }

  const { seeker, job } = await getSeekerAndJob(req.user.id, req.params.jobId);
  const result = await evaluatePreApply(buildSeekerText(seeker), buildJobText(job), { seeker, job });

  return sendSuccess(res, {
    message: "Pre-apply check completed successfully.",
    result
  });
});

const generateResume = asyncHandler(async (req, res) => {
  if (req.user.role !== "seeker") {
    throw new ApiError(403, "Only job seekers can generate resumes.");
  }

  const { seeker, job } = await getSeekerAndJob(req.user.id, req.params.jobId);

  if ((seeker.resumesGeneratedToday || 0) >= 30) {
    throw new ApiError(403, "Daily resume generation quota reached.");
  }

  const resumeReadiness = getResumeProfileReadiness(seeker);

  // claimResumeVariant advances the candidate's rotation, so consecutive generations step through
  // all six layouts. A saved resumeTemplateVariant preference still wins and does not rotate.
  const variant = await claimResumeVariant(seeker);
  const latex = await generateLatexResume(seeker.toObject(), job.toObject(), null, { variant });
  seeker.resumesGeneratedToday = (seeker.resumesGeneratedToday || 0) + 1;
  seeker.lastResumeResetDate = new Date();
  await seeker.save();

  return sendSuccess(res, {
    message: "Resume generated successfully.",
    latex,
    fileName: buildResumeFileName(seeker, job, "tex"),
    readinessWarning: resumeReadiness.ready
      ? ""
      : `Generated with placeholders. Missing profile sections: ${resumeReadiness.missingSections.join(", ")}.`,
    resumeReadiness,
    targetJob: {
      id: job._id,
      title: job.title,
      location: job.location,
      industry: job.industry,
      type: job.type,
      requirements: job.requirements || [],
      skills: [...(job.skillsRequired || []), ...(job.skills || [])].filter(Boolean)
    },
    resumesGeneratedToday: seeker.resumesGeneratedToday
  });
});

const generateResumePdf = asyncHandler(async (req, res) => {
  if (req.user.role !== "seeker") {
    throw new ApiError(403, "Only job seekers can generate resumes.");
  }

  const { seeker, job } = await getSeekerAndJob(req.user.id, req.params.jobId);
  const resumeReadiness = getResumeProfileReadiness(seeker);

  // claimResumeVariant advances the candidate's rotation, so consecutive generations step through
  // all six layouts. A saved resumeTemplateVariant preference still wins and does not rotate.
  const variant = await claimResumeVariant(seeker);
  const latex = await generateLatexResume(seeker.toObject(), job.toObject(), null, { variant });
  // Fitted, not just compiled: a resume that spills a few lines is pulled back onto one page, and
  // one that genuinely needs two is spread so the second page is not six lines above a blank half.
  const { pdfBuffer, fileName } = await compileFittedResumePdf(
    (scale) => withResumeDensityScale(latex, scale),
    buildResumeFileName(seeker, job, "tex")
  );

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  res.setHeader("Content-Length", pdfBuffer.length);
  return res.status(200).send(pdfBuffer);
});

const MIN_JD_TEXT_LENGTH = 40;

// Mirrors deriveArtifactTitle/deriveShortLabel in frontend/src/pages/pro/AIGeneratorPage.jsx so a
// GeneratedArtifact's stored title matches what the chat UI would have shown for the same input,
// even when the list is re-fetched fresh from the server rather than set optimistically.
function deriveArtifactTitle(jobDescription) {
  const firstLine = String(jobDescription || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || "";
  const shortTitle = firstLine.length > 50 ? `${firstLine.slice(0, 50).trim()}…` : firstLine;
  return `Resume — ${shortTitle || "Tailored role"}`;
}

function deriveShortLabel(text, maxWords = 6) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  const short = words.slice(0, maxWords).join(" ");
  return words.length > maxWords ? `${short}…` : short;
}

// Builds an in-memory, DB-free job-like object from a pasted job description so the existing
// resume-generation helpers (buildTargetTerms, pickRelevantSkills, selectRelevantItems) can be
// reused unchanged — they only need title/description/requirements/skills fields, not a real
// Job document.
function buildEphemeralJobFromDescription(jobDescriptionText) {
  const cleaned = String(jobDescriptionText || "").trim();
  const firstLine = cleaned
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || "";
  const title = firstLine && firstLine.length <= 80 ? firstLine : firstLine.slice(0, 77).trim();

  return {
    title: title || "Tailored-Resume",
    description: cleaned,
    industry: "",
    type: "",
    location: "",
    requirements: [],
    skills: [],
    skillsRequired: []
  };
}

const tailorResumeFromJdText = asyncHandler(async (req, res) => {
  if (req.user.role !== "seeker") {
    throw new ApiError(403, "Only job seekers can generate resumes.");
  }

  const jobDescription = requireNonEmptyString(req.body.jobDescription, "jobDescription");

  if (jobDescription.length < MIN_JD_TEXT_LENGTH) {
    throw new ApiError(
      400,
      `Please paste a more complete job description (at least ${MIN_JD_TEXT_LENGTH} characters).`
    );
  }

  const seeker = await JobSeeker.findById(req.user.id);

  if (!seeker) {
    throw new ApiError(404, "Job seeker not found.");
  }

  if ((seeker.resumesGeneratedToday || 0) >= 30) {
    throw new ApiError(403, "Daily resume generation quota reached.");
  }

  const ephemeralJob = buildEphemeralJobFromDescription(jobDescription);
  const filteredProfile = buildProfileForTailoring(seeker.toObject());

  const variant = await claimResumeVariant(seeker);
  const latex = await generateLatexResume(filteredProfile, ephemeralJob, null, {
    omitEmptySections: true,
    variant
  });
  const { pdfBuffer, fileName } = await compileFittedResumePdf(
    (scale) => withResumeDensityScale(latex, scale),
    buildResumeFileName(filteredProfile, ephemeralJob, "tex")
  );

  seeker.resumesGeneratedToday = (seeker.resumesGeneratedToday || 0) + 1;
  seeker.lastResumeResetDate = new Date();
  await seeker.save();

  // Persist the generated PDF as a history artifact in the background — a Supabase or DB hiccup
  // here must never fail the actual download the user is waiting on.
  fireAndForget(async () => {
    const { url, filePath } = await uploadFile(
      pdfBuffer,
      fileName,
      "application/pdf",
      `resumes/${seeker._id}`
    );
    await GeneratedArtifact.create({
      userId: seeker._id,
      type: "resume",
      title: deriveArtifactTitle(jobDescription),
      status: "Ready",
      fileUrl: url,
      filePath,
      // templateVariant is what makes a ROTATING choice safe to ship: a resume that renders wrong
      // can be re-rendered from the stored layout instead of guessing which one the rotation was
      // on at the time. metadata is a Mixed field, so this needs no schema change.
      metadata: { jobDescriptionSnippet: jobDescription.slice(0, 200), templateVariant: variant }
    });
  }, "tailorResumeArtifact");

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  res.setHeader("Content-Length", pdfBuffer.length);
  return res.status(200).send(pdfBuffer);
});

const MIN_TOPIC_TEXT_LENGTH = 10;
const MATCH_JOBS_CANDIDATE_POOL_LIMIT = 30;
const MATCH_JOBS_RESULT_LIMIT = 10;

const matchJobsToSeeker = asyncHandler(async (req, res) => {
  if (req.user.role !== "seeker") {
    throw new ApiError(403, "Only job seekers can get job matches.");
  }

  const seeker = await JobSeeker.findById(req.user.id).select(
    "+embedding skills preferredRoles skillGroups experience education projects achievements firstName lastName currentStatus"
  );

  if (!seeker) {
    throw new ApiError(404, "Job seeker not found.");
  }

  const limit = Math.min(
    Math.max(Number(req.body?.limit) || MATCH_JOBS_RESULT_LIMIT, 1),
    MATCH_JOBS_RESULT_LIMIT
  );
  const poolLimit = MATCH_JOBS_CANDIDATE_POOL_LIMIT;

  // Candidate-pool retrieval mirrors recommendationController.getRecommendedJobs (vector search,
  // falling back to a keyword-overlap ranked "latest active jobs" query), just with a larger pool
  // since results here get re-ranked by the deterministic matcher below.
  let jobs = [];

  if (Array.isArray(seeker.embedding) && seeker.embedding.length) {
    try {
      jobs = await Job.aggregate([
        {
          $vectorSearch: {
            index: "vector_index",
            path: "embedding",
            queryVector: seeker.embedding,
            numCandidates: poolLimit * 5,
            limit: poolLimit,
            filter: { status: "Active" }
          }
        },
        {
          $project: {
            title: 1,
            description: 1,
            organizationId: 1,
            location: 1,
            industry: 1,
            type: 1,
            requirements: 1,
            skills: 1,
            skillsRequired: 1,
            status: 1,
            createdAt: 1
          }
        }
      ]);
    } catch (error) {
      jobs = [];
    }
  }

  if (!jobs.length) {
    const roleTokens = (seeker.preferredRoles || []).map((role) => role.toLowerCase());
    const skillTokens = (seeker.skills || []).map((skill) => skill.toLowerCase());

    jobs = await Job.find({ status: "Active" }).sort({ createdAt: -1 }).limit(poolLimit).lean();
    jobs = jobs.map((job) => {
      const haystack = `${job.title || ""} ${job.description || ""} ${(job.skillsRequired || []).join(" ")} ${(job.skills || []).join(" ")}`.toLowerCase();
      const keywordScore =
        roleTokens.filter((token) => haystack.includes(token)).length * 2 +
        skillTokens.filter((token) => haystack.includes(token)).length;
      return { ...job, keywordScore };
    }).sort((a, b) => b.keywordScore - a.keywordScore || new Date(b.createdAt) - new Date(a.createdAt));
  }

  const filteredProfile = buildProfileForTailoring(seeker.toObject());
  const rankedJobs = jobs
    .map((job) => {
      const match = computeCandidateMatch(filteredProfile, job);
      return { job, match };
    })
    .sort((a, b) => b.match.score - a.match.score)
    .slice(0, limit);

  const jobsWithOrganizations = await attachOrganizations(rankedJobs.map((entry) => entry.job));

  const results = jobsWithOrganizations.map((job, index) => {
    const { match } = rankedJobs[index];
    return {
      jobId: job._id,
      title: job.title,
      organization: {
        companyName: job.organizationId?.companyName,
        industry: job.organizationId?.industry,
        headquartersLocation: job.organizationId?.headquartersLocation,
        logo: job.organizationId?.logo
      },
      location: job.location,
      score: match.score,
      tag: match.tag,
      reasoning: {
        matchedSkills: match.reasoning.matchedSkills,
        missingSkills: match.reasoning.missingSkills
      }
    };
  });

  if (results.length) {
    fireAndForget(() => GeneratedArtifact.create({
      userId: seeker._id,
      type: "job_matches",
      title: "Job matches",
      status: "Ready",
      metadata: { matches: results }
    }), "matchJobsArtifact");
  }

  return sendSuccess(res, {
    message: "Job matches computed successfully.",
    matches: results
  });
});

const draftLinkedInPost = asyncHandler(async (req, res) => {
  if (req.user.role !== "seeker") {
    throw new ApiError(403, "Only job seekers can draft LinkedIn posts.");
  }

  const topic = requireNonEmptyString(req.body.topic, "topic");

  if (topic.length < MIN_TOPIC_TEXT_LENGTH) {
    throw new ApiError(
      400,
      `Please describe what you'd like the post to be about (at least ${MIN_TOPIC_TEXT_LENGTH} characters).`
    );
  }

  const seeker = await JobSeeker.findById(req.user.id);
  if (!seeker) {
    throw new ApiError(404, "Job seeker not found.");
  }

  const filteredProfile = buildProfileForTailoring(seeker.toObject());
  const post = await generateLinkedInPost(filteredProfile, topic);

  if (!post) {
    throw new ApiError(502, "Could not generate a LinkedIn post right now.");
  }

  fireAndForget(() => GeneratedArtifact.create({
    userId: seeker._id,
    type: "linkedin_post",
    title: `LinkedIn post: ${deriveShortLabel(topic)}`,
    status: "Ready",
    textContent: post,
    metadata: { topic }
  }), "linkedInPostArtifact");

  return sendSuccess(res, {
    message: "LinkedIn post drafted successfully.",
    post
  });
});

const writeRecruiterDm = asyncHandler(async (req, res) => {
  if (req.user.role !== "seeker") {
    throw new ApiError(403, "Only job seekers can draft recruiter messages.");
  }

  const context = requireNonEmptyString(req.body.context, "context");

  if (context.length < MIN_TOPIC_TEXT_LENGTH) {
    throw new ApiError(
      400,
      `Please describe who you're reaching out to and why (at least ${MIN_TOPIC_TEXT_LENGTH} characters).`
    );
  }

  const seeker = await JobSeeker.findById(req.user.id);
  if (!seeker) {
    throw new ApiError(404, "Job seeker not found.");
  }

  const filteredProfile = buildProfileForTailoring(seeker.toObject());
  const message = await generateRecruiterDm(filteredProfile, context);

  if (!message) {
    throw new ApiError(502, "Could not generate a recruiter message right now.");
  }

  fireAndForget(() => GeneratedArtifact.create({
    userId: seeker._id,
    type: "recruiter_dm",
    title: `DM to ${deriveShortLabel(context)}`,
    status: "Ready",
    textContent: message,
    metadata: { context }
  }), "recruiterDmArtifact");

  return sendSuccess(res, {
    message: "Recruiter message drafted successfully.",
    dmMessage: message
  });
});

const chatWithAgent = asyncHandler(async (req, res) => {
  if (req.user.role !== "seeker") {
    throw new ApiError(403, "Only job seekers can use the career agent.");
  }

  const history = parseJsonArrayField(req.body.history, []);
  const message = requireNonEmptyString(req.body.message, "message");
  const attachments = await buildAgentAttachmentContext(req.files || []);
  const { seekerContext, jobs, applications, mergedHistory, agentContext } = await buildCareerAgentRequestContext({
    userId: req.user.id,
    message,
    history
  });

  // A document (e.g. a resume) is usually attached only on the turn it is uploaded. So that
  // follow-up questions ("where did she study?") can still be answered, we persist the
  // extracted text and re-inject the last uploaded document when the current turn has none.
  const freshReadableAttachment = attachments.find((item) => item.extractedText);
  let effectiveAttachments = attachments;

  if (freshReadableAttachment) {
    await rememberUploadedDocument({
      userId: req.user.id,
      documentText: freshReadableAttachment.extractedText,
      documentName: freshReadableAttachment.fileName
    });
  } else if (!attachments.length && agentContext.rememberedDocument) {
    effectiveAttachments = [
      {
        index: 1,
        fileName: agentContext.rememberedDocument.fileName,
        mimeType: "text/plain",
        size: agentContext.rememberedDocument.text.length,
        extractedText: agentContext.rememberedDocument.text,
        extractionQuality: { isReadable: true },
        inlineData: null,
        note: "Recalled from a document you uploaded earlier in this conversation."
      }
    ];
  }

  const result = await chatWithRagAgent(
    message,
    mergedHistory,
    seekerContext,
    jobs,
    applications,
    effectiveAttachments
  );

  await saveCareerAgentTurn({
    userId: req.user.id,
    userMessage: attachments.length
      ? `${message}\n\n[Attachments: ${attachments.map((item) => item.fileName).join(", ")}]`
      : message,
    assistantReply: result.reply || "",
    intent: result.toolContext?.intent
  });

  return sendSuccess(res, {
    message: "Career agent response generated successfully.",
    result: {
      ...result,
      attachments: effectiveAttachments.map((item) => ({
        fileName: item.fileName,
        mimeType: item.mimeType,
        size: item.size,
        extractedCharacters: item.extractedText?.length || 0,
        note: item.note || ""
      }))
    }
  });
});

const getCareerAgentDebugContext = asyncHandler(async (req, res) => {
  if (req.user.role !== "seeker") {
    throw new ApiError(403, "Only job seekers can inspect career agent context.");
  }

  const history = Array.isArray(req.body.history) ? req.body.history : [];
  const message = String(req.body.message || "Inspect my career agent context.").trim();
  const { seekerContext, jobs, applications, mergedHistory, agentContext } = await buildCareerAgentRequestContext({
    userId: req.user.id,
    message,
    history
  });
  const questionType = inferQuestionType(message);
  const toolContext = buildToolContext({
    message,
    questionType,
    profile: seekerContext,
    jobs,
    applications
  });

  return sendSuccess(res, {
    message: "Career agent context pack built successfully.",
    context: {
      userMessage: message,
      intent: questionType,
      selectedTools: toolContext.selectedTools,
      toolContext,
      profileContext: compactProfileForAgent(seekerContext),
      jobsContext: compactJobsForAgent(jobs),
      applicationsContext: applications.map((application) => ({
        id: application._id,
        status: application.status,
        atsScore: application.atsScore,
        atsTag: application.atsTag,
        verificationStatus: application.verificationStatus,
        source: application.source,
        appliedAt: application.createdAt,
        job: {
          title: application.jobId?.title,
          location: application.jobId?.location,
          type: application.jobId?.type,
          industry: application.jobId?.industry,
          status: application.jobId?.status
        },
        organization: {
          companyName: application.organizationId?.companyName,
          industry: application.organizationId?.industry
        }
      })),
      memoryContext: agentContext.memory || {},
      recentHistory: compactHistoryForAgent(mergedHistory),
      counts: {
        jobs: jobs.length,
        applications: applications.length,
        recentHistory: mergedHistory.length,
        memoryFacts: (agentContext.memory?.facts || []).length
      }
    }
  });
});

const getAutoApplyPreferences = asyncHandler(async (req, res) => {
  if (req.user.role !== "seeker") {
    throw new ApiError(403, "Only job seekers can view auto-apply preferences.");
  }

  const seeker = await JobSeeker.findById(req.user.id).select(
    "autoApplyPreferences autoApplyCountToday recruiterIntroCountToday +hiddenRoles isPro dismissedActivityKeys"
  );
  if (!seeker) {
    throw new ApiError(404, "Job seeker not found.");
  }
  const [platformPolicy, recruiterIntroPolicy] = await Promise.all([
    getProAutoApplyPolicy(),
    getProRecruiterIntroPolicy()
  ]);
  const preferences = {
    ...(seeker.autoApplyPreferences?.toObject?.() || seeker.autoApplyPreferences || {}),
    matchThreshold: platformPolicy.matchThreshold,
    maxDailyApplications: platformPolicy.maxDailyApplications
  };

  return sendSuccess(res, {
    message: "Auto-apply preferences fetched successfully.",
    preferences,
    platformPolicy,
    // Separate object, not merged into platformPolicy — the introduction caps are governed by
    // their own admin-controlled policy and shouldn't look like auto-apply settings.
    recruiterIntroPolicy,
    autoApplyCountToday: seeker.autoApplyCountToday,
    recruiterIntroCountToday: seeker.recruiterIntroCountToday || 0,
    hiddenRoles: seeker.hiddenRoles || [],
    dismissedActivityKeys: seeker.dismissedActivityKeys || [],
    readiness: {
      isPro: Boolean(seeker.isPro),
      enabled: Boolean(seeker.autoApplyPreferences?.enabled),
      hasHiddenRoles: Boolean((seeker.hiddenRoles || []).length),
      hasDailyCapacity:
        (seeker.autoApplyCountToday || 0) < platformPolicy.maxDailyApplications
    },
    // Why the master switch alone doesn't tell the UI whether anything will happen: it also needs
    // a channel. These mirror recruiterIntroductionWorker's own per-candidate gates exactly, so the
    // settings screen can explain an inert configuration (master on, both channels off; or auto-DM
    // on with auto-connect off) instead of leaving the seeker to infer it from silence.
    recruiterIntroReadiness: {
      isPro: Boolean(seeker.isPro),
      optedIn: Boolean(seeker.autoApplyPreferences?.autoIntroduceToRecruiters),
      autoConnectEnabled: Boolean(seeker.autoApplyPreferences?.autoConnectEnabled),
      autoDMEnabled: Boolean(seeker.autoApplyPreferences?.autoDMEnabled),
      platformEnabled: recruiterIntroPolicy.enabled !== false,
      hasDailyCapacity:
        (seeker.recruiterIntroCountToday || 0) <
        recruiterIntroPolicy.maxDailyIntroductionsPerSeeker,
      // autoDM without autoConnect authorizes nothing — surfaced explicitly because it looks
      // enabled in the UI while producing no introductions at all.
      dmBlockedByMissingConnect:
        Boolean(seeker.autoApplyPreferences?.autoDMEnabled) &&
        !seeker.autoApplyPreferences?.autoConnectEnabled
    }
  });
});

const updateAutoApplyPreferences = asyncHandler(async (req, res) => {
  if (req.user.role !== "seeker") {
    throw new ApiError(403, "Only job seekers can update auto-apply preferences.");
  }

  const seeker = await JobSeeker.findById(req.user.id).select("autoApplyPreferences +hiddenRoles");
  if (!seeker) {
    throw new ApiError(404, "Job seeker not found.");
  }

  const wasEnabled = Boolean(seeker.autoApplyPreferences?.enabled);
  const shouldRunBackgroundScan = req.body.enabled === true;

  if (req.body.enabled === true && !(seeker.hiddenRoles || []).length) {
    throw new ApiError(400, "Auto-apply cannot be enabled until hidden roles are available.");
  }
  if (req.body.enabled !== undefined) {
    seeker.autoApplyPreferences.enabled = Boolean(req.body.enabled);
  }
  if (req.body.tailoredResume !== undefined) {
    seeker.autoApplyPreferences.tailoredResume = Boolean(req.body.tailoredResume);
  }
  if (req.body.autoConnectEnabled !== undefined) {
    seeker.autoApplyPreferences.autoConnectEnabled = Boolean(req.body.autoConnectEnabled);
  }
  if (req.body.autoDMEnabled !== undefined) {
    seeker.autoApplyPreferences.autoDMEnabled = Boolean(req.body.autoDMEnabled);
  }
  // Unlike the two LinkedIn-intent flags above, this one authorizes real outbound contact with a
  // named recruiter, so it is set only from an explicit request and never inferred from `enabled`.
  if (req.body.autoIntroduceToRecruiters !== undefined) {
    seeker.autoApplyPreferences.autoIntroduceToRecruiters = Boolean(
      req.body.autoIntroduceToRecruiters
    );
  }
  if (req.body.safetyGuardrailsEnabled !== undefined) {
    seeker.autoApplyPreferences.safetyGuardrailsEnabled = Boolean(req.body.safetyGuardrailsEnabled);
  }
  if (Array.isArray(req.body.preferredLocations)) {
    seeker.autoApplyPreferences.preferredLocations = requireArrayOfStrings(
      req.body.preferredLocations,
      "preferredLocations",
      { max: 20 }
    );
    seeker.autoApplyPreferences.locationPreferences = seeker.autoApplyPreferences.preferredLocations;
  }
  if (Array.isArray(req.body.excludedCompanies)) {
    seeker.autoApplyPreferences.excludedCompanies = requireArrayOfStrings(
      req.body.excludedCompanies,
      "excludedCompanies",
      { max: 50 }
    );
  }
  if (Array.isArray(req.body.rolePreferences)) {
    seeker.autoApplyPreferences.rolePreferences = requireArrayOfStrings(
      req.body.rolePreferences,
      "rolePreferences",
      { max: 20 }
    );
  }
  if (req.body.minSalary !== undefined) {
    const minSalary = Number(req.body.minSalary);
    seeker.autoApplyPreferences.minSalary =
      Number.isFinite(minSalary) && minSalary > 0 ? minSalary : undefined;
  }

  await seeker.save();

  if (shouldRunBackgroundScan) {
    fireAndForget(async () => {
      const result = await runAutoApplyForSeeker(req.user.id);
      await AutoApplyRun.create({
        seekerId: req.user.id,
        source: wasEnabled ? "manual_test" : "preference_enabled",
        ...result
      });
    });
  }

  const platformPolicy = await getProAutoApplyPolicy();
  const preferences = {
    ...(seeker.autoApplyPreferences?.toObject?.() || seeker.autoApplyPreferences || {}),
    matchThreshold: platformPolicy.matchThreshold,
    maxDailyApplications: platformPolicy.maxDailyApplications
  };

  return sendSuccess(res, {
    message: "Auto-apply preferences updated successfully. Match threshold and daily limits are controlled by admin.",
    preferences,
    platformPolicy
  });
});

const runAutoApplyTest = asyncHandler(async (req, res) => {
  if (req.user.role !== "seeker") {
    throw new ApiError(403, "Only job seekers can run auto-apply tests.");
  }

  const result = await runAutoApplyForSeeker(req.user.id);
  console.log("[AutoApply Test Result]", JSON.stringify({
    ready: result.ready,
    readiness: result.readiness,
    jobsChecked: result.jobsChecked,
    applicationsCreated: result.applicationsCreated,
    results: result.results
  }, null, 2));

  // Persist so this test run shows up in GET /auto-apply/runs (and therefore the Automations
  // page's metrics/activity stream) — mirrors the same persistence already done for the
  // background scan triggered by updateAutoApplyPreferences.
  await AutoApplyRun.create({
    seekerId: req.user.id,
    source: "manual_test",
    ...result
  });

  return sendSuccess(res, {
    message: "Auto-apply test run completed.",
    result
  });
});

const getAutoApplyRuns = asyncHandler(async (req, res) => {
  if (req.user.role !== "seeker") {
    throw new ApiError(403, "Only job seekers can view auto-apply history.");
  }

  const runs = await AutoApplyRun.find({ seekerId: req.user.id })
    .sort({ createdAt: -1 })
    .limit(10);

  return sendSuccess(res, {
    message: "Auto-apply history fetched successfully.",
    runs
  });
});

// PATCH /api/pro/agent/activity/dismiss — hides a single AI Activity Stream row for this seeker.
// Activity rows aren't their own documents (they're computed by flattening AutoApplyRun.results[]
// on every render), so there's nothing to soft-delete — this just records the row's stable key so
// the frontend can filter it out. The underlying AutoApplyRun history is never touched.
const dismissActivityEntry = asyncHandler(async (req, res) => {
  if (req.user.role !== "seeker") {
    throw new ApiError(403, "Only job seekers can dismiss activity entries.");
  }

  const key = requireNonEmptyString(req.body.key, "key");

  await JobSeeker.updateOne(
    { _id: req.user.id },
    { $addToSet: { dismissedActivityKeys: key } }
  );

  return sendSuccess(res, {
    message: "Activity entry dismissed."
  });
});

// PATCH /api/pro/agent/activity/dismiss-all — hides every currently-visible activity row in one
// call. The frontend sends exactly the keys it's currently rendering (the activity stream is
// capped/paginated client-side), same non-destructive semantics as dismissActivityEntry above.
const dismissAllActivityEntries = asyncHandler(async (req, res) => {
  if (req.user.role !== "seeker") {
    throw new ApiError(403, "Only job seekers can dismiss activity entries.");
  }

  const keys = requireArrayOfStrings(req.body.keys, "keys", { max: 50 });

  await JobSeeker.updateOne(
    { _id: req.user.id },
    { $addToSet: { dismissedActivityKeys: { $each: keys } } }
  );

  return sendSuccess(res, {
    message: "All visible activity entries dismissed."
  });
});

const listGeneratedArtifacts = asyncHandler(async (req, res) => {
  if (req.user.role !== "seeker") {
    throw new ApiError(403, "Only job seekers can view generated artifacts.");
  }

  const limit = req.query.limit ? Number(req.query.limit) : 20;
  const artifacts = await GeneratedArtifact.find({ userId: req.user.id, dismissedAt: null })
    .sort({ createdAt: -1 })
    .limit(limit);

  // The stored `fileUrl` (built by uploadFile at persistence time) assumes a public bucket, but
  // the configured bucket is private, so it 404s if used directly. Generate a fresh short-lived
  // signed URL from the stored `filePath` instead — this also means resume links never go stale.
  const results = await Promise.all(artifacts.map(async (artifact) => {
    let fileUrl;

    if (artifact.type === "resume" && artifact.filePath) {
      try {
        fileUrl = await getSignedFileUrl(artifact.filePath);
      } catch (error) {
        fileUrl = undefined;
      }
    }

    return {
      id: artifact._id,
      type: artifact.type,
      title: artifact.title,
      status: artifact.status,
      createdAt: artifact.createdAt,
      fileUrl,
      textContent: ["linkedin_post", "recruiter_dm"].includes(artifact.type) ? artifact.textContent : undefined,
      metadata:
        artifact.type === "job_matches"
          ? artifact.metadata
          // Only the `linkedin` publish-state sub-field is needed on the frontend for
          // linkedin_post artifacts (to show "Posted ✓" / disable re-publishing) — no other
          // metadata shape is defined for this type, so there's nothing else to leak.
          : artifact.type === "linkedin_post" && artifact.metadata?.linkedin
            ? { linkedin: artifact.metadata.linkedin }
            : undefined
    };
  }));

  return sendSuccess(res, {
    message: "Generated artifacts fetched successfully.",
    artifacts: results
  });
});

// PATCH /api/pro/agent/artifacts/:artifactId/dismiss — hides a single artifact from the seeker's
// "Generated artifacts" list. This never touches the underlying content (resume file, LinkedIn/DM
// text, job matches) — it only sets dismissedAt, which listGeneratedArtifacts filters on.
const dismissGeneratedArtifact = asyncHandler(async (req, res) => {
  if (req.user.role !== "seeker") {
    throw new ApiError(403, "Only job seekers can dismiss generated artifacts.");
  }

  const artifact = await GeneratedArtifact.findById(req.params.artifactId);

  if (!artifact || artifact.userId.toString() !== req.user.id) {
    throw new ApiError(404, "Generated artifact not found.");
  }

  artifact.dismissedAt = new Date();
  await artifact.save();

  return sendSuccess(res, {
    message: "Artifact dismissed."
  });
});

// PATCH /api/pro/agent/artifacts/dismiss-all — hides every currently-visible artifact for this
// seeker in one action. Same non-destructive semantics as dismissGeneratedArtifact above.
const dismissAllGeneratedArtifacts = asyncHandler(async (req, res) => {
  if (req.user.role !== "seeker") {
    throw new ApiError(403, "Only job seekers can dismiss generated artifacts.");
  }

  await GeneratedArtifact.updateMany(
    { userId: req.user.id, dismissedAt: null },
    { dismissedAt: new Date() }
  );

  return sendSuccess(res, {
    message: "All artifacts dismissed."
  });
});

// ---------------------------------------------------------------------------
// LinkedIn identity-link (NOT a login provider, NOT connection/messaging automation).
//
// LinkedIn's public API only grants OpenID identity (name/email/picture) to apps outside its
// vetted Talent/Marketing Partner program — it does not grant the ability to send connection
// requests, send messages, or read replies, and doing so without that partner access would
// violate LinkedIn's Terms of Service. So this only proves who the seeker is on LinkedIn;
// it never unlocks any auto-connect/auto-DM automation.
// ---------------------------------------------------------------------------

function getFrontendUrl() {
  return (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
}

function getLinkedInProviderConfig(req) {
  const provider = oauthProviders.linkedin;
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  const redirectUri =
    process.env.LINKEDIN_REDIRECT_URI || `${req.protocol}://${req.get("host")}/api/pro/linkedin/callback`;

  if (!clientId || !clientSecret) {
    throw new ApiError(503, "LinkedIn connection is not configured yet.");
  }

  // Extends authController.js's shared identity-only scope with w_member_social so this
  // seeker-facing connect flow can also publish a post to the member's own feed on their
  // explicit click (publishLinkedInPost below) — NOT extended for auto-connect/auto-DM, which
  // stays deliberately unavailable regardless of scope (see linkedinConnectionSchema's comment).
  // IMPORTANT: this scope is only actually granted at LinkedIn's consent screen if the LinkedIn
  // Developer Portal app has the "Share on LinkedIn" product added — that's a one-time manual
  // setup step in LinkedIn's own portal, not something this code can do or verify.
  return {
    ...provider,
    providerKey: "linkedin",
    clientId,
    clientSecret,
    redirectUri,
    scope: "openid profile email w_member_social"
  };
}

function redirectToLinkedInCallback(res, status, extra = {}) {
  const params = new URLSearchParams({ status, ...extra });
  return res.redirect(`${getFrontendUrl()}/pro/linkedin/callback?${params.toString()}`);
}

// GET /api/pro/linkedin/connect — reached via a real top-level browser navigation so it can
// land on LinkedIn's own consent screen, which means it can't carry our normal Authorization
// header. The frontend passes the seeker's existing access token as a query param instead;
// it's verified here exactly like requireAuth does, just read from the query string.
const connectLinkedIn = asyncHandler(async (req, res) => {
  const token = String(req.query.token || "");
  let user;

  try {
    user = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return redirectToLinkedInCallback(res, "error", {
      message: "Your session expired. Please sign in again and retry."
    });
  }

  if (user.role !== "seeker") {
    return redirectToLinkedInCallback(res, "error", {
      message: "Only job seekers can connect a LinkedIn account."
    });
  }

  try {
    const provider = getLinkedInProviderConfig(req);
    const state = jwt.sign(
      {
        provider: "linkedin",
        seekerId: user.id,
        nonce: `${Date.now()}-${Math.random().toString(36).slice(2)}`
      },
      process.env.JWT_SECRET,
      { expiresIn: "10m" }
    );
    const params = new URLSearchParams({
      response_type: "code",
      client_id: provider.clientId,
      redirect_uri: provider.redirectUri,
      scope: provider.scope,
      state
    });

    return res.redirect(`${provider.authorizeUrl}?${params.toString()}`);
  } catch (error) {
    const message = error instanceof ApiError ? error.message : "Unable to start LinkedIn connection.";
    return redirectToLinkedInCallback(res, "error", { message });
  }
});

// GET /api/pro/linkedin/callback — hit directly by LinkedIn's server-side redirect, so it
// identifies the seeker from the signed `state` param rather than requireAuth.
const linkedinCallback = asyncHandler(async (req, res) => {
  try {
    if (req.query.error) {
      throw new ApiError(401, String(req.query.error_description || req.query.error));
    }

    const code = String(req.query.code || "");
    const state = String(req.query.state || "");

    if (!code || !state) {
      throw new ApiError(400, "LinkedIn callback is missing code or state.");
    }

    let decodedState;
    try {
      decodedState = jwt.verify(state, process.env.JWT_SECRET);
    } catch {
      throw new ApiError(401, "LinkedIn connection state is invalid or expired.");
    }

    if (decodedState.provider !== "linkedin" || !decodedState.seekerId) {
      throw new ApiError(400, "LinkedIn connection state mismatch.");
    }

    const provider = getLinkedInProviderConfig(req);
    const tokenPayload = await exchangeOAuthCode(provider, code);

    const profileResponse = await fetch(provider.userInfoUrl, {
      headers: { Authorization: `Bearer ${tokenPayload.access_token}` }
    });
    const profile = await profileResponse.json().catch(() => ({}));

    if (!profileResponse.ok || !profile.sub) {
      throw new ApiError(401, "Unable to fetch LinkedIn profile.");
    }

    const seeker = await JobSeeker.findById(decodedState.seekerId);

    if (!seeker) {
      throw new ApiError(404, "Job seeker not found.");
    }

    const displayName = String(
      profile.name || `${profile.given_name || ""} ${profile.family_name || ""}`.trim() || "LinkedIn member"
    ).trim();

    // LinkedIn's token response echoes back what was actually granted in its own `scope` field
    // (space- or comma-separated depending on the exact response) — trust that over what we
    // merely requested, since a member could in principle grant only part of it.
    const grantedScopes = String(tokenPayload.scope || "")
      .split(/[\s,]+/)
      .map((scope) => scope.trim())
      .filter(Boolean);

    seeker.linkedinConnection = {
      linkedinUserId: profile.sub,
      displayName,
      connectedAt: new Date(),
      accessToken: tokenPayload.access_token,
      refreshToken: tokenPayload.refresh_token,
      scopes: grantedScopes,
      expiresAt: tokenPayload.expires_in
        ? new Date(Date.now() + tokenPayload.expires_in * 1000)
        : undefined
    };
    await seeker.save();

    return redirectToLinkedInCallback(res, "success", { displayName });
  } catch (error) {
    const message = error instanceof ApiError ? error.message : "LinkedIn connection failed.";
    return redirectToLinkedInCallback(res, "error", { message });
  }
});

const getLinkedInStatus = asyncHandler(async (req, res) => {
  if (req.user.role !== "seeker") {
    throw new ApiError(403, "Only job seekers can view LinkedIn connection status.");
  }

  const seeker = await JobSeeker.findById(req.user.id).select("linkedinConnection");
  const connection = seeker?.linkedinConnection;

  return sendSuccess(res, {
    connected: Boolean(connection?.linkedinUserId),
    displayName: connection?.displayName || null,
    connectedAt: connection?.connectedAt || null,
    // Distinguishes an older identity-only connection (made before w_member_social existed on
    // this connect flow, or where the member declined that part of consent) from one that can
    // actually publish — the frontend uses this to decide whether "Post to LinkedIn" should
    // publish directly or send the seeker through the connect flow again.
    canPost: Boolean(connection?.scopes?.includes("w_member_social"))
  });
});

// LinkedIn's Posts API requires this versioned header on every call, independent of OAuth scope
// version — LinkedIn ships a new one most months. Override via env if this drifts stale; see
// https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api for
// the current value at time of any future maintenance.
const LINKEDIN_API_VERSION = process.env.LINKEDIN_API_VERSION || "202506";

function buildLinkedInPersonUrn(linkedinUserId) {
  return `urn:li:person:${linkedinUserId}`;
}

// POST /api/pro/linkedin/posts/:artifactId/publish — publishes an existing "linkedin_post"
// GeneratedArtifact (drafted via the Career Copilot's "Draft a LinkedIn post" feature) to the
// seeker's own LinkedIn feed, with their explicit consent (this endpoint call) and using only
// the w_member_social scope granted through /pro/linkedin/connect. Text-only for this first
// version — no media attachment support yet.
const publishLinkedInPost = asyncHandler(async (req, res) => {
  if (req.user.role !== "seeker") {
    throw new ApiError(403, "Only job seekers can publish to LinkedIn.");
  }

  const artifact = await GeneratedArtifact.findById(req.params.artifactId);

  if (!artifact || artifact.userId.toString() !== req.user.id) {
    throw new ApiError(404, "Generated artifact not found.");
  }

  if (artifact.type !== "linkedin_post") {
    throw new ApiError(400, "Only LinkedIn post drafts can be published to LinkedIn.");
  }

  if (artifact.metadata?.linkedin?.postedAt) {
    throw new ApiError(409, "This draft has already been posted to LinkedIn.", {
      errorCode: "LINKEDIN_ALREADY_POSTED",
      url: artifact.metadata.linkedin.url || null
    });
  }

  if (!artifact.textContent || !artifact.textContent.trim()) {
    throw new ApiError(400, "This draft has no text content to publish.");
  }

  const seeker = await JobSeeker.findById(req.user.id).select("+linkedinConnection.accessToken");
  const connection = seeker?.linkedinConnection;

  if (!connection?.linkedinUserId || !connection?.accessToken) {
    throw new ApiError(409, "Connect your LinkedIn account before publishing.", {
      errorCode: "LINKEDIN_NOT_CONNECTED"
    });
  }

  if (!connection.scopes?.includes("w_member_social")) {
    throw new ApiError(409, "Reconnect LinkedIn to grant posting permission.", {
      errorCode: "LINKEDIN_MISSING_SCOPE"
    });
  }

  if (connection.expiresAt && new Date(connection.expiresAt).getTime() < Date.now()) {
    throw new ApiError(409, "Your LinkedIn connection expired. Please reconnect.", {
      errorCode: "LINKEDIN_TOKEN_EXPIRED"
    });
  }

  const linkedinResponse = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${connection.accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
      "LinkedIn-Version": LINKEDIN_API_VERSION
    },
    body: JSON.stringify({
      author: buildLinkedInPersonUrn(connection.linkedinUserId),
      commentary: artifact.textContent,
      visibility: "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: []
      },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false
    })
  });

  if (!linkedinResponse.ok) {
    if (linkedinResponse.status === 401 || linkedinResponse.status === 403) {
      throw new ApiError(409, "Your LinkedIn connection no longer has permission to post. Please reconnect.", {
        errorCode: "LINKEDIN_MISSING_SCOPE"
      });
    }

    let message = "LinkedIn rejected the post.";
    try {
      const errorBody = await linkedinResponse.json();
      message = errorBody?.message || message;
    } catch {
      // LinkedIn error bodies aren't always JSON — fall back to the generic message.
    }

    throw new ApiError(502, message, { errorCode: "LINKEDIN_API_ERROR" });
  }

  // On success the Posts API returns 201 with no useful body — the created post's URN comes
  // back in the x-restli-id response header instead (per LinkedIn's own docs).
  const postUrn = linkedinResponse.headers.get("x-restli-id") || "";
  const postUrl = postUrn ? `https://www.linkedin.com/feed/update/${postUrn}/` : "";

  artifact.metadata = {
    ...(artifact.metadata && typeof artifact.metadata === "object" ? artifact.metadata : {}),
    linkedin: {
      postedAt: new Date(),
      urn: postUrn,
      url: postUrl
    }
  };
  await artifact.save();

  return sendSuccess(res, {
    message: "Posted to LinkedIn successfully.",
    urn: postUrn,
    url: postUrl
  });
});

const disconnectLinkedIn = asyncHandler(async (req, res) => {
  if (req.user.role !== "seeker") {
    throw new ApiError(403, "Only job seekers can disconnect a LinkedIn account.");
  }

  await JobSeeker.updateOne({ _id: req.user.id }, { $unset: { linkedinConnection: 1 } });

  return sendSuccess(res, { message: "LinkedIn account disconnected." });
});

// Counts the seeker's own recruiter introductions. Added here rather than derived in the frontend
// because nothing the seeker already fetches exposes RecruiterIntroduction at all — the home
// dashboard's "auto-connects" tile had no source without it, and the alternative was a hardcoded
// number.
//
// Deliberately does NOT report an "accepted"/"responded" count. RecruiterIntroduction.status has
// Accepted/Declined values and a respondedAt field, but NOTHING in the codebase ever writes them:
// every record stays Pending for its whole life. A count filtered on status would therefore always
// be 0, and a rendered 0 reads as "no recruiter has responded" when the truth is "responses are
// not tracked". The UI shows that stat as unavailable instead.
const getRecruiterIntroductionStats = asyncHandler(async (req, res) => {
  if (req.user.role !== "seeker") {
    throw new ApiError(403, "Only job seekers have recruiter introductions.");
  }

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Both counts are backed by the { jobSeekerId: 1, createdAt: -1 } index on the model.
  const [total, last7Days] = await Promise.all([
    RecruiterIntroduction.countDocuments({ jobSeekerId: req.user.id }),
    RecruiterIntroduction.countDocuments({ jobSeekerId: req.user.id, createdAt: { $gte: since } })
  ]);

  return sendSuccess(res, {
    message: "Recruiter introduction stats fetched successfully.",
    stats: { total, last7Days }
  });
});

module.exports = {
  preApplyCheck,
  generateResume,
  generateResumePdf,
  tailorResumeFromJdText,
  matchJobsToSeeker,
  draftLinkedInPost,
  writeRecruiterDm,
  listGeneratedArtifacts,
  dismissGeneratedArtifact,
  dismissAllGeneratedArtifacts,
  chatWithAgent,
  getCareerAgentDebugContext,
  getAutoApplyPreferences,
  updateAutoApplyPreferences,
  runAutoApplyTest,
  getAutoApplyRuns,
  dismissActivityEntry,
  dismissAllActivityEntries,
  connectLinkedIn,
  linkedinCallback,
  getLinkedInStatus,
  disconnectLinkedIn,
  publishLinkedInPost,
  getRecruiterIntroductionStats
};
