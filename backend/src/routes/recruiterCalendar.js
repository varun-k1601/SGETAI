const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const requireOrgMemberRole = require("../middleware/requireOrgMemberRole");
const {
  connectCalendar,
  calendarCallback,
  getCalendarStatus,
  disconnectCalendar,
  scheduleInterview,
  rescheduleInterview,
  cancelInterview,
  SCHEDULING_ROLES
} = require("../controllers/recruiterCalendarController");

const router = express.Router();

// These two are reached by real top-level browser navigation — the recruiter's own click, then
// Google's server-side redirect back — so neither can carry the Authorization header requireAuth
// needs. Each proves identity itself: connectCalendar verifies a token query param exactly as
// requireAuth does, calendarCallback verifies the signed `state` Google echoes back. Same shape as
// the LinkedIn connect flow in proFeatures.js, for the same reason.
router.get("/connect", connectCalendar);
router.get("/callback", calendarCallback);

router.use(requireAuth);

/* Everything below is per-MEMBER, so requireOrgMemberRole does the work: it rejects anyone who is
   not an organization session, refuses a legacy JWT with no memberId, re-reads the member from the
   database, and requires them to be Active in an allowed role. It also hands the handler
   req.orgMember, which is the identity the calendar grant is keyed to.

   The tenant check (does this organization own the job this application is for?) is separate and
   lives in the controller, where the application is loaded. */
const requireSchedulingMember = requireOrgMemberRole(SCHEDULING_ROLES);

router.get("/status", requireSchedulingMember, getCalendarStatus);
router.post("/disconnect", requireSchedulingMember, disconnectCalendar);
router.post("/applications/:applicationId/interview", requireSchedulingMember, scheduleInterview);
router.patch("/interviews/:interviewId", requireSchedulingMember, rescheduleInterview);
router.delete("/interviews/:interviewId", requireSchedulingMember, cancelInterview);

module.exports = router;
