const Application = require("../models/Application");
const JobSeeker = require("../models/JobSeeker");
const Job = require("../models/Job");
const SubscriptionPayment = require("../models/SubscriptionPayment");

// Everything the admin dashboard needs that a snapshot countDocuments() cannot answer: movement
// over time. Kept out of adminController so getAdminOverview stays a flat list of counts, and so
// this can be reused or cached later without untangling it from the response assembly.

const DAY_MS = 24 * 60 * 60 * 1000;
// The headline window and its comparison window are the same length on purpose — a delta is only
// honest when the two periods it compares cover equal spans.
const TREND_WINDOW_DAYS = 30;
const MONTHS_PER_YEAR = 12;

// A closed allowlist, not a numeric range: every entry here fans out into four daily-bucket
// aggregations plus an eight-week status aggregation, so an arbitrary caller-supplied integer
// would let one request schedule an unbounded scan. Each window also carries the dependent range
// sizes it needs, because those cannot sensibly stay fixed while the window moves —
// weekly funnel buckets across a 7-day window would collapse to a single point, and 90 daily
// sparkline bars inside a 60px sprite would be sub-pixel.
const TREND_WINDOW_PRESETS = {
  7: { sparklineDays: 7, funnelWeeks: 4 },
  30: { sparklineDays: 14, funnelWeeks: 8 },
  90: { sparklineDays: 30, funnelWeeks: 13 }
};
// Exported so the controller validates against this exact object rather than a second copy of
// the same numbers that could drift out of sync with it.
const ALLOWED_TREND_WINDOW_DAYS = Object.keys(TREND_WINDOW_PRESETS).map(Number);

// Mongo's $dateToString defaults to UTC, but every boundary below is computed from the server's
// local midnight. Passing the server's own UTC offset keeps day buckets and window edges on the
// same calendar, instead of silently splitting one local day across two buckets.
function getServerUtcOffset() {
  const offsetMinutes = -new Date().getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absolute / 60)).padStart(2, "0");
  const minutes = String(absolute % 60).padStart(2, "0");
  return `${sign}${hours}:${minutes}`;
}

function startOfDay(date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

function toDayKey(date) {
  const local = startOfDay(date);
  const year = local.getFullYear();
  const month = String(local.getMonth() + 1).padStart(2, "0");
  const day = String(local.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function daysAgo(days) {
  return startOfDay(new Date(Date.now() - days * DAY_MS));
}

// Percent change between two equal-length windows. Returns null — never 0, never Infinity — when
// the prior window has nothing to compare against, so the UI can say "no baseline" instead of
// rendering a meaningless "+100%".
function percentChange(current, previous) {
  if (!previous) {
    return null;
  }

  return Math.round(((current - previous) / previous) * 1000) / 10;
}

async function buildWindowDelta(Model, dateField, { windowStart, previousStart, match = {} }) {
  const [current, previous] = await Promise.all([
    Model.countDocuments({ ...match, [dateField]: { $gte: windowStart } }),
    Model.countDocuments({ ...match, [dateField]: { $gte: previousStart, $lt: windowStart } })
  ]);

  return { current, previous, changePercent: percentChange(current, previous) };
}

// Zero-filled so the sparkline always has exactly SPARKLINE_DAYS points: a day with no rows is a
// real zero, and omitting it would make the bar chart silently compress its own time axis.
function buildDailySeries(rows, days) {
  const countsByDay = new Map(rows.map((row) => [row._id, row.count]));
  const series = [];

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const key = toDayKey(daysAgo(offset));
    series.push({ date: key, value: countsByDay.get(key) || 0 });
  }

  return series;
}

async function countDailyRows(Model, dateField, since, timezone, match = {}) {
  return Model.aggregate([
    { $match: { ...match, [dateField]: { $gte: since } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: `$${dateField}`, timezone } },
        count: { $sum: 1 }
      }
    }
  ]);
}

// Buckets daily application rows into calendar weeks in JS rather than with $isoWeek, because
// week-of-year numbers wrap at the new year and would sort a December week ahead of a January
// one. Ordering by each week's actual start date has no such edge case.
function buildFunnelWeeks(statusRows, weeks) {
  const buckets = [];
  const firstWeekStart = startOfDay(new Date(Date.now() - (weeks * 7 - 1) * DAY_MS));

  for (let index = 0; index < weeks; index += 1) {
    const weekStart = new Date(firstWeekStart.getTime() + index * 7 * DAY_MS);
    buckets.push({
      weekStart: weekStart.toISOString(),
      applications: 0,
      accepted: 0,
      conversionRate: 0
    });
  }

  statusRows.forEach((row) => {
    const rowDate = startOfDay(new Date(`${row._id.day}T00:00:00`));
    const bucketIndex = Math.floor((rowDate - firstWeekStart) / (7 * DAY_MS));

    if (bucketIndex < 0 || bucketIndex >= buckets.length) {
      return;
    }

    buckets[bucketIndex].applications += row.count;

    if (row._id.status === "Accepted") {
      buckets[bucketIndex].accepted += row.count;
    }
  });

  return buckets.map((bucket) => ({
    ...bucket,
    conversionRate: bucket.applications
      ? Math.round((bucket.accepted / bucket.applications) * 1000) / 10
      : 0
  }));
}

