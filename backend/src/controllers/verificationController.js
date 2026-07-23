const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");
const { sendEmail } = require("../utils/email");
const { signVerificationToken, verifyVerificationToken } = require("../utils/verificationTokens");
const { getTrustScoreTag, normalizeManagerRating } = require("../utils/trustScore");
const { createVerificationSchedule } = require("../utils/verificationSchedule");
const { createNotification } = require("../services/notificationService");
const { optionalString, requireNonEmptyString } = require("../utils/validation");

const Application = require("../models/Application");
const Job = require("../models/Job");
const JobSeeker = require("../models/JobSeeker");
const Organization = require("../models/Organization");
const VerificationRequest = require("../models/VerificationRequest");

function buildVerificationLink(token) {
  const baseUrl = (process.env.FRONTEND_URL || "").replace(/\/$/, "");
  return `${baseUrl}/verification?token=${encodeURIComponent(token)}`;
}

async function sendVerificationRequestEmail({ managerEmail, seeker, organization, job, token }) {
  const verificationLink = buildVerificationLink(token);

  return sendEmail(
    managerEmail,
    `Employment verification request for ${seeker.firstName} ${seeker.lastName}`,
    `
      <p>${organization.companyName} has requested employment verification for <strong>${seeker.firstName} ${seeker.lastName}</strong>.</p>
      <p>Job title: <strong>${job.title}</strong></p>
      <p>Please submit your verification using this secure link:</p>
      <p><a href="${verificationLink}">${verificationLink}</a></p>
      <p>This link is time-limited and intended only for the recipient.</p>
    `
  );
}

function toExperienceTimestamp(value) {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function selectLatestVerifiableExperience(experiences = []) {
  const rankedExperiences = experiences
    .map((experience, index) => {
      const recencyTimestamp = experience.isCurrent
        ? (toExperienceTimestamp(experience.startDate) ?? -1)
        : (
          toExperienceTimestamp(experience.endDate) ??
          toExperienceTimestamp(experience.startDate) ??
          -1
        );

      return {
        experience,
        index,
        isCurrentRank: experience.isCurrent ? 1 : 0,
        recencyTimestamp
      };
    })
    .filter(({ experience }) => Boolean(String(experience.managerEmail || "").trim()))
    .sort((left, right) => {
      if (right.isCurrentRank !== left.isCurrentRank) {
        return right.isCurrentRank - left.isCurrentRank;
      }

      if (right.recencyTimestamp !== left.recencyTimestamp) {
        return right.recencyTimestamp - left.recencyTimestamp;
      }

      return right.index - left.index;
    });

  return rankedExperiences[0]?.experience || null;
}

const triggerVerification = asyncHandler(async (req, res) => {
  if (req.user.role !== "organization") {
    throw new ApiError(403, "Only organizations can trigger verification.");
  }

  const application = await Application.findById(req.params.applicationId);
  if (!application) {
    throw new ApiError(404, "Application not found.");
  }

  if (application.organizationId.toString() !== req.user.id) {
    throw new ApiError(403, "You can only trigger verification for your own applications.");
  }

  const [job, seeker, organization] = await Promise.all([
    Job.findById(application.jobId),
    JobSeeker.findById(application.jobSeekerId),
    Organization.findById(application.organizationId)
  ]);

  if (!job || !seeker || !organization) {
    throw new ApiError(404, "Related records for verification were not found.");
  }

  const latestExperience = selectLatestVerifiableExperience(seeker.experience || []);

  if (!latestExperience) {
    throw new ApiError(400, "The job seeker does not have a verifiable experience with managerEmail.");
  }

  const existingPending = await VerificationRequest.findOne({
    applicationId: application._id,
    experienceId: latestExperience._id,
    status: "Pending"
  });

  if (existingPending) {
    throw new ApiError(409, "A pending verification request already exists for this application.");
  }

  const schedule = createVerificationSchedule();

  const verificationRequest = await VerificationRequest.create({
    applicationId: application._id,
    organizationId: organization._id,
    jobSeekerId: seeker._id,
    experienceId: latestExperience._id,
    managerEmail: latestExperience.managerEmail,
    requestedAt: schedule.requestedAt,
    gracePeriodEndsAt: schedule.gracePeriodEndsAt,
    nextReminderAt: schedule.nextReminderAt
  });

  const token = signVerificationToken({
    verificationRequestId: verificationRequest._id.toString(),
    applicationId: application._id.toString(),
    experienceId: latestExperience._id.toString(),
    managerEmail: latestExperience.managerEmail
  });

  await sendVerificationRequestEmail({
    managerEmail: latestExperience.managerEmail,
    seeker,
    organization,
    job,
    token
  });

  application.verificationStatus = "InProgress";
  await application.save();

  latestExperience.verificationStatus = "Pending";
  await seeker.save();

  return sendSuccess(res, {
    message: "Verification request triggered successfully.",
    verificationRequest
  }, 201);
});

const submitVerification = asyncHandler(async (req, res) => {
  const token = requireNonEmptyString(req.body.token, "token");
  const feedback = optionalString(req.body.feedback);

  const payload = verifyVerificationToken(token);
  const managerRating = normalizeManagerRating(req.body.rating);

  if (managerRating <= 0) {
    throw new ApiError(400, "rating must be between 1 and 100.");
  }

  const verificationRequest = await VerificationRequest.findById(payload.verificationRequestId);
  if (!verificationRequest || verificationRequest.status !== "Pending") {
    throw new ApiError(404, "Verification request was not found or is no longer pending.");
  }

  if (verificationRequest.managerEmail !== String(payload.managerEmail).toLowerCase()) {
    throw new ApiError(400, "Verification token does not match the pending request.");
  }

  const [application, seeker, organization] = await Promise.all([
    Application.findById(verificationRequest.applicationId),
    JobSeeker.findById(verificationRequest.jobSeekerId),
    Organization.findById(verificationRequest.organizationId)
  ]);

  if (!application || !seeker || !organization) {
    throw new ApiError(404, "Related verification records were not found.");
  }

  const experience = seeker.experience.id(verificationRequest.experienceId);
  if (!experience) {
    throw new ApiError(404, "Associated experience record not found.");
  }

  const trustScoreTag = getTrustScoreTag(managerRating);

  verificationRequest.status = "Submitted";
  verificationRequest.submittedAt = new Date();
  verificationRequest.managerRating = managerRating;
  verificationRequest.managerFeedback = feedback;
  await verificationRequest.save();

  application.trustScore = managerRating;
  application.trustScoreTag = trustScoreTag;
  application.verificationStatus = "Verified";

  if (organization.autoRejectOnTrustScore && managerRating < organization.trustScoreThreshold) {
    application.status = "Rejected";
  }

  await application.save();

  experience.trustScore = managerRating;
  experience.verificationStatus = managerRating >= 50 ? "Verified" : "Rejected";
  await seeker.save();

  await createNotification({
    recipientId: seeker._id,
    recipientRole: "seeker",
    type: "verification_complete",
    title: "Background verification completed",
    message: `Your verification was completed with a ${trustScoreTag.toLowerCase()} trust score.`,
    metadata: {
      applicationId: application._id,
      trustScore: managerRating,
      trustScoreTag
    }
  });

  return sendSuccess(res, {
    message: "Verification submitted successfully.",
    trustScore: managerRating,
    trustScoreTag,
    applicationStatus: application.status
  });
});

module.exports = {
  triggerVerification,
  submitVerification
};
