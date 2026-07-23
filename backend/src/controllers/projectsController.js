const createArrayCrudController = require("./arrayCrudController");
const {
  uploadMediaDescriptors,
  collectFilePaths,
  cleanupUploadedMedia
} = require("../utils/mediaStorage");

module.exports = createArrayCrudController({
  arrayField: "projects",
  singularLabel: "Project",
  allowedRoles: ["seeker"],
  paramName: "projectId",
  async prepareCreate(req) {
    let mediaFiles = [];
    let documents = [];

    try {
      mediaFiles = await uploadMediaDescriptors(req.files?.mediaFiles || [], "projects/media", {
        allowedTypes: ["image", "video"],
        label: "Project media file"
      });
      documents = await uploadMediaDescriptors(req.files?.documents || [], "projects/documents", {
        allowedTypes: ["document"],
        label: "Project document"
      });
    } catch (error) {
      await cleanupUploadedMedia([...mediaFiles, ...documents]);
      throw error;
    }

    return {
      itemData: {
        ...req.body,
        mediaFiles,
        documents
      },
      uploadedMedia: [...mediaFiles, ...documents]
    };
  },
  async prepareUpdate(req, user, item) {
    const nextItemData = { ...req.body };
    const replacedPaths = [];
    const hasMediaFiles = Boolean(req.files?.mediaFiles?.length);
    const hasDocuments = Boolean(req.files?.documents?.length);

    if (hasMediaFiles) {
      replacedPaths.push(...collectFilePaths(item.mediaFiles));
    }

    if (hasDocuments) {
      replacedPaths.push(...collectFilePaths(item.documents));
    }

    return {
      itemData: nextItemData,
      replacedPaths,
      performUpload: hasMediaFiles || hasDocuments
        ? async () => {
          let mediaFiles = [];
          let documents = [];

          try {
            mediaFiles = await uploadMediaDescriptors(req.files?.mediaFiles || [], "projects/media", {
              allowedTypes: ["image", "video"],
              label: "Project media file"
            });
            documents = await uploadMediaDescriptors(req.files?.documents || [], "projects/documents", {
              allowedTypes: ["document"],
              label: "Project document"
            });
          } catch (error) {
            await cleanupUploadedMedia([...mediaFiles, ...documents]);
            throw error;
          }

          const itemData = {};
          if (mediaFiles.length) {
            itemData.mediaFiles = mediaFiles;
          }
          if (documents.length) {
            itemData.documents = documents;
          }

          return {
            itemData,
            uploadedMedia: [...mediaFiles, ...documents]
          };
        }
        : null
    };
  },
  collectItemPaths(item) {
    return [
      ...collectFilePaths(item.mediaFiles),
      ...collectFilePaths(item.documents)
    ];
  }
});
