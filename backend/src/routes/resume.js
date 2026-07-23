const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const { uploadSingle } = require("../middleware/upload");
const { checkResumeAts } = require("../controllers/resumeController");

const router = express.Router();

router.post("/ats-check", requireAuth, uploadSingle, checkResumeAts);

module.exports = router;
