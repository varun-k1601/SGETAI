import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../services/api";
import { AutoDismissFeedback } from "../../components/AutoDismissFeedback";

// Rendered inside AppShell's existing <Outlet />. Everything visual here is scoped under the
// .admin-console root class (see styles.css) so this page can own a warm editorial palette
// without touching the shell that seekers and recruiters share.

// PLACEHOLDER — no model is called anywhere in this page, and nothing on the platform generates
// an operating brief yet. The card is built so a real generator can drop in later; until then
// `confidence` is null (the chip renders "SAMPLE BRIEF" rather than a fabricated percentage) and
// the two stat rows are fed from real metrics by buildBriefStats() below, never from this object.
// TODO: replace with a persisted, generated brief once an admin-insights source exists.
const AI_OPERATING_BRIEF = {
  confidence: null,
  headline: "Pipeline throughput is the constraint, not candidate supply.",
  body:
    "Applications keep arriving, but they are pooling in review rather than converting. " +
    "The gap sits between submission and recruiter response, so adding candidates would " +
    "deepen the queue instead of clearing it.",
  evidenceLabel: "Explore the evidence",
  disclaimer: "Recommendation, not a decision",
};

const CHART = {
  width: 640,
  height: 220,
  padTop: 12,
  padRight: 12,
  padBottom: 26,
  padLeft: 36,
};

const SPARK = { width: 60, height: 20, gap: 1 };

// Must stay in step with TREND_WINDOW_PRESETS in backend/src/services/adminTrendsService.js —
// the API rejects anything outside its allowlist with a 400, so an extra option here would be a
// dead control rather than a new capability. Labels are derived from these values below.
const TREND_WINDOW_OPTIONS = [7, 30, 90];
const DEFAULT_TREND_WINDOW = 30;

const PIPELINE_PILL_TONE = {
  Accepted: "adm-pill--pos",
  Interview: "adm-pill--info",
  UnderReview: "adm-pill--warn",
  Pending: "adm-pill--warn",
  Rejected: "adm-pill--neg",
  Withdrawn: "",
};

const PIPELINE_PILL_LABEL = {
  UnderReview: "Under review",
};

function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-IN");
}

function formatMoney(currency, amount) {
  return `${currency} ${Number(amount || 0).toLocaleString("en-IN")}`;
}

function getGreeting(date) {
  const hour = date.getHours();

  if (hour < 12) {
    return "Good morning";
  }

  if (hour < 17) {
    return "Good afternoon";
  }

  return "Good evening";
}

// Admin sessions never load /profile/me (see AuthContext), so there is no firstName to greet by —
// the username, then the email local-part, are the only real identifiers available.
function getAdminName(session) {
  const username = String(session?.username || "").trim();

  if (username) {
    return username;
  }

  const emailLocalPart = String(session?.email || "").split("@")[0].trim();
  return emailLocalPart || "Admin";
}

function formatEyebrowDate(date) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })
    .format(date)
    .toUpperCase();
}

function formatShortDate(value) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(parsed);
}

function formatRelativeTime(value) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  const diffSeconds = Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 1000));

  if (diffSeconds < 60) {
    return "just now";
  }

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) {
    return `${diffDays}d ago`;
  }

  return `${Math.floor(diffDays / 30)}mo ago`;
}

function getPersonName(user) {
  return (
    `${user?.firstName || ""} ${user?.lastName || ""}`.trim() ||
    user?.companyName ||
    user?.email ||
    "Unknown"
  );
}

