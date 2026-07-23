const ApiError = require("./ApiError");
const { uploadFile, deleteFiles } = require("./supabaseService");

const documentMimeTypes = new Set([
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation"
]);

function getMediaTypeFromMime(mimeType) {
  const normalizedMime = String(mimeType || "").toLowerCase();

  if (normalizedMime.startsWith("image/")) {
    return "image";
  }

  if (normalizedMime.startsWith("video/")) {
    return "video";
  }

  if (documentMimeTypes.has(normalizedMime)) {
    return "document";
  }

  return null;
}

function ensureSupportedFileType(file, allowedTypes = ["image", "video", "document"], label = "file") {
  const mediaType = getMediaTypeFromMime(file?.mimetype);

  if (!mediaType || !allowedTypes.includes(mediaType)) {
    throw new ApiError(
      400,
      `${label} must be one of the supported file types: ${allowedTypes.join(", ")}.`
    );
  }

  return mediaType;
}

async function safeDeleteStoredFiles(paths = []) {
  const uniquePaths = [...new Set(paths.filter(Boolean).map((value) => String(value).trim()))];

  if (!uniquePaths.length) {
    return [];
  }

  await deleteFiles(uniquePaths);
  return uniquePaths;
}

async function cleanupUploadedMedia(items = []) {
  const paths = items
    .map((item) => item?.filePath)
    .filter(Boolean);

  if (!paths.length) {
    return;
  }

  await safeDeleteStoredFiles(paths).catch(() => null);
}

async function uploadMediaDescriptor(file, folder, options = {}) {
  const {
    allowedTypes = ["image", "video", "document"],
    label = "file"
  } = options;

  if (!file?.buffer) {
    throw new ApiError(400, `${label} is required.`);
  }

  const fileType = ensureSupportedFileType(file, allowedTypes, label);
  const uploaded = await uploadFile(
    file.buffer,
    file.originalname,
    file.mimetype,
    folder
  );

  return {
    url: uploaded.url,
    filePath: uploaded.filePath,
    fileType
  };
}

async function uploadMediaDescriptors(files, folder, options = {}) {
  const descriptors = [];

  try {
    for (const file of files || []) {
      descriptors.push(await uploadMediaDescriptor(file, folder, options));
    }
  } catch (error) {
    await cleanupUploadedMedia(descriptors);
    throw error;
  }

  return descriptors;
}

function collectFilePaths(value) {
  if (!value) {
    return [];
  }

  if (typeof value.toObject === "function") {
    return collectFilePaths(value.toObject());
  }

  if (Array.isArray(value)) {
    return value.reduce((paths, item) => paths.concat(collectFilePaths(item)), []);
  }

  if (typeof value === "object") {
    const paths = [];

    if (value.filePath) {
      paths.push(String(value.filePath));
    }

    for (const nestedValue of Object.values(value)) {
      paths.push(...collectFilePaths(nestedValue));
    }

    return [...new Set(paths)];
  }

  return [];
}

function clonePlain(value) {
  if (value === undefined || value === null) {
    return value;
  }

  if (typeof value.toObject === "function") {
    return value.toObject();
  }

  return JSON.parse(JSON.stringify(value));
}

module.exports = {
  getMediaTypeFromMime,
  ensureSupportedFileType,
  uploadMediaDescriptor,
  uploadMediaDescriptors,
  cleanupUploadedMedia,
  safeDeleteStoredFiles,
  collectFilePaths,
  clonePlain
};
