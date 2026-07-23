const DAY_IN_MS = 24 * 60 * 60 * 1000;
const GRACE_PERIOD_DAYS = 3;
const REMINDER_INTERVAL_DAYS = 4;

function addDays(date, days) {
  return new Date(new Date(date).getTime() + (days * DAY_IN_MS));
}

function createVerificationSchedule(requestedAt = new Date()) {
  const normalizedRequestedAt = new Date(requestedAt);
  const gracePeriodEndsAt = addDays(normalizedRequestedAt, GRACE_PERIOD_DAYS);

  return {
    requestedAt: normalizedRequestedAt,
    gracePeriodEndsAt,
    nextReminderAt: gracePeriodEndsAt
  };
}

function getNextReminderAt(lastReminderSentAt = new Date()) {
  return addDays(lastReminderSentAt, REMINDER_INTERVAL_DAYS);
}

module.exports = {
  GRACE_PERIOD_DAYS,
  REMINDER_INTERVAL_DAYS,
  addDays,
  createVerificationSchedule,
  getNextReminderAt
};
