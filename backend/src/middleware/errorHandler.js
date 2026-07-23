function errorHandler(err, req, res, next) {
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal server error";
  let details = err.details || null;

  if (err.name === "ValidationError") {
    statusCode = 400;
    const validationMessages = Object.values(err.errors || {})
      .map((validationError) => validationError?.message)
      .filter(Boolean);

    message = validationMessages[0] || "Validation failed.";
    details = validationMessages.length > 1 ? validationMessages : details;
  }

  if (err.name === "CastError") {
    statusCode = 400;
    message = `Invalid value for ${err.path || "request parameter"}.`;
  }

  if (err.type === "entity.parse.failed") {
    statusCode = 400;
    message = "Request body contains invalid JSON.";
  }

  const response = {
    success: false,
    message
  };

  if (details) {
    response.details = details;
  }

  if (process.env.NODE_ENV !== "production" && err.stack) {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
}

module.exports = errorHandler;
