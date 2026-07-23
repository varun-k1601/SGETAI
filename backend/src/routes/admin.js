const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const {
  getAdminOverview,
  updateAdminProPolicy,
  updateJobThreshold
} = require("../controllers/adminController");

const router = express.Router();

router.use(requireAuth);
router.use(requireRole(["SuperAdmin", "Moderator"]));

router.get("/overview", getAdminOverview);
router.put("/pro-auto-apply-policy", requireRole(["SuperAdmin"]), updateAdminProPolicy);
router.put("/jobs/:jobId/threshold", requireRole(["SuperAdmin"]), updateJobThreshold);

module.exports = router;
