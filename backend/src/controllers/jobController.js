const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");
const { fireAndForget, syncJobAiFields } = require("../services/aiSyncService");
const { buildTailoredResumeForJob } = require("../services/applicationResumeService");
const { latexToPlainText, scoreResumeAgainstJob } = require("../services/resumeScoringService");
const { cleanText, extractResumeText } = require("../utils/resumeTextExtractor");
const {
  cleanupUploadedMedia,
  safeDeleteStoredFiles,
  uploadMediaDescriptor
} = require("../utils/mediaStorage");
const {
  requireNonEmptyString,
  requireArrayOfStrings,
  optionalString
} = require("../utils/validation");

const Job = require("../models/Job");
const Application = require("../models/Application");
const JobSeeker = require("../models/JobSeeker");
const Organization = require("../models/Organization");
const Follow = require("../models/Follow");
const VerificationRequest = require("../models/VerificationRequest");
const { createNotification } = require("../services/notificationService");
const { runAutoApplyForJob } = require("../workers/autoApplyWorker");

function toApplicationResponse(application, latestVerificationRequest) {
  return {
    ...application.toObject(),
    latestVerificationRequest: latestVerificationRequest
      ? {
          _id: latestVerificationRequest._id,
          status: latestVerificationRequest.status,
          managerEmail: latestVerificationRequest.managerEmail,
          requestedAt: latestVerificationRequest.requestedAt,
          gracePeriodEndsAt: latestVerificationRequest.gracePeriodEndsAt,
          nextReminderAt: latestVerificationRequest.nextReminderAt,
          submittedAt: latestVerificationRequest.submittedAt,
          lastReminderSentAt: latestVerificationRequest.lastReminderSentAt,
          reminderCount: latestVerificationRequest.reminderCount,
          managerRating: latestVerificationRequest.managerRating,
          managerFeedback: latestVerificationRequest.managerFeedback,
          createdAt: latestVerificationRequest.createdAt,
          updatedAt: latestVerificationRequest.updatedAt
        }
      : null
  };
}

function parseOptionalNumber(value, field, { min, max, integer = true } = {}) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const number = Number(value);

  if (!Number.isFinite(number) || number < min || number > max || (integer && !Number.isInteger(number))) {
    throw new ApiError(400, `${field} must be a number between ${min} and ${max}.`);
  }

  return number;
}

function getAutoApplyFields(body, existing = {}) {
  const autoApplyEnabled = body.autoApplyEnabled !== undefined
    ? Boolean(body.autoApplyEnabled)
    : (existing.autoApplyEnabled !== undefined ? Boolean(existing.autoApplyEnabled) : true);
  const threshold = parseOptionalNumber(body.autoApplyThreshold, "autoApplyThreshold", {
    min: 0,
    max: 100
  });
  const dailyCap = parseOptionalNumber(body.autoApplyDailyCap, "autoApplyDailyCap", {
    min: 1,
    max: 1000
  });

  return {
    ...(body.autoApplyEnabled !== undefined ? { autoApplyEnabled } : {}),
    ...(threshold !== undefined ? { autoApplyThreshold: threshold } : {}),
    ...(body.autoApplyUseAIScoring !== undefined
      ? { autoApplyUseAIScoring: Boolean(body.autoApplyUseAIScoring) }
      : {}),
    ...(dailyCap !== undefined ? { autoApplyDailyCap: dailyCap } : {}),
    ...(body.autoApplyDailyCap === "" || body.autoApplyDailyCap === null
      ? { autoApplyDailyCap: undefined }
      : {}),
    autoApplyEnabled
  };
}

