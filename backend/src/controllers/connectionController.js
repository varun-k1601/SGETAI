const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");
const Connection = require("../models/Connection");
const JobSeeker = require("../models/JobSeeker");
const { createNotification } = require("../services/notificationService");
const { attachMediaUrl } = require("../services/mediaUrlService");
const { requireNonEmptyString } = require("../utils/validation");

function ensureSeeker(req) {
  if (req.user.role !== "seeker") {
    throw new ApiError(403, "Only job seekers can manage connections.");
  }
}

// Was a third copy of the same getReadableFileUrl-based helper (profileController and
// jobSearchController carried the others). Delegates to the one signed implementation.
const ensureMediaUrl = attachMediaUrl;

function toConnectionSummary(connection, currentUserId) {
  const isRequester = connection.requester?._id?.toString() === String(currentUserId);
  const counterpart = isRequester ? connection.recipient : connection.requester;

  return {
    id: connection._id,
    status: connection.status,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
    respondedAt: connection.respondedAt || null,
    direction: isRequester ? "sent" : "received",
    counterpart
  };
}

const sendConnectionRequest = asyncHandler(async (req, res) => {
  ensureSeeker(req);

  const requesterId = req.user.id;
  const recipientId = req.params.recipientId;

  if (String(requesterId) === String(recipientId)) {
    throw new ApiError(400, "You cannot send a connection request to yourself.");
  }

  const [requester, recipient] = await Promise.all([
    JobSeeker.findById(requesterId),
    JobSeeker.findById(recipientId)
  ]);

  if (!requester) {
    throw new ApiError(404, "Job seeker not found.");
  }

  if (!recipient) {
    throw new ApiError(404, "Recipient job seeker not found.");
  }

  const [existing, reverse] = await Promise.all([
    Connection.findOne({ requester: requester._id, recipient: recipient._id }),
    Connection.findOne({ requester: recipient._id, recipient: requester._id })
  ]);

  const activeConnection = existing || reverse;
  if (activeConnection?.status === "Accepted") {
    throw new ApiError(409, "You are already connected with this job seeker.");
  }

  if (existing?.status === "Pending") {
    throw new ApiError(409, "A connection request has already been sent to this user.");
  }

  if (reverse?.status === "Pending") {
    throw new ApiError(409, "This user has already sent you a connection request. Respond to that request instead.");
  }

  if (existing && ["Rejected", "Ignored"].includes(existing.status)) {
    existing.status = "Pending";
    existing.respondedAt = undefined;
    await existing.save();

    await createNotification({
      recipientId: recipient._id,
      recipientRole: "seeker",
      type: "connection_request",
      title: "New connection request",
      message: `${requester.firstName} ${requester.lastName} sent you a connection request.`,
      metadata: { connectionId: existing._id, requesterId: requester._id }
    });

    return sendSuccess(res, {
      message: "Connection request sent successfully.",
      connection: existing
    }, 201);
  }

  if (reverse && ["Rejected", "Ignored"].includes(reverse.status)) {
    reverse.requester = requester._id;
    reverse.recipient = recipient._id;
    reverse.status = "Pending";
    reverse.respondedAt = undefined;
    await reverse.save();

    await createNotification({
      recipientId: recipient._id,
      recipientRole: "seeker",
      type: "connection_request",
      title: "New connection request",
      message: `${requester.firstName} ${requester.lastName} sent you a connection request.`,
      metadata: { connectionId: reverse._id, requesterId: requester._id }
    });

    return sendSuccess(res, {
      message: "Connection request sent successfully.",
      connection: reverse
    }, 201);
  }

  let connection;
  try {
    connection = await Connection.create({
      requester: requester._id,
      recipient: recipient._id
    });
  } catch (error) {
    if (error.code === 11000) {
      throw new ApiError(409, "A connection request already exists for this user pair.");
    }
    throw error;
  }

  await createNotification({
    recipientId: recipient._id,
    recipientRole: "seeker",
    type: "connection_request",
    title: "New connection request",
    message: `${requester.firstName} ${requester.lastName} sent you a connection request.`,
    metadata: { connectionId: connection._id, requesterId: requester._id }
  });

  return sendSuccess(res, {
    message: "Connection request sent successfully.",
    connection
  }, 201);
});

