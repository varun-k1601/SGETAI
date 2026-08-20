const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const optionalAuth = require("../middleware/optionalAuth");
const { uploadArray } = require("../middleware/upload");
const { getFeed, getMyPosts, createPost, deletePost } = require("../controllers/postController");
const { toggleLike, addComment } = require("../controllers/engagementController");

const router = express.Router();

router.get("/feed", optionalAuth, getFeed);
// Must be registered ahead of any future GET "/:id" route — "mine" would otherwise be swallowed
// as an :id param.
router.get("/mine", requireAuth, getMyPosts);
router.post("/", requireAuth, uploadArray, createPost);
router.delete("/:id", requireAuth, deletePost);
router.post("/:id/like", requireAuth, toggleLike);
router.post("/:id/comment", requireAuth, addComment);

module.exports = router;