function runLiveJobSideEffects(job, organization, source) {
  fireAndForget(async () => {
    console.log(`[Auto-Apply] Starting sync for job ${job._id} (${job.title})`);
    try {
      await syncJobAiFields(job._id);
      console.log(`[Auto-Apply] ✓ Embedding generated for job ${job._id}`);
    } catch (error) {
      console.error(`[Auto-Apply] ✗ Embedding failed for job ${job._id}:`, error?.message);
      return;
    }

    const syncedJob = await Job.findById(job._id).select("autoApplyEnabled");
    console.log(`[Auto-Apply] Job ${job._id} autoApplyEnabled: ${syncedJob?.autoApplyEnabled}`);

    if (syncedJob?.autoApplyEnabled) {
      console.log(`[Auto-Apply] ✓ Triggering auto-apply for job ${job._id} (${job.title})`);
      const result = await runAutoApplyForJob(job._id, { source });
      console.log(`[Auto-Apply] ✓ Auto-apply completed. Applications created: ${result.applicationsCreated}`);
    } else {
      console.log(`[Auto-Apply] ✗ Auto-apply disabled for job ${job._id}`);
    }
  }, "jobCreation");

  return Follow.find({
    organizationId: organization._id,
    "notificationPreferences.notifyJobs": true
  }).then((interestedFollowers) =>
    Promise.all(
      interestedFollowers.map((follow) =>
        createNotification({
          recipientId: follow.jobSeekerId,
          recipientRole: "seeker",
          type: "new_job",
          title: "New job from a followed organization",
          message: `${organization.companyName} posted a new job: ${job.title}.`,
          metadata: { jobId: job._id, organizationId: organization._id }
        })
      )
    )
  );
}

const createJob = asyncHandler(async (req, res) => {
  if (req.user.role !== "organization") {
    throw new ApiError(403, "Only organizations can create jobs.");
  }

  const organization = await Organization.findById(req.user.id);

  if (!organization) {
    throw new ApiError(404, "Organization not found.");
  }

  const status = req.body.status === "Draft" ? "Draft" : "Active";

  const job = await Job.create({
    title: requireNonEmptyString(req.body.title, "title"),
    description: optionalString(req.body.description),
    organizationId: organization._id,
    location: optionalString(req.body.location),
    industry: optionalString(req.body.industry),
    type: req.body.type,
    salary: req.body.salary,
    requirements: req.body.requirements
      ? requireArrayOfStrings(req.body.requirements, "requirements", { max: 50 })
      : [],
    skills: req.body.skills ? requireArrayOfStrings(req.body.skills, "skills", { max: 50 }) : [],
    skillsRequired: req.body.skillsRequired
      ? requireArrayOfStrings(req.body.skillsRequired, "skillsRequired", { max: 50 })
      : [],
    status,
    isActive: status === "Active",
    ...getAutoApplyFields(req.body)
  });

  if (status === "Active") {
    await runLiveJobSideEffects(job, organization, "job_created");
  }

  return sendSuccess(res, {
    message: status === "Draft" ? "Job saved as draft." : "Job created successfully.",
    job
  }, 201);
});

const updateJob = asyncHandler(async (req, res) => {
  if (req.user.role !== "organization") {
    throw new ApiError(403, "Only organizations can update jobs.");
  }

  const job = await Job.findById(req.params.jobId);

  if (!job) {
    throw new ApiError(404, "Job not found.");
  }

  if (job.organizationId.toString() !== req.user.id) {
    throw new ApiError(403, "You can only update your own jobs.");
  }

  const wasAutoApplyEnabled = Boolean(job.autoApplyEnabled);
  const previousThreshold = job.autoApplyThreshold;
  const assignableFields = {
    ...(req.body.title !== undefined ? { title: requireNonEmptyString(req.body.title, "title") } : {}),
    ...(req.body.description !== undefined ? { description: optionalString(req.body.description) } : {}),
    ...(req.body.location !== undefined ? { location: optionalString(req.body.location) } : {}),
    ...(req.body.industry !== undefined ? { industry: optionalString(req.body.industry) } : {}),
    ...(req.body.type !== undefined ? { type: req.body.type } : {}),
    ...(req.body.salary !== undefined ? { salary: req.body.salary } : {}),
    ...(req.body.requirements !== undefined
      ? { requirements: requireArrayOfStrings(req.body.requirements, "requirements", { max: 50 }) }
      : {}),
    ...(req.body.skills !== undefined
      ? { skills: requireArrayOfStrings(req.body.skills, "skills", { max: 50 }) }
      : {}),
    ...(req.body.skillsRequired !== undefined
      ? { skillsRequired: requireArrayOfStrings(req.body.skillsRequired, "skillsRequired", { max: 50 }) }
      : {}),
    ...(() => {
      const fields = getAutoApplyFields(req.body, job);
      delete fields.autoApplyThreshold;
      delete fields.autoApplyDailyCap;
      return fields;
    })()
  };

  Object.assign(job, assignableFields);
  await job.save();

  fireAndForget(async () => {
    console.log(`[Auto-Apply] Updating sync for job ${job._id} (${job.title})`);
    try {
      await syncJobAiFields(job._id);
      console.log(`[Auto-Apply] ✓ Embedding updated for job ${job._id}`);
    } catch (error) {
      console.error(`[Auto-Apply] ✗ Embedding update failed for job ${job._id}:`, error?.message);
      return;
    }

    if (!wasAutoApplyEnabled && job.autoApplyEnabled) {
      console.log(`[Auto-Apply] ✓ Auto-apply was just enabled, triggering for job ${job._id}`);
      const result = await runAutoApplyForJob(job._id, { source: "job_auto_apply_enabled" });
      console.log(`[Auto-Apply] ✓ Auto-apply completed. Applications created: ${result.applicationsCreated}`);
    }

    if (job.autoApplyEnabled && previousThreshold !== job.autoApplyThreshold) {
      console.log(`[Auto-Apply] ✓ Threshold changed from ${previousThreshold} to ${job.autoApplyThreshold}, re-running auto-apply for job ${job._id}`);
      const result = await runAutoApplyForJob(job._id, { source: "job_threshold_changed" });
      console.log(`[Auto-Apply] ✓ Auto-apply re-run completed. Applications created: ${result.applicationsCreated}`);
    }
  }, "jobUpdate");

  return sendSuccess(res, {
    message: "Job updated successfully.",
    job
  });
});

