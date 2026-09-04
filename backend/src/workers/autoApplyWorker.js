const Job = require("../models/Job");
const JobSeeker = require("../models/JobSeeker");
const Application = require("../models/Application");
const Organization = require("../models/Organization");
const Follow = require("../models/Follow");
const ChatSession = require("../models/ChatSession");
const AutoApplyRun = require("../models/AutoApplyRun");
const { createNotification } = require("../services/notificationService");
const { buildTailoredResumeForJob } = require("../services/applicationResumeService");
const { latexToPlainText } = require("../services/resumeScoringService");
const { getProAutoApplyPolicy } = require("../services/platformSettingsService");
const {
  computeAutoApplyCompositeMatch,
  computeCandidateMatch,
  computeFinalAutoApplyScore,
  tagFromScore,
  cosineSimilarity,
  normalizeVectorScore
} = require("../services/matchService");
const { evaluateCandidateMatch } = require("../services/geminiService");
const { buildJobText, buildSeekerText } = require("../utils/textBuilders");

const BORDERLINE_WINDOW = 5;
const MAX_GEMINI_CALLS_PER_JOB = 20;
const EMBEDDING_LENGTH = 768;
// If a doc was created/updated more recently than this, a missing embedding is more likely a
// fire-and-forget generation race than a permanent failure — logged distinctly for diagnosis.
const EMBEDDING_RACE_WINDOW_MS = 5 * 60 * 1000;
// The Atlas Vector Search index this worker's candidate retrieval expects on
// jobseekers.embedding. Named once so the definition in docs/atlas-search-indexes.md, the warning
// text below, and the query all refer to the same thing.
const SEEKER_VECTOR_INDEX = "vector_index";

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

// The eligibility filter every candidate search starts from. Callers that want a different
// opt-in gate (e.g. the recruiter-introduction worker, which keys off
// autoApplyPreferences.autoIntroduceToRecruiters) pass their own; omitting it keeps the exact
// auto-apply behavior this module has always had.
const AUTO_APPLY_CANDIDATE_FILTER = {
  isPro: true,
  "autoApplyPreferences.enabled": true
};

function buildSkillFallbackQuery(job, candidateFilter = AUTO_APPLY_CANDIDATE_FILTER) {
  const tokens = [
    ...(job.hiddenRoles || []),
    ...(job.skillsRequired || []),
    ...(job.skills || []),
    job.title
  ].map(normalizeValue).filter(Boolean);

  if (!tokens.length) {
    return { ...candidateFilter };
  }

  const regexPatterns = tokens.map((token) => {
    const escaped = escapeRegexSpecialChars(token);
    return new RegExp(`^${escaped}$`, "i");
  });

  return {
    ...candidateFilter,
    $or: [
      { hiddenRoles: { $in: regexPatterns } },
      { skills: { $in: regexPatterns } },
      { "skillGroups.skills": { $in: regexPatterns } },
      { preferredRoles: { $in: regexPatterns } },
      { "autoApplyPreferences.rolePreferences": { $in: regexPatterns } }
    ]
  };
}

