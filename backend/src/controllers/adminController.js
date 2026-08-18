const JobSeeker = require("../models/JobSeeker");
const Organization = require("../models/Organization");
const Job = require("../models/Job");
const Application = require("../models/Application");
const SubscriptionPayment = require("../models/SubscriptionPayment");
const Post = require("../models/Post");
const Connection = require("../models/Connection");
const VerificationRequest = require("../models/VerificationRequest");
const { sendSuccess } = require("../utils/apiResponse");
const { requireNumberInRange } = require("../utils/validation");
const { fireAndForget } = require("../services/aiSyncService");
const ApiError = require("../utils/ApiError");
const {
  ALLOWED_TREND_WINDOW_DAYS,
  buildAdminTrends
} = require("../services/adminTrendsService");
const { runAutoApplyForJob } = require("../workers/autoApplyWorker");
const {
  getProAutoApplyPolicy,
  getProRecruiterIntroPolicy,
  updateProAutoApplyPolicy,
  updateProRecruiterIntroPolicy
} = require("../services/platformSettingsService");

function toCountMap(rows, key = "_id") {
  return rows.reduce((acc, row) => {
    acc[row[key] || "Unknown"] = row.count;
    return acc;
  }, {});
}

// An explicit allowlist check rather than requireNumberInRange: the accepted values are three
// discrete presets, not a continuous range, and each one selects a different set of aggregation
// bucket sizes. A range check would wave through 47 — a window the service has no preset for.
// Returns undefined for an omitted param so buildAdminTrends applies its own default and the
// endpoint behaves exactly as it did before this parameter existed.
function parseTrendWindowDays(rawValue) {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return undefined;
  }

  const windowDays = Number(rawValue);

  if (!Number.isInteger(windowDays) || !ALLOWED_TREND_WINDOW_DAYS.includes(windowDays)) {
    throw new ApiError(
      400,
      `windowDays must be one of: ${ALLOWED_TREND_WINDOW_DAYS.join(", ")}.`
    );
  }

  return windowDays;
}

