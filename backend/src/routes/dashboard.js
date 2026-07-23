const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const {
  getNormalDashboard,
  getRecruiterDashboard
} = require("../controllers/dashboardController");

const router = express.Router();

// Normal dashboard (for all seekers)
router.get("/normal", requireAuth, getNormalDashboard);

// Recruiter dashboard (for organizations only)
router.get("/recruiter", requireAuth, getRecruiterDashboard);

module.exports = router;
