const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const { uploadSingle } = require("../middleware/upload");
const {
  createJob,
  updateJob,
  getMyJobs,
  getMyJobsOverview,
  closeJob,
  publishJob,
  deleteJob,
  applyToJob,
  getJobById,
  getJobApplications
} = require("../controllers/jobController");

const router = express.Router();

router.post("/", requireAuth, createJob);
router.get("/mine", requireAuth, getMyJobs);
router.get("/mine/overview", requireAuth, getMyJobsOverview);
router.get("/:jobId", requireAuth, getJobById);
router.put("/:jobId", requireAuth, updateJob);
router.put("/:jobId/close", requireAuth, closeJob);
router.put("/:jobId/publish", requireAuth, publishJob);
router.delete("/:jobId", requireAuth, deleteJob);
router.post("/:jobId/apply", requireAuth, uploadSingle, applyToJob);
router.get("/:jobId/applications", requireAuth, getJobApplications);

module.exports = router;
