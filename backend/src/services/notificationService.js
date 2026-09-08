const mongoose = require("mongoose");

const Notification = require("../models/Notification");
const { emitToUser } = require("../utils/socketServer");

async function createNotification({
  recipientId,
  recipientRole,
  type,
  title,
  message,
  metadata = {}
}) {
  const notification = await Notification.create({
    recipientId,
    recipientRole,
    type,
    title,
    message,
    metadata
  });

  emitToUser(
    { id: recipientId, role: recipientRole },
    "notification",
    {
      recipientId: String(recipientId),
      recipientRole,
      notification
    }
  );

  return notification;
}

/* A connection_request notification is not a record of something that happened — it is a PROMPT,
   and it stops being answerable the moment the request is responded to or the connection row is
   removed. Resolving it is therefore a DELETE.

   Marking it read would not do. NotificationsPage renders the Accept/Decline pair from the type
   and metadata.connectionId alone; isRead is not consulted anywhere in that branch, so a read
   notification still draws two live buttons onto a request that can only answer 400 or 404.

   It lives here, beside createNotification, because the same prompt is spent by more than one
   caller: responding to the request, and removing the connection outright. A third will appear.

   metadata is a Mixed field, so Mongoose applies NO casting to metadata.connectionId — an id
   passed as a string would silently match nothing at all. Both representations are matched rather
   than trusting every future caller to hand over an ObjectId. */
async function resolveConnectionRequestNotification({ recipientId, connectionId }) {
  if (!recipientId || !connectionId) {
    return 0;
  }

  const candidates = [String(connectionId)];

  if (mongoose.Types.ObjectId.isValid(connectionId)) {
    candidates.push(new mongoose.Types.ObjectId(String(connectionId)));
  }

  try {
    /* Scoped by all three of recipient, type and connection. Never by connectionId alone: the
       requester's connection_accepted / connection_rejected notification carries the very same
       connectionId in its own metadata, and that one is how they learn the outcome. */
    const result = await Notification.deleteMany({
      recipientId,
      type: "connection_request",
      "metadata.connectionId": { $in: candidates }
    });

    return result.deletedCount || 0;
  } catch (error) {
    /* Never fails the caller. The connection was already saved or removed, so the user's action
       succeeded; a prompt that could not be deleted is a stale row, not a failed accept. */
    console.warn(
      `[Notifications] Could not clear the connection request prompt for connection ${connectionId}: ${error.message}`
    );
    return 0;
  }
}

module.exports = {
  createNotification,
  resolveConnectionRequestNotification
};