function getInitials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] || ""}${parts[1]?.[0] || ""}`.toUpperCase() || "?";
}

// Picks a readable axis maximum by sizing the four gridline intervals first, then multiplying
// back up — rounding the maximum itself to a 1/2/5 ladder overshoots badly (a peak of 23 would
// scale the axis to 50 and squash the whole series into the bottom half). The step is rounded up
// to a whole number whenever it is at least 1 so gridline labels stay integers for count data,
// and the floor of 4 keeps an all-zero series from stacking five zeroes on the baseline.
const AXIS_STEP_LADDER = [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10];
const AXIS_INTERVALS = 4;

function niceCeiling(value) {
  const target = Number.isFinite(value) && value > 0 ? value : 1;
  const rawStep = target / AXIS_INTERVALS;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const laddered = (AXIS_STEP_LADDER.find((candidate) => normalized <= candidate) ?? 10) * magnitude;
  const step = laddered >= 1 ? Math.ceil(laddered) : laddered;

  return Math.max(4, step * AXIS_INTERVALS);
}

// Builds the area-chart geometry from raw points. A single point is widened into a flat segment
// across the full plot — a lone moveTo would paint nothing at all, so the card would look broken
// on a platform with one week of history.
function buildChartGeometry(points, axisMax) {
  const { width, height, padTop, padRight, padBottom, padLeft } = CHART;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;
  const baseline = padTop + plotHeight;
  const values = points.map((point) => Number(point.value) || 0);
  const max = axisMax ?? niceCeiling(values.length ? Math.max(...values) : 0);
  const toY = (value) => baseline - (max ? (value / max) * plotHeight : 0);

  const coords =
    points.length === 1
      ? [
          { x: padLeft, y: toY(values[0]) },
          { x: padLeft + plotWidth, y: toY(values[0]) },
        ]
      : points.map((point, index) => ({
          x: padLeft + (index / (points.length - 1)) * plotWidth,
          y: toY(values[index]),
        }));

  const line = coords
    .map((coord, index) => `${index === 0 ? "M" : "L"}${coord.x.toFixed(1)} ${coord.y.toFixed(1)}`)
    .join(" ");
  const area = `${line} L${coords[coords.length - 1].x.toFixed(1)} ${baseline} L${coords[0].x.toFixed(
    1
  )} ${baseline} Z`;
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
    ratio,
    y: padTop + plotHeight * ratio,
    label: Math.round(max * (1 - ratio)),
  }));

  return { coords, line, area, gridLines, max, baseline, plotWidth };
}

function AreaChart({ points, mode }) {
  if (!points.length) {
    return <p className="adm-empty">No applications recorded in this period.</p>;
  }

  // Conversion is a percentage, so its axis is pinned to 100 rather than scaled to the data —
  // otherwise a 3% week would render as a full-height chart and read as success.
  const geometry = buildChartGeometry(points, mode === "conversion" ? 100 : undefined);
  const gradientLabel =
    mode === "conversion" ? "Weekly acceptance rate" : "Weekly application volume";
  // Every other tick on a crowded axis; the first and last week always keep their label.
  const labelStep = points.length > 5 ? 2 : 1;

  return (
    <svg
      className="adm-chart"
      viewBox={`0 0 ${CHART.width} ${CHART.height}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`${gradientLabel} over the last ${points.length} weeks.`}
    >
      {geometry.gridLines.map((grid) => (
        <g key={grid.ratio}>
          <line
            className="adm-chart__grid"
            x1={CHART.padLeft}
            x2={CHART.width - CHART.padRight}
            y1={grid.y}
            y2={grid.y}
          />
          <text className="adm-chart__axis" x={CHART.padLeft - 8} y={grid.y + 3} textAnchor="end">
            {grid.label}
            {mode === "conversion" ? "%" : ""}
          </text>
        </g>
      ))}

      <path className="adm-chart__fill" d={geometry.area} />
      <path className="adm-chart__line" d={geometry.line} />

      {points.length <= 12
        ? geometry.coords.map((coord, index) => (
            <circle
              key={`${points[index]?.label || index}-dot`}
              className="adm-chart__dot"
              cx={coord.x}
              cy={coord.y}
              r="2.5"
            />
          ))
        : null}

      {points.map((point, index) => {
        const isEdge = index === 0 || index === points.length - 1;

        if (!isEdge && index % labelStep !== 0) {
          return null;
        }

        const coord = geometry.coords[Math.min(index, geometry.coords.length - 1)];

        return (
          <text
            key={`${point.label}-label`}
            className="adm-chart__axis"
            x={coord.x}
            y={CHART.height - 8}
            textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}
          >
            {point.label}
          </text>
        );
      })}
    </svg>
  );
}

function Sparkline({ series, label }) {
  if (!series.length) {
    return null;
  }

  const max = Math.max(...series.map((point) => Number(point.value) || 0), 0);
  const barWidth = (SPARK.width - SPARK.gap * (series.length - 1)) / series.length;

  return (
    <svg
      className="adm-spark"
      width={SPARK.width}
      height={SPARK.height}
      viewBox={`0 0 ${SPARK.width} ${SPARK.height}`}
      role="img"
      aria-label={label}
    >
      {series.map((point, index) => {
        // A zero day still draws a 1px stub so the axis stays legible and gaps stay visible.
        const barHeight = max ? Math.max(1, (Number(point.value) / max) * SPARK.height) : 1;

        return (
          <rect
            key={point.date || index}
            x={index * (barWidth + SPARK.gap)}
            y={SPARK.height - barHeight}
            width={Math.max(barWidth, 0.5)}
            height={barHeight}
            fill="currentColor"
            opacity={point.value ? 0.85 : 0.22}
          />
        );
      })}
    </svg>
  );
}

function DeltaPill({ delta, comparisonLabel }) {
  const changePercent = delta?.changePercent;

  // No prior-window activity means there is no baseline to compare against — saying "+100%"
  // would be inventing a trend out of a division by zero.
  if (changePercent === null || changePercent === undefined) {
    return (
      <span className="adm-delta adm-delta--flat" title={`No ${comparisonLabel} to compare against`}>
        NO BASELINE
      </span>
    );
  }

  const tone =
    changePercent > 0 ? "adm-delta--up" : changePercent < 0 ? "adm-delta--down" : "adm-delta--flat";
  const arrow = changePercent > 0 ? "▲" : changePercent < 0 ? "▼" : "•";

  return (
    <span className={`adm-delta ${tone}`} title={`vs ${comparisonLabel}`}>
      {arrow} {changePercent > 0 ? "+" : ""}
      {changePercent}%
    </span>
  );
}

