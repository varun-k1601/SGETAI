const Job = require("../models/Job");
const JobSeeker = require("../models/JobSeeker");
const Application = require("../models/Application");
const Organization = require("../models/Organization");
const Follow = require("../models/Follow");
const ChatSession = require("../models/ChatSession");
const AutoApplyRun = require("../models/AutoApplyRun");
const { createNotification } = require("../services/notificationService");
const { buildTailoredResumeForJob } = require("../services/applicationResumeService");
const { latexToPlainText, scoreResumeAgainstJob } = require("../services/resumeScoringService");
const { getProAutoApplyPolicy } = require("../services/platformSettingsService");
const { computeAutoApplyCompositeMatch, computeCandidateMatch, tagFromScore, cosineSimilarity } = require("../services/matchService");
const { evaluateCandidateMatch } = require("../services/geminiService");
const { buildJobText, buildSeekerText } = require("../utils/textBuilders");

const BORDERLINE_WINDOW = 5;
const MAX_GEMINI_CALLS_PER_JOB = 20;
const EMBEDDING_LENGTH = 768;
// If a doc was created/updated more recently than this, a missing embedding is more likely a
// fire-and-forget generation race than a permanent failure — logged distinctly for diagnosis.
const EMBEDDING_RACE_WINDOW_MS = 5 * 60 * 1000;

function isValidEmbedding(embedding) {
  return Array.isArray(embedding) && embedding.length === EMBEDDING_LENGTH;
}

function describeMissingEmbedding(doc) {
  const updatedAt = doc?.updatedAt ? new Date(doc.updatedAt).getTime() : 0;
  const createdAt = doc?.createdAt ? new Date(doc.createdAt).getTime() : 0;
  const mostRecentChange = Math.max(updatedAt, createdAt);
  const isRecent = mostRecentChange && Date.now() - mostRecentChange <= EMBEDDING_RACE_WINDOW_MS;

  return isRecent
    ? "recently created/updated — embedding generation may still be in progress"
    : "no embedding found — generation may have failed or never run for this record";
}

// Computes a real, directly-comparable similarity score for this specific seeker+job pair
// instead of relying on Atlas's $vectorSearch ANN result (which is designed for "find top-K
// candidates from many," not "score this one pair," and silently zeroes out on any Atlas-side
// hiccup). Returns null — not 0 — when an embedding is missing on either side, so the caller can
// fall back to keyword-based scoring instead of treating "no data" as "no similarity".
function computePairVectorScore(seeker, job, warnings = []) {
  const seekerEmbeddingValid = isValidEmbedding(seeker?.embedding);
  const jobEmbeddingValid = isValidEmbedding(job?.embedding);

  if (!seekerEmbeddingValid || !jobEmbeddingValid) {
    if (!seekerEmbeddingValid) {
      warnings.push(
        `No embedding available for seeker ${seeker?._id} — using keyword fallback (${describeMissingEmbedding(seeker)}).`
      );
    }
    if (!jobEmbeddingValid) {
      warnings.push(
        `No embedding available for job ${job?._id} — using keyword fallback (${describeMissingEmbedding(job)}).`
      );
    }
    return null;
  }

  const similarity = cosineSimilarity(seeker.embedding, job.embedding);
  if (similarity === null) {
    warnings.push(
      `Cosine similarity could not be computed for seeker ${seeker?._id} / job ${job?._id} — using keyword fallback.`
    );
  }

  return similarity;
}

function normalizeValue(value) {
  return String(value || "").trim().toLowerCase();
}

