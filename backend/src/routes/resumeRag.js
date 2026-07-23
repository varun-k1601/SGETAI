const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const { uploadSingle } = require("../middleware/upload");
const {
  uploadResumeForRag,
  getResumeStatusEndpoint,
  listResumes,
  deleteResumeEndpoint,
  quickAnalyzeResume,
  analyzeApplicationWithRag
} = require("../controllers/resumeRagController");

const router = express.Router();

router.post("/upload", requireAuth, uploadSingle, uploadResumeForRag);
router.get("/:resumeId/status", requireAuth, getResumeStatusEndpoint);
router.get("/user/list", requireAuth, listResumes);
router.delete("/:resumeId", requireAuth, deleteResumeEndpoint);
router.post("/quick-analyze", requireAuth, quickAnalyzeResume);
router.post("/applications/:applicationId/analyze", requireAuth, analyzeApplicationWithRag);

module.exports = router;
