const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const optionalAuth = require("../middleware/optionalAuth");
const {
  searchJobs,
  searchSeekers,
  searchOrganizations
} = require("../controllers/jobSearchController");

const router = express.Router();

router.get("/jobs", optionalAuth, searchJobs);
router.get("/seekers", requireAuth, searchSeekers);
router.get("/organizations", requireAuth, searchOrganizations);

module.exports = router;
