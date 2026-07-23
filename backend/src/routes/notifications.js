const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const {
  getNotifications,
  markAsRead,
  markAllAsRead,
  clearNotification,
  clearAllNotifications
} = require("../controllers/notificationController");

const router = express.Router();

router.use(requireAuth);
router.get("/", getNotifications);
router.delete("/", clearAllNotifications);
router.put("/read-all", markAllAsRead);
router.put("/:id/read", markAsRead);
router.delete("/:id", clearNotification);

module.exports = router;