const respondToConnection = asyncHandler(async (req, res) => {
  ensureSeeker(req);

  const status = requireNonEmptyString(req.body.status, "status");
  const allowedStatuses = ["Accepted", "Rejected", "Ignored"];

  if (!allowedStatuses.includes(status)) {
    throw new ApiError(400, "status must be Accepted, Rejected, or Ignored.");
  }

  const connection = await Connection.findById(req.params.connectionId)
    .populate("requester", "firstName lastName email")
    .populate("recipient", "firstName lastName email");

  if (!connection) {
    throw new ApiError(404, "Connection request not found.");
  }

  if (connection.recipient._id.toString() !== req.user.id) {
    throw new ApiError(403, "Only the recipient can respond to this connection request.");
  }

  if (connection.status !== "Pending") {
    throw new ApiError(400, "This connection request has already been responded to.");
  }

  connection.status = status;
  connection.respondedAt = new Date();
  await connection.save();

  if (status !== "Ignored") {
    const actionLabel = status === "Accepted" ? "accepted" : "rejected";
    await createNotification({
      recipientId: connection.requester._id,
      recipientRole: "seeker",
      type: `connection_${actionLabel}`,
      title: `Connection request ${actionLabel}`,
      message: `${connection.recipient.firstName} ${connection.recipient.lastName} ${actionLabel} your connection request.`,
      metadata: { connectionId: connection._id, recipientId: connection.recipient._id }
    });
  }

  return sendSuccess(res, {
    message: `Connection request ${status.toLowerCase()} successfully.`,
    connection
  });
});

const getPendingConnections = asyncHandler(async (req, res) => {
  ensureSeeker(req);

  const pendingConnections = await Connection.find({
    recipient: req.user.id,
    status: "Pending"
  })
    .populate("requester", "firstName lastName email tagline profilePicture profileVisibility")
    .sort({ createdAt: -1 });

  const connectionsWithUrls = await Promise.all(
    pendingConnections.map(async (connection) => {
      const requester = connection.requester.toObject ? connection.requester.toObject() : connection.requester;
      requester.profilePicture = await ensureMediaUrl(requester.profilePicture);

      return {
        id: connection._id,
        status: connection.status,
        createdAt: connection.createdAt,
        requester
      };
    })
  );

  return sendSuccess(res, {
    message: "Pending connection requests fetched successfully.",
    connections: connectionsWithUrls
  });
});

const getAcceptedConnections = asyncHandler(async (req, res) => {
  ensureSeeker(req);

  const connections = await Connection.find({
    status: "Accepted",
    $or: [{ requester: req.user.id }, { recipient: req.user.id }]
  })
    .populate("requester", "firstName lastName email tagline profilePicture profileVisibility skills")
    .populate("recipient", "firstName lastName email tagline profilePicture profileVisibility skills")
    .sort({ updatedAt: -1 });

  const connectionsWithUrls = await Promise.all(
    connections.map(async (connection) => {
      const requester = connection.requester.toObject ? connection.requester.toObject() : connection.requester;
      const recipient = connection.recipient.toObject ? connection.recipient.toObject() : connection.recipient;

      requester.profilePicture = await ensureMediaUrl(requester.profilePicture);
      recipient.profilePicture = await ensureMediaUrl(recipient.profilePicture);

      return toConnectionSummary({ ...connection, requester, recipient }, req.user.id);
    })
  );

  return sendSuccess(res, {
    message: "Accepted connections fetched successfully.",
    connections: connectionsWithUrls
  });
});

const removeConnection = asyncHandler(async (req, res) => {
  ensureSeeker(req);

  const connection = await Connection.findById(req.params.connectionId);

  if (!connection) {
    throw new ApiError(404, "Connection not found.");
  }

  const isParticipant =
    connection.requester.toString() === req.user.id ||
    connection.recipient.toString() === req.user.id;

  if (!isParticipant) {
    throw new ApiError(403, "You can only remove your own connections.");
  }

  await connection.deleteOne();

  return sendSuccess(res, {
    message: "Connection removed successfully."
  });
});

module.exports = {
  sendConnectionRequest,
  respondToConnection,
  getPendingConnections,
  getAcceptedConnections,
  removeConnection
};
