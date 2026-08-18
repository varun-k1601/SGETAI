const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");
const ApiError = require("../utils/ApiError");
const { requireNonEmptyString, normalizePagination } = require("../utils/validation");
const Feedback = require("../models/Feedback");
const JobSeeker = require("../models/JobSeeker");
const Organization = require("../models/Organization");
const SupportTicket = require("../models/SupportTicket");
const SupportMessage = require("../models/SupportMessage");
const Admin = require("../models/Admin");
const { emitToUser } = require("../utils/socketServer");
const { getSupportPolicy } = require("../services/platformSettingsService");
const { resolveAuthorModel } = require("./postController");

// Derives a one-line subject from the body — the seeker-facing HelpPage posts a bare message with
// no subject field, and an inbox row needs something scannable. Truncates on a word boundary so a
// long first sentence does not get cut mid-word.
function deriveSubject(message) {
  const firstLine = String(message).split(/\r?\n/)[0].trim();

  if (firstLine.length <= 80) {
    return firstLine || "Support request";
  }

  const truncated = firstLine.slice(0, 80);
  const lastSpace = truncated.lastIndexOf(" ");

  return `${(lastSpace > 40 ? truncated.slice(0, lastSpace) : truncated).trim()}…`;
}

const submitFeedback = asyncHandler(async (req, res) => {
  const message = requireNonEmptyString(req.body.message, "message");
  const userModel = resolveAuthorModel(req.user.role);

  if (!userModel) {
    throw new ApiError(403, "This role cannot submit feedback.");
  }

  // Feedback stays the system of record for the seeker-facing HelpPage, unchanged, so nothing
  // that already reads it breaks. The SupportTicket below is an additional projection of the same
  // submission into the admin desk — created in the same request so new feedback shows up in the
  // inbox immediately rather than waiting for the next backfill run.
  const feedback = await Feedback.create({
    userId: req.user.id,
    userModel,
    message,
    type: req.body.type || "user_feedback"
  });

  try {
    const { slaTargetMinutes } = await getSupportPolicy();
    const ticket = await SupportTicket.create({
      requesterId: req.user.id,
      requesterModel: userModel,
      channel: "ticket",
      subject: deriveSubject(message),
      status: "Open",
      priority: "Normal",
      slaTargetMinutes,
      lastMessageAt: feedback.createdAt,
      unreadForAdmin: 1,
      sourceFeedbackId: feedback._id
    });

    const supportMessage = await SupportMessage.create({
      ticketId: ticket._id,
      senderId: req.user.id,
      senderType: "user",
      body: message
    });

    // Fan out to every admin room. socketServer addresses rooms as `user:{role}:{id}` and admin
    // JWTs carry SuperAdmin/Moderator as their role, so each admin has a room already — but there
    // is no single "all admins" room, hence the explicit enumeration.
    //
    // NOTE: no browser currently joins these rooms. The frontend has no socket.io-client
    // dependency (adding one is outside this task's no-new-dependencies constraint), so the admin
    // inbox polls instead. This emit matches what chatController and notificationService already
    // do, and means the server side is ready the moment a client is added.
    const admins = await Admin.find().select("_id role").lean();
    admins.forEach((admin) => {
      emitToUser({ id: admin._id.toString(), role: admin.role }, "support:ticket", {
        ticketId: ticket._id,
        message: supportMessage
      });
    });
  } catch (error) {
    // The user's feedback is already saved and their submission succeeded. A desk-side projection
    // failure must not turn that into an error response — the backfill script is idempotent and
    // will pick this row up on its next run.
    console.error("Failed to project feedback into a support ticket:", error.message);
  }

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
