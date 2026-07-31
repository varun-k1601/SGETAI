const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");
const ApiError = require("../utils/ApiError");
const { requireNonEmptyString, normalizePagination } = require("../utils/validation");
const Feedback = require("../models/Feedback");
const JobSeeker = require("../models/JobSeeker");
const Organization = require("../models/Organization");
const { resolveAuthorModel } = require("./postController");

const submitFeedback = asyncHandler(async (req, res) => {
  const message = requireNonEmptyString(req.body.message, "message");
  const userModel = resolveAuthorModel(req.user.role);

  if (!userModel) {
    throw new ApiError(403, "This role cannot submit feedback.");
  }

  await Feedback.create({
    userId: req.user.id,
    userModel,
    message,
    type: req.body.type || "user_feedback"
  });

  return sendSuccess(res, {
    message: "Feedback sent successfully!"
  });
});

const listFeedback = asyncHandler(async (req, res) => {
  const { page, limit, skip } = normalizePagination(req.query);

  const [feedbackEntries, total] = await Promise.all([
    Feedback.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Feedback.countDocuments()
  ]);

  const seekerIds = feedbackEntries
    .filter((item) => item.userModel === "JobSeeker")
    .map((item) => item.userId);
  const organizationIds = feedbackEntries
    .filter((item) => item.userModel === "Organization")
    .map((item) => item.userId);

  const [seekers, organizations] = await Promise.all([
    seekerIds.length
      ? JobSeeker.find({ _id: { $in: seekerIds } }).select("firstName lastName email")
      : [],
    organizationIds.length
      ? Organization.find({ _id: { $in: organizationIds } }).select("companyName email")
      : []
  ]);

  const seekerMap = new Map(seekers.map((seeker) => [seeker._id.toString(), seeker]));
  const organizationMap = new Map(organizations.map((organization) => [organization._id.toString(), organization]));

  const feedback = feedbackEntries.map((item) => {
    const submitter =
      item.userModel === "JobSeeker"
        ? seekerMap.get(item.userId.toString())
        : organizationMap.get(item.userId.toString());

    return {
      ...item,
      submitter: submitter
        ? {
            name:
              item.userModel === "JobSeeker"
                ? `${submitter.firstName || ""} ${submitter.lastName || ""}`.trim()
                : submitter.companyName,
            email: submitter.email
          }
        : null
    };
  });

  return sendSuccess(res, {
    message: "Feedback fetched successfully.",
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1)
    },
    feedback
  });
});

module.exports = {
  submitFeedback,
  listFeedback
};
