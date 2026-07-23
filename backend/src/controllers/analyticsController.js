const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");
const ApiError = require("../utils/ApiError");

const Application = require("../models/Application");
const Job = require("../models/Job");

const getSeekerAnalytics = asyncHandler(async (req, res) => {
  if (req.user.role !== "seeker") {
    throw new ApiError(403, "Only job seekers can view seeker analytics.");
  }

  const applications = await Application.find({ jobSeekerId: req.user.id });

  const summary = applications.reduce((accumulator, application) => {
    accumulator.totalApplications += 1;
    accumulator.byStatus[application.status] =
      (accumulator.byStatus[application.status] || 0) + 1;
    accumulator.averageAtsScore += application.atsScore || 0;
    return accumulator;
  }, {
    totalApplications: 0,
    averageAtsScore: 0,
    byStatus: {
      Pending: 0,
      UnderReview: 0,
      Accepted: 0,
      Rejected: 0,
      Withdrawn: 0
    }
  });

  if (summary.totalApplications > 0) {
    summary.averageAtsScore = Number(
      (summary.averageAtsScore / summary.totalApplications).toFixed(2)
    );
  }

  return sendSuccess(res, {
    message: "Seeker analytics fetched successfully.",
    analytics: summary
  });
});

const getOrganizationAnalytics = asyncHandler(async (req, res) => {
  if (req.user.role !== "organization") {
    throw new ApiError(403, "Only organizations can view recruiter analytics.");
  }

  const [jobs, applications] = await Promise.all([
    Job.find({ organizationId: req.user.id }).select("title status isActive createdAt"),
    Application.find({ organizationId: req.user.id }).select(
      "jobId status atsScore trustScore verificationStatus createdAt"
    )
  ]);
  const jobTitleById = new Map(jobs.map((job) => [job._id.toString(), job.title]));
  const applicationsByJobId = new Map();
  const summary = applications.reduce((accumulator, application) => {
    const jobId = application.jobId.toString();

    accumulator.totalApplications += 1;
    accumulator.byStatus[application.status] =
      (accumulator.byStatus[application.status] || 0) + 1;
    accumulator.byVerificationStatus[application.verificationStatus] =
      (accumulator.byVerificationStatus[application.verificationStatus] || 0) + 1;
    accumulator.averageAtsScore += application.atsScore || 0;
    accumulator.averageTrustScore += application.trustScore || 0;
    applicationsByJobId.set(jobId, (applicationsByJobId.get(jobId) || 0) + 1);
    return accumulator;
  }, {
    totalJobs: jobs.length,
    activeJobs: jobs.filter((job) => job.status === "Active" && job.isActive).length,
    closedJobs: jobs.filter((job) => job.status === "Closed" || !job.isActive).length,
    totalApplications: 0,
    averageApplicationsPerJob: 0,
    averageAtsScore: 0,
    averageTrustScore: 0,
    byStatus: {
      Pending: 0,
      UnderReview: 0,
      Accepted: 0,
      Rejected: 0,
      Withdrawn: 0
    },
    byVerificationStatus: {
      Pending: 0,
      InProgress: 0,
      Verified: 0
    },
    topJobs: []
  });

  if (summary.totalApplications > 0) {
    summary.averageAtsScore = Number(
      (summary.averageAtsScore / summary.totalApplications).toFixed(2)
    );
    summary.averageTrustScore = Number(
      (summary.averageTrustScore / summary.totalApplications).toFixed(2)
    );
  }

  if (summary.totalJobs > 0) {
    summary.averageApplicationsPerJob = Number(
      (summary.totalApplications / summary.totalJobs).toFixed(2)
    );
  }

  summary.topJobs = Array.from(applicationsByJobId.entries())
    .map(([jobId, applicationCount]) => ({
      jobId,
      title: jobTitleById.get(jobId) || "Unknown job",
      applicationCount
    }))
    .sort((left, right) => right.applicationCount - left.applicationCount)
    .slice(0, 5);

  return sendSuccess(res, {
    message: "Organization analytics fetched successfully.",
    analytics: summary
  });
});

module.exports = {
  getSeekerAnalytics,
  getOrganizationAnalytics
};
