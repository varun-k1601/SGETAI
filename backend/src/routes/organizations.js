const express = require("express");
const optionalAuth = require("../middleware/optionalAuth");
const { getOrganizationProfile } = require("../controllers/organizationController");

const router = express.Router();

router.get("/:id", optionalAuth, getOrganizationProfile);

module.exports = router;
