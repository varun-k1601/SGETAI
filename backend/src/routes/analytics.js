const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const {
  getOrganizationAnalytics,
  getSeekerAnalytics
} = require("../controllers/analyticsController");

const router = express.Router();

router.get("/seekers", requireAuth, getSeekerAnalytics);
router.get("/organizations", requireAuth, getOrganizationAnalytics);

module.exports = router;
