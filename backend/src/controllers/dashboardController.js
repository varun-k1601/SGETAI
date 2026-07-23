const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");
const ApiError = require("../utils/ApiError");
const JobSeeker = require("../models/JobSeeker");
const Job = require("../models/Job");
const Application = require("../models/Application");
const Organization = require("../models/Organization");
const Post = require("../models/Post");

// Helper: Calculate profile completion percentage
function calculateProfileCompletion(seeker) {
  let completionScore = 0;
  let totalFields = 10;

  if (seeker.firstName && seeker.lastName) completionScore += 1;
  if (seeker.profilePicture) completionScore += 1;
  if (seeker.headline) completionScore += 1;
  if (seeker.bio) completionScore += 1;
  if (seeker.location) completionScore += 1;
  if (seeker.skills && seeker.skills.length > 0) completionScore += 1;
  if (seeker.preferredRoles && seeker.preferredRoles.length > 0) completionScore += 1;
  if (seeker.experience && seeker.experience.length > 0) completionScore += 1;
  if (seeker.education && seeker.education.length > 0) completionScore += 1;
  if (seeker.resume) completionScore += 1;

  return Math.round((completionScore / totalFields) * 100);
}

// Helper: Format activity feed item
function formatActivityFeedItem(application, index) {
  return {
    id: application._id?.toString() || `activity-${index}`,
    type: "application",
    timestamp: application.createdAt || new Date(),
    metadata: {
      jobTitle: application.jobTitle || "Unknown Job",
      companyName: application.organizationName || "Unknown Company",
      status: application.status || "Pending"
    },
    status: application.status === "Accepted" ? "success" : "pending"
  };
}

// Helper: Get trending metric (mock for now - would come from analytics service)
function calculateTrend() {
  return Math.floor(Math.random() * 20) - 10;
}

// GET /api/dashboard/normal - Normal tier dashboard
const getNormalDashboard = asyncHandler(async (req, res) => {
  if (req.user.role !== "seeker") {
    throw new ApiError(403, "Only job seekers can access the normal dashboard.");
  }

  const seekerId = req.user.id;

  // Fetch seeker profile
  const seeker = await JobSeeker.findById(seekerId)
    .select("firstName lastName headline bio location skills profileViews embedding preferredRoles")
    .lean();

  if (!seeker) {
    throw new ApiError(404, "Job seeker profile not found.");
  }

  // Calculate profile completion
  const profileCompletion = {
    percentage: calculateProfileCompletion(seeker),
    profileViews: seeker.profileViews || 0,
    viewsTrend: calculateTrend()
  };

  // Get job matches (recommendations)
  let jobMatches = [];
  try {
    if (Array.isArray(seeker.embedding) && seeker.embedding.length) {
      const jobs = await Job.aggregate([
        {
          $vectorSearch: {
            index: "vector_index",
            path: "embedding",
            queryVector: seeker.embedding,
            numCandidates: 50,
            limit: 6
          }
        },
        {
          $project: {
            title: 1,
            description: 1,
            salary: 1,
            location: 1,
            skills: 1,
            skillsRequired: 1,
            organizationId: 1,
            status: 1,
            createdAt: 1
          }
        }
      ]);

      // Attach organization details
      const orgIds = [...new Set(jobs.map(j => j.organizationId).filter(Boolean))];
      const orgs = await Organization.find({ _id: { $in: orgIds } })
        .select("companyName").lean();
      const orgMap = new Map(orgs.map(o => [o._id.toString(), o]));

      jobMatches = jobs.slice(0, 6).map(job => ({
        id: job._id?.toString(),
        title: job.title,
        company: orgMap.get(job.organizationId?.toString())?.companyName || "Unknown",
        location: job.location || "Remote",
        salary: job.salary || { min: 0, max: 0 },
        matchPercentage: Math.floor(Math.random() * 40) + 60,
        skills: job.skills || job.skillsRequired || []
      }));
    } else {
      // Fallback: get latest jobs
      const jobs = await Job.find({ status: "Active" })
        .select("title description salary location skills skillsRequired organizationId")
        .sort({ createdAt: -1 })
        .limit(6)
        .lean();

      const orgIds = [...new Set(jobs.map(j => j.organizationId).filter(Boolean))];
      const orgs = await Organization.find({ _id: { $in: orgIds } })
        .select("companyName").lean();
      const orgMap = new Map(orgs.map(o => [o._id.toString(), o]));

      jobMatches = jobs.map(job => ({
        id: job._id?.toString(),
        title: job.title,
        company: orgMap.get(job.organizationId?.toString())?.companyName || "Unknown",
        location: job.location || "Remote",
        salary: job.salary || { min: 0, max: 0 },
        matchPercentage: Math.floor(Math.random() * 40) + 60,
        skills: job.skills || job.skillsRequired || []
      }));
    }
  } catch (error) {
    console.log("Error fetching job matches:", error.message);
    jobMatches = [];
  }

  // Get activity feed
  const applications = await Application.find({ jobSeekerId: seekerId })
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  const activityFeed = applications.map((app, idx) => formatActivityFeedItem(app, idx));

  // Get weekly metrics
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const weeklyApplications = await Application.countDocuments({
    jobSeekerId: seekerId,
    createdAt: { $gte: sevenDaysAgo }
  });

  const weeklyMetrics = {
    views: seeker.profileViews || 0,
    viewsTrend: calculateTrend(),
    applications: weeklyApplications,
    applicationsTrend: calculateTrend(),
    messages: Math.floor(Math.random() * 10),
    messagesTrend: calculateTrend(),
    matchPercentage: Math.floor(Math.random() * 40) + 60
  };

  // Get social feed
  const posts = await Post.find()
    .select("authorId authorModel content postType likesCount commentsCount createdAt")
    .sort({ createdAt: -1 })
    .limit(6)
    .lean();

  // Get author names for posts
  const authorIds = [...new Set(posts.map(p => p.authorId))];
  let authorNames = new Map();

  if (authorIds.length > 0) {
    const seekers = await JobSeeker.find({ _id: { $in: authorIds } })
      .select("_id firstName lastName headline")
      .lean();
    seekers.forEach(s => {
      authorNames.set(s._id.toString(), {
        name: `${s.firstName || ""} ${s.lastName || ""}`.trim() || "Unknown",
        role: s.headline || "User"
      });
    });

    const orgs = await Organization.find({ _id: { $in: authorIds } })
      .select("_id companyName")
      .lean();
    orgs.forEach(o => {
      authorNames.set(o._id.toString(), {
        name: o.companyName || "Unknown Company",
        role: "Company"
      });
    });
  }

  const socialFeed = posts.map(post => {
    const author = authorNames.get(post.authorId?.toString()) || { name: "Unknown", role: "User" };
    return {
      id: post._id?.toString(),
      author: {
        name: author.name,
        role: author.role,
        initials: author.name.split(" ").map(n => n[0]).join("").toUpperCase().substring(0, 2)
      },
      content: post.content || "",
      timestamp: post.createdAt || new Date(),
      hashtags: [],
      engagement: { likes: post.likesCount || 0, comments: post.commentsCount || 0, shares: 0 }
    };
  });

  return sendSuccess(res, {
    message: "Normal dashboard data fetched successfully.",
    dashboard: {
      profileCompletion,
      jobMatches,
      activityFeed,
      weeklyMetrics,
      socialFeed
    }
  });
});

