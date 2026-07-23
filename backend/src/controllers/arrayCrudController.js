const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");
const { findUserByAuth } = require("../utils/userModels");
const { fireAndForget, syncSeekerEmbedding } = require("../services/aiSyncService");
const {
  cleanupUploadedMedia,
  clonePlain,
  collectFilePaths,
  safeDeleteStoredFiles
} = require("../utils/mediaStorage");

function createArrayCrudController(config) {
  const {
    arrayField,
    singularLabel,
    allowedRoles,
    prepareCreate,
    prepareUpdate,
    collectItemPaths = collectFilePaths,
    paramName = "itemId"
  } = config;

  function getItemIdFromParams(params) {
    return params[paramName];
  }

  function ensureRole(role) {
    if (!allowedRoles.includes(role)) {
      throw new ApiError(403, `${singularLabel} management is not available for this role.`);
    }
  }

  async function getProfileForRole(req) {
    ensureRole(req.user.role);

    const user = await findUserByAuth(req.user);

    if (!user) {
      throw new ApiError(404, "Authenticated user was not found.");
    }

    return user;
  }

  const list = asyncHandler(async (req, res) => {
    const user = await getProfileForRole(req);

    return sendSuccess(res, {
      message: `${singularLabel} list fetched successfully.`,
      [arrayField]: user[arrayField]
    });
  });

  const create = asyncHandler(async (req, res) => {
    const user = await getProfileForRole(req);
    const prepared = prepareCreate
      ? await prepareCreate(req, user)
      : { itemData: req.body, uploadedMedia: [] };
    const uploadedMedia = prepared.uploadedMedia || [];

    user[arrayField].push(prepared.itemData);
    try {
      await user.save();
    } catch (error) {
      await cleanupUploadedMedia(uploadedMedia);
      throw error;
    }
    if (req.user.role === "seeker") {
      fireAndForget(() => syncSeekerEmbedding(user._id));
    }

    return sendSuccess(
      res,
      {
        message: `${singularLabel} created successfully.`,
        item: user[arrayField][user[arrayField].length - 1]
      },
      201
    );
  });

  const update = asyncHandler(async (req, res) => {
    const user = await getProfileForRole(req);
    const itemId = getItemIdFromParams(req.params);
    const item = user[arrayField].id(itemId);

    if (!item) {
      throw new ApiError(404, `${singularLabel} not found.`);
    }

    const prepared = prepareUpdate
      ? await prepareUpdate(req, user, item)
      : { itemData: req.body, replacedPaths: [], performUpload: null };
    const replacedPaths = prepared.replacedPaths || [];
    const nextItemData = { ...(prepared.itemData || {}) };
    let uploadedMedia = [];

    if (prepared.performUpload) {
      if (replacedPaths.length) {
        await safeDeleteStoredFiles(replacedPaths);
      }

      const uploadResult = await prepared.performUpload();
      uploadedMedia = uploadResult.uploadedMedia || [];
      Object.assign(nextItemData, uploadResult.itemData || {});
    }

    item.set(nextItemData);
    try {
      await user.save();
    } catch (error) {
      await cleanupUploadedMedia(uploadedMedia);
      throw error;
    }

    if (req.user.role === "seeker") {
      fireAndForget(() => syncSeekerEmbedding(user._id));
    }

    return sendSuccess(res, {
      message: `${singularLabel} updated successfully.`,
      item
    });
  });

  const remove = asyncHandler(async (req, res) => {
    const user = await getProfileForRole(req);
    const itemId = getItemIdFromParams(req.params);
    const item = user[arrayField].id(itemId);
    const itemIndex = user[arrayField].findIndex((entry) => entry._id.toString() === itemId);

    if (!item) {
      throw new ApiError(404, `${singularLabel} not found.`);
    }

    const previousItem = clonePlain(item);
    const pathsToDelete = collectItemPaths(item);

    if (pathsToDelete.length) {
      await safeDeleteStoredFiles(pathsToDelete);
    }

    item.deleteOne();
    try {
      await user.save();
    } catch (error) {
      user[arrayField].splice(itemIndex, 0, previousItem);
      throw error;
    }

    if (req.user.role === "seeker") {
      fireAndForget(() => syncSeekerEmbedding(user._id));
    }

    return sendSuccess(res, {
      message: `${singularLabel} deleted successfully.`
    });
  });

  return {
    list,
    create,
    update,
    remove
  };
}

module.exports = createArrayCrudController;