async function findCandidatesForJob(job, warnings, candidateFilter = AUTO_APPLY_CANDIDATE_FILTER) {
  if (Array.isArray(job.embedding) && job.embedding.length) {
    try {
      const rows = await JobSeeker.aggregate([
        {
          $vectorSearch: {
            index: SEEKER_VECTOR_INDEX,
            path: "embedding",
            queryVector: job.embedding,
            numCandidates: 500,
            limit: 200,
            // Atlas only honors paths declared as filter fields in the vector index definition. A
            // caller-supplied filter on a field that isn't declared makes Atlas reject the stage,
            // which lands in the catch below and falls back to the text query — callers must still
            // re-verify their own eligibility gate per candidate rather than trusting this filter.
            filter: candidateFilter
          }
        },
        {
          $addFields: {
            vectorScore: { $meta: "vectorSearchScore" }
          }
        }
      ]);

      if (rows.length) {
        return rows;
      }

      // An empty $vectorSearch result is a MISS, not an answer. When the index named above does
      // not exist, is still building, or has been dropped, Atlas returns zero rows and does NOT
      // throw — indistinguishable from "nobody is similar enough". Committing to that empty array
      // is what made every job-triggered run examine nobody while recording success. Fall through
      // to the keyword query instead, and record the degradation on the run so a missing index is
      // visible in the AutoApplyRun record rather than silent.
      warnings.push(
        `Vector seeker search returned no candidates; used text fallback. Verify the "${SEEKER_VECTOR_INDEX}" Atlas Vector Search index exists on jobseekers.embedding (see docs/atlas-search-indexes.md).`
      );
    } catch (error) {
      warnings.push(`Vector seeker search failed; used text fallback. ${error.message}`);
    }
  } else {
    warnings.push("Job embedding missing; used text-based skill fallback.");
  }

  const fallbackCandidates = await JobSeeker.find(buildSkillFallbackQuery(job, candidateFilter))
    .select("+hiddenRoles +embedding")
    .limit(200);

  // A run that evaluates nobody while opted-in seekers exist is a retrieval failure, not a quiet
  // "no matches" — the two are only distinguishable here, where both numbers are in hand. Without
  // this the run record is `warnings: [], ready: true, candidatesEvaluated: 0`, which reads as
  // success. Counted only when the fallback came back empty, so the normal path pays nothing.
  if (!fallbackCandidates.length) {
    const eligibleCount = await JobSeeker.countDocuments(candidateFilter).catch(() => null);

    if (eligibleCount) {
      warnings.push(
        `No candidates retrieved for job ${job._id} even though ${eligibleCount} opted-in seeker(s) exist — neither vector search nor the skill/role keyword fallback matched anyone.`
      );
    }
  }

  return fallbackCandidates;
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

async function attachResumeForAutoApply({ seeker, job, applicationPayload, warnings, vectorScore }) {
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

    // The single authoritative ATS score — computed once, now that real tailored-resume text
    // exists, blending the resume's own keyword/requirement match against the job with the same
    // vector similarity already computed for retrieval (threaded through as `vectorScore`, never
    // recomputed here). Everything upstream of this (computeAutoApplyCompositeMatch,
    // maybeRunGeminiScore) was only a cheap pre-filter deciding whether to spend this resume
    // generation call at all.
    const resumeText = latexToPlainText(resumeResult.tailoredResume.latex);
    const finalMatch = computeFinalAutoApplyScore(resumeText, job, { vectorScore });

    return {
      ready: true,
      tailoredResume: resumeResult.tailoredResume,
      score: finalMatch.score,
      tag: finalMatch.tag,
      resumeKeywordScore: finalMatch.reasoning.resumeKeywordScore,
      resumeKeywordTag: tagFromScore(finalMatch.reasoning.resumeKeywordScore)
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

      /* atsScore is the PROFILE-vs-job score and nothing else — the same computeCandidateMatch
         call the /jobs page makes, so /applied and /jobs show one number for a given pair. It is
         no longer overwritten further down: the pre-filter composite and the post-resume blend
         are gating signals, and gating signals now live in autoApplyDecision where they can be
         audited. The gate arithmetic below is unchanged; only where each value is STORED moved. */
      const profileMatch = computeCandidateMatch(seeker, job);

      const applicationPayload = {
        jobId: job._id,
        jobSeekerId: seeker._id,
        organizationId: job.organizationId,
        atsScore: profileMatch.score,
        atsTag: profileMatch.tag,
        source: "auto",
        autoApplyDecision: {
          // Provisional: correct for the default-resume fallback, where this pre-filter really is
          // the last gate. Replaced below when the post-resume blend runs.
          gateScore: match.score,
          gateTag: match.tag,
          threshold,
          prefilterScore: match.score,
          // Normalised to 0-100 like every other score on this document. Null stays null: it
          // means "no usable embedding on one side", never "similarity of zero".
          vectorScore: vectorScore === null || vectorScore === undefined ? null : normalizeVectorScore(vectorScore),
          gateSource:
            match.reasoning?.scoringSource === "gemini_borderline"
              ? "gemini_borderline"
              : "prefilter_composite",
          decidedAt: new Date()
        }
      };

      const resumeAttachment = await attachResumeForAutoApply({
        seeker,
        job,
        applicationPayload,
        warnings: runLog.warnings,
        vectorScore
      });

      if (!resumeAttachment.ready) {
        await releaseAutoApplySlot(seeker._id);
        incrementReason(runLog.skippedReasons, resumeAttachment.reason);
        continue;
      }

      if (resumeAttachment.tailoredResume) {
        // The blended resume-vs-job + vector-similarity score is the real, final gate — the
        // pre-resume composite score above only decided whether this candidate was worth
        // generating a resume for, not whether they actually clear the bar.
        if (resumeAttachment.score < threshold) {
          await releaseAutoApplySlot(seeker._id);
          incrementReason(runLog.skippedReasons, "belowThresholdAfterResume");
          continue;
        }

        applicationPayload.tailoredResume = resumeAttachment.tailoredResume;
        // atsScore is deliberately NOT touched here. resumeAttachment.score is the blended
        // resume+vector gate score, which belongs in autoApplyDecision.gateScore — writing it into
        // atsScore is exactly the overwrite the model's comment forbids.
        applicationPayload.resumeMatchScore = resumeAttachment.resumeKeywordScore ?? null;
        applicationPayload.resumeMatchTag = resumeAttachment.resumeKeywordTag ?? null;
        applicationPayload.autoApplyDecision.gateScore = resumeAttachment.score;
        applicationPayload.autoApplyDecision.gateTag = resumeAttachment.tag;
        applicationPayload.autoApplyDecision.gateSource = "final_resume_blend";
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
    // NOT the final score — compositeScore here is only the pre-resume pre-filter. The real,
    // authoritative finalScore is logged below, once a tailored resume actually exists.
    console.log(`[AutoApply] "${job.title}" — candidateScore: ${candidateMatch.score}, compositeScore (pre-filter): ${match.score}, threshold: ${threshold}`);

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

    // Same split as the batch path above: atsScore is the profile-vs-job score /jobs also shows,
    // and every gating signal is recorded in autoApplyDecision instead of overwriting it.
    // candidateMatch is already computed above for the log line.
    const applicationPayload = {
      jobId: job._id,
      jobSeekerId: seeker._id,
      organizationId: job.organizationId,
      atsScore: candidateMatch.score,
      atsTag: candidateMatch.tag,
      source: "auto",
      autoApplyDecision: {
        gateScore: match.score,
        gateTag: match.tag,
        threshold,
        prefilterScore: match.score,
        vectorScore: vectorScore === null || vectorScore === undefined ? null : normalizeVectorScore(vectorScore),
        gateSource:
          match.reasoning?.scoringSource === "gemini_borderline"
            ? "gemini_borderline"
            : "prefilter_composite",
        decidedAt: new Date()
      }
    };
    const warnings = [];
    let resumeAttachment = await attachResumeForAutoApply({
      seeker,
      job,
      applicationPayload,
      warnings,
      vectorScore
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
      // The blended resume-vs-job + vector-similarity score is the real, final gate — the
      // pre-resume composite score above only decided whether this candidate was worth
      // generating a resume for, not whether they actually clear the bar.
      if (resumeAttachment.score < threshold) {
        await releaseAutoApplySlot(seeker._id);
        console.log(`[AutoApply] Skipped "${job.title}" after resume generation — below threshold. finalScore: ${resumeAttachment.score}, threshold: ${threshold}`);
        results.push({
          ...baseResult,
          status: "skipped",
          reason: "belowThresholdAfterResume",
          score: resumeAttachment.score,
          tag: resumeAttachment.tag
        });
        continue;
      }

      applicationPayload.tailoredResume = resumeAttachment.tailoredResume;
      // See the batch path: the blended score is the GATE, not the ATS score.
      applicationPayload.resumeMatchScore = resumeAttachment.resumeKeywordScore ?? null;
      applicationPayload.resumeMatchTag = resumeAttachment.resumeKeywordTag ?? null;
      applicationPayload.autoApplyDecision.gateScore = resumeAttachment.score;
      applicationPayload.autoApplyDecision.gateTag = resumeAttachment.tag;
      applicationPayload.autoApplyDecision.gateSource = "final_resume_blend";
    }

    console.log(`[AutoApply] "${job.title}" — atsScore (profile): ${applicationPayload.atsScore}, prefilter: ${match.score}, gate: ${applicationPayload.autoApplyDecision.gateScore}, threshold: ${threshold}`);

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
  runAutoApplyForSeeker,
  // Exported so recruiterIntroductionWorker.js can run the identical candidate-selection and
  // guardrail logic instead of re-deriving it. Exporting changes nothing about how any of these
  // behave for the auto-apply paths above.
  AUTO_APPLY_CANDIDATE_FILTER,
  findCandidatesForJob,
  SEEKER_VECTOR_INDEX,
  computePairVectorScore,
  hasLocationMatch,
  hasSalaryMatch,
  isExcludedCompany,
  ensureRecruiterNetwork,
  buildParticipantKey,
  incrementReason
};
