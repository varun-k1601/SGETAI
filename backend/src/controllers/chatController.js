const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");
const ChatSession = require("../models/ChatSession");
const ChatMessage = require("../models/ChatMessage");
const JobSeeker = require("../models/JobSeeker");
const Organization = require("../models/Organization");
const Connection = require("../models/Connection");
const Follow = require("../models/Follow");
const Application = require("../models/Application");
const { findUserByAuth, getModelForRole } = require("../utils/userModels");
const { requireNonEmptyString } = require("../utils/validation");
const { createNotification } = require("../services/notificationService");
const { emitToUser } = require("../utils/socketServer");

function buildParticipantKey(a, b) {
  return [a, b].sort().join("|");
}

function isParticipant(session, user) {
  return session.participants.some((participant) => {
    return participant.role === user?.role && participant.userId.toString() === user?.id;
  });
}

function getOtherParticipant(session, user) {
  return session.participants.find((participant) => {
    return !(participant.role === user?.role && participant.userId.toString() === user?.id);
  });
}

function buildUserDisplay(role, user) {
  if (!user) {
    return {
      name: role === "organization" ? "Recruiter" : "Applicant",
      subtitle: "Profile unavailable"
    };
  }

  if (role === "organization") {
    return {
      name: user.companyName || "Recruiter",
      subtitle: user.industry || user.email || "Organization",
      avatar: user.logo
    };
  }

  return {
    name: `${user.firstName || ""} ${user.lastName || ""}`.trim() || "Applicant",
    subtitle: user.tagline || user.currentStatus || user.email || "Job seeker",
    avatar: user.profilePicture?.url
  };
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function resolveRecipient(recipientRole, identifier) {
  const RecipientModel = getModelForRole(recipientRole);
  const trimmedIdentifier = String(identifier || "").trim();

  if (!RecipientModel || !trimmedIdentifier) {
    return null;
  }

  if (/^[0-9a-fA-F]{24}$/.test(trimmedIdentifier)) {
    const recipientById = await RecipientModel.findById(trimmedIdentifier);
    if (recipientById) {
      return recipientById;
    }
  }

  const exactIdentifier = trimmedIdentifier.toLowerCase();
  const query = {
    $or: [
      { username: exactIdentifier },
      { email: exactIdentifier }
    ]
  };

  if (recipientRole === "organization") {
    query.$or.push({ companyName: new RegExp(`^${escapeRegex(trimmedIdentifier)}$`, "i") });
  }

  return RecipientModel.findOne(query);
}

async function assertCanStartChat(sender, recipientRole, recipientId) {
  if (sender.role === "seeker" && recipientRole === "seeker") {
    const connection = await Connection.findOne({
      status: "Accepted",
      $or: [
        { requester: sender.id, recipient: recipientId },
        { requester: recipientId, recipient: sender.id }
      ]
    });

    if (!connection) {
      throw new ApiError(403, "You can chat with another applicant only after both users are connected.");
    }

    return;
  }

  const seekerId = sender.role === "seeker" ? sender.id : recipientId;
  const organizationId = sender.role === "organization" ? sender.id : recipientId;

  if (sender.role !== recipientRole && seekerId && organizationId) {
    const [follow, application] = await Promise.all([
      Follow.findOne({ jobSeekerId: seekerId, organizationId }),
      Application.findOne({ jobSeekerId: seekerId, organizationId })
    ]);

    if (!follow && !application) {
      throw new ApiError(
        403,
        "Applicant and recruiter chats require a follow or an existing application relationship."
      );
    }

    return;
  }

  if (sender.role === "organization" && recipientRole === "organization") {
    throw new ApiError(403, "Recruiter-to-recruiter chat is not available.");
  }
}

async function decorateSessions(sessions, authUser) {
  const plainSessions = sessions.map((session) => session.toObject());
  const otherParticipants = plainSessions
    .map((session) => getOtherParticipant(session, authUser))
    .filter(Boolean);
  const seekerIds = otherParticipants
    .filter((participant) => participant.role === "seeker")
    .map((participant) => participant.userId);
  const organizationIds = otherParticipants
    .filter((participant) => participant.role === "organization")
    .map((participant) => participant.userId);

  const [seekers, organizations] = await Promise.all([
    seekerIds.length
      ? JobSeeker.find({ _id: { $in: seekerIds } }).select("firstName lastName email tagline currentStatus profilePicture")
      : [],
    organizationIds.length
      ? Organization.find({ _id: { $in: organizationIds } }).select("companyName email industry logo")
      : []
  ]);

  const seekerMap = new Map(seekers.map((seeker) => [seeker._id.toString(), seeker]));
  const organizationMap = new Map(organizations.map((organization) => [organization._id.toString(), organization]));

  return plainSessions.map((session) => {
    const participant = getOtherParticipant(session, authUser);
    const profile =
      participant?.role === "organization"
        ? organizationMap.get(participant.userId.toString())
        : seekerMap.get(participant?.userId?.toString());

    return {
      ...session,
      otherParticipant: participant
        ? {
            ...participant,
            display: buildUserDisplay(participant.role, profile)
          }
        : null
    };
  });
}

const initiateChat = asyncHandler(async (req, res) => {
  const recipientIdentifier = requireNonEmptyString(
    req.body.recipientIdentifier || req.body.recipientId,
    "recipientIdentifier"
  );
  const recipientRole = requireNonEmptyString(req.body.recipientRole, "recipientRole");

  const sender = await findUserByAuth(req.user);
  if (!sender) {
    throw new ApiError(404, "Authenticated user not found.");
  }

  if (!["seeker", "organization"].includes(recipientRole)) {
    throw new ApiError(400, "recipientRole must be seeker or organization.");
  }

  const recipient = await resolveRecipient(recipientRole, recipientIdentifier);

  if (!recipient) {
    throw new ApiError(404, "Recipient not found. Check the username or email.");
  }

  const recipientId = recipient._id.toString();

  if (recipientRole === req.user.role && recipientId === req.user.id) {
    throw new ApiError(400, "You cannot start a chat with yourself.");
  }

  await assertCanStartChat(req.user, recipientRole, recipientId);

  const senderKey = `${req.user.role}:${req.user.id}`;
  const recipientKey = `${recipientRole}:${recipientId}`;
  const participantKey = buildParticipantKey(senderKey, recipientKey);

  let session = await ChatSession.findOne({ participantKey });

  if (!session) {
    session = await ChatSession.create({
      participants: [
        { userId: req.user.id, role: req.user.role },
        { userId: recipientId, role: recipientRole }
      ],
      participantKey,
      initiatedBy: req.user.id
    });
  }

  return sendSuccess(res, {
    message: "Chat session ready.",
    session
  }, 201);
});

const getChatSessions = asyncHandler(async (req, res) => {
  const sessions = await ChatSession.find({
    participants: {
      $elemMatch: {
        userId: req.user.id,
        role: req.user.role
      }
    }
  }).sort({ lastMessageAt: -1, updatedAt: -1 });

  const decoratedSessions = await decorateSessions(sessions, req.user);

  return sendSuccess(res, {
    message: "Chat sessions fetched successfully.",
    sessions: decoratedSessions
  });
});

const getSessionMessages = asyncHandler(async (req, res) => {
  const session = await ChatSession.findById(req.params.sessionId);

  if (!session) {
    throw new ApiError(404, "Chat session not found.");
  }

  if (!isParticipant(session, req.user)) {
    throw new ApiError(403, "You do not have access to this chat session.");
  }

  const messages = await ChatMessage.find({ sessionId: session._id }).sort({ createdAt: 1 });

  return sendSuccess(res, {
    message: "Chat messages fetched successfully.",
    messages
  });
});

const sendMessage = asyncHandler(async (req, res) => {
  const content = requireNonEmptyString(req.body.content, "content");
  const session = await ChatSession.findById(req.params.sessionId);

  if (!session) {
    throw new ApiError(404, "Chat session not found.");
  }

  if (!isParticipant(session, req.user)) {
    throw new ApiError(403, "You do not have access to this chat session.");
  }

  const message = await ChatMessage.create({
    sessionId: session._id,
    senderId: req.user.id,
    senderRole: req.user.role,
    content,
    readBy: [req.user.id]
  });

  session.lastMessage = content.slice(0, 240);
  session.lastMessageAt = message.createdAt;
  await session.save();

  const recipient = getOtherParticipant(session, req.user);

  if (recipient) {
    emitToUser(
      { id: recipient.userId.toString(), role: recipient.role },
      "chat:message",
      { sessionId: session._id, message }
    );

    await createNotification({
      recipientId: recipient.userId,
      recipientRole: recipient.role,
      type: "chat_message",
      title: "New chat message",
      message: "You received a new message.",
      metadata: {
        sessionId: session._id,
        messageId: message._id
      }
    });
  }

  return sendSuccess(res, {
    message: "Message sent successfully.",
    chatMessage: message
  }, 201);
});

const closeChatSession = asyncHandler(async (req, res) => {
  const session = await ChatSession.findById(req.params.sessionId);

  if (!session) {
    throw new ApiError(404, "Chat session not found.");
  }

  if (!isParticipant(session, req.user)) {
    throw new ApiError(403, "You do not have access to this chat session.");
  }

  await Promise.all([
    ChatMessage.deleteMany({ sessionId: session._id }),
    session.deleteOne()
  ]);

  return sendSuccess(res, {
    message: "Chat closed successfully."
  });
});

module.exports = {
  initiateChat,
  getChatSessions,
  getSessionMessages,
  sendMessage,
  closeChatSession
};
