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
const { runAutoApplyForJob } = require("../workers/autoApplyWorker");
const {
  getProAutoApplyPolicy,
  updateProAutoApplyPolicy
} = require("../services/platformSettingsService");

function toCountMap(rows, key = "_id") {
  return rows.reduce((acc, row) => {
    acc[row[key] || "Unknown"] = row.count;
    return acc;
  }, {});
}

async function getAdminOverview(req, res, next) {
  try {
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
      proAutoApplyPolicy
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
      getProAutoApplyPolicy()
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
      proAutoApplyPolicy
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
  updateJobThreshold
};
