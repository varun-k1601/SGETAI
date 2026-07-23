const ApiError = require("../utils/ApiError");

function requireRole(allowedRoles = []) {
  return function roleMiddleware(req, res, next) {
    if (!req.user) {
      return next(new ApiError(401, "Authentication is required."));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(new ApiError(403, "You do not have permission to access this resource."));
    }

    return next();
  };
}

module.exports = requireRole;
