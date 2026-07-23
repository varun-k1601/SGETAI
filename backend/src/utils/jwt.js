const jwt = require("jsonwebtoken");

function createAccessToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "1d" });
}

function createRefreshToken(payload) {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, { expiresIn: "7d" });
}

module.exports = {
  createAccessToken,
  createRefreshToken
};
