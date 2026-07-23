const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const {
  followOrganization,
  unfollowOrganization,
  updateFollowPreferences,
  listFollows
} = require("../controllers/followController");

const router = express.Router();

router.use(requireAuth);
router.post("/:organizationId", followOrganization);
router.delete("/:organizationId", unfollowOrganization);
router.put("/:organizationId/preferences", updateFollowPreferences);
router.get("/", listFollows);

module.exports = router;
