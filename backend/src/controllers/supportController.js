const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");
const { requireNonEmptyString, normalizePagination } = require("../utils/validation");
const { emitToUser } = require("../utils/socketServer");
const { getSupportPolicy } = require("../services/platformSettingsService");
const { buildSupportMetrics } = require("../services/supportMetricsService");
const { createNotification } = require("../services/notificationService");
const { SUPPORT_DISPLAY_NAME, previewLine } = require("../utils/supportPresentation");

const SupportTicket = require("../models/SupportTicket");
const SupportMessage = require("../models/SupportMessage");
const Admin = require("../models/Admin");
const JobSeeker = require("../models/JobSeeker");
const Organization = require("../models/Organization");

const CHANNELS = ["chat", "ticket"];
const STATUSES = ["Open", "Pending", "Resolved", "Closed"];
const PRIORITIES = ["Low", "Normal", "High", "Urgent"];

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getAdminName(admin) {
  if (!admin) {
    return "SGETAI Support";
  }

  return String(admin.email || "").split("@")[0] || "SGETAI Support";
}

// Resolves requester display data for a page of tickets in two queries, not one per row.
async function decorateTickets(tickets) {
  const seekerIds = tickets
    .filter((ticket) => ticket.requesterModel === "JobSeeker")
    .map((ticket) => ticket.requesterId);
  const organizationIds = tickets
    .filter((ticket) => ticket.requesterModel === "Organization")
    .map((ticket) => ticket.requesterId);
  const assigneeIds = tickets.map((ticket) => ticket.assigneeId).filter(Boolean);

  const [seekers, organizations, admins] = await Promise.all([
    seekerIds.length
      ? JobSeeker.find({ _id: { $in: seekerIds } }).select("firstName lastName email").lean()
      : [],
    organizationIds.length
      ? Organization.find({ _id: { $in: organizationIds } }).select("companyName email").lean()
      : [],
    assigneeIds.length
      ? Admin.find({ _id: { $in: assigneeIds } }).select("email role").lean()
      : []
  ]);

  const seekerMap = new Map(seekers.map((row) => [row._id.toString(), row]));
  const organizationMap = new Map(organizations.map((row) => [row._id.toString(), row]));
  const adminMap = new Map(admins.map((row) => [row._id.toString(), row]));

  return tickets.map((ticket) => {
    const key = ticket.requesterId?.toString();
    const requester =
      ticket.requesterModel === "JobSeeker" ? seekerMap.get(key) : organizationMap.get(key);
    const assignee = ticket.assigneeId ? adminMap.get(ticket.assigneeId.toString()) : null;

    return {
      ...ticket,
      requester: requester
        ? {
            name:
              ticket.requesterModel === "JobSeeker"
                ? `${requester.firstName || ""} ${requester.lastName || ""}`.trim() ||
                  requester.email
                : requester.companyName || requester.email,
            email: requester.email,
            type: ticket.requesterModel === "JobSeeker" ? "Candidate" : "Organisation"
          }
        : null,
      // null rather than a placeholder name — "unassigned" is a state the UI renders explicitly.
      assignee: assignee ? { _id: assignee._id, name: getAdminName(assignee), role: assignee.role } : null
    };
  });
}

const listTickets = asyncHandler(async (req, res) => {
  const { page, limit, skip } = normalizePagination(req.query);
  const filter = {};

  if (req.query.channel) {
    if (!CHANNELS.includes(req.query.channel)) {
      throw new ApiError(400, `channel must be one of: ${CHANNELS.join(", ")}.`);
    }
    filter.channel = req.query.channel;
  }

  if (req.query.status) {
    if (!STATUSES.includes(req.query.status)) {
      throw new ApiError(400, `status must be one of: ${STATUSES.join(", ")}.`);
    }
    filter.status = req.query.status;
  }

  if (req.query.assignee) {
    // "unassigned" is a real, queryable state, not the absence of a filter.
    filter.assigneeId = req.query.assignee === "unassigned" ? null : req.query.assignee;
  }

  const search = String(req.query.q || "").trim();
  if (search) {
    filter.subject = new RegExp(escapeRegex(search), "i");
  }

  const [tickets, total] = await Promise.all([
    SupportTicket.find(filter)
      .sort({ lastMessageAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    SupportTicket.countDocuments(filter)
  ]);

  const decorated = await decorateTickets(tickets);

  // One extra query for the whole page rather than one per ticket.
  const ticketIds = decorated.map((ticket) => ticket._id);
  const latestMessages = ticketIds.length
    ? await SupportMessage.aggregate([
        { $match: { ticketId: { $in: ticketIds } } },
        { $sort: { createdAt: -1 } },
        { $group: { _id: "$ticketId", body: { $first: "$body" }, senderType: { $first: "$senderType" } } }
      ])
    : [];
  const previewByTicket = new Map(latestMessages.map((row) => [row._id.toString(), row]));

  return sendSuccess(res, {
    message: "Support tickets fetched successfully.",
    pagination: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) },
    tickets: decorated.map((ticket) => ({
      ...ticket,
      preview: previewByTicket.get(ticket._id.toString()) || null
    }))
  });
});

