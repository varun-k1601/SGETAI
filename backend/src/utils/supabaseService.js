const path = require("path");
const { v4: uuidv4 } = require("uuid");
const { createClient } = require("@supabase/supabase-js");

let supabaseClient = null;
let lastVerificationStatus = "unchecked";

function isPlaceholder(value) {
  const normalizedValue = String(value || "").toLowerCase();

  return (
    !normalizedValue ||
    normalizedValue.includes("replace_me") ||
    normalizedValue.includes("your-project") ||
    normalizedValue.includes("example")
  );
}

function shouldUseDevSupabaseFallback() {
  return (
    process.env.NODE_ENV !== "production" &&
    (
      isPlaceholder(process.env.SUPABASE_URL) ||
      isPlaceholder(process.env.SUPABASE_SERVICE_KEY)
    )
  );
}

function hasUsableSupabaseConfig() {
  return Boolean(process.env.SUPABASE_URL) && Boolean(process.env.SUPABASE_SERVICE_KEY);
}

function getSupabaseBucket() {
  return String(process.env.SUPABASE_BUCKET || "").trim();
}

function getSupabaseClient() {
  if (!supabaseClient) {
    supabaseClient = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );
  }

  return supabaseClient;
}

function requireOperationalStorage() {
  if (shouldUseDevSupabaseFallback()) {
    throw new Error("Supabase storage is running in development fallback mode and cannot upload files.");
  }

  if (!hasUsableSupabaseConfig()) {
    throw new Error("Supabase storage is not configured.");
  }

  if (!getSupabaseBucket()) {
    throw new Error("SUPABASE_BUCKET must be configured.");
  }

  return getSupabaseClient();
}

function sanitizeFolder(folder) {
  return String(folder || "")
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/+/g, "/");
}

function sanitizeStoredPath(filePath) {
  return String(filePath || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .trim();
}

function buildSafeFileName(fileName, mimeType) {
  const originalName = path.basename(String(fileName || "file"));
  const existingExtension = path.extname(originalName).toLowerCase();
  const baseName = path.basename(originalName, existingExtension)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "file";

  let extension = existingExtension;
  if (!extension) {
    const subtype = String(mimeType || "").split("/")[1] || "";
    const normalizedSubtype = subtype.toLowerCase().replace(/[^a-z0-9]+/g, "");
    extension = normalizedSubtype ? `.${normalizedSubtype}` : "";
  }

  return `${baseName}-${uuidv4()}${extension}`;
}

function getSupabaseHealthStatus() {
  if (shouldUseDevSupabaseFallback()) {
    return "dev-fallback";
  }

  if (lastVerificationStatus === "connected") {
    return "connected";
  }

  if (lastVerificationStatus === "disconnected") {
    return "disconnected";
  }

  return hasUsableSupabaseConfig() ? "configured" : "disconnected";
}

async function verifySupabaseConnection() {
  if (shouldUseDevSupabaseFallback()) {
    lastVerificationStatus = "dev-fallback";
    return true;
  }

  const client = requireOperationalStorage();
  const bucket = getSupabaseBucket();
  const { error } = await client.storage.from(bucket).list("", { limit: 1 });

  if (error) {
    lastVerificationStatus = "disconnected";
    throw new Error(`Supabase storage verification failed: ${error.message}`);
  }

  lastVerificationStatus = "connected";
  return true;
}

async function uploadFile(buffer, fileName, mimeType, folder) {
  const client = requireOperationalStorage();

  if (!Buffer.isBuffer(buffer) && !ArrayBuffer.isView(buffer)) {
    throw new Error("uploadFile requires a Buffer or typed-array compatible payload.");
  }

  const safeFileName = buildSafeFileName(fileName, mimeType);
  const normalizedFolder = sanitizeFolder(folder);
  const filePath = normalizedFolder ? `${normalizedFolder}/${safeFileName}` : safeFileName;
  const bucket = getSupabaseBucket();

  const { error } = await client.storage.from(bucket).upload(filePath, buffer, {
    contentType: mimeType || "application/octet-stream",
    cacheControl: "3600",
    upsert: false
  });

  if (error) {
    throw new Error(`Supabase upload failed: ${error.message}`);
  }

  const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();
  const publicUrl = supabaseUrl
    ? `${supabaseUrl}/storage/v1/object/public/${bucket}/${filePath}`
    : "";

  return {
    url: publicUrl,
    filePath
  };
}

async function deleteFiles(paths = []) {
  const client = requireOperationalStorage();
  const bucket = getSupabaseBucket();
  const uniquePaths = [...new Set(
    paths
      .map(sanitizeStoredPath)
      .filter(Boolean)
  )];

  if (!uniquePaths.length) {
    return [];
  }

  const { error } = await client.storage.from(bucket).remove(uniquePaths);

  if (error) {
    throw new Error(`Supabase delete failed: ${error.message}`);
  }

  return uniquePaths;
}

async function downloadFile(filePath) {
  const client = requireOperationalStorage();
  const bucket = getSupabaseBucket();
  const normalizedPath = sanitizeStoredPath(filePath);

  if (!normalizedPath) {
    throw new Error("downloadFile requires a stored file path.");
  }

  const { data, error } = await client.storage.from(bucket).download(normalizedPath);

  if (error) {
    throw new Error(`Supabase download failed: ${error.message}`);
  }

  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function getReadableFileUrl(filePath) {
  const bucket = getSupabaseBucket();
  const normalizedPath = sanitizeStoredPath(filePath);

  if (!normalizedPath) {
    return "";
  }

  const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();
  if (!supabaseUrl) {
    return "";
  }

  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${normalizedPath}`;
}

// The configured bucket is private, so the "public" object URL built by getReadableFileUrl /
// uploadFile's returned `url` 404s with "Bucket not found" when actually fetched. A signed URL
// is the correct way to hand out a temporary, working download link for a file in a private
// bucket without making the whole bucket (which can hold resumes/profile media) publicly readable.
async function getSignedFileUrl(filePath, expiresInSeconds = 3600) {
  const normalizedPath = sanitizeStoredPath(filePath);

  if (!normalizedPath) {
    return "";
  }

  const client = requireOperationalStorage();
  const bucket = getSupabaseBucket();
  const { data, error } = await client.storage
    .from(bucket)
    .createSignedUrl(normalizedPath, expiresInSeconds);

  if (error) {
    throw new Error(`Supabase signed URL generation failed: ${error.message}`);
  }

  return data?.signedUrl || "";
}

module.exports = {
  uploadFile,
  deleteFiles,
  getSignedFileUrl,
  downloadFile,
  getReadableFileUrl,
  verifySupabaseConnection,
  getSupabaseHealthStatus,
  hasUsableSupabaseConfig,
  shouldUseDevSupabaseFallback
};
