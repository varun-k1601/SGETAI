const cron = require("node-cron");
const VerificationRequest = require("../models/VerificationRequest");
const Application = require("../models/Application");
const JobSeeker = require("../models/JobSeeker");
const Organization = require("../models/Organization");
const Job = require("../models/Job");
const { sendEmail } = require("../utils/email");
const { signVerificationToken } = require("../utils/verificationTokens");
const {
  createVerificationSchedule,
  getNextReminderAt
} = require("../utils/verificationSchedule");

let verificationTask = null;

function buildVerificationLink(token) {
  const baseUrl = (process.env.FRONTEND_URL || "").replace(/\/$/, "");
  return `${baseUrl}/verification?token=${encodeURIComponent(token)}`;
}

async function sendReminderForRequest(request, now = new Date()) {
  const [application, seeker, organization, job] = await Promise.all([
    Application.findById(request.applicationId),
    JobSeeker.findById(request.jobSeekerId),
    Organization.findById(request.organizationId),
    Job.findOne({ organizationId: request.organizationId }).sort({ createdAt: -1 })
  ]);

  if (!application || !seeker || !organization) {
    return;
  }

  const token = signVerificationToken({
    verificationRequestId: request._id.toString(),
    applicationId: request.applicationId.toString(),
    experienceId: request.experienceId.toString(),
    managerEmail: request.managerEmail
  });

  await sendEmail(
    request.managerEmail,
    `Reminder: verification request for ${seeker.firstName} ${seeker.lastName}`,
    `
      <p>This is a reminder from ${organization.companyName} to complete employment verification for <strong>${seeker.firstName} ${seeker.lastName}</strong>.</p>
      <p>${job ? `Job context: <strong>${job.title}</strong>` : ""}</p>
      <p>Verification link: <a href="${buildVerificationLink(token)}">${buildVerificationLink(token)}</a></p>
    `
  );

  request.lastReminderSentAt = now;
  request.reminderCount += 1;
  request.nextReminderAt = getNextReminderAt(now);
  await request.save();
}

async function runVerificationSweep(now = new Date()) {
  const pendingRequests = await VerificationRequest.find({ status: "Pending" });

  for (const request of pendingRequests) {
    let shouldPersistSchedule = false;

    if (!request.gracePeriodEndsAt || !request.nextReminderAt) {
      const baseSchedule = createVerificationSchedule(request.requestedAt || now);

      if (!request.gracePeriodEndsAt) {
        request.gracePeriodEndsAt = baseSchedule.gracePeriodEndsAt;
        shouldPersistSchedule = true;
      }

      if (!request.nextReminderAt) {
        request.nextReminderAt = request.lastReminderSentAt
          ? getNextReminderAt(request.lastReminderSentAt)
          : baseSchedule.nextReminderAt;
        shouldPersistSchedule = true;
      }
    }

    if (request.nextReminderAt && now >= request.nextReminderAt) {
      await sendReminderForRequest(request, now);
      continue;
    }

    if (shouldPersistSchedule) {
      await request.save();
    }
  }
}

function startVerificationCron() {
  if (verificationTask) {
    return verificationTask;
  }

  verificationTask = cron.schedule("0 0 * * *", async () => {
    await runVerificationSweep(new Date());
  }, { scheduled: true });

  return verificationTask;
}

module.exports = {
  runVerificationSweep,
  startVerificationCron
};
