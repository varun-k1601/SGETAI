function sendSuccess(res, payload = {}, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    ...payload
  });
}

module.exports = {
  sendSuccess
};
