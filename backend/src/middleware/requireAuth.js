const jwt = require("jsonwebtoken");
const ApiError = require("../utils/ApiError");

function requireAuth(req, res, next) {
  const authorization = req.headers.authorization || "";

  if (!authorization.startsWith("Bearer ")) {
    return next(new ApiError(401, "Authorization token is required."));
  }

  const token = authorization.slice(7).trim();

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    return next();
  } catch (error) {
    return next(new ApiError(401, "Invalid or expired token."));
  }
}

module.exports = requireAuth;
