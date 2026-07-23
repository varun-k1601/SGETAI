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

module.exports = {
  createNotification
};
