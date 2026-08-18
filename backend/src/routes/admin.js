const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const {
  getAdminOverview,
  updateAdminProPolicy,
  updateAdminRecruiterIntroPolicy,
  updateJobThreshold
} = require("../controllers/adminController");

const router = express.Router();

router.use(requireAuth);
router.use(requireRole(["SuperAdmin", "Moderator"]));

router.get("/overview", getAdminOverview);
router.put("/pro-auto-apply-policy", requireRole(["SuperAdmin"]), updateAdminProPolicy);
router.put(
  "/pro-recruiter-intro-policy",
  requireRole(["SuperAdmin"]),
  updateAdminRecruiterIntroPolicy
);
router.put("/jobs/:jobId/threshold", requireRole(["SuperAdmin"]), updateJobThreshold);

module.exports = router;
