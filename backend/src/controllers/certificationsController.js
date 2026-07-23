const createArrayCrudController = require("./arrayCrudController");
const { uploadMediaDescriptor } = require("../utils/mediaStorage");

module.exports = createArrayCrudController({
  arrayField: "licensesAndCertifications",
  singularLabel: "Certification",
  allowedRoles: ["seeker"],
  paramName: "certId",
  async prepareCreate(req) {
    const media = req.file
      ? await uploadMediaDescriptor(req.file, "certifications", {
        allowedTypes: ["image", "document"],
        label: "Certification file"
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
          const media = await uploadMediaDescriptor(req.file, "certifications", {
            allowedTypes: ["image", "document"],
            label: "Certification file"
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
