const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");
const { requireNonEmptyString, normalizePagination } = require("../utils/validation");
const { createNotification } = require("../services/notificationService");
const { SUPPORT_DISPLAY_NAME, previewLine } = require("../utils/supportPresentation");
const { buildPublicResponseStat } = require("../services/supportMetricsService");

const SupportTicket = require("../models/SupportTicket");
const SupportMessage = require("../models/SupportMessage");
const Admin = require("../models/Admin");

// The requester's half of the support desk. Deliberately a separate controller from
// supportController: that one is written for an operator (assignee, SLA, priority, unread counts,
// every requester's tickets) and reusing its helpers here is exactly how internal fields leak into
// a user-facing payload. Nothing below imports decorateTickets.

// The one place a requester's identity is derived. It comes from the verified JWT payload and
// NOTHING else — no body field, no query param, no header. Every query in this file is scoped by
// the pair this returns, so a request can only ever address its own rows.
function resolveRequesterScope(req) {
  // Admins authenticate against the same middleware but are not requesters — SupportTicket's
  // requesterModel enum has no third value. Without this guard an admin session would be silently
  // treated as an Organization and query for tickets whose requesterId happened to equal their
  // admin id; that matches nothing today, but "happens to be safe" is not a guarantee. Admins have
  // their own desk at /api/support.
  if (!["seeker", "organization"].includes(req.user.role)) {
    throw new ApiError(403, "This account type does not have support conversations.");
  }

  return {
    requesterId: req.user.id,
    requesterModel: req.user.role === "seeker" ? "JobSeeker" : "Organization"
  };
}

// User-facing status wording. `status` is kept raw so the client can style a pill off a stable
// value, but "Pending" means "the desk answered, we are waiting on you" — showing that word alone
// to the person being waited on is actively misleading.
const STATUS_LABELS = {
  Open: "Open",
  Pending: "Awaiting your reply",
  Resolved: "Resolved",
  Closed: "Closed"
};

// THE MAPPER. An allowlist, not a redaction pass: fields are copied in one by one, so a column
// added to SupportTicket later cannot start flowing to users just because someone forgot this
// file. Excluded on purpose — assigneeId (who is handling it is internal routing), priority (an
// internal triage lever; a user seeing "Low" learns only that they are deprioritised),
// slaTargetMinutes (an internal commitment, not a promise made to this user), unreadForAdmin (the
// desk's own badge), firstResponseAt (an input to an internal metric), sourceFeedbackId (an
// implementation detail of the backfill).
function toRequesterTicket(ticket) {
  return {
    _id: ticket._id,
    subject: ticket.subject,
    channel: ticket.channel,
    status: ticket.status,
    statusLabel: STATUS_LABELS[ticket.status] || ticket.status,
    createdAt: ticket.createdAt,
    lastMessageAt: ticket.lastMessageAt || ticket.createdAt,
    resolvedAt: ticket.resolvedAt || null,
    hasUnread: Boolean(ticket.unreadForRequester)
  };
}

// Support speaks with one voice. senderId is dropped entirely rather than mapped: an admin's
// ObjectId is no more the requester's business than their email address.
function toRequesterMessage(message) {
  return {
    _id: message._id,
    body: message.body,
    senderType: message.senderType,
    senderName: message.senderType === "admin" ? SUPPORT_DISPLAY_NAME : "You",
    createdAt: message.createdAt
  };
}

const listMyTickets = asyncHandler(async (req, res) => {
  const { requesterId, requesterModel } = resolveRequesterScope(req);
  const { page, limit, skip } = normalizePagination(req.query);

  // Ownership is IN THE QUERY. Fetching then filtering would mean the database hands this process
  // other people's rows and only application code stands between them and the response.
  const filter = { requesterId, requesterModel };

  const [tickets, total] = await Promise.all([
    SupportTicket.find(filter)
      .sort({ lastMessageAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    SupportTicket.countDocuments(filter)
  ]);

  // One aggregate for the whole page rather than one query per row.
  const ticketIds = tickets.map((ticket) => ticket._id);
  const latestMessages = ticketIds.length
    ? await SupportMessage.aggregate([
        { $match: { ticketId: { $in: ticketIds } } },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: "$ticketId",
            body: { $first: "$body" },
            senderType: { $first: "$senderType" }
          }
        }
      ])
    : [];
  const previewByTicket = new Map(latestMessages.map((row) => [row._id.toString(), row]));

  return sendSuccess(res, {
    message: "Your support conversations were fetched successfully.",
    pagination: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) },
    tickets: tickets.map((ticket) => {
      const preview = previewByTicket.get(ticket._id.toString());

      return {
        ...toRequesterTicket(ticket),
        preview: preview
          ? { body: previewLine(preview.body), senderType: preview.senderType }
          : null
      };
    })
  });
});