// GET /api/dashboard/recruiter - Recruiter dashboard
const getRecruiterDashboard = asyncHandler(async (req, res) => {
  if (req.user.role !== "organization") {
    throw new ApiError(403, "This dashboard is only available for recruiters.");
  }

  const organizationId = req.user.id;

  // Get posted jobs
  const jobs = await Job.find({ organizationId })
    .select("title status createdAt")
    .sort({ createdAt: -1 })
    .lean();

  // Count applications for each job
  const jobApplicationCounts = await Application.aggregate([
    {
      $match: { jobId: { $in: jobs.map(j => j._id) } }
    },
    {
      $group: {
        _id: "$jobId",
        count: { $sum: 1 }
      }
    }
  ]);

  const applicationCountMap = new Map(jobApplicationCounts.map(j => [j._id.toString(), j.count]));

  const postedJobs = jobs.map(job => ({
    id: job._id?.toString(),
    title: job.title,
    company: req.user.companyName || "Your Company",
    status: job.status === "Active" ? "active" : "closed",
    applicantCount: applicationCountMap.get(job._id.toString()) || 0,
    viewCount: 0,
    createdAt: job.createdAt
  }));

  // Get applicant pipeline
  const allApplications = await Application.find({
    jobId: { $in: jobs.map(j => j._id) }
  }).lean();

  const applicantPipeline = {
    totalApplications: allApplications.length,
    inReview: allApplications.filter(a => a.status === "UnderReview").length,
    interviewed: allApplications.filter(a => a.status === "Interviewed").length,
    offerSent: allApplications.filter(a => a.status === "OfferSent").length,
    rejected: allApplications.filter(a => a.status === "Rejected").length,
    accepted: allApplications.filter(a => a.status === "Accepted").length
  };

  // Get recent applicants
  const recentApplicants = allApplications
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 10)
    .map((app, idx) => ({
      id: app._id?.toString(),
      name: app.jobSeekerName || "Unknown",
      appliedFor: app.jobTitle || "Unknown Position",
      appliedAt: app.createdAt,
      status: app.status?.toLowerCase() || "new",
      matchScore: Math.floor(Math.random() * 40) + 60,
      resumeUrl: app.resumeUrl || ""
    }));

  // Get analytics
  const totalJobViews = jobs.reduce((sum, job) => sum + (job.viewCount || 0), 0);
  const totalApplications = allApplications.length;
  const applicationRate = jobs.length > 0
    ? Math.round((totalApplications / (jobs.length * 10)) * 100)
    : 0;

  const analytics = {
    totalJobViews,
    totalApplications,
    applicationRate,
    averageMatchQuality: Math.floor(Math.random() * 40) + 60,
    hireRate: applicantPipeline.accepted > 0
      ? Math.round((applicantPipeline.accepted / totalApplications) * 100)
      : 0
  };

  return sendSuccess(res, {
    message: "Recruiter dashboard data fetched successfully.",
    dashboard: {
      postedJobs,
      applicantPipeline,
      recentApplicants,
      analytics
    }
  });
});

module.exports = {
  getNormalDashboard,
  getRecruiterDashboard
};
