const multer = require("multer");
const ApiError = require("../utils/ApiError");
const { getMediaTypeFromMime } = require("../utils/mediaStorage");

const maxFileSize = 50 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxFileSize
  },
  fileFilter(req, file, callback) {
    if (getMediaTypeFromMime(file.mimetype)) {
      return callback(null, true);
    }

    return callback(new ApiError(400, "Unsupported file type."));
  }
});

function wrapUploadMiddleware(middleware) {
  return (req, res, next) => {
    middleware(req, res, (error) => {
      if (!error) {
        return next();
      }

      if (error instanceof multer.MulterError) {
        if (error.code === "LIMIT_FILE_SIZE") {
          return next(new ApiError(400, "Uploaded file exceeds the 50MB limit."));
        }

        return next(new ApiError(400, error.message));
      }

      return next(error);
    });
  };
}

module.exports = {
  uploadSingle: wrapUploadMiddleware(upload.single("file")),
  uploadArray: wrapUploadMiddleware(upload.array("files", 10)),
  uploadProjectFiles: wrapUploadMiddleware(upload.fields([
    { name: "mediaFiles", maxCount: 5 },
    { name: "documents", maxCount: 3 }
  ]))
};
