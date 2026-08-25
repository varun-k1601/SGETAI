const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");
const Post = require("../models/Post");
const Like = require("../models/Like");
const Comment = require("../models/Comment");
const JobSeeker = require("../models/JobSeeker");
const Organization = require("../models/Organization");
const { normalizePagination, requireNonEmptyString } = require("../utils/validation");
const {
  uploadMediaDescriptors,
  cleanupUploadedMedia,
  collectFilePaths,
  safeDeleteStoredFiles
} = require("../utils/mediaStorage");
const { attachMediaUrls } = require("../services/mediaUrlService");

const organizationPostTypes = new Set(["CompanyUpdate", "HiringPost", "Promotion", "Announcement"]);

function resolveAuthorModel(role) {
  if (role === "seeker") {
    return "JobSeeker";
  }
  if (role === "organization") {
    return "Organization";
  }
  return null;
}

function resolvePostType(role, value) {
  if (role !== "organization") {
    return "UserPost";
  }

  const normalizedValue = String(value || "CompanyUpdate").trim();

  if (!organizationPostTypes.has(normalizedValue)) {
    throw new ApiError(400, "postType must be CompanyUpdate, HiringPost, Promotion, or Announcement.");
  }

  return normalizedValue;
}

function roleToModelName(role) {
  return role === "organization" ? "Organization" : role === "seeker" ? "JobSeeker" : null;
}

function buildAuthorDisplay(authorModel, author) {
  if (!author) {
    return {
      name: authorModel === "Organization" ? "Organization" : "Applicant",
      subtitle: "Profile unavailable"
    };
  }

  if (authorModel === "Organization") {
    return {
      name: author.companyName || "Organization",
      subtitle: author.industry || author.websiteUrl || "Recruiter",
      avatar: author.logo
    };
  }

  return {
    name: `${author.firstName || ""} ${author.lastName || ""}`.trim() || "Applicant",
    subtitle: author.tagline || author.currentStatus || "Job seeker",
    avatar: author.profilePicture?.url
  };
}

async function decoratePosts(posts, authUser) {
  const plainPosts = posts.map((post) => post.toObject());
  const seekerIds = plainPosts
    .filter((post) => post.authorModel === "JobSeeker")
    .map((post) => post.authorId);
  const organizationIds = plainPosts
    .filter((post) => post.authorModel === "Organization")
    .map((post) => post.authorId);
  const postIds = plainPosts.map((post) => post._id);

  const [seekers, organizations, comments, likes] = await Promise.all([
    seekerIds.length
      ? JobSeeker.find({ _id: { $in: seekerIds } }).select("firstName lastName tagline currentStatus profilePicture")
      : [],
    organizationIds.length
      ? Organization.find({ _id: { $in: organizationIds } }).select("companyName industry websiteUrl logo")
      : [],
    postIds.length
      ? Comment.find({ postId: { $in: postIds } }).sort({ createdAt: -1 }).limit(postIds.length * 3)
      : [],
    authUser?.id && postIds.length
      ? Like.find({
          postId: { $in: postIds },
          userId: authUser.id,
          userModel: roleToModelName(authUser.role)
        })
      : []
  ]);

  const seekerMap = new Map(seekers.map((seeker) => [seeker._id.toString(), seeker]));
  const organizationMap = new Map(organizations.map((organization) => [organization._id.toString(), organization]));
  const likedPostIds = new Set(likes.map((like) => like.postId.toString()));

  // Extract unique commenter IDs for fetching user data
  const commenterSeekerIds = new Set();
  const commenterOrganizationIds = new Set();
  comments.forEach((comment) => {
    if (comment.userModel === "JobSeeker") {
      commenterSeekerIds.add(comment.userId.toString());
    } else {
      commenterOrganizationIds.add(comment.userId.toString());
    }
  });

  // Fetch commenter user data
  const [commenterSeekers, commenterOrganizations] = await Promise.all([
    commenterSeekerIds.size
      ? JobSeeker.find({ _id: { $in: Array.from(commenterSeekerIds) } }).select("firstName lastName")
      : [],
    commenterOrganizationIds.size
      ? Organization.find({ _id: { $in: Array.from(commenterOrganizationIds) } }).select("companyName")
      : []
  ]);

  const commenterSeekerMap = new Map(commenterSeekers.map((seeker) => [seeker._id.toString(), seeker]));
  const commenterOrganizationMap = new Map(commenterOrganizations.map((organization) => [organization._id.toString(), organization]));

  const commentsByPost = comments.reduce((accumulator, comment) => {
    const key = comment.postId.toString();
    accumulator[key] = accumulator[key] || [];
    if (accumulator[key].length < 3) {
      let userName = "User";
      if (comment.userModel === "JobSeeker") {
        const commenter = commenterSeekerMap.get(comment.userId.toString());
        if (commenter) {
          userName = `${commenter.firstName || ""} ${commenter.lastName || ""}`.trim() || "Applicant";
        }
      } else {
        const commenter = commenterOrganizationMap.get(comment.userId.toString());
        if (commenter) {
          userName = commenter.companyName || "Organization";
        }
      }
      accumulator[key].push({ ...comment.toObject(), userName });
    }
    return accumulator;
  }, {});

  /* ONE signature pass for the WHOLE page, through the shared resolver in mediaUrlService.
     This used to be a private ensureMediaUrl plus two inline getSignedFileUrl calls, which meant
     (a) a fifth copy of logic the service already owns, (b) one round-trip per author avatar AND
     one per media item — a 20-post feed with an image each cost 40 calls — and (c) the 3600s
     default TTL instead of MEDIA_URL_TTL_SECONDS, so feed images expired six times sooner than
     every other surface. attachMediaUrls deduplicates by filePath, so an author appearing on five
     posts is signed once. */
  const authorSlots = [
    ...[...seekerMap.entries()].map(([id, user]) => ({ key: `JobSeeker:${id}`, field: "profilePicture", user })),
    ...[...organizationMap.entries()].map(([id, user]) => ({ key: `Organization:${id}`, field: "logo", user }))
  ].map((slot) => ({ ...slot, plain: slot.user.toObject ? slot.user.toObject() : slot.user }));

  // Index-aligned so the flat resolved array can be split back apart: author avatars first, then
  // each post's media in post order.
  const resolvedMedia = await attachMediaUrls([
    ...authorSlots.map((slot) => slot.plain[slot.field]),
    ...plainPosts.flatMap((post) => post.media || [])
  ]);

  const authorByKey = new Map(
    authorSlots.map((slot, index) => [slot.key, { ...slot.plain, [slot.field]: resolvedMedia[index] }])
  );

  let mediaCursor = authorSlots.length;
  const mediaByPost = plainPosts.map((post) => {
    const count = (post.media || []).length;
    const slice = resolvedMedia.slice(mediaCursor, mediaCursor + count);
    mediaCursor += count;
    return slice;
  });

  return plainPosts.map((post, index) => ({
    ...post,
    media: mediaByPost[index],
    author: buildAuthorDisplay(post.authorModel, authorByKey.get(`${post.authorModel}:${post.authorId.toString()}`)),
    likedByMe: likedPostIds.has(post._id.toString()),
    recentComments: commentsByPost[post._id.toString()] || []
  }));
}