// A yearly plan is a year of committed revenue, so it contributes one twelfth of its amount to a
// MONTHLY recurring figure — summing raw amounts would overstate MRR twelvefold for those rows.
// Only subscriptions whose paid term has not expired are counted, and currencies stay separate
// because amounts are stored in whatever currency the payment was taken in.
async function buildMonthlyRecurringRevenue() {
  const rows = await SubscriptionPayment.aggregate([
    { $match: { status: "Paid", expiresAt: { $gt: new Date() } } },
    {
      $group: {
        _id: "$currency",
        monthlyAmount: {
          $sum: {
            $cond: [
              { $eq: ["$plan", "yearly"] },
              { $divide: ["$amount", MONTHS_PER_YEAR] },
              "$amount"
            ]
          }
        },
        activeSubscriptions: { $sum: 1 }
      }
    },
    { $sort: { monthlyAmount: -1 } }
  ]);

  const byCurrency = rows.map((row) => ({
    currency: row._id || "INR",
    amount: Math.round(row.monthlyAmount),
    activeSubscriptions: row.activeSubscriptions
  }));

  return {
    byCurrency,
    // The largest single currency, used as the headline figure. Deliberately NOT a sum across
    // currencies — adding INR to USD would produce a number that means nothing.
    primary: byCurrency[0] || null,
    activeSubscriptions: byCurrency.reduce((total, row) => total + row.activeSubscriptions, 0)
  };
}

async function buildAdminTrends({ windowDays = TREND_WINDOW_DAYS } = {}) {
  const preset = TREND_WINDOW_PRESETS[windowDays];

  // The controller rejects bad input with a 400 before reaching here, so an unknown window at
  // this point is a programming error in a caller, not user input — surfacing it loudly beats
  // silently substituting 30 days and reporting the wrong period back to an admin.
  if (!preset) {
    throw new Error(
      `Unsupported trend window: ${windowDays}. Expected one of ${ALLOWED_TREND_WINDOW_DAYS.join(", ")}.`
    );
  }

  const { sparklineDays, funnelWeeks } = preset;
  const timezone = getServerUtcOffset();
  const windowStart = daysAgo(windowDays);
  const previousStart = daysAgo(windowDays * 2);
  const sparklineSince = daysAgo(sparklineDays - 1);
  const funnelSince = daysAgo(funnelWeeks * 7 - 1);
  // DELIBERATELY NOT scaled with windowDays. These two feed the "Applications this week" card,
  // which is a fixed weekly operating cadence rather than a view of the selected range — letting
  // it follow a 90-day window would make its own label ("this week", "the prior 7 days") false.
  // Keeping it fixed is also what makes an omitted windowDays byte-identical to the previous
  // behaviour of this endpoint.
  const weekStart = daysAgo(6);
  const priorWeekStart = daysAgo(13);

  const [
    seekerDelta,
    applicationDelta,
    jobDelta,
    paidPaymentDelta,
    applicationsThisWeek,
    applicationsPriorWeek,
    seekerDailyRows,
    applicationDailyRows,
    jobDailyRows,
    paymentDailyRows,
    funnelStatusRows,
    mrr
  ] = await Promise.all([
    buildWindowDelta(JobSeeker, "createdAt", { windowStart, previousStart }),
    buildWindowDelta(Application, "createdAt", { windowStart, previousStart }),
    buildWindowDelta(Job, "createdAt", { windowStart, previousStart }),
    buildWindowDelta(SubscriptionPayment, "paidAt", {
      windowStart,
      previousStart,
      match: { status: "Paid" }
    }),
    Application.countDocuments({ createdAt: { $gte: weekStart } }),
    Application.countDocuments({ createdAt: { $gte: priorWeekStart, $lt: weekStart } }),
    countDailyRows(JobSeeker, "createdAt", sparklineSince, timezone),
    countDailyRows(Application, "createdAt", sparklineSince, timezone),
    countDailyRows(Job, "createdAt", sparklineSince, timezone),
    countDailyRows(SubscriptionPayment, "paidAt", sparklineSince, timezone, { status: "Paid" }),
    Application.aggregate([
      { $match: { createdAt: { $gte: funnelSince } } },
      {
        $group: {
          _id: {
            day: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone } },
            status: "$status"
          },
          count: { $sum: 1 }
        }
      }
    ]),
    buildMonthlyRecurringRevenue()
  ]);

  return {
    generatedAt: new Date(),
    window: {
      days: windowDays,
      start: windowStart,
      previousStart
    },
    applicationsThisWeek: {
      current: applicationsThisWeek,
      previous: applicationsPriorWeek,
      changePercent: percentChange(applicationsThisWeek, applicationsPriorWeek)
    },
    deltas: {
      seekers: seekerDelta,
      applications: applicationDelta,
      jobs: jobDelta,
      paidPayments: paidPaymentDelta
    },
    mrr,
    funnelWeekly: buildFunnelWeeks(funnelStatusRows, funnelWeeks),
    sparklines: {
      seekers: buildDailySeries(seekerDailyRows, sparklineDays),
      applications: buildDailySeries(applicationDailyRows, sparklineDays),
      jobs: buildDailySeries(jobDailyRows, sparklineDays),
      paidPayments: buildDailySeries(paymentDailyRows, sparklineDays)
    }
  };
}

module.exports = {
  ALLOWED_TREND_WINDOW_DAYS,
  TREND_WINDOW_DAYS,
  buildAdminTrends,
  percentChange
};
