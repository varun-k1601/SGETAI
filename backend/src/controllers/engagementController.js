const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");
const Post = require("../models/Post");
const Like = require("../models/Like");
const Comment = require("../models/Comment");
const { createNotification } = require("../services/notificationService");
const { resolveAuthorModel } = require("./postController");
const { requireNonEmptyString } = require("../utils/validation");

const toggleLike = asyncHandler(async (req, res) => {
  const userModel = resolveAuthorModel(req.user.role);

  if (!userModel) {
    throw new ApiError(403, "This role cannot engage with posts.");
  }

  const post = await Post.findById(req.params.id);

  if (!post) {
    throw new ApiError(404, "Post not found.");
  }

  const existingLike = await Like.findOne({
    postId: post._id,
    userId: req.user.id
  });

  let liked;
  if (existingLike) {
    await existingLike.deleteOne();
    post.likesCount = Math.max(0, post.likesCount - 1);
    liked = false;
  } else {
    await Like.create({
      postId: post._id,
      userId: req.user.id,
      userModel
    });
    post.likesCount += 1;
    liked = true;

    if (post.authorId.toString() !== req.user.id) {
      await createNotification({
        recipientId: post.authorId,
        recipientRole: post.authorModel === "Organization" ? "organization" : "seeker",
        type: "post_like",
        title: "New like on your post",
        message: "Someone liked your post.",
        metadata: { postId: post._id, likedBy: req.user.id }
      });
    }
  }

  await post.save();

  return sendSuccess(res, {
    message: liked ? "Post liked successfully." : "Post unliked successfully.",
    liked,
    likesCount: post.likesCount
  });
});

const addComment = asyncHandler(async (req, res) => {
  const userModel = resolveAuthorModel(req.user.role);
  if (!userModel) {
    throw new ApiError(403, "This role cannot comment on posts.");
  }

  const post = await Post.findById(req.params.id);

  if (!post) {
    throw new ApiError(404, "Post not found.");
  }

  const comment = await Comment.create({
    postId: post._id,
    userId: req.user.id,
    userModel,
    content: requireNonEmptyString(req.body.content, "content")
  });

  post.commentsCount += 1;
  await post.save();

  if (post.authorId.toString() !== req.user.id) {
    await createNotification({
      recipientId: post.authorId,
      recipientRole: post.authorModel === "Organization" ? "organization" : "seeker",
      type: "post_comment",
      title: "New comment on your post",
      message: "Someone commented on your post.",
      metadata: { postId: post._id, commentId: comment._id }
    });
  }

  return sendSuccess(res, {
    message: "Comment added successfully.",
    comment,
    commentsCount: post.commentsCount
  }, 201);
});

module.exports = {
  toggleLike,
  addComment
};
