const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const requireOrgMemberRole = require("../middleware/requireOrgMemberRole");
const {
  MANAGER_ROLES,
  inviteMember,
  completeInvite,
  listMembers,
  updateMemberRole,
  removeMember
} = require("../controllers/organizationMemberController");

const router = express.Router();

// Public — the invite email links here with a signed token, no prior session exists yet.
router.post("/complete-invite", completeInvite);

router.use(requireAuth, requireRole(["organization"]));

router.get("/", listMembers);
router.post("/invite", requireOrgMemberRole(MANAGER_ROLES), inviteMember);
router.put("/:id/role", requireOrgMemberRole(["Owner"]), updateMemberRole);
router.delete("/:id", requireOrgMemberRole(MANAGER_ROLES), removeMember);

module.exports = router;