const createPost = asyncHandler(async (req, res) => {
  const authorModel = resolveAuthorModel(req.user.role);

  if (!authorModel) {
    throw new ApiError(403, "This role cannot create posts.");
  }

  const uploadedMedia = await uploadMediaDescriptors(req.files || [], "posts/media", {
    allowedTypes: ["image", "video", "document"],
    label: "Post media file"
  });

  let post;
  try {
    post = await Post.create({
      authorId: req.user.id,
      authorModel,
      content: requireNonEmptyString(req.body.content, "content"),
      postType: resolvePostType(req.user.role, req.body.postType),
      media: uploadedMedia
    });

    // Log post creation for debugging
    console.log(`✓ Post created: ${post._id} with ${uploadedMedia.length} media items`);
    if (uploadedMedia.length > 0) {
      console.log(`  Media URLs: ${uploadedMedia.map(m => m.url ? '✓' : '✗').join(', ')}`);
    }
  } catch (error) {
    console.error(`✗ Failed to create post:`, error.message);
    await cleanupUploadedMedia(uploadedMedia);
    throw error;
  }

  return sendSuccess(res, {
    message: "Post created successfully.",
    post
  }, 201);
});

const deletePost = asyncHandler(async (req, res) => {
  const post = await Post.findById(req.params.id);

  if (!post) {
    throw new ApiError(404, "Post not found.");
  }

  if (post.authorId.toString() !== req.user.id) {
    throw new ApiError(403, "You can only delete your own posts.");
  }

  await safeDeleteStoredFiles(collectFilePaths(post.media));

  await Promise.all([
    Like.deleteMany({ postId: post._id }),
    Comment.deleteMany({ postId: post._id }),
    post.deleteOne()
  ]);

  return sendSuccess(res, {
    message: "Post deleted successfully."
  });
});

const getFeed = asyncHandler(async (req, res) => {
  const { page, limit, skip } = normalizePagination(req.query);
  const [posts, total] = await Promise.all([
    Post.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
    Post.countDocuments()
  ]);

  console.log(`📋 getFeed: Found ${posts.length} posts (total: ${total})`);

  let decoratedPosts;
  try {
    decoratedPosts = await decoratePosts(posts, req.user);
    console.log(`✓ Successfully decorated ${decoratedPosts.length} posts`);
  } catch (error) {
    console.error(`✗ Error decorating posts:`, error.message);
    throw error;
  }

  return sendSuccess(res, {
    message: "Feed fetched successfully.",
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1)
    },
    posts: decoratedPosts
  });
});

// Scoped strictly to the caller's own author identity — authorId/authorModel come from req.user,
// never from a query param, so there is no way to request another account's posts through this
// route. For an organization account, req.user.id IS the Organization document's own _id (there
// is no separate "team member" identity), so every teammate signed into the same organization
// resolves to the same authorId and sees the same company feed here, not just their own posts.
const getMyPosts = asyncHandler(async (req, res) => {
  const authorModel = resolveAuthorModel(req.user.role);

  if (!authorModel) {
    throw new ApiError(403, "This role cannot have posts.");
  }

  const { page, limit, skip } = normalizePagination(req.query);
  const filter = { authorId: req.user.id, authorModel };

  const [posts, total] = await Promise.all([
    Post.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Post.countDocuments(filter)
  ]);

  const decoratedPosts = await decoratePosts(posts, req.user);

  return sendSuccess(res, {
    message: "Posts fetched successfully.",
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1)
    },
    posts: decoratedPosts
  });
});

module.exports = {
  createPost,
  deletePost,
  getFeed,
  getMyPosts,
  resolveAuthorModel
};
