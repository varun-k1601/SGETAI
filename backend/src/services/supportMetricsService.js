const SupportTicket = require("../models/SupportTicket");

// The four KPI cards on the support inbox. Two are snapshot counts (always real, and 0 is a real
// answer). Two are measurements over a window and return null when the window contains nothing to
// measure — reporting 0m first response or 0% SLA for a week with no responses would be a
// fabricated reading, not an accurate one.

const DAY_MS = 24 * 60 * 60 * 1000;
const RESPONSE_WINDOW_DAYS = 7;

function daysAgo(days) {
  return new Date(Date.now() - days * DAY_MS);
}

// Median, not mean: a single ticket answered three days late should not drag a week of
// twelve-minute responses up with it. The whole point of this number is what a typical requester
// experiences.
function median(values) {
  if (!values.length) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function percentChange(current, previous) {
  if (current === null || previous === null || !previous) {
    return null;
  }

  return Math.round(((current - previous) / previous) * 1000) / 10;
}

// Pulls the raw (createdAt, firstResponseAt, slaTargetMinutes) triples for one window. Only
// tickets that actually received a first response inside the window are included — an unanswered
// ticket has no response time yet, and counting it as anything would be an invention.
async function loadRespondedTickets(since, until) {
  return SupportTicket.find({
    firstResponseAt: { $gte: since, ...(until ? { $lt: until } : {}) }
  })
    .select("createdAt firstResponseAt slaTargetMinutes")
    .lean();
}

function toResponseMinutes(ticket) {
  const created = new Date(ticket.createdAt).getTime();
  const responded = new Date(ticket.firstResponseAt).getTime();

  if (!Number.isFinite(created) || !Number.isFinite(responded) || responded < created) {
    return null;
  }

  return (responded - created) / 60000;
}

async function buildSupportMetrics({ slaTargetMinutes }) {
  const windowStart = daysAgo(RESPONSE_WINDOW_DAYS);
  const previousStart = daysAgo(RESPONSE_WINDOW_DAYS * 2);

  const [
    openCount,
    highPriorityCount,
    unreadCount,
    distinctAssignees,
    currentTickets,
    previousTickets,
    totalCount,
    unassignedOpenCount
  ] = await Promise.all([
    SupportTicket.countDocuments({ status: { $in: ["Open", "Pending"] } }),
    SupportTicket.countDocuments({
      status: { $in: ["Open", "Pending"] },
      priority: { $in: ["High", "Urgent"] }
    }),
    SupportTicket.countDocuments({ unreadForAdmin: { $gt: 0 } }),
    SupportTicket.distinct("assigneeId", {
      status: { $in: ["Open", "Pending"] },
      assigneeId: { $ne: null }
    }),
    loadRespondedTickets(windowStart, null),
    loadRespondedTickets(previousStart, windowStart),
    SupportTicket.countDocuments(),
    SupportTicket.countDocuments({ status: { $in: ["Open", "Pending"] }, assigneeId: null })
  ]);

  const currentMinutes = currentTickets.map(toResponseMinutes).filter((value) => value !== null);
  const previousMinutes = previousTickets.map(toResponseMinutes).filter((value) => value !== null);
  const currentMedian = median(currentMinutes);
  const previousMedian = median(previousMinutes);

  // Each ticket is judged against the SLA target that was in force when it was raised (copied onto
  // the row at creation), falling back to the current platform target only for rows that predate
  // the field — never against today's target retroactively.
  const withinSla = currentTickets.filter((ticket) => {
    const minutes = toResponseMinutes(ticket);
    if (minutes === null) {
      return false;
    }
    return minutes <= (ticket.slaTargetMinutes || slaTargetMinutes);
  }).length;

  return {
    generatedAt: new Date(),
    windowDays: RESPONSE_WINDOW_DAYS,
    slaTargetMinutes,
    openTickets: {
      value: openCount,
      highPriority: highPriorityCount,
      unassigned: unassignedOpenCount
    },
    firstResponse: {
      // null = nothing was answered in the last 7 days, so there is no median to report.
      medianMinutes: currentMedian === null ? null : Math.round(currentMedian),
      previousMedianMinutes: previousMedian === null ? null : Math.round(previousMedian),
      changePercent: percentChange(currentMedian, previousMedian),
      sampleSize: currentMinutes.length
    },
    slaHealth: {
      // null = no responses in the window, so the percentage would be 0/0.
      percent: currentMinutes.length
        ? Math.round((withinSla / currentMinutes.length) * 1000) / 10
        : null,
      withinTarget: withinSla,
      sampleSize: currentMinutes.length
    },
    unread: {
      value: unreadCount,
      distinctAssignees: distinctAssignees.length
    },
    totalTickets: totalCount
  };
}

module.exports = {
  RESPONSE_WINDOW_DAYS,
  buildSupportMetrics,
  median
};
