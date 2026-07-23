const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const requiredEnvVars = [
  "PORT",
  "MONGO_URI",
  "JWT_SECRET",
  "JWT_REFRESH_SECRET",
  "JWT_VERIFICATION_SECRET",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_KEY",
  "SUPABASE_BUCKET",
  "EMAIL_USER",
  "EMAIL_PASS",
  "FRONTEND_URL",
  "GEMINI_API_KEY"
];

function isPlaceholder(key, value) {
  const normalizedValue = String(value || "").toLowerCase();
  if (!normalizedValue) {
    return true;
  }

  const commonPlaceholders = ["replace_me", "your_", "xxxxx", "example"];

  if (key === "PORT") {
    return false;
  }

  return commonPlaceholders.some((token) => normalizedValue.includes(token));
}

function validateEnv() {
  const missingVars = requiredEnvVars.filter((key) => !process.env[key]);

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(", ")}`
    );
  }

  const port = Number(process.env.PORT);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error("PORT must be a valid integer between 1 and 65535.");
  }

  if (!/^mongodb(\+srv)?:\/\//.test(process.env.MONGO_URI)) {
    throw new Error("MONGO_URI must start with mongodb:// or mongodb+srv://");
  }

  if (!/^https?:\/\//.test(process.env.FRONTEND_URL)) {
    throw new Error("FRONTEND_URL must start with http:// or https://");
  }

  if (!/^https?:\/\//.test(process.env.SUPABASE_URL)) {
    throw new Error("SUPABASE_URL must start with http:// or https://");
  }

  const placeholderVars = requiredEnvVars.filter((key) => isPlaceholder(key, process.env[key]));
  if (placeholderVars.length > 0) {
    console.warn(
      `Warning: placeholder-like environment values detected for: ${placeholderVars.join(", ")}`
    );
  }
}

module.exports = {
  requiredEnvVars,
  validateEnv
};