const publishJob = asyncHandler(async (req, res) => {
  if (req.user.role !== "organization") {
    throw new ApiError(403, "Only organizations can publish jobs.");
  }

  const job = await Job.findById(req.params.jobId);

  if (!job) {
    throw new ApiError(404, "Job not found.");
  }

  if (job.organizationId.toString() !== req.user.id) {
    throw new ApiError(403, "You can only publish your own jobs.");
  }

  if (job.status !== "Draft") {
    throw new ApiError(400, "Only draft jobs can be published.");
  }

  const organization = await Organization.findById(job.organizationId);

  job.status = "Active";
  job.isActive = true;
  await job.save();

  await runLiveJobSideEffects(job, organization, "job_published");

  return sendSuccess(res, {
    message: "Job published successfully.",
    job
  });
});

const getMyJobs = asyncHandler(async (req, res) => {
  if (req.user.role !== "organization") {
    throw new ApiError(403, "Only organizations can view their jobs.");
  }

  const status = String(req.query.status || "All").trim();
  const filter = { organizationId: req.user.id };

  if (["Draft", "Active", "Closed"].includes(status)) {
    filter.status = status;
  }

  const jobs = await Job.find(filter).sort({ createdAt: -1 }).lean();
  const applicationCounts = await Application.aggregate([
    { $match: { jobId: { $in: jobs.map((job) => job._id) } } },
    { $group: { _id: "$jobId", count: { $sum: 1 } } }
  ]);
  const countByJobId = new Map(
    applicationCounts.map((item) => [item._id.toString(), item.count])
  );

  const allOrgJobIds = await Job.find({ organizationId: req.user.id }).distinct("_id");
  const earliestAcceptedByJobId = await Application.aggregate([
    {
      $match: {
        jobId: { $in: allOrgJobIds },
        status: "Accepted",
        acceptedAt: { $ne: null }
      }
    },
    { $sort: { acceptedAt: 1 } },
    { $group: { _id: "$jobId", acceptedAt: { $first: "$acceptedAt" } } }
  ]);

  let avgTimeToFillDays = null;

  if (earliestAcceptedByJobId.length) {
    const jobCreatedAtById = new Map(
      (await Job.find({ _id: { $in: earliestAcceptedByJobId.map((item) => item._id) } })
        .select("createdAt")
        .lean()
      ).map((job) => [job._id.toString(), job.createdAt])
    );

    const fillDurationsDays = earliestAcceptedByJobId
      .map((item) => {
        const createdAt = jobCreatedAtById.get(item._id.toString());
        if (!createdAt) return null;
        return (new Date(item.acceptedAt) - new Date(createdAt)) / (1000 * 60 * 60 * 24);
      })
      .filter((value) => value !== null);

    if (fillDurationsDays.length) {
      avgTimeToFillDays =
        fillDurationsDays.reduce((sum, value) => sum + value, 0) / fillDurationsDays.length;
    }
  }

  return sendSuccess(res, {
    message: "Recruiter jobs fetched successfully.",
    jobs: jobs.map((job) => ({
      ...job,
      applicationCount: countByJobId.get(job._id.toString()) || 0
    })),
    avgTimeToFillDays
  });
});

