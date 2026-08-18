const cron = require("node-cron");
const JobSeeker = require("../models/JobSeeker");

let midnightTask = null;

async function runMidnightReset(now = new Date()) {
  await JobSeeker.updateMany(
    {},
    {
      $set: {
        resumesGeneratedToday: 0,
        autoApplyCountToday: 0,
        recruiterIntroCountToday: 0,
        lastResumeResetDate: now
      }
    }
  );
}

function startMidnightCron() {
  if (midnightTask) {
    return midnightTask;
  }

  midnightTask = cron.schedule("0 0 * * *", async () => {
    await runMidnightReset(new Date());
  }, { scheduled: true });

  return midnightTask;
}

module.exports = {
  runMidnightReset,
  startMidnightCron
};
