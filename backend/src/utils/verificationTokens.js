const jwt = require("jsonwebtoken");

function signVerificationToken(payload) {
  return jwt.sign(payload, process.env.JWT_VERIFICATION_SECRET, {
    expiresIn: "14d"
  });
}

function verifyVerificationToken(token) {
  return jwt.verify(token, process.env.JWT_VERIFICATION_SECRET);
}

module.exports = {
  signVerificationToken,
  verifyVerificationToken
};