const getTicket = asyncHandler(async (req, res) => {
  const ticket = await SupportTicket.findById(req.params.id).lean();

  if (!ticket) {
    throw new ApiError(404, "Support ticket not found.");
  }

  const [decorated] = await decorateTickets([ticket]);
  const messages = await SupportMessage.find({ ticketId: ticket._id })
    .sort({ createdAt: 1 })
    .lean();

  // Opening the thread is what clears the badge — the admin has now seen every inbound message.
  if (ticket.unreadForAdmin > 0) {
    await Promise.all([
      SupportTicket.updateOne({ _id: ticket._id }, { $set: { unreadForAdmin: 0 } }),
      SupportMessage.updateMany(
        { ticketId: ticket._id, senderType: "user", readAt: null },
        { $set: { readAt: new Date() } }
      )
    ]);
    decorated.unreadForAdmin = 0;
  }

  return sendSuccess(res, {
    message: "Support ticket fetched successfully.",
    ticket: decorated,
    messages
  });
});

const replyToTicket = asyncHandler(async (req, res) => {
  const body = requireNonEmptyString(req.body.body, "body");
  const ticket = await SupportTicket.findById(req.params.id);

  if (!ticket) {
    throw new ApiError(404, "Support ticket not found.");
  }

  const message = await SupportMessage.create({
    ticketId: ticket._id,
    senderId: req.user.id,
    senderType: "admin",
    body
  });

  // firstResponseAt is set once and never moved: the metric measures how long the requester waited
  // for a human, and a later reply does not change that.
  if (!ticket.firstResponseAt) {
    ticket.firstResponseAt = message.createdAt;
  }
  ticket.lastMessageAt = message.createdAt;
  // An admin replying takes ownership implicitly — leaving a ticket they have answered in the
  // unassigned queue would misreport who is on it.
  if (!ticket.assigneeId) {
    ticket.assigneeId = req.user.id;
  }
  if (ticket.status === "Open") {
    ticket.status = "Pending";
  }
  // The user now has something waiting on their side of the thread (HelpPage renders this dot).
  ticket.unreadForRequester = true;
  await ticket.save();

  const admin = await Admin.findById(req.user.id).select("email role").lean();
  // One mapping, used by both the notification and the socket emit below, so the two can never
  // drift apart on which room/role a requester belongs to.
  const requesterRole = ticket.requesterModel === "JobSeeker" ? "seeker" : "organization";

  // The notification is what actually reaches the requester today. AppShell already polls
  // GET /notifications every 30s and renders the unread badge, so this lands without any new
  // client machinery — unlike the emit below, which has no listener (the frontend has no
  // socket.io-client). Notification.type is a free-form String and recipientRole already permits
  // "seeker" and "organization", so no schema change is involved.
  //
  // Wrapped: the admin's reply is already persisted and the request has succeeded. A failure to
  // notify must be logged, never turned into a 500 that makes the admin re-send a message that
  // was in fact delivered.
  try {
    await createNotification({
      recipientId: ticket.requesterId,
      recipientRole: requesterRole,
      type: "support_reply",
      title: "Support replied to your request",
      message: previewLine(body) || `${SUPPORT_DISPLAY_NAME} replied to "${ticket.subject}".`,
      // Carries what a deep link into the thread needs.
      metadata: {
        ticketId: ticket._id,
        messageId: message._id,
        subject: ticket.subject
      }
    });
  } catch (error) {
    console.error("Failed to notify requester of a support reply:", error.message);
  }

  // Pushes the reply to the requester's own room. Rooms are `user:{role}:{id}` (socketServer), and
  // the requester's role token differs from their model name.
  emitToUser(
    { id: ticket.requesterId.toString(), role: requesterRole },
    "support:message",
    { ticketId: ticket._id, message }
  );

  return sendSuccess(
    res,
    {
      message: "Reply sent.",
      supportMessage: { ...message.toObject(), senderName: getAdminName(admin) },
      ticket: (await decorateTickets([ticket.toObject()]))[0]
    },
    201
  );
});

