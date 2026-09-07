import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { apiBlobRequest, apiRequest } from "../../services/api";
import { AutoDismissFeedback } from "../../components/AutoDismissFeedback";
import { CompanyLogo } from "../../components/CompanyLogo";

// STYLING APPROACH — scoped global CSS (`.applied-page ...` in styles.css) on the shared --ph-*
// palette, the same system as .pro-home, .ai-gen, .jobs-page and .job-detail. Tailwind's semantic
// colour utilities generate no CSS in this app, and the unlayered global `button { ... }` rule
// outranks any Tailwind utility on a <button>.

// THE BOARD IS READ-ONLY. A seeker cannot change their own application status — only a recruiter
// can, through applicationController.updateApplicationStatus. Nothing here is draggable and no
// status mutation exists in this file; the only writes are withdraw and the resume download.

// Withdraw is permitted exactly where withdrawApplication() permits it: not already Withdrawn,
// and not a final decision (Accepted/Rejected). Mirrored from the controller's own guards so the
// button never appears for a request the server will reject.
const WITHDRAWABLE_STATUSES = ["Pending", "UnderReview", "Interview"];

// Application.source enum is ["Manual", "AutoApply", "auto"]. BOTH "AutoApply" and "auto" are
// written by the auto-apply worker — matching only one of them would silently mislabel rows as
// manual. "Manual" is the schema default and the only non-automated value.
const AI_TRACKED_SOURCES = new Set(["AutoApply", "auto"]);

// The five reference columns, mapped to the real Application.status enum. Unchanged from before.
const COLUMNS = [
  { key: "applied", label: "Applied" },
  { key: "inReview", label: "In Review" },
  { key: "interview", label: "Interview" },
  { key: "offer", label: "Offer" },
  { key: "closed", label: "Closed" },
];

// Application-related notification types. IMPORTANT: of the four, only "application_status" and
// "auto_apply_success" are ever sent to a seeker — "application_withdrawn" (applicationController)
// and "job_application" (jobController + autoApplyWorker) are created with
// recipientRole: "organization", so they reach the recruiter, never the applicant. They are listed
// anyway so this filter stays correct if those recipients ever change.
const APPLICATION_NOTIFICATION_TYPES = new Set([
  "application_status",
  "auto_apply_success",
  "application_withdrawn",
  "job_application",
  // Written by the Google Calendar connector against a specific application, so they belong in
  // this page's feed rather than only in the global notifications list.
  "interview_scheduled",
  "interview_rescheduled",
  "interview_cancelled",
]);

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const ICON_PATHS = {
  briefcase: (
    <>
      <path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      <rect width="20" height="14" x="2" y="6" rx="2" />
    </>
  ),
  trending: (
    <>
      <path d="M16 7h6v6" />
      <path d="m22 7-8.5 8.5-5-5L2 17" />
    </>
  ),
  calendar: (
    <>
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M3 10h18" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  bell: (
    <>
      <path d="M10.268 21a2 2 0 0 0 3.464 0" />
      <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
    </>
  ),
  zap: <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />,
};

function Icon({ name, className = "ap-icon" }) {
  const paths = ICON_PATHS[name];

  if (!paths) {
    return null;
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {paths}
    </svg>
  );
}