const closeJob = asyncHandler(async (req, res) => {
  if (req.user.role !== "organization") {
    throw new ApiError(403, "Only organizations can close jobs.");
  }

  const job = await Job.findById(req.params.jobId);

  if (!job) {
    throw new ApiError(404, "Job not found.");
  }

  if (job.organizationId.toString() !== req.user.id) {
    throw new ApiError(403, "You can only close your own jobs.");
  }

  job.status = "Closed";
  job.isActive = false;
  await job.save();

  return sendSuccess(res, {
    message: "Job closed successfully. Existing applications remain available for review.",
    job
  });
});

const deleteJob = asyncHandler(async (req, res) => {
  if (req.user.role !== "organization") {
    throw new ApiError(403, "Only organizations can delete jobs.");
  }

  const job = await Job.findById(req.params.jobId);

  if (!job) {
    throw new ApiError(404, "Job not found.");
  }

  if (job.organizationId.toString() !== req.user.id) {
    throw new ApiError(403, "You can only delete your own jobs.");
  }

  const applicationCount = await Application.countDocuments({ jobId: job._id });

  if (applicationCount > 0) {
    throw new ApiError(
      400,
      "This job already has applications. Close the job instead so candidate records remain available."
    );
  }

  await job.deleteOne();

  return sendSuccess(res, {
    message: "Job deleted successfully."
  });
});

const applyToJob = asyncHandler(async (req, res) => {
  if (req.user.role !== "seeker") {
    throw new ApiError(403, "Only job seekers can apply to jobs.");
  }

  const [job, seeker] = await Promise.all([
    Job.findById(req.params.jobId),
    JobSeeker.findById(req.user.id)
  ]);

  if (!job) {
    throw new ApiError(404, "Job not found.");
  }

  if (!seeker) {
    throw new ApiError(404, "Job seeker not found.");
  }

  if (!job.isActive || job.status !== "Active") {
    throw new ApiError(400, "This job is not accepting applications.");
  }

  let application;
  let attachedResume = null;
  let resumeResult = null;
  let generatedTailoredResume = null;
  let resumeTextForScoring = "";
  let wasReapplied = false;

  if (req.file) {
    resumeTextForScoring = cleanText(await extractResumeText(req.file));

    if (!resumeTextForScoring || resumeTextForScoring.length < 80) {
      throw new ApiError(
        400,
        "Could not extract enough resume text to calculate ATS score. Upload a text-based PDF, DOCX, or TXT resume."
      );
    }

    const media = await uploadMediaDescriptor(req.file, "applications/resumes", {
      allowedTypes: ["document"],
      label: "Resume"
    });

    attachedResume = {
      media,
      originalName: req.file.originalname,
      uploadedAt: new Date(),
      source: "ManualUpload"
    };
  } else if (seeker.isPro) {
    resumeResult = await buildTailoredResumeForJob({
      seeker,
      job,
      source: "ManualApply"
    });

    if (resumeResult.ready) {
      generatedTailoredResume = resumeResult.tailoredResume;
      resumeTextForScoring = latexToPlainText(generatedTailoredResume.latex);
    }
  }

  if (!resumeTextForScoring || resumeTextForScoring.length < 80) {
    throw new ApiError(
      400,
      "Attach a resume before applying so the ATS score can be calculated from the submitted resume."
    );
  }

  const match = await scoreResumeAgainstJob(resumeTextForScoring, job);

  const existingApplication = await Application.findOne({
    jobId: job._id,
    jobSeekerId: seeker._id
  });

  try {
    if (existingApplication) {
      if (existingApplication.status !== "Withdrawn") {
        throw new ApiError(409, "You have already applied to this job.");
      }

      const previousResumePath = existingApplication.attachedResume?.media?.filePath;
      existingApplication.status = "Pending";
      existingApplication.atsScore = match.score;
      existingApplication.atsTag = match.tag;
      existingApplication.source = "Manual";
      existingApplication.verificationStatus = "Pending";
      existingApplication.withdrawnAt = undefined;
      existingApplication.reappliedAt = new Date();
      existingApplication.trustScore = 0;
      existingApplication.trustScoreTag = undefined;
      existingApplication.tailoredResume = generatedTailoredResume || undefined;
      existingApplication.attachedResume = attachedResume || undefined;
      await existingApplication.save();

      if (previousResumePath) {
        await safeDeleteStoredFiles([previousResumePath]).catch(() => null);
      }

      application = existingApplication;
      wasReapplied = true;
    } else {
      application = await Application.create({
        jobId: job._id,
        jobSeekerId: seeker._id,
        organizationId: job.organizationId,
        atsScore: match.score,
        atsTag: match.tag,
        source: "Manual",
        ...(attachedResume ? { attachedResume } : {}),
        ...(generatedTailoredResume ? { tailoredResume: generatedTailoredResume } : {})
      });
    }
  } catch (error) {
    if (attachedResume?.media) {
      await cleanupUploadedMedia([attachedResume.media]);
    }

    if (error instanceof ApiError) {
      throw error;
    }

    if (error && error.code === 11000) {
      throw new ApiError(409, "You have already applied to this job.");
    }
    throw error;
  }

  await createNotification({
    recipientId: job.organizationId,
    recipientRole: "organization",
    type: "job_application",
    title: wasReapplied ? "Application resubmitted" : "New application received",
    message: `${seeker.firstName} ${seeker.lastName} ${wasReapplied ? "resubmitted" : "applied for"} ${job.title}.`,
    metadata: { applicationId: application._id, jobId: job._id, reapplied: wasReapplied }
  });

  return sendSuccess(res, {
    message: wasReapplied ? "Application resubmitted successfully." : "Application submitted successfully.",
    application,
    ats: match,
    tailoredResume: resumeResult
  }, 201);
});

