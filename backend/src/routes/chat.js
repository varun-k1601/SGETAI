const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const {
  initiateChat,
  getChatSessions,
  getSessionMessages,
  sendMessage,
  closeChatSession
} = require("../controllers/chatController");

const router = express.Router();

router.get("/sessions", requireAuth, getChatSessions);
router.post("/initiate", requireAuth, initiateChat);
router.get("/:sessionId/messages", requireAuth, getSessionMessages);
router.post("/:sessionId/messages", requireAuth, sendMessage);
router.delete("/:sessionId", requireAuth, closeChatSession);

module.exports = router;
