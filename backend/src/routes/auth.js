const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const {
  register,
  registerOrganization,
  login,
  startOAuth,
  handleOAuthCallback,
  completeOAuthOrganization,
  adminLogin,
  me
} = require("../controllers/authController");

const router = express.Router();

router.post("/register/organization", registerOrganization);
router.post("/register/:role", register);
router.post("/login", login);
router.get("/oauth/:provider", startOAuth);
router.get("/oauth/:provider/callback", handleOAuthCallback);
router.post("/oauth/organization/complete", completeOAuthOrganization);
router.post("/admin/login", adminLogin);
router.get("/me", requireAuth, me);

module.exports = router;