const getJobById = asyncHandler(async (req, res) => {
  const job = await Job.findById(req.params.jobId).lean();

  if (!job) {
    throw new ApiError(404, "Job not found.");
  }

  const organization = await Organization.findById(job.organizationId)
    .select("companyName industry headquartersLocation logo websiteUrl description companySize foundedYear")
    .lean();

  const jobWithOrganization = {
    ...job,
    organizationId: organization || job.organizationId
  };

  let alreadyApplied = false;
  let applicationStatus = null;

  if (req.user?.role === "seeker") {
    const existingApplication = await Application.findOne({
      jobId: job._id,
      jobSeekerId: req.user.id
    })
      .select("status")
      .lean();

    if (existingApplication) {
      alreadyApplied = existingApplication.status !== "Withdrawn";
      applicationStatus = existingApplication.status;
    }
  }

  return sendSuccess(res, {
    job: jobWithOrganization,
    alreadyApplied,
    applicationStatus
  });
});

const getJobApplications = asyncHandler(async (req, res) => {
  if (req.user.role !== "organization") {
    throw new ApiError(403, "Only organizations can view job applications.");
  }

  const job = await Job.findById(req.params.jobId).select("+embedding");

  if (!job) {
    throw new ApiError(404, "Job not found.");
  }

  if (job.organizationId.toString() !== req.user.id) {
    throw new ApiError(403, "You can only view applications for your own jobs.");
  }

  const applications = await Application.find({ jobId: job._id })
    .populate(
      "jobSeekerId",
      [
        "firstName",
        "lastName",
        "email",
        "tagline",
        "bio",
        "currentStatus",
        "skills",
        "preferredRoles",
        "openToWork",
        "portfolioUrl",
        "linkedinUrl",
        "githubUrl",
        "experience",
        "education"
      ].join(" ")
    )
    .sort({ atsScore: -1, createdAt: 1 });
  const rankedApplications = applications;
  const verificationRequests = await VerificationRequest.find({
    applicationId: { $in: rankedApplications.map((application) => application._id) }
  }).sort({ createdAt: -1 });
  const latestVerificationRequestByApplicationId = new Map();

  verificationRequests.forEach((verificationRequest) => {
    const applicationId = verificationRequest.applicationId.toString();

    if (!latestVerificationRequestByApplicationId.has(applicationId)) {
      latestVerificationRequestByApplicationId.set(applicationId, verificationRequest);
    }
  });

  return sendSuccess(res, {
    message: "Job applications fetched successfully.",
    applications: rankedApplications.map((application) =>
      toApplicationResponse(
        application,
        latestVerificationRequestByApplicationId.get(application._id.toString()) || null
      )
    )
  });
});

module.exports = {
  createJob,
  updateJob,
  getMyJobs,
  closeJob,
  publishJob,
  deleteJob,
  applyToJob,
  getJobById,
  getJobApplications
};
