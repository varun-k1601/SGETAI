const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const {
  triggerVerification,
  submitVerification
} = require("../controllers/verificationController");

const router = express.Router();

router.post("/:applicationId/trigger", requireAuth, triggerVerification);
router.post("/submit", submitVerification);

module.exports = router;