function downloadBlob(fileName, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName || "resume";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function withinLastWeek(value) {
  if (!value) {
    return false;
  }

  const time = new Date(value).getTime();
  return Number.isFinite(time) && Date.now() - time <= WEEK_MS;
}

/* Rendered in the READER's timezone with the zone spelled out. The interview also carries the
   recruiter's IANA zone, but showing a candidate in Bengaluru a time in America/New_York is how
   people miss interviews — so the stored instant is formatted locally, and the abbreviation makes
   the zone explicit rather than implied. */
function formatInterviewWhen(startAt) {
  if (!startAt) {
    return "";
  }

  return new Date(startAt).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function formatCardDate(value) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Same relative-time shape the Notifications page already uses, so the two surfaces agree.
function formatRelative(value) {
  if (!value) {
    return "Just now";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "Recently";
  }

  const seconds = Math.floor((Date.now() - parsed) / 1000);

  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;

  return parsed.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function ApplicationsPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState({ type: "", message: "" });
  const [downloadingId, setDownloadingId] = useState("");
  const [withdrawingId, setWithdrawingId] = useState("");

  const applicationsQuery = useQuery({
    queryKey: ["applications", "mine"],
    queryFn: () =>
      apiRequest("/applications/mine", {
        token: session.accessToken,
      }),
    enabled: Boolean(session?.accessToken),
  });

  // The SAME query key AppShell already mounts on every page, so this shares one cache entry and
  // fires no additional request — not a parallel notifications query.
  const notificationsQuery = useQuery({
    queryKey: ["notifications", session?.role, "navbar"],
    queryFn: () =>
      apiRequest("/notifications?limit=50", {
        token: session.accessToken,
      }),
    enabled: Boolean(session?.accessToken),
    refetchInterval: 30000,
  });

  const applications = applicationsQuery.data?.applications || [];

  // Group applications by the real Application.status enum
  // (Pending | UnderReview | Interview | Accepted | Rejected | Withdrawn).
  const groupedApplications = {
    applied: applications.filter((app) => app.status === "Pending"),
    inReview: applications.filter((app) => app.status === "UnderReview"),
    interview: applications.filter((app) => app.status === "Interview"),
    offer: applications.filter((app) => app.status === "Accepted"),
    closed: applications.filter((app) => app.status === "Rejected" || app.status === "Withdrawn"),
  };

  const totalApplications = applications.length;
  const appliedCount = groupedApplications.applied.length;
  const inReviewCount = groupedApplications.inReview.length;
  const interviewCount = groupedApplications.interview.length;
  const offerCount = groupedApplications.offer.length;

  // "this week" is only computable where the model actually timestamps the transition.
  // createdAt is when an application was created — i.e. when it entered Pending/Applied.
  const appliedThisWeek = groupedApplications.applied.filter((app) =>
    withinLastWeek(app.createdAt)
  ).length;
  // acceptedAt is the one status transition the model does record. If no offer carries it (older
  // rows predate the field), the sub-label is omitted rather than reported as zero.
  const offersWithDate = groupedApplications.offer.filter((app) => app.acceptedAt);
  const offersThisWeek = offersWithDate.filter((app) => withinLastWeek(app.acceptedAt)).length;
  // NO sub-label for In review / Interviews: Application has withdrawnAt, reappliedAt and
  // acceptedAt but no interviewAt and no status history, so there is no way to know when an
  // application entered UnderReview or Interview. Adding one needs a backend model change.
  const kpis = [
    { key: "applied", icon: "briefcase", label: "Applied", value: appliedCount, sub: `${appliedThisWeek} this week` },
    { key: "inReview", icon: "trending", label: "In review", value: inReviewCount, sub: null },
    { key: "interview", icon: "calendar", label: "Interviews", value: interviewCount, sub: null },
    {
      key: "offer",
      icon: "check",
      label: "Offers",
      value: offerCount,
      sub: offersWithDate.length > 0 ? `${offersThisWeek} this week` : null,
    },
  ];

  const applicationNotifications = (notificationsQuery.data?.notifications || []).filter(
    (notification) => APPLICATION_NOTIFICATION_TYPES.has(notification.type)
  );

  const isAiTracked = (app) => AI_TRACKED_SOURCES.has(app.source);

  // atsScore defaults to 0 in the schema, so a stored 0 is indistinguishable from "never scored".
  // Treated as unscored and rendered as an em dash rather than claiming a 0% match.
  const matchScore = (app) =>
    Number.isFinite(app.atsScore) && app.atsScore > 0 ? Math.round(app.atsScore) : null;

  const hasResume = (app) =>
    Boolean(
      app.attachedResume?.media?.filePath ||
        app.attachedResume?.media?.url ||
        app.tailoredResume?.latex
    );

  const withdrawMutation = useMutation({
    mutationFn: (applicationId) =>
      apiRequest(`/applications/${applicationId}/withdraw`, {
        method: "PUT",
        token: session.accessToken,
      }),
    onSuccess: () => {
      setFeedback({ type: "success", message: "Application withdrawn." });
      queryClient.invalidateQueries({ queryKey: ["applications", "mine"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => {
      setFeedback({ type: "error", message: error.message || "Could not withdraw the application." });
    },
    onSettled: () => {
      setWithdrawingId("");
    },
  });

  async function handleDownloadResume(event, app) {
    event.stopPropagation();
    setFeedback({ type: "", message: "" });
    setDownloadingId(app._id);

    try {
      const { blob, fileName } = await apiBlobRequest(
        `/applications/${app._id}/resume?disposition=attachment`,
        { token: session.accessToken }
      );
      downloadBlob(fileName, blob);
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setDownloadingId("");
    }
  }

  function handleWithdraw(event, app) {
    event.stopPropagation();
    setFeedback({ type: "", message: "" });

    const jobTitle = app.jobId?.title || "this job";

    if (!window.confirm(`Withdraw your application for ${jobTitle}? This cannot be undone.`)) {
      return;
    }

    setWithdrawingId(app._id);
    withdrawMutation.mutate(app._id);
  }

  const ApplicationCard = ({ app, columnLabel }) => {
    const jobId = app.jobId?._id || app.jobId;
    const jobTitle = app.jobId?.title || "Job title unavailable";
    const companyName = app.organizationId?.companyName || "Company";
    const score = matchScore(app);
    const canWithdraw = WITHDRAWABLE_STATUSES.includes(app.status);

    return (
      <li
        className="ap-card"
        onClick={() => jobId && navigate(`/jobs/${jobId}`)}
        role="presentation"
      >
        <div className="ap-card__top">
          <CompanyLogo organization={app.organizationId} size="sm" />
          {/* SNAPSHOT, AND LABELLED AS ONE. atsScore is the profile-vs-job score as it stood when
              the seeker applied — the same computeCandidateMatch value /jobs shows live. The two
              agree for an unchanged profile, and once the seeker improves theirs an older
              application legitimately reads lower than /jobs does today. That is only honest if
              the label says so, otherwise it is the same confusion with better numbers. */}
          <div
            className="ap-match"
            aria-hidden="true"
            title={
              score === null
                ? "No match score was recorded for this application"
                : `${score}% match at the time of applying`
            }
          >
            <p className="ap-match__value">{score === null ? "—" : `${score}%`}</p>
            <p className="ap-match__label">Match when applied</p>
          </div>
        </div>

        {jobId ? (
          <Link
            to={`/jobs/${jobId}`}
            className="ap-card__title"
            onClick={(event) => event.stopPropagation()}
            aria-label={`${jobTitle} at ${companyName}, ${columnLabel}, ${
              score === null
                ? "match score not available"
                : `${score} percent match at the time of applying`
            }`}
          >
            {jobTitle}
          </Link>
        ) : (
          <p className="ap-card__title ap-card__title--plain">{jobTitle}</p>
        )}

        <p className="ap-card__meta">
          {companyName} · {formatCardDate(app.createdAt)}
        </p>

        <div className="ap-card__foot">
          <span className={`ap-pill${isAiTracked(app) ? " ap-pill--accent" : ""}`}>
            {isAiTracked(app) ? <Icon name="zap" className="ap-icon ap-icon--xs" /> : null}
            {isAiTracked(app) ? "AI tracking" : "Manually applied"}
          </span>
        </div>

        {/* THE CANDIDATE'S OWN INTERVIEW TIME. The Google invite may sit in a spam folder and the
            in-app notification scrolls away; this is the place a candidate can go and LOOK. Without
            it the only way to check when their interview is would be to email the recruiter.
            Rendered in the reader's own timezone with the zone named, because the recruiter who
            booked it may be in another one. */}
        {app.interview?.status === "Scheduled" ? (
          <div className="ap-interview">
            <p className="ap-interview__when">
              <Icon name="calendar" className="ap-icon ap-icon--xs" />
              Interview {formatInterviewWhen(app.interview.startAt)}
            </p>
            {app.interview.meetLink ? (
              <a
                className="ap-interview__link"
                href={app.interview.meetLink}
                target="_blank"
                rel="noreferrer"
                onClick={(event) => event.stopPropagation()}
              >
                Join Google Meet
              </a>
            ) : null}
          </div>
        ) : null}

        {(hasResume(app) || canWithdraw) && (
          <div className="ap-card__actions">
            {hasResume(app) && (
              <button
                type="button"
                onClick={(event) => handleDownloadResume(event, app)}
                disabled={downloadingId === app._id}
                className="ap-btn ap-btn--sm"
              >
                {downloadingId === app._id
                  ? "Downloading…"
                  : isAiTracked(app)
                    ? "Download AI resume"
                    : "Download resume"}
              </button>
            )}
            {canWithdraw && (
              <button
                type="button"
                onClick={(event) => handleWithdraw(event, app)}
                disabled={withdrawingId === app._id}
                className="ap-btn ap-btn--sm ap-btn--ghost"
              >
                {withdrawingId === app._id ? "Withdrawing…" : "Withdraw"}
              </button>
            )}
          </div>
        )}
      </li>
    );
  };

  return (
    <main className="applied-page">
      <AutoDismissFeedback feedback={feedback} onClear={() => setFeedback({ type: "", message: "" })} />

      <header className="ap-hero">
        <p className="ap-eyebrow">Pipeline</p>
        <h1 className="ap-hero__title">Your applications</h1>
        <p className="ap-hero__sub">
          Tracking {totalApplications} active {totalApplications === 1 ? "application" : "applications"} ·
          AI sends nudges and follow-ups for you.
        </p>
      </header>

      <div className="ap-kpis">
        {kpis.map((kpi) => (
          <div key={kpi.key} className="ap-card-surface ap-kpi">
            <p className="ap-kpi__label">
              <Icon name={kpi.icon} className="ap-icon ap-icon--sm" />
              {kpi.label}
            </p>
            <p className="ap-kpi__value">{kpi.value}</p>
            {kpi.sub && <p className="ap-kpi__sub">{kpi.sub}</p>}
          </div>
        ))}
      </div>

      {applicationsQuery.isLoading ? (
        <p className="ap-card-surface ap-state">Loading applications…</p>
      ) : applicationsQuery.isError ? (
        <p className="ap-card-surface ap-state">
          {applicationsQuery.error?.message || "Could not load your applications."}
        </p>
      ) : (
        <section className="ap-board-wrap" aria-labelledby="ap-board-heading">
          <h2 className="ap-sr-only" id="ap-board-heading">
            Application pipeline
          </h2>
          {/* Horizontal scroll lives HERE, on the board only, so the page itself never scrolls
              sideways. Cards inside are focusable, which is what makes the region keyboard
              reachable — no drag or grid semantics are declared anywhere. */}
          <div className="ap-board">
            {COLUMNS.map((column) => {
              const items = groupedApplications[column.key];

              return (
                <section key={column.key} className="ap-column" aria-labelledby={`ap-col-${column.key}`}>
                  <div className="ap-column__head">
                    <h3 className="ap-column__title" id={`ap-col-${column.key}`}>
                      {column.label}
                    </h3>
                    <span className="ap-count">{items.length}</span>
                  </div>

                  {items.length > 0 ? (
                    <ul className="ap-column__body">
                      {items.map((app) => (
                        <ApplicationCard key={app._id} app={app} columnLabel={column.label} />
                      ))}
                    </ul>
                  ) : (
                    <p className="ap-column__empty">No applications</p>
                  )}
                </section>
              );
            })}
          </div>
        </section>
      )}

      <section className="ap-card-surface ap-notifications" aria-labelledby="ap-notifications-heading">
        <div className="ap-notifications__head">
          <div>
            <p className="ap-eyebrow">Notifications</p>
            <h2 className="ap-section-title" id="ap-notifications-heading">
              Updates on your applications
            </h2>
          </div>
          <span className="ap-tile" aria-hidden="true">
            <Icon name="bell" className="ap-icon ap-icon--sm" />
          </span>
        </div>

        {applicationNotifications.length > 0 ? (
          <ul className="ap-feed">
            {applicationNotifications.map((notification) => (
              <li key={notification._id} className="ap-feed__row">
                <span className="ap-tile ap-tile--sm" aria-hidden="true">
                  <Icon
                    name={notification.type === "auto_apply_success" ? "zap" : "briefcase"}
                    className="ap-icon ap-icon--xs"
                  />
                </span>
                <div className="ap-feed__body">
                  <p className="ap-feed__title">{notification.title}</p>
                  <p className="ap-feed__message">{notification.message}</p>
                </div>
                <time className="ap-feed__time" dateTime={notification.createdAt}>
                  {formatRelative(notification.createdAt)}
                </time>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ap-empty">
            {notificationsQuery.isLoading
              ? "Loading updates…"
              : "No application updates yet. You'll be notified when a recruiter moves one of your applications."}
          </p>
        )}
      </section>
    </main>
  );
}
