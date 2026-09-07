const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");
const { fireAndForget, syncJobAiFields } = require("../services/aiSyncService");
const { buildTailoredResumeForJob } = require("../services/applicationResumeService");
const { latexToPlainText, scoreResumeAgainstJob } = require("../services/resumeScoringService");
// The same profile-vs-job scorer recommendationController.js uses for the /jobs "match %", so an
// application's stored atsScore and the number the seeker saw before applying are one value.
const { computeCandidateMatch } = require("../services/matchService");
const { cleanText, extractResumeText } = require("../utils/resumeTextExtractor");
const {
  cleanupUploadedMedia,
  safeDeleteStoredFiles,
  uploadMediaDescriptor
} = require("../utils/mediaStorage");
const {
  requireNonEmptyString,
  requireArrayOfStrings,
  requireArrayOfCustomFields,
  optionalString,
  normalizePagination
} = require("../utils/validation");

const Job = require("../models/Job");
const Application = require("../models/Application");
const JobSeeker = require("../models/JobSeeker");
const Organization = require("../models/Organization");
const OrganizationMember = require("../models/OrganizationMember");
const Follow = require("../models/Follow");
const VerificationRequest = require("../models/VerificationRequest");
const Interview = require("../models/Interview");
const { createNotification } = require("../services/notificationService");
const { attachOrganizationLogos } = require("../services/mediaUrlService");
const { runAutoApplyForJob } = require("../workers/autoApplyWorker");
const { runRecruiterIntroductionsForJob } = require("../workers/recruiterIntroductionWorker");