async function getAdminOverview(req, res, next) {
  try {
    const windowDays = parseTrendWindowDays(req.query.windowDays);
    const [
      seekerCount,
      proSeekerCount,
      recruiterCount,
      recruiterStatusRows,
      jobCount,
      jobStatusRows,
      applicationCount,
      applicationStatusRows,
      verificationStatusRows,
      paymentCount,
      paidPaymentRows,
      postCount,
      connectionCount,
      recentSeekers,
      recentRecruiters,
      recentJobs,
      recentApplications,
      recentPayments,
      recentVerificationRequests,
      proAutoApplyPolicy,
      proRecruiterIntroPolicy,
      trends
    ] = await Promise.all([
      JobSeeker.countDocuments(),
      JobSeeker.countDocuments({ isPro: true }),
      Organization.countDocuments(),
      Organization.aggregate([
        { $group: { _id: "$verificationStatus", count: { $sum: 1 } } }
      ]),
      Job.countDocuments(),
      Job.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } }
      ]),
      Application.countDocuments(),
      Application.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } }
      ]),
      Application.aggregate([
        { $group: { _id: "$verificationStatus", count: { $sum: 1 } } }
      ]),
      SubscriptionPayment.countDocuments(),
      SubscriptionPayment.aggregate([
        { $match: { status: "Paid" } },
        {
          $group: {
            _id: "$currency",
            count: { $sum: 1 },
            revenue: { $sum: "$amount" }
          }
        }
      ]),
      Post.countDocuments(),
      Connection.countDocuments(),
      JobSeeker.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .select("firstName lastName username email isPro currentStatus openToWork createdAt")
        .lean(),
      Organization.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .select("companyName username email industry verificationStatus domainMatched createdAt")
        .lean(),
      Job.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .select("title organizationId location industry type status isActive createdAt")
        .populate("organizationId", "companyName username email verificationStatus")
        .lean(),
      Application.find()
        .sort({ createdAt: -1 })
        .limit(12)
        .select("jobId jobSeekerId organizationId status atsScore verificationStatus source createdAt")
        .populate("jobId", "title type status")
        .populate("jobSeekerId", "firstName lastName username email isPro")
        .populate("organizationId", "companyName username email")
        .lean(),
      SubscriptionPayment.find()
        .sort({ createdAt: -1 })
        .limit(8)
        .select("seekerId plan amount currency provider status paidAt expiresAt createdAt")
        .populate("seekerId", "firstName lastName username email")
        .lean(),
      VerificationRequest.find()
        .sort({ createdAt: -1 })
        .limit(8)
        .select("applicationId organizationId jobSeekerId managerEmail status requestedAt submittedAt reminderCount createdAt")
        .populate("organizationId", "companyName username email")
        .populate("jobSeekerId", "firstName lastName username email")
        .lean(),
      getProAutoApplyPolicy(),
      getProRecruiterIntroPolicy(),
      buildAdminTrends({ windowDays })
    ]);

    const recruiterStatuses = toCountMap(recruiterStatusRows);
    const jobStatuses = toCountMap(jobStatusRows);
    const applicationStatuses = toCountMap(applicationStatusRows);
    const verificationStatuses = toCountMap(verificationStatusRows);
    const paidPaymentSummary = paidPaymentRows.reduce(
      (acc, row) => {
        acc.count += row.count;
        acc.revenueByCurrency[row._id || "INR"] = row.revenue;
        return acc;
      },
      { count: 0, revenueByCurrency: {} }
    );

    // Per-candidate match/ATS/pipeline signals for the dashboard table. These live on Application
    // (atsScore, resumeMatchScore, status), NOT on JobSeeker, so they only exist for seekers who
    // have actually applied to something — the UI renders an em-dash for everyone else rather
    // than substituting a zero. One aggregation plus one title lookup for the whole page, never
    // a query per row.
    const recentSeekerIds = recentSeekers.map((seeker) => seeker._id);
    const latestApplicationRows = recentSeekerIds.length
      ? await Application.aggregate([
          { $match: { jobSeekerId: { $in: recentSeekerIds } } },
          { $sort: { createdAt: -1 } },
          {
            $group: {
              _id: "$jobSeekerId",
              applicationId: { $first: "$_id" },
              jobId: { $first: "$jobId" },
              status: { $first: "$status" },
              atsScore: { $first: "$atsScore" },
              atsTag: { $first: "$atsTag" },
              resumeMatchScore: { $first: "$resumeMatchScore" },
              source: { $first: "$source" },
              lastActivityAt: { $first: "$createdAt" },
              totalApplications: { $sum: 1 }
            }
          }
        ])
      : [];
    const signalJobIds = latestApplicationRows.map((row) => row.jobId).filter(Boolean);
    const signalJobs = signalJobIds.length
      ? await Job.find({ _id: { $in: signalJobIds } }).select("title location").lean()
      : [];
    const signalJobById = new Map(signalJobs.map((job) => [job._id.toString(), job]));
    const candidateSignals = latestApplicationRows.reduce((acc, row) => {
      const job = row.jobId ? signalJobById.get(row.jobId.toString()) : null;

      acc[row._id.toString()] = {
        applicationId: row.applicationId,
        targetRole: job?.title || null,
        targetLocation: job?.location || null,
        // The seeker-profile-vs-job composite that gated the application.
        matchScore: Number.isFinite(row.atsScore) ? row.atsScore : null,
        matchTag: row.atsTag || null,
        // The tailored resume's own score against the JD — a different formula, and null for
        // every application that never generated a tailored resume.
        resumeMatchScore: Number.isFinite(row.resumeMatchScore) ? row.resumeMatchScore : null,
        pipelineStatus: row.status || null,
        source: row.source || null,
        lastActivityAt: row.lastActivityAt || null,
        totalApplications: row.totalApplications || 0
      };

      return acc;
    }, {});

    return sendSuccess(res, {
      metrics: {
        seekers: seekerCount,
        proSeekers: proSeekerCount,
        normalSeekers: Math.max(seekerCount - proSeekerCount, 0),
        recruiters: recruiterCount,
        verifiedRecruiters: recruiterStatuses.Verified || 0,
        pendingRecruiters: recruiterStatuses.Pending || 0,
        onHoldRecruiters: recruiterStatuses.OnHold || 0,
        jobs: jobCount,
        activeJobs: jobStatuses.Active || 0,
        closedJobs: jobStatuses.Closed || 0,
        applications: applicationCount,
        pendingApplications: applicationStatuses.Pending || 0,
        underReviewApplications: applicationStatuses.UnderReview || 0,
        acceptedApplications: applicationStatuses.Accepted || 0,
        rejectedApplications: applicationStatuses.Rejected || 0,
        withdrawnApplications: applicationStatuses.Withdrawn || 0,
        verificationPending: verificationStatuses.Pending || 0,
        verificationInProgress: verificationStatuses.InProgress || 0,
        verificationVerified: verificationStatuses.Verified || 0,
        payments: paymentCount,
        paidPayments: paidPaymentSummary.count,
        revenueByCurrency: paidPaymentSummary.revenueByCurrency,
        posts: postCount,
        connections: connectionCount
      },
      seekers: recentSeekers,
      recruiters: recentRecruiters,
      jobs: recentJobs,
      applications: recentApplications,
      payments: recentPayments,
      verificationRequests: recentVerificationRequests,
      proAutoApplyPolicy,
      proRecruiterIntroPolicy,
      trends,
      candidateSignals
    });
  } catch (error) {
    return next(error);
  }
}

