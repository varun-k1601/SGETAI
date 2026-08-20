const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const {
  triggerVerification,
  submitVerification,
  getMyVerificationRequests
} = require("../controllers/verificationController");

const router = express.Router();

// Registered ahead of "/:applicationId/trigger" only matters if a literal path could collide with
// that param route — it can't ("mine" is not a POST), but kept alongside the other "mine"-style
// routes (jobs.js, posts.js) for consistency.
router.get("/mine", requireAuth, getMyVerificationRequests);
router.post("/:applicationId/trigger", requireAuth, triggerVerification);
router.post("/submit", submitVerification);

module.exports = router;