function toApplicationResponse(application, latestVerificationRequest, interview = null) {
  return {
    ...application.toObject(),
    /* The live interview for this application, if one is scheduled. Attached here rather than
       fetched per-row by the applicants page, which would be one request per candidate. Carries no
       googleEventId — that is an internal handle for addressing the event on Google, of no use to
       any client and not something to hand out. */
    interview: interview
      ? {
          _id: interview._id,
          startAt: interview.startAt,
          endAt: interview.endAt,
          timezone: interview.timezone,
          title: interview.title,
          meetLink: interview.meetLink,
          htmlLink: interview.htmlLink,
          status: interview.status
        }
      : null,
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

// Attaches a lightweight `postedBy` display object to each job with a postedByMemberId — jobs
// created before this feature or by a legacy session simply have no postedBy in the response,
// same as they had no attribution before. That null is load-bearing: the UI renders nothing at
// all about a person rather than inventing one.
//
// ONLY name/email/status are read off the member, and only name/email are ever returned. Nothing
// else about the record (its _id, role, or passwordHash) reaches a job payload.
//
// `includeStatus` is off by default: see the call site in getJobById for why a job seeker is not
// told that a named individual no longer works at the company.
async function attachPostedBy(jobs, { includeStatus = false } = {}) {
  const memberIds = [...new Set(jobs.map((job) => job.postedByMemberId).filter(Boolean).map(String))];

  if (!memberIds.length) {
    return jobs.map((job) => ({ ...job, postedBy: null }));
  }

  const members = await OrganizationMember.find({ _id: { $in: memberIds } })
    .select("firstName lastName email status");
  const memberById = new Map(members.map((member) => [member._id.toString(), member]));

  return jobs.map((job) => {
    const member = job.postedByMemberId ? memberById.get(String(job.postedByMemberId)) : null;

    if (!member) {
      return { ...job, postedBy: null };
    }

    // A removed teammate still posted this job — that historical fact stays true and their name
    // is kept. Their email is not: it is a personal address at a company they have left, so mail
    // to it bounces or goes unread, and publishing it as the live hiring contact is misleading.
    // The UI falls back to the organization when there is no email.
    const isDisabled = member.status === "Disabled";

    return {
      ...job,
      postedBy: {
        name: `${member.firstName || ""} ${member.lastName || ""}`.trim() || "Team member",
        email: isDisabled ? null : member.email || null,
        ...(includeStatus ? { status: member.status } : {})
      }
    };
  });
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
    let embeddingReady = false;

    try {
      await syncJobAiFields(job._id);
      embeddingReady = true;
      console.log(`[Auto-Apply] ✓ Embedding generated for job ${job._id}`);
    } catch (error) {
      console.error(`[Auto-Apply] ✗ Embedding failed for job ${job._id}:`, error?.message);
    }

    // Unchanged auto-apply behavior: a failed embedding still skips auto-apply entirely.
    if (embeddingReady) {
      const syncedJob = await Job.findById(job._id).select("autoApplyEnabled");
      console.log(`[Auto-Apply] Job ${job._id} autoApplyEnabled: ${syncedJob?.autoApplyEnabled}`);

      if (syncedJob?.autoApplyEnabled) {
        console.log(`[Auto-Apply] ✓ Triggering auto-apply for job ${job._id} (${job.title})`);
        const result = await runAutoApplyForJob(job._id, { source });
        console.log(`[Auto-Apply] ✓ Auto-apply completed. Applications created: ${result.applicationsCreated}`);
      } else {
        console.log(`[Auto-Apply] ✗ Auto-apply disabled for job ${job._id}`);
      }
    }

    // Introductions are a separate feature from auto-apply, so they are NOT gated on
    // job.autoApplyEnabled and run even when the embedding failed (the worker's candidate search
    // falls back to keyword matching and every guardrail still applies). Wrapped in its own
    // try/catch so a failure here can neither surface to the publish request — already impossible
    // inside fireAndForget — nor mask the auto-apply result above.
    try {
      const introRun = await runRecruiterIntroductionsForJob(job._id, { source });
      console.log(
        `[RecruiterIntro] Job ${job._id} — evaluated ${introRun.candidatesEvaluated}, introduced ${introRun.introductionsCreated}`
      );
    } catch (error) {
      console.error(`[RecruiterIntro] ✗ Introductions failed for job ${job._id}:`, error?.message);
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
    // The acting team member (see OrganizationMember) — not a form field, set automatically from
    // the session. Absent for legacy sessions issued before team accounts existed.
    postedByMemberId: req.user.memberId || undefined,
    location: optionalString(req.body.location),
    industry: optionalString(req.body.industry),
    type: req.body.type || undefined,
    salary: req.body.salary || undefined,
    requirements: req.body.requirements
      ? requireArrayOfStrings(req.body.requirements, "requirements", { max: 50 })
      : [],
    skills: req.body.skills ? requireArrayOfStrings(req.body.skills, "skills", { max: 50 }) : [],
    skillsRequired: req.body.skillsRequired
      ? requireArrayOfStrings(req.body.skillsRequired, "skillsRequired", { max: 50 })
      : [],
    customFields: req.body.customFields
      ? requireArrayOfCustomFields(req.body.customFields, "customFields", { max: 20 })
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
    ...(req.body.type !== undefined ? { type: req.body.type || undefined } : {}),
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
    ...(req.body.customFields !== undefined
      ? { customFields: requireArrayOfCustomFields(req.body.customFields, "customFields", { max: 20 }) }
      : {}),
    // Backfill only — a job that already has an original poster keeps that attribution even when
    // a different team member edits it later; only jobs with no attribution yet (created before
    // this feature, or by a legacy session) pick up the current editor.
    ...(!job.postedByMemberId && req.user.memberId ? { postedByMemberId: req.user.memberId } : {}),
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

  const jobsWithPostedBy = await attachPostedBy(jobs, { includeStatus: true });

  return sendSuccess(res, {
    message: "Recruiter jobs fetched successfully.",
    jobs: jobsWithPostedBy.map((job) => ({
      ...job,
      applicationCount: countByJobId.get(job._id.toString()) || 0
    })),
    avgTimeToFillDays
  });
});

// GET /api/jobs/mine/overview — a single cross-job summary for the recruiter Overview page.
// Composed from the same Job/Application/VerificationRequest data getMyJobs/getJobApplications
// already expose, just aggregated across every job this org owns instead of one job at a time —
// avoids the frontend firing one /jobs/:jobId/applications request per posting to build one page.
const getMyJobsOverview = asyncHandler(async (req, res) => {
  if (req.user.role !== "organization") {
    throw new ApiError(403, "Only organizations can view their jobs overview.");
  }

  const organizationId = req.user.id;
  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now - 14 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

  const jobs = await Job.find({ organizationId }).select("status createdAt").lean();
  const activePostings = jobs.filter((job) => job.status === "Active").length;
  const postingsThisWeek = jobs.filter((job) => new Date(job.createdAt) >= sevenDaysAgo).length;

  const [
    newApplicantsThisWeek,
    newApplicantsPrevWeek,
    funnelApplications,
    verificationReadyForReview,
    backgroundChecks
  ] = await Promise.all([
    Application.countDocuments({ organizationId, createdAt: { $gte: sevenDaysAgo } }),
    Application.countDocuments({
      organizationId,
      createdAt: { $gte: fourteenDaysAgo, $lt: sevenDaysAgo }
    }),
    Application.find({ organizationId, createdAt: { $gte: thirtyDaysAgo } })
      .select("status atsScore")
      .lean(),
    VerificationRequest.countDocuments({ organizationId, status: "Submitted" }),
    VerificationRequest.find({ organizationId })
      .sort({ requestedAt: -1 })
      .limit(5)
      .populate("jobSeekerId", "firstName lastName")
      .lean()
  ]);

  const newApplicantsChangePct =
    newApplicantsPrevWeek > 0
      ? Math.round(((newApplicantsThisWeek - newApplicantsPrevWeek) / newApplicantsPrevWeek) * 100)
      : newApplicantsThisWeek > 0
        ? 100
        : 0;

  const atsScoresLast30Days = funnelApplications
    .map((application) => application.atsScore)
    .filter((score) => typeof score === "number");
  const avgMatchLast30Days = atsScoresLast30Days.length
    ? Math.round(atsScoresLast30Days.reduce((sum, score) => sum + score, 0) / atsScoresLast30Days.length)
    : null;

  const funnel = {
    windowDays: 30,
    applied: funnelApplications.length,
    underReview: funnelApplications.filter((application) => application.status === "UnderReview").length,
    interview: funnelApplications.filter((application) => application.status === "Interview").length,
    offer: funnelApplications.filter((application) => application.status === "Accepted").length,
    rejectedOrWithdrawn: funnelApplications.filter((application) =>
      ["Rejected", "Withdrawn"].includes(application.status)
    ).length
  };

  const topCandidateApplications = await Application.find({
    organizationId,
    createdAt: { $gte: sevenDaysAgo }
  })
    .sort({ atsScore: -1, createdAt: 1 })
    .limit(5)
    .populate("jobId", "title")
    .populate("jobSeekerId", "firstName lastName tagline currentStatus skills locationPreferences")
    .lean();

  const topCandidateVerifications = await VerificationRequest.find({
    applicationId: { $in: topCandidateApplications.map((application) => application._id) }
  })
    .sort({ createdAt: -1 })
    .lean();
  const latestVerificationByApplicationId = new Map();
  topCandidateVerifications.forEach((verificationRequest) => {
    const applicationId = verificationRequest.applicationId.toString();
    if (!latestVerificationByApplicationId.has(applicationId)) {
      latestVerificationByApplicationId.set(applicationId, verificationRequest);
    }
  });

  const topCandidates = topCandidateApplications.map((application) => {
    const seeker = application.jobSeekerId || {};
    const verification = latestVerificationByApplicationId.get(application._id.toString());

    return {
      applicationId: application._id,
      name: `${seeker.firstName || ""} ${seeker.lastName || ""}`.trim() || "Unknown candidate",
      title: application.jobId?.title || seeker.currentStatus || "Applicant",
      location: seeker.locationPreferences?.[0] || "Not specified",
      skills: seeker.skills || [],
      atsScore: application.atsScore ?? 0,
      verificationStatus: verification?.status || "NotStarted"
    };
  });

  return sendSuccess(res, {
    message: "Recruiter overview fetched successfully.",
    overview: {
      activePostings,
      postingsThisWeek,
      newApplicantsThisWeek,
      newApplicantsChangePct,
      avgMatchLast30Days,
      funnel,
      topCandidates,
      verificationReadyForReview,
      backgroundChecks: backgroundChecks.map((verificationRequest) => ({
        id: verificationRequest._id,
        name:
          `${verificationRequest.jobSeekerId?.firstName || ""} ${verificationRequest.jobSeekerId?.lastName || ""}`.trim() ||
          "Unknown candidate",
        status: verificationRequest.status,
        requestedAt: verificationRequest.requestedAt,
        submittedAt: verificationRequest.submittedAt
      }))
    }
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

  /* TWO SCORES, TWO FIELDS — they are not interchangeable and this used to store only the first
     one, in the wrong column.

     resumeMatch is the submitted resume's TEXT against the job description. profileMatch is the
     seeker's structured PROFILE against the job — the identical call recommendationController.js
     makes for the "match %" on /jobs. Writing resumeMatch into atsScore is what made /applied
     disagree with /jobs on every row, and left resumeMatchScore (the field the model reserves for
     exactly this value) empty. */
  const resumeMatch = await scoreResumeAgainstJob(resumeTextForScoring, job);
  const profileMatch = computeCandidateMatch(seeker, job);

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
      existingApplication.atsScore = profileMatch.score;
      existingApplication.atsTag = profileMatch.tag;
      existingApplication.resumeMatchScore = resumeMatch.score;
      existingApplication.resumeMatchTag = resumeMatch.tag;
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
        atsScore: profileMatch.score,
        atsTag: profileMatch.tag,
        resumeMatchScore: resumeMatch.score,
        resumeMatchTag: resumeMatch.tag,
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
    /* `ats` used to be the resume-text match, because that was also what went into atsScore. Now
       that the two are separated, this response reports both under the names the document uses,
       so a client can tell which number is which instead of inferring it. */
    ats: profileMatch,
    resumeMatch,
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

  // Seeker-facing, so no `status`: whether a named person still works at the company is
  // their employment information, is not needed to render any state of the Posted by block
  // (the absence of an email is what the UI keys off), and every signed-in user sees this.
  const [jobWithPostedBy] = await attachPostedBy([job]);
  // Same dead public-object URL as the list endpoints — the detail page renders CompanyLogo too,
  // so without this the logo broke here as well.
  const [organizationWithLogo] = organization ? await attachOrganizationLogos([organization]) : [];
  const jobWithOrganization = {
    ...jobWithPostedBy,
    organizationId: organizationWithLogo || organization || job.organizationId
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
  // One query for every scheduled interview on this job, keyed by application — the recruiter's
  // list needs to show "Scheduled for…" beside the candidates that have one.
  const interviews = await Interview.find({
    applicationId: { $in: rankedApplications.map((application) => application._id) },
    status: "Scheduled"
  });
  const interviewByApplicationId = new Map(
    interviews.map((interview) => [interview.applicationId.toString(), interview])
  );
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
        latestVerificationRequestByApplicationId.get(application._id.toString()) || null,
        interviewByApplicationId.get(application._id.toString()) || null
      )
    )
  });
});

// Same local helper as jobSearchController/chatController use — kept local for consistency with
// them rather than refactoring three call sites in an unrelated change.
function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Total time actually spent working, in years, from JobSeeker.experience[].
//
// Overlapping roles are MERGED rather than summed: someone who held two concurrent positions for
// three years has three years of experience, not six. Returns null — never 0 — when no entry has a
// usable start date, so the UI can omit the figure instead of asserting "0y".
function computeYearsOfExperience(experience) {
  const now = Date.now();
  const intervals = (experience || [])
    .map((item) => {
      const start = item?.startDate ? new Date(item.startDate).getTime() : NaN;
      if (!Number.isFinite(start)) return null;

      const end = item?.isCurrent
        ? now
        : item?.endDate
          ? new Date(item.endDate).getTime()
          : NaN;

      if (!Number.isFinite(end) || end < start) return null;
      return [start, end];
    })
    .filter(Boolean)
    .sort((left, right) => left[0] - right[0]);

  if (!intervals.length) return null;

  let total = 0;
  let [currentStart, currentEnd] = intervals[0];

  for (let index = 1; index < intervals.length; index += 1) {
    const [start, end] = intervals[index];

    if (start <= currentEnd) {
      currentEnd = Math.max(currentEnd, end);
    } else {
      total += currentEnd - currentStart;
      currentStart = start;
      currentEnd = end;
    }
  }

  total += currentEnd - currentStart;
  return total / (1000 * 60 * 60 * 24 * 365.25);
}

// GET /api/jobs/mine/candidates — every PERSON who has applied to any of this organization's jobs,
// collapsed to one row each.
//
// This is deliberately not "applications": a candidate who applied to three of your postings is one
// row carrying their BEST match, not three rows. getJobApplications already answers the per-job
// question; nothing answered the cross-job, per-person one.
//
// SCOPE: the $match is pinned to this org's own job ids, so this endpoint can only ever return
// people who already appear in getJobApplications for one of those jobs. It widens no access.
const getMyCandidates = asyncHandler(async (req, res) => {
  if (req.user.role !== "organization") {
    throw new ApiError(403, "Only organizations can view their candidates.");
  }

  const { page, limit, skip } = normalizePagination(req.query);
  const search = String(req.query.q || "").trim();
  const orgJobIds = await Job.find({ organizationId: req.user.id }).distinct("_id");

  if (!orgJobIds.length) {
    return sendSuccess(res, {
      message: "Candidates fetched successfully.",
      candidates: [],
      summary: { total: 0, verified: 0, inInterview: 0, avgMatch: null },
      pagination: { page, limit, total: 0, totalPages: 1 }
    });
  }

  const searchStages = [];

  if (search) {
    const searchRegex = new RegExp(escapeRegex(search), "i");
    searchStages.push({
      $match: {
        $or: [
          { "seeker.firstName": searchRegex },
          { "seeker.lastName": searchRegex },
          { "seeker.tagline": searchRegex },
          { "seeker.skills": searchRegex },
          { "seeker.preferredRoles": searchRegex }
        ]
      }
    });
  }

  const [result] = await Application.aggregate([
    { $match: { jobId: { $in: orgJobIds } } },
    // Sorted before grouping so $first below really is the most recent application.
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: "$jobSeekerId",
        bestMatch: { $max: "$atsScore" },
        applicationCount: { $sum: 1 },
        lastAppliedAt: { $first: "$createdAt" },
        lastJobId: { $first: "$jobId" },
        verifiedCount: {
          $sum: { $cond: [{ $eq: ["$verificationStatus", "Verified"] }, 1, 0] }
        },
        interviewCount: {
          $sum: { $cond: [{ $eq: ["$status", "Interview"] }, 1, 0] }
        }
      }
    },
    {
      $lookup: {
        from: JobSeeker.collection.name,
        localField: "_id",
        foreignField: "_id",
        as: "seeker"
      }
    },
    { $unwind: "$seeker" },
    ...searchStages,
    {
      $lookup: {
        from: Job.collection.name,
        localField: "lastJobId",
        foreignField: "_id",
        as: "lastJob"
      }
    },
    { $unwind: { path: "$lastJob", preserveNullAndEmptyArrays: true } },
    {
      $facet: {
        // The KPI counts are computed over the WHOLE matched set, not the current page, so they
        // stay correct as the recruiter pages through or searches.
        summary: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              verified: { $sum: { $cond: [{ $gt: ["$verifiedCount", 0] }, 1, 0] } },
              inInterview: { $sum: { $cond: [{ $gt: ["$interviewCount", 0] }, 1, 0] } },
              avgMatch: { $avg: "$bestMatch" }
            }
          }
        ],
        rows: [
          { $sort: { bestMatch: -1, lastAppliedAt: -1 } },
          { $skip: skip },
          { $limit: limit },
          {
            // An explicit allow-list. The seeker document is never spread wholesale, so embedding,
            // hiddenRoles, phone and auto-apply internals cannot leak into a list response.
            $project: {
              _id: 0,
              seekerId: "$_id",
              firstName: "$seeker.firstName",
              lastName: "$seeker.lastName",
              tagline: "$seeker.tagline",
              skills: "$seeker.skills",
              skillGroups: "$seeker.skillGroups",
              experience: "$seeker.experience",
              bestMatch: 1,
              applicationCount: 1,
              lastAppliedAt: 1,
              lastJobId: 1,
              lastJobTitle: "$lastJob.title",
              verified: { $gt: ["$verifiedCount", 0] },
              inInterview: { $gt: ["$interviewCount", 0] }
            }
          }
        ]
      }
    }
  ]);

  const summary = result?.summary?.[0] || { total: 0, verified: 0, inInterview: 0, avgMatch: null };
  const rows = result?.rows || [];

  const candidates = rows.map((row) => {
    const flatSkills = (row.skills || []).length
      ? row.skills
      : (row.skillGroups || []).flatMap((group) => group.skills || []);

    return {
      seekerId: row.seekerId,
      firstName: row.firstName || "",
      lastName: row.lastName || "",
      tagline: row.tagline || "",
      skills: flatSkills.slice(0, 6),
      skillCount: flatSkills.length,
      // Derived from real dates; null when the seeker has no dated experience.
      yearsOfExperience: computeYearsOfExperience(row.experience),
      bestMatch: typeof row.bestMatch === "number" ? row.bestMatch : null,
      applicationCount: row.applicationCount,
      lastAppliedAt: row.lastAppliedAt,
      lastJobId: row.lastJobId,
      lastJobTitle: row.lastJobTitle || "",
      verified: Boolean(row.verified),
      inInterview: Boolean(row.inInterview)
    };
  });

  return sendSuccess(res, {
    message: "Candidates fetched successfully.",
    candidates,
    summary: {
      total: summary.total || 0,
      verified: summary.verified || 0,
      inInterview: summary.inInterview || 0,
      avgMatch: typeof summary.avgMatch === "number" ? summary.avgMatch : null
    },
    pagination: {
      page,
      limit,
      total: summary.total || 0,
      totalPages: Math.max(Math.ceil((summary.total || 0) / limit), 1)
    }
  });
});

module.exports = {
  createJob,
  updateJob,
  getMyJobs,
  getMyJobsOverview,
  getMyCandidates,
  closeJob,
  publishJob,
  deleteJob,
  applyToJob,
  getJobById,
  getJobApplications
};