async function updateAdminProPolicy(req, res, next) {
  try {
    const matchThreshold = requireNumberInRange(req.body.matchThreshold, "matchThreshold", {
      min: 56,
      max: 100,
      integer: true
    });
    const maxDailyApplications = requireNumberInRange(
      req.body.maxDailyApplications,
      "maxDailyApplications",
      {
        min: 1,
        max: 50,
        integer: true
      }
    );

    const proAutoApplyPolicy = await updateProAutoApplyPolicy({
      enabled: req.body.enabled,
      matchThreshold,
      maxDailyApplications,
      updatedBy: req.user.id
    });

    return sendSuccess(res, {
      message: "Global Pro auto-apply policy updated successfully.",
      proAutoApplyPolicy
    });
  } catch (error) {
    return next(error);
  }
}

async function updateAdminRecruiterIntroPolicy(req, res, next) {
  try {
    // Each cap is optional: an omitted field keeps its current value (see
    // updateProRecruiterIntroPolicy), so a partial update can't silently reset a tightened limit
    // back to the default.
    const maxIntroductionsPerJobPerRecruiter =
      req.body.maxIntroductionsPerJobPerRecruiter === undefined
        ? undefined
        : requireNumberInRange(
            req.body.maxIntroductionsPerJobPerRecruiter,
            "maxIntroductionsPerJobPerRecruiter",
            { min: 1, max: 50, integer: true }
          );
    const maxIntroductionsPerRecruiterPerDay =
      req.body.maxIntroductionsPerRecruiterPerDay === undefined
        ? undefined
        : requireNumberInRange(
            req.body.maxIntroductionsPerRecruiterPerDay,
            "maxIntroductionsPerRecruiterPerDay",
            { min: 1, max: 100, integer: true }
          );
    const maxDailyIntroductionsPerSeeker =
      req.body.maxDailyIntroductionsPerSeeker === undefined
        ? undefined
        : requireNumberInRange(
            req.body.maxDailyIntroductionsPerSeeker,
            "maxDailyIntroductionsPerSeeker",
            { min: 1, max: 25, integer: true }
          );

    const proRecruiterIntroPolicy = await updateProRecruiterIntroPolicy({
      enabled: req.body.enabled,
      maxIntroductionsPerJobPerRecruiter,
      maxIntroductionsPerRecruiterPerDay,
      maxDailyIntroductionsPerSeeker,
      updatedBy: req.user.id
    });

    return sendSuccess(res, {
      message: "Global recruiter introduction policy updated successfully.",
      proRecruiterIntroPolicy
    });
  } catch (error) {
    return next(error);
  }
}

async function updateJobThreshold(req, res, next) {
  try {
    const { jobId, threshold } = req.body;

    if (!jobId) {
      return res.status(400).json({ message: "jobId is required" });
    }

    const thresholdValue = requireNumberInRange(threshold, "threshold", { min: 0, max: 100 });

    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    const previousThreshold = job.autoApplyThreshold;
    job.autoApplyThreshold = thresholdValue;
    await job.save();

    fireAndForget(async () => {
      if (job.autoApplyEnabled) {
        console.log(`[Admin] Threshold changed for job ${job._id} (${job.title}) from ${previousThreshold} to ${thresholdValue}. Re-running auto-apply...`);
        const result = await runAutoApplyForJob(job._id, { source: "admin_threshold_change" });
        console.log(`[Admin] Auto-apply re-run completed. Applications created: ${result.applicationsCreated}`);
      }
    }, "adminThresholdUpdate");

    return sendSuccess(res, {
      message: `Job threshold updated from ${previousThreshold} to ${thresholdValue}. Auto-apply is re-running with new threshold.`,
      job: {
        _id: job._id,
        title: job.title,
        previousThreshold,
        newThreshold: thresholdValue
      }
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getAdminOverview,
  updateAdminProPolicy,
  updateAdminRecruiterIntroPolicy,
  updateJobThreshold
};
