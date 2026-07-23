const ApiError = require("./ApiError");

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function requireNonEmptyString(value, fieldName) {
  if (!isNonEmptyString(value)) {
    throw new ApiError(400, `${fieldName} must be a non-empty string.`);
  }

  return value.trim();
}

function optionalString(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  return String(value).trim();
}

function requireArrayOfStrings(value, fieldName, { min = 0, max = Infinity } = {}) {
  if (!Array.isArray(value)) {
    throw new ApiError(400, `${fieldName} must be an array of strings.`);
  }

  const normalized = value.map((item) => String(item || "").trim()).filter(Boolean);

  if (normalized.length < min) {
    throw new ApiError(400, `${fieldName} must contain at least ${min} item(s).`);
  }

  if (normalized.length > max) {
    throw new ApiError(400, `${fieldName} must contain at most ${max} item(s).`);
  }

  return normalized;
}

function requireBoolean(value, fieldName) {
  if (typeof value !== "boolean") {
    throw new ApiError(400, `${fieldName} must be a boolean.`);
  }

  return value;
}

function requireNumberInRange(value, fieldName, { min = -Infinity, max = Infinity, integer = false } = {}) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    throw new ApiError(400, `${fieldName} must be a valid number.`);
  }

  if (integer && !Number.isInteger(numericValue)) {
    throw new ApiError(400, `${fieldName} must be an integer.`);
  }

  if (numericValue < min || numericValue > max) {
    throw new ApiError(400, `${fieldName} must be between ${min} and ${max}.`);
  }

  return numericValue;
}

function normalizePagination(query) {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 10, 1), 50);
  return { page, limit, skip: (page - 1) * limit };
}

module.exports = {
  isNonEmptyString,
  requireNonEmptyString,
  optionalString,
  requireArrayOfStrings,
  requireBoolean,
  requireNumberInRange,
  normalizePagination
};
