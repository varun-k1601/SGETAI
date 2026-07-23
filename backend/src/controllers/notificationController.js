const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");
const ApiError = require("../utils/ApiError");
const Notification = require("../models/Notification");
const { normalizePagination } = require("../utils/validation");

const getNotifications = asyncHandler(async (req, res) => {
  const { page, limit, skip } = normalizePagination(req.query);
  const filter = {
    recipientId: req.user.id,
    recipientRole: req.user.role
  };

  const [notifications, total] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Notification.countDocuments(filter)
  ]);

  return sendSuccess(res, {
    message: "Notifications fetched successfully.",
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1)
    },
    notifications
  });
});

const markAsRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findOne({
    _id: req.params.id,
    recipientId: req.user.id,
    recipientRole: req.user.role
  });

  if (!notification) {
    throw new ApiError(404, "Notification not found.");
  }

  notification.isRead = true;
  await notification.save();

  return sendSuccess(res, {
    message: "Notification marked as read.",
    notification
  });
});

const markAllAsRead = asyncHandler(async (req, res) => {
  await Notification.updateMany(
    { recipientId: req.user.id, recipientRole: req.user.role, isRead: false },
    { $set: { isRead: true } }
  );

  return sendSuccess(res, {
    message: "All notifications marked as read."
  });
});

const clearNotification = asyncHandler(async (req, res) => {
  const notification = await Notification.findOneAndDelete({
    _id: req.params.id,
    recipientId: req.user.id,
    recipientRole: req.user.role
  });

  if (!notification) {
    throw new ApiError(404, "Notification not found.");
  }

  return sendSuccess(res, {
    message: "Notification cleared."
  });
});

const clearAllNotifications = asyncHandler(async (req, res) => {
  const result = await Notification.deleteMany({
    recipientId: req.user.id,
    recipientRole: req.user.role
  });

  return sendSuccess(res, {
    message: "All notifications cleared.",
    deletedCount: result.deletedCount || 0
  });
});

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
  clearNotification,
  clearAllNotifications
};
