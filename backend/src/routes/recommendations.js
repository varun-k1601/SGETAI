const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const { getRecommendedJobs } = require("../controllers/recommendationController");

const router = express.Router();

router.get("/jobs", requireAuth, getRecommendedJobs);

module.exports = router;
