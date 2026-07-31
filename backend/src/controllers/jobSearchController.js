const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");
const ApiError = require("../utils/ApiError");
const { normalizePagination } = require("../utils/validation");
const { getReadableFileUrl } = require("../utils/supabaseService");

const Job = require("../models/Job");
const JobSeeker = require("../models/JobSeeker");
const Connection = require("../models/Connection");
const Organization = require("../models/Organization");
const Follow = require("../models/Follow");

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function truthy(value) {
  return ["true", "1", "yes", "on"].includes(String(value || "").toLowerCase());
}

async function ensureMediaUrl(media) {
  if (!media) {
    return media;
  }

  if (media.url) {
    return media;
  }

  if (!media.filePath) {
    return media;
  }

  try {
    const readableUrl = await getReadableFileUrl(media.filePath);
    return {
      ...media,
      url: readableUrl || ""
    };
  } catch {
    return {
      ...media,
      url: ""
    };
  }
}

const searchJobs = asyncHandler(async (req, res) => {
  const {
    q,
    location,
    industry,
    status = "Active",
    type,
    skill,
    skills,
    minSalary,
    maxSalary,
    remoteOnly,
    usePreferences
  } = req.query;
  const { page, limit, skip } = normalizePagination(req.query);

  const filter = {};
  const andClauses = [];
  const filtersApplied = [];

  if (status) {
    filter.status = status;
    filtersApplied.push("status");
  }

  if (location) {
    filter.location = new RegExp(escapeRegex(location), "i");
    filtersApplied.push("location");
  }

  if (industry) {
    filter.industry = new RegExp(escapeRegex(industry), "i");
    filtersApplied.push("industry");
  }

  if (type) {
    filter.type = type;
    filtersApplied.push("type");
  }

  const skillTokens = [...parseCsv(skills), ...parseCsv(skill)];
  if (skillTokens.length) {
    const skillRegexes = skillTokens.map((token) => new RegExp(escapeRegex(token), "i"));
    andClauses.push({
      $or: [
        { skills: { $in: skillRegexes } },
        { skillsRequired: { $in: skillRegexes } },
        { requirements: { $in: skillRegexes } }
      ]
    });
    filtersApplied.push("skills");
  }

  if (truthy(remoteOnly)) {
    andClauses.push({
      $or: [
        { type: "Remote" },
        { location: /remote/i }
      ]
    });
    filtersApplied.push("remoteOnly");
  }

  const minSalaryValue = Number(minSalary);
  const maxSalaryValue = Number(maxSalary);

  if (minSalary && Number.isFinite(minSalaryValue)) {
    andClauses.push({
      $or: [
        { "salary.max": { $gte: minSalaryValue } },
        { "salary.min": { $gte: minSalaryValue } }
      ]
    });
    filtersApplied.push("minSalary");
  }

  if (maxSalary && Number.isFinite(maxSalaryValue)) {
    andClauses.push({
      $or: [
        { "salary.min": { $lte: maxSalaryValue } },
        { "salary.max": { $lte: maxSalaryValue } }
      ]
    });
    filtersApplied.push("maxSalary");
  }

  if (truthy(usePreferences) && req.user?.role === "seeker") {
    const seeker = await JobSeeker.findById(req.user.id).select(
      "skills preferredRoles expectedSalary autoApplyPreferences.preferredLocations"
    );

    if (seeker) {
      const preferredTokens = [...(seeker.preferredRoles || []), ...(seeker.skills || [])]
        .map((value) => String(value || "").trim())
        .filter(Boolean)
        .slice(0, 20);

      if (preferredTokens.length) {
        const preferenceRegexes = preferredTokens.map((token) => new RegExp(escapeRegex(token), "i"));
        andClauses.push({
          $or: [
            { title: { $in: preferenceRegexes } },
            { description: { $in: preferenceRegexes } },
            { skills: { $in: preferenceRegexes } },
            { skillsRequired: { $in: preferenceRegexes } },
            { requirements: { $in: preferenceRegexes } }
          ]
        });
      }

      if (!location && seeker.autoApplyPreferences?.preferredLocations?.length) {
        const locationRegexes = seeker.autoApplyPreferences.preferredLocations
          .slice(0, 10)
          .map((item) => new RegExp(escapeRegex(item), "i"));
        andClauses.push({ location: { $in: locationRegexes } });
      }

      if (!minSalary && seeker.expectedSalary) {
        andClauses.push({
          $or: [
            { "salary.max": { $gte: seeker.expectedSalary } },
            { salary: { $exists: false } }
          ]
        });
      }

      filtersApplied.push("savedPreferences");
    }
  }

  if (andClauses.length) {
    filter.$and = andClauses;
  }

  let query = Job.find(filter)
    .populate("organizationId", "companyName industry headquartersLocation logo")
    .skip(skip)
    .limit(limit);

  if (q) {
    query = Job.find({
      ...filter,
      $text: { $search: q }
    }, {
      score: { $meta: "textScore" }
    })
      .populate("organizationId", "companyName industry headquartersLocation logo")
      .sort({ score: { $meta: "textScore" }, createdAt: -1 })
      .skip(skip)
      .limit(limit);
  } else {
    query = query.sort({ createdAt: -1 });
  }

  const jobs = await query;
  const total = await Job.countDocuments(q ? { ...filter, $text: { $search: q } } : filter);

  return sendSuccess(res, {
    message: "Jobs fetched successfully.",
    filtersApplied,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1)
    },
    jobs
  });
});