function escapeRegexSpecialChars(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function incrementReason(skippedReasons, reason) {
  skippedReasons[reason] = (skippedReasons[reason] || 0) + 1;
}

function getPreferenceLocations(seeker) {
  return [
    ...(seeker.autoApplyPreferences?.preferredLocations || []),
    ...(seeker.autoApplyPreferences?.locationPreferences || [])
  ].filter(Boolean);
}

function hasLocationMatch(seeker, job) {
  const preferredLocations = getPreferenceLocations(seeker);

  if (!preferredLocations.length || !job.location) {
    return true;
  }

  const normalizedJobLocation = normalizeValue(job.location);
  return preferredLocations.some((location) => normalizeValue(location) === normalizedJobLocation);
}

function hasSalaryMatch(seeker, job) {
  const minSalary = Number(seeker.autoApplyPreferences?.minSalary);

  if (!Number.isFinite(minSalary) || minSalary <= 0) {
    return true;
  }

  if (!job.salary?.max && !job.salary?.min) {
    return true;
  }

  return Number(job.salary?.max || job.salary?.min || 0) >= minSalary;
}

function isExcludedCompany(seeker, job, organization) {
  const excludedCompanyTokens = [
    normalizeValue(job.organizationId),
    normalizeValue(organization?.companyName)
  ].filter(Boolean);
  const excludedCompanies = (seeker.autoApplyPreferences?.excludedCompanies || []).map((name) =>
    normalizeValue(name)
  );

  return excludedCompanies.some((company) => excludedCompanyTokens.includes(company));
}

function buildParticipantKey(a, b) {
  return [a, b].sort().join("|");
}

async function reserveAutoApplySlot(seekerId, maxDailyApplications) {
  return JobSeeker.findOneAndUpdate(
    {
      _id: seekerId,
      autoApplyCountToday: { $lt: maxDailyApplications }
    },
    {
      $inc: { autoApplyCountToday: 1 }
    },
    {
      new: true,
      projection: { _id: 1, autoApplyCountToday: 1 }
    }
  );
}

async function releaseAutoApplySlot(seekerId) {
  await JobSeeker.updateOne(
    {
      _id: seekerId,
      autoApplyCountToday: { $gt: 0 }
    },
    {
      $inc: { autoApplyCountToday: -1 }
    }
  );
}

async function ensureRecruiterNetwork(seeker, job) {
  const seekerKey = `seeker:${seeker._id}`;
  const organizationKey = `organization:${job.organizationId}`;

  await Promise.all([
    Follow.findOneAndUpdate(
      {
        jobSeekerId: seeker._id,
        organizationId: job.organizationId
      },
      {
        $setOnInsert: {
          jobSeekerId: seeker._id,
          organizationId: job.organizationId,
          notificationPreferences: { notifyJobs: true }
        }
      },
      { upsert: true, new: true }
    ),
    ChatSession.findOneAndUpdate(
      {
        participantKey: buildParticipantKey(seekerKey, organizationKey)
      },
      {
        $setOnInsert: {
          participants: [
            { userId: seeker._id, role: "seeker" },
            { userId: job.organizationId, role: "organization" }
          ],
          participantKey: buildParticipantKey(seekerKey, organizationKey),
          initiatedBy: seeker._id
        }
      },
      { upsert: true, new: true }
    )
  ]);
}

function buildSkillFallbackQuery(job) {
  const tokens = [
    ...(job.hiddenRoles || []),
    ...(job.skillsRequired || []),
    ...(job.skills || []),
    job.title
  ].map(normalizeValue).filter(Boolean);

  if (!tokens.length) {
    return {
      isPro: true,
      "autoApplyPreferences.enabled": true
    };
  }

  const regexPatterns = tokens.map((token) => {
    const escaped = escapeRegexSpecialChars(token);
    return new RegExp(`^${escaped}$`, "i");
  });

  return {
    isPro: true,
    "autoApplyPreferences.enabled": true,
    $or: [
      { hiddenRoles: { $in: regexPatterns } },
      { skills: { $in: regexPatterns } },
      { "skillGroups.skills": { $in: regexPatterns } },
      { preferredRoles: { $in: regexPatterns } },
      { "autoApplyPreferences.rolePreferences": { $in: regexPatterns } }
    ]
  };
}

async function findCandidatesForJob(job, warnings) {
  if (Array.isArray(job.embedding) && job.embedding.length) {
    try {
      const rows = await JobSeeker.aggregate([
        {
          $vectorSearch: {
            index: "vector_index",
            path: "embedding",
            queryVector: job.embedding,
            numCandidates: 500,
            limit: 200,
            filter: {
              isPro: true,
              "autoApplyPreferences.enabled": true
            }
          }
        },
        {
          $addFields: {
            vectorScore: { $meta: "vectorSearchScore" }
          }
        }
      ]);

      return rows;
    } catch (error) {
      warnings.push(`Vector seeker search failed; used text fallback. ${error.message}`);
    }
  } else {
    warnings.push("Job embedding missing; used text-based skill fallback.");
  }

  return JobSeeker.find(buildSkillFallbackQuery(job))
    .select("+hiddenRoles +embedding")
    .limit(200);
}

async function getExistingApplicationIds(jobId, seekerIds) {
  const applications = await Application.find({
    jobId,
    jobSeekerId: { $in: seekerIds }
  }).select("jobSeekerId");

  return new Set(applications.map((application) => application.jobSeekerId.toString()));
}

function isBorderline(score, threshold) {
  return Math.abs(Number(score) - Number(threshold)) <= BORDERLINE_WINDOW;
}

async function maybeRunGeminiScore({ seeker, job, match, threshold, useAIScoring, geminiState }) {
  if (!useAIScoring || !isBorderline(match.score, threshold)) {
    return match;
  }

  if (geminiState.calls >= MAX_GEMINI_CALLS_PER_JOB) {
    return match;
  }

  geminiState.calls += 1;

  try {
    const aiMatch = await evaluateCandidateMatch(buildSeekerText(seeker), buildJobText(job), {
      seeker,
      job
    });

    if (!aiMatch || !Number.isFinite(Number(aiMatch.score))) {
      geminiState.failures += 1;
      return match;
    }

    return {
      ...match,
      score: aiMatch.score,
      tag: aiMatch.tag || tagFromScore(aiMatch.score),
      reasoning: {
        ...(match.reasoning || {}),
        aiReasoning: aiMatch.reasoning || null,
        scoringSource: "gemini_borderline"
      }
    };
  } catch (error) {
    geminiState.failures += 1;
    return match;
  }
}

async function attachResumeForAutoApply({ seeker, job, applicationPayload, warnings }) {
  try {
    const resumeResult = await buildTailoredResumeForJob({
      seeker,
      job,
      source: "AutoApply"
    });

    if (!resumeResult.ready) {
      warnings.push(`Auto-apply for job ${job._id}: Profile incomplete for tailored resume generation (${resumeResult.reason}). Attempting to use default resume.`);

      if (seeker.defaultResume?.media?.filePath) {
        applicationPayload.attachedResume = {
          media: seeker.defaultResume.media,
          originalName: seeker.defaultResume.originalName,
          uploadedAt: seeker.defaultResume.uploadedAt || new Date(),
          source: "ManualUpload"
        };
        return { ready: true };
      }

      return {
        ready: false,
        reason: "profile_incomplete_and_no_default_resume"
      };
    }

    const resumeMatch = await scoreResumeAgainstJob(
      latexToPlainText(resumeResult.tailoredResume.latex),
      job
    );

    return {
      ready: true,
      tailoredResume: resumeResult.tailoredResume,
      score: resumeMatch.score,
      tag: resumeMatch.tag
    };
  } catch (error) {
    warnings.push(`Auto-apply for job ${job._id}: Error generating tailored resume: ${error.message}. Attempting fallback to default resume.`);

    if (seeker.defaultResume?.media?.filePath) {
      applicationPayload.attachedResume = {
        media: seeker.defaultResume.media,
        originalName: seeker.defaultResume.originalName,
        uploadedAt: seeker.defaultResume.uploadedAt || new Date(),
        source: "ManualUpload"
      };
      return { ready: true };
    }

    return {
      ready: false,
      reason: "tailored_resume_generation_failed"
    };
  }
}

async function runAutoApplyForJob(jobId, options = {}) {
  const runLog = {
    jobId,
    source: options.source || "job_created",
    ranAt: new Date(),
    ready: false,
    candidatesEvaluated: 0,
    applicationsCreated: 0,
    appliedSeekerIds: [],
    skippedReasons: {},
    warnings: [],
    errors: []
  };

  try {
    const job = await Job.findById(jobId).select("+hiddenRoles +embedding");
    if (!job || !job.isActive || job.status !== "Active") {
      incrementReason(runLog.skippedReasons, "job_inactive_or_missing");
      await AutoApplyRun.create(runLog);
      return runLog;
    }

    if (!job.autoApplyEnabled) {
      incrementReason(runLog.skippedReasons, "job_auto_apply_disabled");
      await AutoApplyRun.create(runLog);
      return runLog;
    }

    const platformPolicy = await getProAutoApplyPolicy();
    if (platformPolicy.enabled === false) {
      incrementReason(runLog.skippedReasons, "platform_auto_apply_disabled");
      await AutoApplyRun.create(runLog);
      return runLog;
    }

    const organization = await Organization.findById(job.organizationId).select("companyName");
    const threshold = Number(job.autoApplyThreshold ?? platformPolicy.matchThreshold ?? 70);
    const candidates = await findCandidatesForJob(job, runLog.warnings);
    const seekerIds = candidates.map((candidate) => candidate._id);
    const existingApplicationIds = await getExistingApplicationIds(job._id, seekerIds);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    let jobApplicationsToday = await Application.countDocuments({
      jobId: job._id,
      source: { $in: ["auto", "AutoApply"] },
      createdAt: { $gte: startOfDay }
    });
    const geminiState = { calls: 0, failures: 0 };

    runLog.ready = true;
    runLog.candidatesEvaluated = candidates.length;

    for (const seeker of candidates) {
      const freshJob = await Job.findById(job._id).select("isActive status autoApplyEnabled autoApplyDailyCap");
      if (!freshJob || !freshJob.isActive || freshJob.status !== "Active") {
        incrementReason(runLog.skippedReasons, "job_closed_during_run");
        break;
      }

      if (freshJob.autoApplyDailyCap && jobApplicationsToday >= freshJob.autoApplyDailyCap) {
        incrementReason(runLog.skippedReasons, "job_daily_cap_reached");
        break;
      }

      if (existingApplicationIds.has(seeker._id.toString())) {
        incrementReason(runLog.skippedReasons, "alreadyApplied");
        continue;
      }

      if ((seeker.autoApplyCountToday || 0) >= platformPolicy.maxDailyApplications) {
        incrementReason(runLog.skippedReasons, "quotaExhausted");
        continue;
      }

      if (seeker.autoApplyPreferences?.safetyGuardrailsEnabled) {
        if (!hasLocationMatch(seeker, job)) {
          incrementReason(runLog.skippedReasons, "locationMismatch");
          continue;
        }

        if (!hasSalaryMatch(seeker, job)) {
          incrementReason(runLog.skippedReasons, "salaryMismatch");
          continue;
        }

        if (isExcludedCompany(seeker, job, organization)) {
          incrementReason(runLog.skippedReasons, "companyExcluded");
          continue;
        }
      }

      const vectorScore = computePairVectorScore(seeker, job, runLog.warnings);
      let match = computeAutoApplyCompositeMatch(seeker, job, { vectorScore });

      match = await maybeRunGeminiScore({
        seeker,
        job,
        match,
        threshold,
        useAIScoring: job.autoApplyUseAIScoring,
        geminiState
      });

      if (match.score < threshold) {
        incrementReason(runLog.skippedReasons, "belowThreshold");
        continue;
      }

      const slotReservation = await reserveAutoApplySlot(
        seeker._id,
        platformPolicy.maxDailyApplications
      );

      if (!slotReservation) {
        incrementReason(runLog.skippedReasons, "quotaExhausted");
        continue;
      }

      const applicationPayload = {
        jobId: job._id,
        jobSeekerId: seeker._id,
        organizationId: job.organizationId,
        atsScore: match.score,
        atsTag: match.tag,
        source: "auto"
      };

      const resumeAttachment = await attachResumeForAutoApply({
        seeker,
        job,
        applicationPayload,
        warnings: runLog.warnings
      });

      if (!resumeAttachment.ready) {
        await releaseAutoApplySlot(seeker._id);
        incrementReason(runLog.skippedReasons, resumeAttachment.reason);
        continue;
      }

      if (resumeAttachment.tailoredResume) {
        applicationPayload.tailoredResume = resumeAttachment.tailoredResume;
        applicationPayload.resumeMatchScore = resumeAttachment.score ?? null;
        applicationPayload.resumeMatchTag = resumeAttachment.tag ?? null;
      }

      try {
        const application = await Application.create(applicationPayload);

        await Promise.all([
          ensureRecruiterNetwork(seeker, job),
          createNotification({
            recipientId: seeker._id,
            recipientRole: "seeker",
            type: "auto_apply_success",
            title: "Auto-apply submitted",
            message: `We auto-applied you to ${job.title}.`,
            metadata: { applicationId: application._id, jobId: job._id }
          }),
          createNotification({
            recipientId: job.organizationId,
            recipientRole: "organization",
            type: "job_application",
            title: "New auto-apply candidate",
            message: `${seeker.firstName} ${seeker.lastName} was auto-applied to ${job.title}.`,
            metadata: { applicationId: application._id, jobId: job._id, autoApplied: true }
          })
        ]);

        runLog.applicationsCreated += 1;
        runLog.appliedSeekerIds.push(seeker._id);
        jobApplicationsToday += 1;
      } catch (error) {
        await releaseAutoApplySlot(seeker._id);

        if (error.code === 11000) {
          incrementReason(runLog.skippedReasons, "alreadyApplied");
          continue;
        }

        runLog.errors.push(error.message);
      }
    }

    if (geminiState.failures) {
      runLog.skippedReasons.geminiFailed = geminiState.failures;
    }

    await AutoApplyRun.create(runLog);
    return runLog;
  } catch (error) {
    runLog.errors.push(error.message);
    await AutoApplyRun.create(runLog).catch(() => null);
    return runLog;
  }
}

async function runAutoApplyForSeeker(seekerId) {
  const seeker = await JobSeeker.findById(seekerId).select("+hiddenRoles +embedding");
  const platformPolicy = await getProAutoApplyPolicy();

  if (!seeker) {
    return {
      ready: false,
      reason: "seeker_not_found",
      jobsChecked: 0,
      matchingJobs: 0,
      applicationsCreated: 0,
      results: []
    };
  }

  const readiness = {
    isPro: Boolean(seeker.isPro),
    enabled: Boolean(seeker.autoApplyPreferences?.enabled),
    platformEnabled: platformPolicy.enabled !== false,
    hasDailyCapacity:
      (seeker.autoApplyCountToday || 0) < platformPolicy.maxDailyApplications
  };
  const ready = Object.values(readiness).every(Boolean);

  if (!ready) {
    return {
      ready,
      readiness,
      reason: "not_ready",
      jobsChecked: 0,
      matchingJobs: 0,
      applicationsCreated: 0,
      platformPolicy,
      results: []
    };
  }

  const jobs = await Job.find({
    isActive: true,
    status: "Active",
    autoApplyEnabled: true
  }).select("+hiddenRoles +embedding").sort({ createdAt: -1 }).limit(100);

  console.log(`[AutoApply] Seeker ${seekerId} — found ${jobs.length} autoApplyEnabled jobs`);

  let applicationsCreated = 0;
  const results = [];

  for (const job of jobs) {
    const organization = await Organization.findById(job.organizationId).select("companyName");
    const baseResult = {
      jobId: job._id,
      title: job.title,
      companyName: organization?.companyName || "Organization",
      matchedHiddenRoles: (job.hiddenRoles || []).filter((role) =>
        (seeker.hiddenRoles || []).map(normalizeValue).includes(normalizeValue(role))
      )
    };
    const threshold = Number(
      job.autoApplyEnabled
        ? job.autoApplyThreshold ?? platformPolicy.matchThreshold ?? 70
        : platformPolicy.matchThreshold ?? 70
    );

    if (seeker.autoApplyPreferences?.safetyGuardrailsEnabled) {
      if (!hasLocationMatch(seeker, job)) {
        console.log(`[AutoApply Debug] Skipped "${job.title}" — location not matched. Job: ${job.location}, Seeker prefs: ${JSON.stringify(getPreferenceLocations(seeker))}`);
        results.push({ ...baseResult, status: "skipped", reason: "location_not_matched" });
        continue;
      }

      if (!hasSalaryMatch(seeker, job)) {
        console.log(`[AutoApply Debug] Skipped "${job.title}" — salary not matched. Job max: ${job.salary?.max}, Seeker min: ${seeker.autoApplyPreferences?.minSalary}`);
        results.push({ ...baseResult, status: "skipped", reason: "salary_not_matched" });
        continue;
      }

      if (isExcludedCompany(seeker, job, organization)) {
        console.log(`[AutoApply Debug] Skipped "${job.title}" — company excluded`);
        results.push({ ...baseResult, status: "skipped", reason: "company_excluded" });
        continue;
      }
    }

    const existingApplication = await Application.findOne({
      jobId: job._id,
      jobSeekerId: seeker._id
    });

    if (existingApplication) {
      console.log(`[AutoApply Debug] Skipped "${job.title}" — already applied`);
      results.push({ ...baseResult, status: "skipped", reason: "already_applied" });
      continue;
    }

    // Only compute the pair's vectorScore here — do NOT also max the result against a
    // separately-computed candidateMatch.score. computeAutoApplyCompositeMatch already applies
    // the correct max-vs-keyword fallback internally ONLY when no vector score is available;
    // re-applying Math.max at this call site would silently let a pure-keyword score override a
    // trustworthy, semantically-dominant vector composite, undoing that logic.
    const vectorWarnings = [];
    const vectorScore = computePairVectorScore(seeker, job, vectorWarnings);
    vectorWarnings.forEach((warning) => console.log(`[AutoApply Debug] ${warning}`));
    const candidateMatch = computeCandidateMatch(seeker, job);
    const match = computeAutoApplyCompositeMatch(seeker, job, { vectorScore });
    console.log(`[AutoApply] "${job.title}" — candidateScore: ${candidateMatch.score}, compositeScore: ${match.score}, finalScore: ${match.score}, threshold: ${threshold}`);

    if (match.score < threshold) {
      console.log(`[AutoApply Debug] Skipped "${job.title}" — below threshold. Score: ${match.score}, Threshold: ${threshold}, autoApplyEnabled: ${job.autoApplyEnabled}`);
      results.push({
        ...baseResult,
        status: "skipped",
        reason: "below_threshold",
        score: match.score,
        tag: match.tag
      });
      continue;
    }

    const slotReservation = await reserveAutoApplySlot(
      seeker._id,
      platformPolicy.maxDailyApplications
    );

    if (!slotReservation) {
      results.push({ ...baseResult, status: "skipped", reason: "daily_limit_reached" });
      continue;
    }

    const applicationPayload = {
      jobId: job._id,
      jobSeekerId: seeker._id,
      organizationId: job.organizationId,
      atsScore: match.score,
      atsTag: match.tag,
      source: "auto"
    };
    const warnings = [];
    let resumeAttachment = await attachResumeForAutoApply({
      seeker,
      job,
      applicationPayload,
      warnings
    });

    if (!resumeAttachment.ready) {
      console.log(`[AutoApply] Tailored resume not ready for "${job.title}" — reason: ${resumeAttachment.reason}. Trying defaultResume fallback.`);

      if (seeker.defaultResume?.media?.filePath) {
        applicationPayload.attachedResume = {
          media: seeker.defaultResume.media,
          originalName: seeker.defaultResume.originalName,
          uploadedAt: seeker.defaultResume.uploadedAt || new Date(),
          source: "ManualUpload"
        };
        resumeAttachment = { ready: true };
        console.log(`[AutoApply] Using defaultResume fallback for "${job.title}"`);
      } else {
        await releaseAutoApplySlot(seeker._id);
        console.log(`[AutoApply] No resume available for "${job.title}" — skipping`);
        results.push({
          ...baseResult,
          status: "skipped",
          reason: resumeAttachment.reason
        });
        continue;
      }
    }

    if (resumeAttachment.tailoredResume) {
      applicationPayload.tailoredResume = resumeAttachment.tailoredResume;
      applicationPayload.resumeMatchScore = resumeAttachment.score ?? null;
      applicationPayload.resumeMatchTag = resumeAttachment.tag ?? null;
    }

    try {
      const application = await Application.create(applicationPayload);

      await Promise.all([
        ensureRecruiterNetwork(seeker, job),
        createNotification({
          recipientId: seeker._id,
          recipientRole: "seeker",
          type: "auto_apply_success",
          title: "Auto-apply submitted",
          message: `We auto-applied you to ${job.title}.`,
          metadata: { applicationId: application._id, jobId: job._id }
        }),
        createNotification({
          recipientId: job.organizationId,
          recipientRole: "organization",
          type: "job_application",
          title: "New auto-apply candidate",
          message: `${seeker.firstName} ${seeker.lastName} was auto-applied to ${job.title}.`,
          metadata: { applicationId: application._id, jobId: job._id, autoApplied: true }
        })
      ]);

      applicationsCreated += 1;
      results.push({
        ...baseResult,
        status: "applied",
        applicationId: application._id,
        score: applicationPayload.atsScore,
        tag: applicationPayload.atsTag,
        networked: true
      });
    } catch (error) {
      await releaseAutoApplySlot(seeker._id);

      if (error.code === 11000) {
        results.push({ ...baseResult, status: "skipped", reason: "already_applied" });
        continue;
      }

      throw error;
    }
  }

  return {
    ready,
    readiness,
    jobsChecked: jobs.length,
    matchingJobs: results.filter((result) => result.matchedHiddenRoles?.length).length,
    applicationsCreated,
    platformPolicy,
    results
  };
}

module.exports = {
  runAutoApplyForJob,
  runAutoApplyForSeeker
};
