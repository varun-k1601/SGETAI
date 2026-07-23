const ApiError = require("../utils/ApiError");
const JobSeeker = require("../models/JobSeeker");

async function requireSeekerPro(req, res, next) {
  if (!req.user) {
    return next(new ApiError(401, "Authentication is required."));
  }

  if (req.user.role !== "seeker") {
    return next(new ApiError(403, "This feature requires a Pro subscription."));
  }

  const seeker = await JobSeeker.findById(req.user.id).select("isPro subscriptionStatus proExpiresAt");
  if (!seeker?.isPro) {
    return next(new ApiError(403, "This feature requires a Pro subscription."));
  }

  if (seeker.proExpiresAt && seeker.proExpiresAt < new Date()) {
    seeker.isPro = false;
    seeker.subscriptionStatus = "Expired";
    await seeker.save();
    return next(new ApiError(403, "This feature requires an active Pro subscription."));
  }

  return next();
}

module.exports = requireSeekerPro;
