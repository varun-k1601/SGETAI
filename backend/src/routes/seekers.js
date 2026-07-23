const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const optionalAuth = require("../middleware/optionalAuth");
const {
  updateVisibility,
  getSeekerProfile
} = require("../controllers/jobSeekerController");

const router = express.Router();

router.put("/visibility", requireAuth, updateVisibility);
router.get("/:id", optionalAuth, getSeekerProfile);

module.exports = router;
