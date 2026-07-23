const jwt = require("jsonwebtoken");

function optionalAuth(req, res, next) {
  const authorization = req.headers.authorization || "";

  if (!authorization.startsWith("Bearer ")) {
    return next();
  }

  const token = authorization.slice(7).trim();

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    req.user = null;
  }

  return next();
}

module.exports = optionalAuth;
