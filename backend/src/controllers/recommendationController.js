const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");
const ApiError = require("../utils/ApiError");
const JobSeeker = require("../models/JobSeeker");
const Job = require("../models/Job");
const Organization = require("../models/Organization");
const { computeCandidateMatch } = require("../services/matchService");

async function attachOrganizations(jobs = []) {
  const organizationIds = [
    ...new Set(jobs.map((job) => job.organizationId).filter(Boolean).map(String))
  ];

  if (!organizationIds.length) {
    return jobs;
  }

  const organizations = await Organization.find({ _id: { $in: organizationIds } })
    .select("companyName industry headquartersLocation logo")
    .lean();
  const organizationById = new Map(organizations.map((organization) => [String(organization._id), organization]));

  return jobs.map((job) => ({
    ...job,
    organizationId: organizationById.get(String(job.organizationId)) || job.organizationId
  }));
}

const getRecommendedJobs = asyncHandler(async (req, res) => {
  if (req.user.role !== "seeker") {
    throw new ApiError(403, "Only job seekers can access job recommendations.");
  }

  // Full seeker document (not just skills/preferredRoles) is required below by
  // computeCandidateMatch, which reads education/experience/projects/skillGroups/etc. too.
  const seeker = await JobSeeker.findById(req.user.id).select("+embedding");
  if (!seeker) {
    throw new ApiError(404, "Job seeker not found.");
  }

  let jobs = [];
  let strategy = "latest_fallback";

  if (Array.isArray(seeker.embedding) && seeker.embedding.length) {
    try {
      jobs = await Job.aggregate([
        {
          $vectorSearch: {
            index: "vector_index",
            path: "embedding",
            queryVector: seeker.embedding,
            numCandidates: 50,
            limit: 10,
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
            createdAt: 1,
            score: { $meta: "vectorSearchScore" }
          }
        }
      ]);
      strategy = "vector_search";
    } catch (error) {
      jobs = [];
    }
  }

  if (!jobs.length) {
    const roleTokens = (seeker.preferredRoles || []).map((role) => role.toLowerCase());
    const skillTokens = (seeker.skills || []).map((skill) => skill.toLowerCase());

    jobs = await Job.find({ status: "Active" }).sort({ createdAt: -1 }).limit(10).lean();
    jobs = jobs.map((job) => {
      const haystack = `${job.title || ""} ${job.description || ""} ${(job.skillsRequired || []).join(" ")} ${(job.skills || []).join(" ")}`.toLowerCase();
      const score =
        roleTokens.filter((token) => haystack.includes(token)).length * 2 +
        skillTokens.filter((token) => haystack.includes(token)).length;
      return { ...job, score };
    }).sort((a, b) => b.score - a.score || new Date(b.createdAt) - new Date(a.createdAt));
  }

  jobs = await attachOrganizations(jobs);

  // `score` above is strategy-specific (Atlas vectorSearchScore for the vector path, an unbounded
  // keyword-overlap count for the fallback path) — neither is a comparable 0-100 percentage, and
  // mixing the two would make "match %" mean different things depending on which strategy ran.
  // computeCandidateMatch is the same formula already used for ATS/auto-apply scoring elsewhere,
  // so reusing it here keeps "match %" consistent everywhere it's shown in the app.
  jobs = jobs.map((job) => ({
    ...job,
    matchScore: computeCandidateMatch(seeker, job).score
  }));

  return sendSuccess(res, {
    message: "Job recommendations fetched successfully.",
    strategy,
    jobs
  });
});

module.exports = {
  getRecommendedJobs,
  attachOrganizations
};
