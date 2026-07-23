const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const {
  uploadSingle,
  uploadProjectFiles
} = require("../middleware/upload");
const {
  getMyProfile,
  updateMyProfile,
  updateCareerObjective,
  updateProfilePicture,
  removeProfilePicture,
  updateBackgroundVideo,
  removeBackgroundVideo,
  streamProfileMedia,
  parseResumeForProfile,
  applyParsedResume
} = require("../controllers/profileController");
const projectsController = require("../controllers/projectsController");
const certificationsController = require("../controllers/certificationsController");
const researchController = require("../controllers/researchController");
const achievementsController = require("../controllers/achievementsController");

const router = express.Router();

router.use(requireAuth);

router.get("/me", getMyProfile);
router.put("/me", updateMyProfile);
router.get("/media/:mediaType", streamProfileMedia);
router.put("/picture", uploadSingle, updateProfilePicture);
router.delete("/picture", removeProfilePicture);
router.put("/background-video", uploadSingle, updateBackgroundVideo);
router.delete("/background-video", removeBackgroundVideo);
router.put("/career-objective", updateCareerObjective);
router.post("/parse-resume", uploadSingle, parseResumeForProfile);
router.put("/apply-parsed-resume", applyParsedResume);

router.get("/projects", projectsController.list);
router.post("/projects", uploadProjectFiles, projectsController.create);
router.put("/projects/:projectId", uploadProjectFiles, projectsController.update);
router.delete("/projects/:projectId", projectsController.remove);

router.get("/certifications", certificationsController.list);
router.post("/certifications", uploadSingle, certificationsController.create);
router.put("/certifications/:certId", uploadSingle, certificationsController.update);
router.delete("/certifications/:certId", certificationsController.remove);

router.get("/research", researchController.list);
router.post("/research", uploadSingle, researchController.create);
router.put("/research/:researchId", uploadSingle, researchController.update);
router.delete("/research/:researchId", researchController.remove);

router.get("/achievements", achievementsController.list);
router.post("/achievements", uploadSingle, achievementsController.create);
router.put("/achievements/:achievementId", uploadSingle, achievementsController.update);
router.delete("/achievements/:achievementId", achievementsController.remove);

module.exports = router;