const searchSeekers = asyncHandler(async (req, res) => {
  // Seekers search other seekers to connect (ConnectionsPage.jsx); organizations search seekers to
  // start a recruiter->candidate chat (RecruiterMessagesPage.jsx) — both are legitimate callers.
  // The `connection` field below stays meaningful only for a seeker caller (Connection documents
  // are only ever created between two seekers); for an organization caller it's simply always
  // null, which is fine since that page doesn't use it.
  if (!["seeker", "organization"].includes(req.user.role)) {
    throw new ApiError(403, "Only job seekers and organizations can search other seekers.");
  }

  const { q, skill, role, currentStatus } = req.query;
  const { page, limit, skip } = normalizePagination(req.query);
  const filter = {
    _id: { $ne: req.user.id },
    profileVisibility: { $ne: "Private" }
  };

  if (q) {
    const searchRegex = new RegExp(escapeRegex(q), "i");
    filter.$or = [
      { firstName: searchRegex },
      { lastName: searchRegex },
      { username: searchRegex },
      { email: searchRegex },
      { tagline: searchRegex },
      { bio: searchRegex },
      { skills: searchRegex },
      { preferredRoles: searchRegex }
    ];
  }

  if (skill) {
    filter.skills = new RegExp(escapeRegex(skill), "i");
  }

  if (role) {
    filter.preferredRoles = new RegExp(escapeRegex(role), "i");
  }

  if (currentStatus) {
    filter.currentStatus = currentStatus;
  }

  const [seekers, total] = await Promise.all([
    JobSeeker.find(filter)
      .select("firstName lastName username email tagline bio currentStatus skills preferredRoles profilePicture profileVisibility")
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit),
    JobSeeker.countDocuments(filter)
  ]);
  const seekerIds = seekers.map((seeker) => seeker._id);
  const connections = await Connection.find({
    $or: [
      { requester: req.user.id, recipient: { $in: seekerIds } },
      { requester: { $in: seekerIds }, recipient: req.user.id }
    ]
  });
  const connectionBySeekerId = new Map();

  connections.forEach((connection) => {
    const isRequester = connection.requester.toString() === String(req.user.id);
    const counterpartId = isRequester ? connection.recipient.toString() : connection.requester.toString();

    connectionBySeekerId.set(counterpartId, {
      id: connection._id,
      status: connection.status,
      direction: isRequester ? "sent" : "received"
    });
  });

  const seekersWithUrls = await Promise.all(
    seekers.map(async (seeker) => {
      const seekerObj = seeker.toObject();
      seekerObj.profilePicture = await ensureMediaUrl(seekerObj.profilePicture);
      return seekerObj;
    })
  );

  return sendSuccess(res, {
    message: "Seekers fetched successfully.",
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1)
    },
    seekers: seekersWithUrls.map((seeker) => ({
      ...seeker,
      connection: connectionBySeekerId.get(seeker._id.toString()) || null
    }))
  });
});

const searchOrganizations = asyncHandler(async (req, res) => {
  if (req.user.role !== "seeker") {
    throw new ApiError(403, "Only job seekers can search organizations to follow.");
  }

  const { q, industry } = req.query;
  const { page, limit, skip } = normalizePagination(req.query);
  const filter = {
    verificationStatus: "Verified",
    domainMatched: true
  };

  if (q) {
    const searchRegex = new RegExp(escapeRegex(q), "i");
    filter.$or = [
      { companyName: searchRegex },
      { username: searchRegex },
      { email: searchRegex },
      { industry: searchRegex },
      { description: searchRegex },
      { headquartersLocation: searchRegex }
    ];
  }

  if (industry) {
    filter.industry = new RegExp(escapeRegex(industry), "i");
  }

  const [organizations, total] = await Promise.all([
    Organization.find(filter)
      .select("companyName username email industry websiteUrl headquartersLocation verificationStatus logo description")
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit),
    Organization.countDocuments(filter)
  ]);
  const organizationIds = organizations.map((organization) => organization._id);
  const follows = await Follow.find({
    jobSeekerId: req.user.id,
    organizationId: { $in: organizationIds }
  });
  const followByOrganizationId = new Map(
    follows.map((follow) => [follow.organizationId.toString(), follow])
  );

  const organizationsWithUrls = await Promise.all(
    organizations.map(async (organization) => {
      const orgObj = organization.toObject();
      orgObj.logo = await ensureMediaUrl(orgObj.logo);
      return orgObj;
    })
  );

  return sendSuccess(res, {
    message: "Organizations fetched successfully.",
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1)
    },
    organizations: organizationsWithUrls.map((organization) => {
      const follow = followByOrganizationId.get(organization._id.toString());

      return {
        ...organization,
        follow: follow
          ? {
              id: follow._id,
              notificationPreferences: follow.notificationPreferences
            }
          : null
      };
    })
  });
});

module.exports = {
  searchJobs,
  searchSeekers,
  searchOrganizations
};