const getMyTicket = asyncHandler(async (req, res) => {
  const { requesterId, requesterModel } = resolveRequesterScope(req);

  // findOne with the ownership pair in the filter, not findById-then-compare. A ticket belonging
  // to someone else is indistinguishable here from a ticket that does not exist, and that is the
  // point: 404 rather than 403, so probing ids cannot confirm which ones are real.
  const ticket = await SupportTicket.findOne({
    _id: req.params.id,
    requesterId,
    requesterModel
  }).lean();

  if (!ticket) {
    throw new ApiError(404, "Support conversation not found.");
  }

  const messages = await SupportMessage.find({ ticketId: ticket._id })
    .sort({ createdAt: 1 })
    .lean();

  // Opening the thread is what clears the user's dot — they have now seen every reply. Mirrors
  // exactly what the admin getTicket does with unreadForAdmin.
  if (ticket.unreadForRequester) {
    await Promise.all([
      SupportTicket.updateOne({ _id: ticket._id }, { $set: { unreadForRequester: false } }),
      SupportMessage.updateMany(
        { ticketId: ticket._id, senderType: "admin", readAt: null },
        { $set: { readAt: new Date() } }
      )
    ]);
    ticket.unreadForRequester = false;
  }

  return sendSuccess(res, {
    message: "Support conversation fetched successfully.",
    ticket: toRequesterTicket(ticket),
    messages: messages.map(toRequesterMessage)
  });
});

// Tells the desk a user has written back. Falls back to every admin when nobody owns the ticket,
// so an unassigned thread is not a black hole in this direction either.
async function notifyDeskOfUserReply(ticket, body) {
  const recipients = ticket.assigneeId
    ? await Admin.find({ _id: ticket.assigneeId }).select("_id role").lean()
    : await Admin.find().select("_id role").lean();

  await Promise.all(
    recipients.map((admin) =>
      createNotification({
        recipientId: admin._id,
        recipientRole: admin.role,
        type: "support_user_reply",
        title: "New reply on a support ticket",
        message: previewLine(body) || `A requester replied to "${ticket.subject}".`,
        metadata: { ticketId: ticket._id, subject: ticket.subject }
      })
    )
  );
}

const replyToMyTicket = asyncHandler(async (req, res) => {
  const { requesterId, requesterModel } = resolveRequesterScope(req);
  const body = requireNonEmptyString(req.body.body, "body");

  const ticket = await SupportTicket.findOne({
    _id: req.params.id,
    requesterId,
    requesterModel
  });

  if (!ticket) {
    throw new ApiError(404, "Support conversation not found.");
  }

  const message = await SupportMessage.create({
    ticketId: ticket._id,
    senderId: requesterId,
    senderType: "user",
    body
  });

  ticket.lastMessageAt = message.createdAt;
  ticket.unreadForAdmin = (ticket.unreadForAdmin || 0) + 1;
  // The user is looking at the thread as they send this, so nothing is waiting on their side.
  ticket.unreadForRequester = false;

  // REOPEN POLICY — Closed reopens, it is not terminal.
  //
  // Closed is an operator's housekeeping state here, not a lock: nothing in the product lets a
  // user start a fresh ticket directly (the only entry point is the feedback form, which files a
  // new one with a derived subject and no link to this conversation). Treating Closed as terminal
  // would therefore mean either refusing the reply — stranding someone whose problem came back —
  // or accepting it into a thread the desk's Resolved/Closed views hide, which is the black hole
  // this whole change exists to close. resolvedAt is cleared to match updateTicket, which already
  // refuses to report a resolution date for a ticket that is open again.
  if (["Pending", "Resolved", "Closed"].includes(ticket.status)) {
    ticket.status = "Open";
    ticket.resolvedAt = undefined;
  }

  // NOT touched, deliberately:
  //   firstResponseAt — measures how long THIS requester waited for a human. A user's own message
  //                     is not a response to themselves, and moving it would corrupt the median.
  //   assigneeId      — a user replying does not reassign their ticket, or un-assign it.
  await ticket.save();

  try {
    await notifyDeskOfUserReply(ticket, body);
  } catch (error) {
    // The user's message is already persisted and their request succeeded. A notification failure
    // is a desk-side problem, not theirs.
    console.error("Failed to notify the support desk of a user reply:", error.message);
  }

  // No separate socket emit in this direction. createNotification already pushes a "notification"
  // event into each recipient's room, and it is the only caller that knows the admin's role —
  // rooms are addressed as `user:{role}:{id}`, so a hand-rolled emit here would have to guess
  // between SuperAdmin and Moderator and would silently address an empty room when it guessed
  // wrong. (No browser joins these rooms today regardless: the frontend has no socket.io-client
  // and every live surface in this app polls.)

  return sendSuccess(
    res,
    {
      message: "Reply sent.",
      ticket: toRequesterTicket(ticket.toObject()),
      supportMessage: toRequesterMessage(message)
    },
    201
  );
});

// GET /api/support/me/response-time — the ONE support measurement a requester may see.
//
// The admin desk's GET /api/support/metrics is gated to SuperAdmin/Moderator and stays that way:
// it reports open counts, unread counts, SLA breach rates and assignee spread, all of which
// describe other people's tickets. This returns a single aggregate median plus its sample size —
// no ticket, no id, no body, nothing per-requester — so the help page can print a real reply time
// instead of a hardcoded one.
//
// requireAuth only, deliberately: unlike the routes above there is no per-row data to scope, and
// an organization requester needs the same figure a seeker does. resolveRequesterScope is NOT
// called here for that reason — an admin hitting this endpoint gets the same public aggregate
// rather than a 403, which is harmless because that is all it can ever return.
const getMyResponseTime = asyncHandler(async (_req, res) => {
  const responseTime = await buildPublicResponseStat();

  return sendSuccess(res, {
    message: "Support response time fetched successfully.",
    responseTime
  });
});

module.exports = {
  listMyTickets,
  getMyTicket,
  replyToMyTicket,
  getMyResponseTime,
  // Exported for the route-level tests; not mounted anywhere.
  toRequesterTicket,
  toRequesterMessage
};
