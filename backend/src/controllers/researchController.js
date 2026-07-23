const createArrayCrudController = require("./arrayCrudController");
const { uploadMediaDescriptor } = require("../utils/mediaStorage");

module.exports = createArrayCrudController({
  arrayField: "researchAndPapers",
  singularLabel: "Research entry",
  allowedRoles: ["seeker"],
  paramName: "researchId",
  async prepareCreate(req) {
    const media = req.file
      ? await uploadMediaDescriptor(req.file, "research", {
        allowedTypes: ["image", "document"],
        label: "Research file"
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
          const media = await uploadMediaDescriptor(req.file, "research", {
            allowedTypes: ["image", "document"],
            label: "Research file"
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
