const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const { submitFeedback, listFeedback } = require("../controllers/feedbackController");

const router = express.Router();

router.post("/", requireAuth, submitFeedback);
router.get("/", requireAuth, requireRole(["SuperAdmin", "Moderator"]), listFeedback);

module.exports = router;