const updateTicket = asyncHandler(async (req, res) => {
  const ticket = await SupportTicket.findById(req.params.id);

  if (!ticket) {
    throw new ApiError(404, "Support ticket not found.");
  }

  if (req.body.status !== undefined) {
    if (!STATUSES.includes(req.body.status)) {
      throw new ApiError(400, `status must be one of: ${STATUSES.join(", ")}.`);
    }
    ticket.status = req.body.status;
    // Stamped only on the transition into a closed state, and cleared on reopen so the metric
    // never reports a resolution date for an open ticket.
    if (["Resolved", "Closed"].includes(req.body.status)) {
      ticket.resolvedAt = ticket.resolvedAt || new Date();
    } else {
      ticket.resolvedAt = undefined;
    }
  }

  if (req.body.priority !== undefined) {
    if (!PRIORITIES.includes(req.body.priority)) {
      throw new ApiError(400, `priority must be one of: ${PRIORITIES.join(", ")}.`);
    }
    ticket.priority = req.body.priority;
  }

  if (req.body.assigneeId !== undefined) {
    if (req.body.assigneeId === null || req.body.assigneeId === "") {
      ticket.assigneeId = null;
    } else {
      const assignee = await Admin.findById(req.body.assigneeId).select("_id").lean();
      if (!assignee) {
        throw new ApiError(404, "Assignee not found.");
      }
      ticket.assigneeId = assignee._id;
    }
  }

  await ticket.save();
  const [decorated] = await decorateTickets([ticket.toObject()]);

  return sendSuccess(res, { message: "Ticket updated.", ticket: decorated });
});

const createTicket = asyncHandler(async (req, res) => {
  const subject = requireNonEmptyString(req.body.subject, "subject");
  const body = requireNonEmptyString(req.body.body, "body");
  const requesterModel = req.body.requesterModel;

  if (!["JobSeeker", "Organization"].includes(requesterModel)) {
    throw new ApiError(400, "requesterModel must be JobSeeker or Organization.");
  }

  const RequesterModel = requesterModel === "JobSeeker" ? JobSeeker : Organization;
  const requester = await RequesterModel.findById(req.body.requesterId).select("_id").lean();

  if (!requester) {
    throw new ApiError(404, "Requester not found.");
  }

  const channel = CHANNELS.includes(req.body.channel) ? req.body.channel : "ticket";
  const priority = PRIORITIES.includes(req.body.priority) ? req.body.priority : "Normal";
  const { slaTargetMinutes } = await getSupportPolicy();
  const now = new Date();

  const ticket = await SupportTicket.create({
    requesterId: requester._id,
    requesterModel,
    channel,
    subject,
    priority,
    status: "Open",
    slaTargetMinutes,
    lastMessageAt: now,
    // Raised by an admin on a user's behalf, so there is nothing waiting on the desk to read.
    unreadForAdmin: 0
  });

  await SupportMessage.create({
    ticketId: ticket._id,
    senderId: requester._id,
    senderType: "user",
    body,
    readAt: now
  });

  const [decorated] = await decorateTickets([ticket.toObject()]);

  return sendSuccess(res, { message: "Ticket created.", ticket: decorated }, 201);
});

const getSupportMetrics = asyncHandler(async (req, res) => {
  const { slaTargetMinutes } = await getSupportPolicy();
  const metrics = await buildSupportMetrics({ slaTargetMinutes });

  return sendSuccess(res, { message: "Support metrics fetched successfully.", metrics });
});

const listAssignees = asyncHandler(async (req, res) => {
  const admins = await Admin.find().select("email role").sort({ email: 1 }).lean();

  return sendSuccess(res, {
    message: "Assignees fetched successfully.",
    assignees: admins.map((admin) => ({
      _id: admin._id,
      name: getAdminName(admin),
      email: admin.email,
      role: admin.role
    }))
  });
});

module.exports = {
  listTickets,
  getTicket,
  replyToTicket,
  updateTicket,
  createTicket,
  getSupportMetrics,
  listAssignees
};
