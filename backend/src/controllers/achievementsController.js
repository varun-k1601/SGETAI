const createArrayCrudController = require("./arrayCrudController");
const { uploadMediaDescriptor } = require("../utils/mediaStorage");

module.exports = createArrayCrudController({
  arrayField: "achievements",
  singularLabel: "Achievement",
  allowedRoles: ["seeker"],
  paramName: "achievementId",
  async prepareCreate(req) {
    const media = req.file
      ? await uploadMediaDescriptor(req.file, "achievements", {
        allowedTypes: ["image", "document"],
        label: "Achievement file"
      })
      : null;

    return {
      itemData: {
        ...req.body,
        ...(media ? { media } : {})
      },
      uploadedMedia: media ? [media] : []
    };
  },
  async prepareUpdate(req, user, item) {
    return {
      itemData: { ...req.body },
      replacedPaths: req.file && item.media?.filePath ? [item.media.filePath] : [],
      performUpload: req.file
        ? async () => {
          const media = await uploadMediaDescriptor(req.file, "achievements", {
            allowedTypes: ["image", "document"],
            label: "Achievement file"
          });

          return {
            itemData: { media },
            uploadedMedia: [media]
          };
        }
        : null
    };
  },
  collectItemPaths(item) {
    return item.media?.filePath ? [item.media.filePath] : [];
  }
});
