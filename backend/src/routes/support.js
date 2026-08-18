const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const {
  listTickets,
  getTicket,
  replyToTicket,
  updateTicket,
  createTicket,
  getSupportMetrics,
  listAssignees
} = require("../controllers/supportController");

const router = express.Router();

// Same gate as routes/admin.js — the whole support desk is admin-only. No route below widens it.
router.use(requireAuth);
router.use(requireRole(["SuperAdmin", "Moderator"]));

router.get("/metrics", getSupportMetrics);
router.get("/assignees", listAssignees);
router.get("/tickets", listTickets);
router.post("/tickets", createTicket);
router.get("/tickets/:id", getTicket);
router.post("/tickets/:id/messages", replyToTicket);
router.patch("/tickets/:id", updateTicket);

module.exports = router;
