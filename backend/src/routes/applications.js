const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const {
  getMyApplications,
  updateApplicationStatus,
  withdrawApplication,
  downloadApplicationResume
} = require("../controllers/applicationController");

const router = express.Router();

router.get("/mine", requireAuth, getMyApplications);
router.get("/:id/resume", requireAuth, downloadApplicationResume);
router.put("/:id/withdraw", requireAuth, withdrawApplication);
router.put("/:id/status", requireAuth, updateApplicationStatus);

module.exports = router;