function KpiCard({ label, value, helper, delta, comparisonLabel, sparkline, sparklineLabel }) {
  return (
    <article className="adm-card adm-kpi">
      <div className="adm-kpi__top">
        <p className="adm-eyebrow">{label}</p>
        {delta ? <DeltaPill delta={delta} comparisonLabel={comparisonLabel} /> : null}
      </div>
      <div className="adm-kpi__value adm-num">{value}</div>
      <div className="adm-kpi__bottom">
        <p className="adm-kpi__helper">{helper}</p>
        {sparkline?.length ? <Sparkline series={sparkline} label={sparklineLabel} /> : null}
      </div>
    </article>
  );
}

function StatusPill({ status }) {
  if (!status) {
    return <span className="adm-dash">—</span>;
  }

  const tone = PIPELINE_PILL_TONE[status] ?? "";
  const label = PIPELINE_PILL_LABEL[status] || status;

  return <span className={`adm-pill ${tone}`.trim()}>{label}</span>;
}

// Merges the four "recent X" lists the overview already returns into one reverse-chronological
// stream. Each source keeps its own dot colour and its own real description — nothing here is
// synthesised, entries with no usable timestamp are dropped rather than dated to now.
function buildPulseEntries(overview) {
  const entries = [];

  (overview.jobs || []).forEach((job) => {
    entries.push({
      id: `job-${job._id}`,
      kind: "job",
      title: `Job posted — ${job.title}`,
      description: `${job.organizationId?.companyName || "Unknown company"}${
        job.location ? ` · ${job.location}` : ""
      }`,
      timestamp: job.createdAt,
    });
  });

  (overview.applications || []).forEach((application) => {
    entries.push({
      id: `application-${application._id}`,
      kind: "application",
      title: `Application — ${application.jobId?.title || "Unknown role"}`,
      description: `${getPersonName(application.jobSeekerId)} → ${
        application.organizationId?.companyName || "Unknown company"
      } · ${application.status}`,
      timestamp: application.createdAt,
    });
  });

  (overview.payments || []).forEach((payment) => {
    entries.push({
      id: `payment-${payment._id}`,
      kind: "payment",
      title: `Payment ${payment.status?.toLowerCase() || "recorded"} — ${payment.plan} plan`,
      description: `${getPersonName(payment.seekerId)} · ${formatMoney(
        payment.currency || "INR",
        payment.amount
      )}`,
      timestamp: payment.createdAt,
    });
  });

  (overview.verificationRequests || []).forEach((request) => {
    entries.push({
      id: `verification-${request._id}`,
      kind: "verification",
      title: `Verification ${request.status?.toLowerCase() || "requested"}`,
      description: `${getPersonName(request.jobSeekerId)} · ${
        request.organizationId?.companyName || "Unknown company"
      }`,
      timestamp: request.requestedAt || request.createdAt,
    });
  });

  return entries
    .filter((entry) => entry.timestamp && !Number.isNaN(new Date(entry.timestamp).getTime()))
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

function toCsvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function AdminDashboardPage() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState({ type: "", message: "" });
  const [funnelMode, setFunnelMode] = useState("volume");
  const [candidateSearch, setCandidateSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("all");
  const [showAllCandidates, setShowAllCandidates] = useState(false);
  const [showAllPulse, setShowAllPulse] = useState(false);
  const [windowDays, setWindowDays] = useState(DEFAULT_TREND_WINDOW);
  const [policyForm, setPolicyForm] = useState({
    enabled: true,
    matchThreshold: 70,
    maxDailyApplications: 10,
  });

  const overviewQuery = useQuery({
    // windowDays MUST be part of the key. React Query caches by key alone, so without it every
    // range would resolve to the first payload fetched and the dropdown would silently no-op.
    queryKey: ["admin-overview", windowDays],
    queryFn: () =>
      apiRequest(`/admin/overview?windowDays=${windowDays}`, {
        token: session.accessToken,
      }),
    enabled: Boolean(session?.accessToken),
    // Keeps the previous range on screen while the next one loads, so switching dims the
    // dashboard instead of collapsing it to the full-page loading state below.
    placeholderData: keepPreviousData,
  });

  const overview = overviewQuery.data || {};
  const metrics = overview.metrics || {};
  const trends = overview.trends || {};
  const candidateSignals = overview.candidateSignals || {};
  const proAutoApplyPolicy = overview.proAutoApplyPolicy || {};
  const proRecruiterIntroPolicy = overview.proRecruiterIntroPolicy || {};

  useEffect(() => {
    if (!overview.proAutoApplyPolicy) {
      return;
    }

    setPolicyForm({
      enabled: overview.proAutoApplyPolicy.enabled ?? true,
      matchThreshold: overview.proAutoApplyPolicy.matchThreshold ?? 70,
      maxDailyApplications: overview.proAutoApplyPolicy.maxDailyApplications ?? 10,
    });
  }, [overview.proAutoApplyPolicy]);

  const policyMutation = useMutation({
    mutationFn: () =>
      apiRequest("/admin/pro-auto-apply-policy", {
        method: "PUT",
        token: session.accessToken,
        body: {
          enabled: policyForm.enabled,
          matchThreshold: Number(policyForm.matchThreshold),
          maxDailyApplications: Number(policyForm.maxDailyApplications),
        },
      }),
    onSuccess: (response) => {
      setFeedback({ type: "success", message: response.message || "Policy updated." });
      queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
      queryClient.invalidateQueries({ queryKey: ["pro-tools", "auto-apply"] });
    },
    onError: (error) => {
      setFeedback({ type: "error", message: error.message });
    },
  });

  const now = new Date();
  const isSuperAdmin = session?.role === "SuperAdmin";
  const canEditPolicy = isSuperAdmin;

  const funnelPoints = useMemo(() => {
    return (trends.funnelWeekly || []).map((week) => ({
      label: formatShortDate(week.weekStart),
      value: funnelMode === "conversion" ? week.conversionRate : week.applications,
      applications: week.applications,
      accepted: week.accepted,
    }));
  }, [trends.funnelWeekly, funnelMode]);

  const pulseEntries = useMemo(() => buildPulseEntries(overview), [overview]);
  const visiblePulseEntries = showAllPulse ? pulseEntries : pulseEntries.slice(0, 6);

  const candidateRows = useMemo(() => {
    const query = candidateSearch.trim().toLowerCase();

    return (overview.seekers || [])
      .map((seeker) => {
        const signal = candidateSignals[seeker._id] || {};
        const name = getPersonName(seeker);

        return {
          id: seeker._id,
          name,
          initials: getInitials(name),
          // JobSeeker has no location field anywhere in the schema, so the secondary line uses
          // the handle plus the real plan tier rather than inventing a market.
          meta: `@${seeker.username || "not-set"} · ${seeker.isPro ? "Pro" : "Standard"}`,
          isPro: Boolean(seeker.isPro),
          targetRole: signal.targetRole || null,
          targetLocation: signal.targetLocation || null,
          matchScore: signal.matchScore ?? null,
          resumeMatchScore: signal.resumeMatchScore ?? null,
          pipelineStatus: signal.pipelineStatus || null,
          lastActivityAt: signal.lastActivityAt || seeker.createdAt || null,
        };
      })
      .filter((row) => {
        if (planFilter === "pro" && !row.isPro) {
          return false;
        }

        if (planFilter === "standard" && row.isPro) {
          return false;
        }

        if (!query) {
          return true;
        }

        return (
          row.name.toLowerCase().includes(query) ||
          row.meta.toLowerCase().includes(query) ||
          (row.targetRole || "").toLowerCase().includes(query)
        );
      });
  }, [overview.seekers, candidateSignals, candidateSearch, planFilter]);

  const visibleCandidateRows = showAllCandidates ? candidateRows : candidateRows.slice(0, 6);

  const openPipeline =
    (metrics.pendingApplications || 0) + (metrics.underReviewApplications || 0);
  const mrrPrimary = trends.mrr?.primary || null;

  // Read back from the payload, not from the `windowDays` state: while a switch is in flight
  // keepPreviousData is still showing the OLD range, so labelling it with the newly-selected
  // value would caption the visible numbers with the wrong period for the length of the fetch.
  const activeWindowDays = trends.window?.days ?? windowDays;
  // isFetching covers background refetches; isLoading is the first-ever load, which renders the
  // dedicated loading screen instead and must not also dim.
  const isWindowPending = overviewQuery.isFetching && !overviewQuery.isLoading;
  const sparklineDays = trends.sparklines?.applications?.length ?? 0;
  const funnelWeekCount = trends.funnelWeekly?.length ?? 0;
  const sparklineWindowLabel = sparklineDays
    ? `over the last ${sparklineDays} days`
    : "over the trailing period";

  function handleExportReport() {
    const rows = [
      ["Metric", "Value"],
      ["Generated at", now.toISOString()],
      ["Trend window (days)", activeWindowDays],
      ["Active users", metrics.seekers ?? 0],
      ["Pro users", metrics.proSeekers ?? 0],
      ["Standard users", metrics.normalSeekers ?? 0],
      ["Open pipeline", openPipeline],
      ["Applications this week", trends.applicationsThisWeek?.current ?? 0],
      ["Applications last week", trends.applicationsThisWeek?.previous ?? 0],
      [
        "MRR",
        mrrPrimary ? formatMoney(mrrPrimary.currency, mrrPrimary.amount) : "No active subscriptions",
      ],
      ["Recruiters", metrics.recruiters ?? 0],
      ["Verified recruiters", metrics.verifiedRecruiters ?? 0],
      ["Active jobs", metrics.activeJobs ?? 0],
      ["Closed jobs", metrics.closedJobs ?? 0],
      [],
      ["Candidate", "Handle", "Target role", "Match", "Resume ATS", "Pipeline status", "Last activity"],
      ...candidateRows.map((row) => [
        row.name,
        row.meta,
        row.targetRole || "Not available",
        row.matchScore === null ? "Not available" : row.matchScore,
        row.resumeMatchScore === null ? "Not available" : row.resumeMatchScore,
        row.pipelineStatus || "Not available",
        row.lastActivityAt || "Not available",
      ]),
    ];
    const csv = rows.map((row) => row.map(toCsvCell).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `admin-report-${now.toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setFeedback({ type: "success", message: "Report exported." });
  }

  if (overviewQuery.isLoading) {
    return (
      <div className="admin-console">
        <div className="admin-console__inner">
          <p className="adm-eyebrow">Administrator view</p>
          <h1 className="adm-h1">Loading the console…</h1>
          <p className="adm-sub">Pulling platform health, trends and recent activity.</p>
        </div>
      </div>
    );
  }

  if (overviewQuery.isError) {
    return (
      <div className="admin-console">
        <div className="admin-console__inner">
          <p className="adm-eyebrow">Administrator view</p>
          <h1 className="adm-h1">The console could not load.</h1>
          <p className="feedback-banner error">{overviewQuery.error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-console">
      <div className="admin-console__inner">
        {/* ---------- 1. Header ---------- */}
        <header className="admin-console__section adm-header">
          <div>
            <p className="adm-eyebrow">
              <span className="adm-num">{formatEyebrowDate(now)}</span>
              {" · "}
              {(session?.role || "administrator").toUpperCase()} VIEW
            </p>
            <h1 className="adm-h1">
              {getGreeting(now)}, {getAdminName(session)}.
            </h1>
            <p className="adm-sub">Here is the signal across your career operation.</p>
          </div>

          <div className="adm-header__actions">
            {/* Drives the whole trends payload: the value goes into the query key and the request
                path, so the API recomputes deltas, sparklines and the funnel for the chosen span. */}
            <select
              className={`adm-control${isWindowPending ? " adm-control--pending" : ""}`}
              value={windowDays}
              onChange={(event) => setWindowDays(Number(event.target.value))}
              aria-label="Trend comparison window"
              aria-busy={isWindowPending}
            >
              {TREND_WINDOW_OPTIONS.map((days) => (
                <option key={days} value={days}>
                  Last {days} days
                </option>
              ))}
            </select>
            <button type="button" className="adm-btn adm-btn--accent" onClick={handleExportReport}>
              Export report
            </button>
          </div>
        </header>

        <AutoDismissFeedback
          feedback={feedback}
          onClear={() => setFeedback({ type: "", message: "" })}
        />

        {/* ---------- 2. KPI cards ---------- */}
        <section
          className="admin-console__section adm-kpis"
          aria-label="Key metrics"
          data-pending={isWindowPending || undefined}
        >
          <KpiCard
            label="Active users"
            value={formatNumber(metrics.seekers)}
            helper={`${formatNumber(metrics.proSeekers)} Pro · ${formatNumber(
              metrics.normalSeekers
            )} standard`}
            delta={trends.deltas?.seekers}
            comparisonLabel={`sign-ups in the previous ${activeWindowDays} days`}
            sparkline={trends.sparklines?.seekers}
            sparklineLabel={`New sign-ups per day ${sparklineWindowLabel}`}
          />
          <KpiCard
            label="Open pipeline"
            value={formatNumber(openPipeline)}
            helper={`${formatNumber(metrics.pendingApplications)} pending · ${formatNumber(
              metrics.underReviewApplications
            )} in review`}
            delta={trends.deltas?.applications}
            comparisonLabel={`applications in the previous ${activeWindowDays} days`}
            sparkline={trends.sparklines?.applications}
            sparklineLabel={`New applications per day ${sparklineWindowLabel}`}
          />
          <KpiCard
            label="Applications this week"
            value={formatNumber(trends.applicationsThisWeek?.current)}
            helper={`${formatNumber(trends.applicationsThisWeek?.previous)} in the prior 7 days`}
            delta={trends.applicationsThisWeek}
            comparisonLabel="the prior 7 days"
            sparkline={trends.sparklines?.applications}
            sparklineLabel={`New applications per day ${sparklineWindowLabel}`}
          />
          <KpiCard
            label="Monthly recurring"
            value={
              mrrPrimary ? formatMoney(mrrPrimary.currency, mrrPrimary.amount) : "—"
            }
            helper={
              mrrPrimary
                ? `${formatNumber(trends.mrr?.activeSubscriptions)} active · yearly plans at 1/12`
                : "No unexpired paid subscriptions"
            }
            delta={trends.deltas?.paidPayments}
            comparisonLabel={`payments in the previous ${activeWindowDays} days`}
            sparkline={trends.sparklines?.paidPayments}
            sparklineLabel={`Payments received per day ${sparklineWindowLabel}`}
          />
        </section>

        {/* ---------- 3. Funnel health + AI brief ---------- */}
        <section
          className="admin-console__section adm-row"
          data-pending={isWindowPending || undefined}
        >
          <article className="adm-card">
            <div className="adm-card__head">
              <div>
                <p className="adm-eyebrow">Funnel health</p>
                <h2 className="adm-card__title">Applications moving with intent</h2>
              </div>
              <div className="adm-segmented" role="group" aria-label="Funnel metric">
                <button
                  type="button"
                  aria-pressed={funnelMode === "volume"}
                  onClick={() => setFunnelMode("volume")}
                >
                  Volume
                </button>
                <button
                  type="button"
                  aria-pressed={funnelMode === "conversion"}
                  onClick={() => setFunnelMode("conversion")}
                >
                  Conversion
                </button>
              </div>
            </div>

            <AreaChart points={funnelPoints} mode={funnelMode} />

            <div className="adm-chart__footer">
              <div className="adm-legend">
                <span className="adm-legend__item">
                  <span className="adm-legend__dot" />
                  {funnelMode === "conversion" ? "Accepted share" : "Applications"}
                </span>
                <span className="adm-legend__item">
                  <span className="adm-legend__dot adm-legend__dot--accent" />
                  Weekly buckets, last {funnelWeekCount} weeks
                </span>
              </div>
              <span className="adm-note">
                {trends.deltas?.applications?.changePercent === null ||
                trends.deltas?.applications?.changePercent === undefined ? (
                  "No prior period to compare"
                ) : (
                  <>
                    <span className="adm-num">
                      {trends.deltas.applications.changePercent > 0 ? "+" : ""}
                      {trends.deltas.applications.changePercent}%
                    </span>{" "}
                    vs last period
                  </>
                )}
              </span>
            </div>
          </article>

          <article className="adm-card adm-brief">
            <div className="adm-brief__top">
              <span className="adm-brief__mark">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 2l1.8 5.6L19.5 9l-5.7 1.4L12 16l-1.8-5.6L4.5 9l5.7-1.4z" />
                  <path d="M18.5 14l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z" />
                </svg>
                AI operating brief
              </span>
              <span className="adm-brief__chip">
                {AI_OPERATING_BRIEF.confidence === null
                  ? "Sample brief"
                  : `${AI_OPERATING_BRIEF.confidence}% confidence`}
              </span>
            </div>

            <h2 className="adm-brief__headline">{AI_OPERATING_BRIEF.headline}</h2>
            <p className="adm-brief__body">{AI_OPERATING_BRIEF.body}</p>

            {/* Both stat rows are real platform figures — only the prose above is placeholder. */}
            <div className="adm-brief__stats">
              <div className="adm-brief__stat">
                <span className="adm-brief__stat-value">{formatNumber(openPipeline)}</span>
                <span className="adm-brief__stat-label">
                  applications waiting on a recruiter decision
                </span>
              </div>
              <div className="adm-brief__stat">
                <span className="adm-brief__stat-value">
                  {formatNumber(metrics.acceptedApplications)}
                </span>
                <span className="adm-brief__stat-label">
                  accepted all-time, against {formatNumber(metrics.applications)} submitted
                </span>
              </div>
            </div>

            <span className="adm-brief__link">{AI_OPERATING_BRIEF.evidenceLabel} ›</span>
            <p className="adm-brief__foot">
              {AI_OPERATING_BRIEF.disclaimer} · sample copy, no model has run
            </p>
          </article>
        </section>

        {/* ---------- 4. People in motion + live pulse ---------- */}
        <section className="admin-console__section adm-row">
          <article className="adm-card">
            <div className="adm-card__head">
              <div>
                <p className="adm-eyebrow">People in motion</p>
                <h2 className="adm-card__title">Candidate performance</h2>
              </div>
              {candidateRows.length > 6 ? (
                <button
                  type="button"
                  className="adm-linkish"
                  onClick={() => setShowAllCandidates((current) => !current)}
                >
                  {showAllCandidates ? "Show fewer ‹" : `View all ${candidateRows.length} ›`}
                </button>
              ) : (
                <span className="adm-note">
                  Showing <span className="adm-num">{candidateRows.length}</span> of{" "}
                  <span className="adm-num">{formatNumber(metrics.seekers)}</span>
                </span>
              )}
            </div>

            <div className="adm-filters">
              <label className="sr-only" htmlFor="admin-candidate-search">
                Search candidates by name, handle or target role
              </label>
              <input
                id="admin-candidate-search"
                className="adm-search"
                type="search"
                placeholder="Search candidates…"
                value={candidateSearch}
                onChange={(event) => setCandidateSearch(event.target.value)}
              />
              {/* No market/location data exists on JobSeeker, so this filters on the plan tier —
                  a real, stored field — rather than a market the schema cannot supply. */}
              <select
                className="adm-control"
                value={planFilter}
                onChange={(event) => setPlanFilter(event.target.value)}
                aria-label="Filter candidates by plan"
              >
                <option value="all">All plans</option>
                <option value="pro">Pro only</option>
                <option value="standard">Standard only</option>
              </select>
            </div>

            <div className="adm-table-wrap">
              <table className="adm-table">
                <caption className="sr-only">
                  Most recent candidates with their latest application signals
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Candidate</th>
                    <th scope="col">Target role</th>
                    <th scope="col">Match</th>
                    <th scope="col">Resume ATS</th>
                    <th scope="col">Pipeline status</th>
                    <th scope="col">Last activity</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleCandidateRows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <div className="adm-candidate">
                          <span className="adm-avatar" aria-hidden="true">
                            {row.initials}
                          </span>
                          <span style={{ minWidth: 0 }}>
                            <span className="adm-candidate__name">{row.name}</span>
                            <span className="adm-candidate__meta">{row.meta}</span>
                          </span>
                        </div>
                      </td>
                      <td>
                        {row.targetRole ? (
                          <>
                            {row.targetRole}
                            {row.targetLocation ? (
                              <span className="adm-candidate__meta">{row.targetLocation}</span>
                            ) : null}
                          </>
                        ) : (
                          <span className="adm-dash">—</span>
                        )}
                      </td>
                      <td>
                        {row.matchScore === null ? (
                          <span className="adm-dash">—</span>
                        ) : (
                          <span className="adm-match">{row.matchScore}%</span>
                        )}
                      </td>
                      <td>
                        {row.resumeMatchScore === null ? (
                          <span className="adm-dash">—</span>
                        ) : (
                          <span className="adm-num">{row.resumeMatchScore}%</span>
                        )}
                      </td>
                      <td>
                        <StatusPill status={row.pipelineStatus} />
                      </td>
                      <td>
                        <span className="adm-num adm-candidate__meta">
                          {formatRelativeTime(row.lastActivityAt)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {!visibleCandidateRows.length ? (
                <p className="adm-empty">No candidates match this search.</p>
              ) : null}
            </div>
          </article>

          <article className="adm-card">
            <div className="adm-card__head">
              <div>
                <p className="adm-eyebrow">Live pulse</p>
                <h2 className="adm-card__title">What changed</h2>
              </div>
            </div>

            {visiblePulseEntries.length ? (
              <ol className="adm-pulse">
                {visiblePulseEntries.map((entry) => (
                  <li className="adm-pulse__item" key={entry.id}>
                    <span className={`adm-pulse__dot adm-pulse__dot--${entry.kind}`} aria-hidden="true" />
                    <span className="adm-pulse__title">{entry.title}</span>
                    <p className="adm-pulse__desc">{entry.description}</p>
                    <span className="adm-pulse__time">{formatRelativeTime(entry.timestamp)}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="adm-empty">Nothing has changed on the platform yet.</p>
            )}

            {pulseEntries.length > 6 ? (
              <div className="adm-pulse__foot">
                <button
                  type="button"
                  className="adm-linkish"
                  onClick={() => setShowAllPulse((current) => !current)}
                >
                  {showAllPulse
                    ? "Collapse activity log ‹"
                    : `Open activity log (${pulseEntries.length}) ›`}
                </button>
              </div>
            ) : null}
          </article>
        </section>

        {/* ---------- 5. Platform ledger + global policy (behaviour preserved) ---------- */}
        <section className="admin-console__section adm-row">
          <article className="adm-card">
            <div className="adm-card__head">
              <div>
                <p className="adm-eyebrow">Pro policy</p>
                <h2 className="adm-card__title">Global auto-apply controls</h2>
              </div>
              <span className="adm-note">
                {proAutoApplyPolicy.enabled === false ? (
                  "Disabled"
                ) : (
                  <>
                    Threshold{" "}
                    <span className="adm-num">{proAutoApplyPolicy.matchThreshold ?? 70}</span>
                  </>
                )}
              </span>
            </div>

            <p className="adm-kpi__helper" style={{ marginBottom: 16 }}>
              These values are controlled by admin and apply to every Pro applicant. Users can only
              toggle auto-apply and set personal filters.
            </p>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                setFeedback({ type: "", message: "" });
                policyMutation.mutate();
              }}
            >
              <div className="adm-policy__grid">
                <label className="adm-field adm-field--check">
                  <input
                    type="checkbox"
                    checked={policyForm.enabled}
                    onChange={(event) =>
                      setPolicyForm((current) => ({
                        ...current,
                        enabled: event.target.checked,
                      }))
                    }
                    disabled={!canEditPolicy}
                  />
                  <span>Enable global auto-apply</span>
                  <small>Turn this off to stop all background auto-apply runs.</small>
                </label>

                <label className="adm-field">
                  <span>Minimum auto-apply score</span>
                  <input
                    type="number"
                    min="56"
                    max="100"
                    value={policyForm.matchThreshold}
                    onChange={(event) =>
                      setPolicyForm((current) => ({
                        ...current,
                        matchThreshold: event.target.value,
                      }))
                    }
                    disabled={!canEditPolicy}
                  />
                  <small>Only jobs at or above this ATS score can be auto-applied.</small>
                </label>

                <label className="adm-field">
                  <span>Daily auto-apply limit per Pro user</span>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={policyForm.maxDailyApplications}
                    onChange={(event) =>
                      setPolicyForm((current) => ({
                        ...current,
                        maxDailyApplications: event.target.value,
                      }))
                    }
                    disabled={!canEditPolicy}
                  />
                  <small>This cap is shared across all Pro accounts.</small>
                </label>
              </div>

              <div className="adm-policy__foot">
                <button
                  type="submit"
                  className="adm-btn adm-btn--accent"
                  disabled={policyMutation.isPending || !canEditPolicy}
                >
                  {policyMutation.isPending ? "Saving policy…" : "Save global policy"}
                </button>
                {!canEditPolicy ? (
                  <span className="adm-note">Only SuperAdmin can update this policy.</span>
                ) : null}
              </div>
            </form>

            {/* Returned by /admin/overview but rendered nowhere until now. */}
            <div className="adm-pulse__foot">
              <p className="adm-eyebrow" style={{ marginBottom: 8 }}>
                Recruiter introduction policy
              </p>
              <div className="adm-chips">
                <span className="adm-chip">
                  <strong>{proRecruiterIntroPolicy.enabled === false ? "Off" : "On"}</strong> status
                </span>
                <span className="adm-chip">
                  <strong>{proRecruiterIntroPolicy.maxIntroductionsPerJobPerRecruiter ?? "—"}</strong>
                  per job
                </span>
                <span className="adm-chip">
                  <strong>{proRecruiterIntroPolicy.maxIntroductionsPerRecruiterPerDay ?? "—"}</strong>
                  per recruiter/day
                </span>
                <span className="adm-chip">
                  <strong>{proRecruiterIntroPolicy.maxDailyIntroductionsPerSeeker ?? "—"}</strong>
                  per seeker/day
                </span>
              </div>
            </div>
          </article>

          <article className="adm-card">
            <div className="adm-card__head">
              <div>
                <p className="adm-eyebrow">Platform ledger</p>
                <h2 className="adm-card__title">Everything else on record</h2>
              </div>
            </div>

            <div className="adm-chips">
              <span className="adm-chip">
                <strong>{formatNumber(metrics.recruiters)}</strong> recruiters
              </span>
              <span className="adm-chip">
                <strong>{formatNumber(metrics.verifiedRecruiters)}</strong> verified
              </span>
              <span className="adm-chip">
                <strong>{formatNumber(metrics.pendingRecruiters)}</strong> pending
              </span>
              <span className="adm-chip">
                <strong>{formatNumber(metrics.onHoldRecruiters)}</strong> on hold
              </span>
              <span className="adm-chip">
                <strong>{formatNumber(metrics.activeJobs)}</strong> active jobs
              </span>
              <span className="adm-chip">
                <strong>{formatNumber(metrics.closedJobs)}</strong> closed jobs
              </span>
              <span className="adm-chip">
                <strong>{formatNumber(metrics.acceptedApplications)}</strong> accepted
              </span>
              <span className="adm-chip">
                <strong>{formatNumber(metrics.rejectedApplications)}</strong> rejected
              </span>
              <span className="adm-chip">
                <strong>{formatNumber(metrics.withdrawnApplications)}</strong> withdrawn
              </span>
              <span className="adm-chip">
                <strong>{formatNumber(metrics.verificationVerified)}</strong> verifications passed
              </span>
              <span className="adm-chip">
                <strong>{formatNumber(metrics.verificationInProgress)}</strong> in progress
              </span>
              <span className="adm-chip">
                <strong>{formatNumber(metrics.verificationPending)}</strong> awaiting manager
              </span>
              <span className="adm-chip">
                <strong>{formatNumber(metrics.posts)}</strong> posts
              </span>
              <span className="adm-chip">
                <strong>{formatNumber(metrics.connections)}</strong> connections
              </span>
            </div>
          </article>
        </section>
      </div>
    </div>
  );
}
