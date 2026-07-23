const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const {
  listPlans,
  getMySubscription,
  createCheckoutSession,
  confirmCheckoutSession
} = require("../controllers/subscriptionController");

const router = express.Router();

router.use(requireAuth);
router.get("/plans", listPlans);
router.get("/me", getMySubscription);
router.post("/checkout", createCheckoutSession);
router.post("/confirm", confirmCheckoutSession);

module.exports = router;
