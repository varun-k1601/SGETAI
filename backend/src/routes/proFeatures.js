const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const requirePro = require("../middleware/requirePro");
const { uploadArray } = require("../middleware/upload");
const {
  preApplyCheck,
  generateResume,
  generateResumePdf,
  tailorResumeFromJdText,
  matchJobsToSeeker,
  draftLinkedInPost,
  writeRecruiterDm,
  listGeneratedArtifacts,
  dismissGeneratedArtifact,
  dismissAllGeneratedArtifacts,
  chatWithAgent,
  getCareerAgentDebugContext,
  getAutoApplyPreferences,
  updateAutoApplyPreferences,
  runAutoApplyTest,
  getAutoApplyRuns,
  dismissActivityEntry,
  dismissAllActivityEntries,
  connectLinkedIn,
  linkedinCallback,
  getLinkedInStatus,
  disconnectLinkedIn,
  publishLinkedInPost,
  getRecruiterIntroductionStats
} = require("../controllers/proFeaturesController");

const router = express.Router();

// These two are reached via real top-level browser navigation (the seeker's own click, and
// LinkedIn's server-side redirect back) rather than an authenticated XHR from our frontend, so
// they can't rely on the requireAuth middleware below — each verifies identity itself
// (connectLinkedIn via a token query param, linkedinCallback via the signed `state` param).
router.get("/linkedin/connect", connectLinkedIn);
router.get("/linkedin/callback", linkedinCallback);

// All routes below require authentication
router.use(requireAuth);

// Available to all authenticated users
router.post("/jobs/:jobId/pre-apply-check", preApplyCheck);
router.post("/agent/chat", uploadArray, chatWithAgent);

// Pro-only features
router.post("/jobs/:jobId/generate-resume", requirePro, generateResume);
router.post("/jobs/:jobId/generate-resume/pdf", requirePro, generateResumePdf);
router.post("/agent/tailor-resume-pdf", requirePro, tailorResumeFromJdText);
router.post("/agent/match-jobs", requirePro, matchJobsToSeeker);
router.post("/agent/linkedin-post", requirePro, draftLinkedInPost);
router.post("/agent/recruiter-dm", requirePro, writeRecruiterDm);
router.get("/agent/artifacts", requirePro, listGeneratedArtifacts);
router.patch("/agent/artifacts/dismiss-all", requirePro, dismissAllGeneratedArtifacts);
router.patch("/agent/artifacts/:artifactId/dismiss", requirePro, dismissGeneratedArtifact);
router.post("/agent/debug-context", requirePro, getCareerAgentDebugContext);
router.get("/auto-apply/preferences", requirePro, getAutoApplyPreferences);
router.put("/auto-apply/preferences", requirePro, updateAutoApplyPreferences);
router.get("/auto-apply/runs", requirePro, getAutoApplyRuns);
router.get("/recruiter-introductions/stats", requirePro, getRecruiterIntroductionStats);
router.post("/auto-apply/test-run", requirePro, runAutoApplyTest);
router.patch("/agent/activity/dismiss-all", requirePro, dismissAllActivityEntries);
router.patch("/agent/activity/dismiss", requirePro, dismissActivityEntry);
router.get("/linkedin/status", getLinkedInStatus);
router.post("/linkedin/disconnect", disconnectLinkedIn);
router.post("/linkedin/posts/:artifactId/publish", requirePro, publishLinkedInPost);

module.exports = router;
