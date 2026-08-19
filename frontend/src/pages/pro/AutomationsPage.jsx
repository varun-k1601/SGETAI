import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../services/api";
import { AutoDismissFeedback } from "../../components/AutoDismissFeedback";

// STYLING APPROACH — scoped global CSS (`.automations-page ...` in styles.css) on the shared
// --ph-* palette, the same system as .pro-home, .ai-gen, .jobs-page, .job-detail and
// .applied-page. Tailwind's semantic colour utilities generate no CSS in this app, and the
// unlayered global `button { ... }` rule outranks any Tailwind utility on a <button>.
//
// The toggle rows are built here rather than through <AutomationSection>: that component styles
// itself from the app's older var(--border)/var(--surface) palette and inline style objects,
// which would be a second visual language inside a --ph-* page. AutomationSection.jsx is left
// untouched — its only other importer is DashboardLayout.jsx, which is unchanged.

// Rendered wherever a figure has no source in this system, so "we cannot measure this" is never
// confused with a measured zero.
const NOT_TRACKED = null;

const ICON_PATHS = {
  briefcase: (
    <>
      <path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      <rect width="20" height="14" x="2" y="6" rx="2" />
    </>
  ),
  userPlus: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M19 8v6" />
      <path d="M22 11h-6" />
    </>
  ),
  link: (
    <>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </>
  ),
  message: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  mail: (
    <>
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </>
  ),
  refresh: (
    <>
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </>
  ),
  shield: <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />,
  zap: <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />,
  reply: (
    <>
      <path d="M9 17l-5-5 5-5" />
      <path d="M4 12h11a5 5 0 0 1 5 5v2" />
    </>
  ),
  close: <path d="M18 6 6 18M6 6l12 12" />,
  broom: (
    <>
      <path d="M3 21h18" />
      <path d="M9 21V9l6-6 5 5-6 6H9z" />
    </>
  ),
  bot: (
    <>
      <path d="M12 8V4H8" />
      <rect width="16" height="12" x="4" y="8" rx="2" />
      <path d="M2 14h2" />
      <path d="M20 14h2" />
      <path d="M15 13v2" />
      <path d="M9 13v2" />
    </>
  ),
};

function Icon({ name, className = "au-icon" }) {
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

function formatRelativeTime(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return "just now";
  }

  const diffSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));

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
  if (diffDays === 1) {
    return "yesterday";
  }

  return `${diffDays}d ago`;
}

function isWithinDays(dateValue, days) {
  const time = new Date(dateValue).getTime();
  if (Number.isNaN(time)) {
    return false;
  }
  return Date.now() - time <= days * 24 * 60 * 60 * 1000;
}

// Calendar day, not a rolling 24 hours — recruiterIntroCountToday is reset at midnight by
// workers/midnightCron.js, so the two halves of "Actions today" have to mean the same thing.
function isToday(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return false;
  }
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function humanizeSkipReason(reason) {
  if (!reason) {
    return "skipped";
  }
  if (reason === "below_threshold") {
    return "below threshold";
  }
  return String(reason).replace(/_/g, " ");
}

function Switch({ id, checked, disabled, onChange, label }) {
  return (
    <input
      id={id}
      type="checkbox"
      role="switch"
      className="au-switch"
      checked={checked}
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      aria-disabled={disabled ? "true" : undefined}
      onChange={(event) => onChange?.(event.target.checked)}
    />
  );
}

export function AutomationsPage() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState(null);

  const preferencesQuery = useQuery({
    queryKey: ["automations", "preferences"],
    queryFn: () => apiRequest("/pro/auto-apply/preferences", { token: session.accessToken }),
    enabled: Boolean(session?.accessToken),
  });

  const runsQuery = useQuery({
    queryKey: ["automations", "runs"],
    queryFn: () => apiRequest("/pro/auto-apply/runs", { token: session.accessToken }),
    enabled: Boolean(session?.accessToken),
  });

  // Same query key the Pro home already uses, so this shares one cache entry rather than opening
  // a parallel request for the same counts.
  const introductionStatsQuery = useQuery({
    queryKey: ["automations", "recruiter-introductions", "stats"],
    queryFn: () => apiRequest("/pro/recruiter-introductions/stats", { token: session.accessToken }),
    enabled: Boolean(session?.accessToken),
  });

  const updatePreferencesMutation = useMutation({
    mutationFn: (patch) =>
      apiRequest("/pro/auto-apply/preferences", {
        method: "PUT",
        token: session.accessToken,
        body: patch,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations", "preferences"] });
      queryClient.invalidateQueries({ queryKey: ["automations", "runs"] });
    },
    onError: (error) => {
      setFeedback({ type: "error", message: error.message });
    },
  });

  // Activity rows are computed from AutoApplyRun.results[], not their own documents, so there's
  // nothing to soft-delete server-side — dismissing just records the row's stable key so it gets
  // filtered out below. The underlying run history is never touched.
  const dismissActivityMutation = useMutation({
    mutationFn: (key) =>
      apiRequest("/pro/agent/activity/dismiss", {
        method: "PATCH",
        token: session.accessToken,
        body: { key },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations", "preferences"] });
    },
    onError: (error) => {
      setFeedback({ type: "error", message: error.message });
    },
  });

  const dismissAllActivityMutation = useMutation({
    mutationFn: (keys) =>
      apiRequest("/pro/agent/activity/dismiss-all", {
        method: "PATCH",
        token: session.accessToken,
        body: { keys },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations", "preferences"] });
    },
    onError: (error) => {
      setFeedback({ type: "error", message: error.message });
    },
  });

  const preferences = preferencesQuery.data?.preferences || {};
  const runs = runsQuery.data?.runs || [];
  // Admin-controlled caps for recruiter introductions — shown alongside the toggle so turning it
  // on is an informed choice about how much outreach it can actually produce.
  const recruiterIntroPolicy = preferencesQuery.data?.recruiterIntroPolicy || {};
  const recruiterIntroCountToday = preferencesQuery.data?.recruiterIntroCountToday || 0;
  // Mirrors recruiterIntroductionWorker's own per-candidate gates, so the page can explain an
  // inert configuration instead of leaving the seeker to infer it from silence.
  const introReadiness = preferencesQuery.data?.recruiterIntroReadiness || {};
  const introStats = introductionStatsQuery.data?.stats || {};

  function handleToggleAutomation(featureId, nextEnabled) {
    if (updatePreferencesMutation.isPending) {
      return;
    }

    if (featureId === "autoApply") {
      updatePreferencesMutation.mutate({ enabled: nextEnabled });
    } else if (featureId === "recruiterIntro") {
      updatePreferencesMutation.mutate({ autoIntroduceToRecruiters: nextEnabled });
    } else if (featureId === "autoConnect") {
      updatePreferencesMutation.mutate({ autoConnectEnabled: nextEnabled });
    } else if (featureId === "autoDM") {
      updatePreferencesMutation.mutate({ autoDMEnabled: nextEnabled });
    } else if (featureId === "safetyGuards") {
      updatePreferencesMutation.mutate({ safetyGuardrailsEnabled: nextEnabled });
    }
    // followUp / profileSync have no backend behind them yet — their toggles are
    // rendered disabled below and never reach this handler.
  }

  const masterIntroOn = Boolean(preferences.autoIntroduceToRecruiters);

  const automationFeatures = [
    {
      id: "autoApply",
      icon: "briefcase",
      name: "Auto-apply to jobs",
      description: "Applies on your behalf when a job scores above the platform match threshold.",
      enabled: Boolean(preferences.enabled),
    },
    // The MASTER switch. The reference omits it, but auto-connect and auto-DM below do nothing
    // without it — recruiterIntroductionWorker gates every introduction on this flag.
    {
      id: "recruiterIntro",
      icon: "userPlus",
      name: "Auto-introduce to recruiters",
      description:
        "Master switch for the two channels below. On a strong match, introduces you to the recruiter who posted the job.",
      note: recruiterIntroPolicy.maxDailyIntroductionsPerSeeker
        ? `Up to ${recruiterIntroPolicy.maxDailyIntroductionsPerSeeker}/day · ${recruiterIntroCountToday} sent today · you can read every message in Chat.`
        : "Every message is visible to you in Chat.",
      enabled: masterIntroOn,
      disabled: recruiterIntroPolicy.enabled === false,
      badge: recruiterIntroPolicy.enabled === false ? "Paused by admin" : undefined,
    },
    // RELABELLED. This was "Auto-connect" under a LinkedIn icon, which was false: it writes an
    // in-app connection and a RecruiterIntroduction record and never contacts LinkedIn. LinkedIn's
    // public API exposes no endpoint for sending connection requests to third parties, so no
    // amount of scopes or approval could make the old label true.
    {
      id: "autoConnect",
      icon: "link",
      name: "Auto-connect to recruiters",
      description:
        "Creates an in-app connection with the recruiter who posted the job. Runs inside SGETAI only — your LinkedIn account is never used.",
      enabled: Boolean(preferences.autoConnectEnabled),
      note: !masterIntroOn ? "Inert until Auto-introduce to recruiters is on." : undefined,
    },
    // Reworded. There is no acceptance step to wait for: recruiterIntroductionWorker sends the
    // intro in the same pass that creates the connection.
    {
      id: "autoDM",
      icon: "message",
      name: "Auto-DM intros",
      description:
        "Sends an AI-drafted first message in SGETAI chat at the moment the connection is made — there is no acceptance step.",
      enabled: Boolean(preferences.autoDMEnabled),
      note: introReadiness.dmBlockedByMissingConnect
        ? "Sends nothing while Auto-connect is off — the message rides along with the connection."
        : !masterIntroOn
          ? "Inert until Auto-introduce to recruiters is on."
          : undefined,
    },
    {
      id: "followUp",
      icon: "mail",
      name: "Auto follow-up emails",
      description: "Polite nudges after a period of silence.",
      enabled: false,
      disabled: true,
      badge: "Not built",
      note: "Nothing is scheduled or sent — there is no follow-up service behind this switch yet.",
    },
    {
      id: "profileSync",
      icon: "refresh",
      name: "LinkedIn profile sync",
      description: "Mirror your SGETAI profile to LinkedIn.",
      enabled: false,
      disabled: true,
      badge: "Not possible",
      note: "LinkedIn provides no API for writing a member's headline, experience or profile, so this cannot be built — it is not pending.",
    },
    {
      id: "safetyGuards",
      icon: "shield",
      name: "Safety guardrails",
      description: "Skip auto-apply on excluded companies, mismatched location, or salary.",
      enabled: Boolean(preferences.safetyGuardrailsEnabled),
    },
  ];

  const runsLast7Days = runs.filter((run) => isWithinDays(run.ranAt || run.createdAt, 7));
  const autoAppliesThisWeek = runsLast7Days.reduce(
    (sum, run) => sum + (run.applicationsCreated || 0),
    0
  );
  const autoApplyActionsToday = runs
    .filter((run) => isToday(run.ranAt || run.createdAt))
    .reduce((sum, run) => sum + (run.results?.length || 0), 0);
  const actionsToday = autoApplyActionsToday + recruiterIntroCountToday;

  // Recruiter replies are not recorded anywhere in this system, and there is no manual baseline
  // to compare against, so there is nothing to divide. Rendered as "—", never as a number.
  const replyRate = NOT_TRACKED;

  const kpis = [
    {
      key: "actions",
      icon: "zap",
      label: "Actions today",
      value: actionsToday,
      sub: `${autoApplyActionsToday} auto-apply · ${recruiterIntroCountToday} intro${
        recruiterIntroCountToday === 1 ? "" : "s"
      }`,
    },
    {
      key: "applies",
      icon: "briefcase",
      label: "Auto-applies",
      value: autoAppliesThisWeek,
      sub: "this week",
    },
    {
      key: "connects",
      icon: "userPlus",
      label: "Connects sent",
      value: Number.isFinite(introStats.total) ? introStats.total : NOT_TRACKED,
      // NO acceptance rate. RecruiterIntroduction.status has Accepted/Declined values, but nothing
      // in the codebase ever writes them — every record stays Pending, so any "% accepted" would
      // be a permanent 0% masquerading as a measurement.
      sub: Number.isFinite(introStats.last7Days) ? `${introStats.last7Days} this week` : null,
    },
    {
      key: "replies",
      icon: "reply",
      label: "Reply rate",
      value: replyRate,
      sub: "Not tracked",
    },
  ];

  const dismissedActivityKeys = preferencesQuery.data?.dismissedActivityKeys || [];
  const dismissedActivityKeySet = new Set(dismissedActivityKeys);
  const hasAnyRawActivity = runs.some((run) => (run.results || []).length);

  const activityStream = runs
    .flatMap((run) =>
      (run.results || []).map((result) => ({
        ...result,
        ranAt: run.ranAt || run.createdAt,
        // Identical to the Pro home's derivation, so dismissing a row on either surface hides it
        // on both — the keys are stored per-seeker on the server, not per-page.
        key: `${run._id}-${result.jobId}-${result.status}`,
      }))
    )
    .sort((a, b) => new Date(b.ranAt) - new Date(a.ranAt))
    .filter((result) => !dismissedActivityKeySet.has(result.key))
    .slice(0, 8)
    .map((result) => {
      if (result.status === "applied") {
        return {
          key: result.key,
          icon: "briefcase",
          title: `Applied to ${result.title}`,
          subtitle: `${result.companyName || "Company"} · ${result.score}% match · tailored resume`,
          time: formatRelativeTime(result.ranAt),
        };
      }

      return {
        key: result.key,
        icon: "close",
        title: `Skipped: ${result.title}`,
        subtitle: `${result.companyName || "Company"} · ${
          Number.isFinite(result.score) ? `${result.score}% match · ` : ""
        }${humanizeSkipReason(result.reason)}`,
        time: formatRelativeTime(result.ranAt),
      };
    });

  function handleDismissAllActivity() {
    if (
      !window.confirm(
        "Close all activity entries? Your auto-apply history is still saved — this only clears them from this list."
      )
    ) {
      return;
    }
    dismissAllActivityMutation.mutate(activityStream.map((activity) => activity.key));
  }

  const matchThreshold =
    typeof preferences.matchThreshold === "number" ? preferences.matchThreshold : null;

  return (
    <main className="automations-page">
      <AutoDismissFeedback feedback={feedback} onClear={() => setFeedback(null)} />

      <header className="au-hero">
        <p className="au-eyebrow">Automation OS</p>
        <h1 className="au-hero__title">Your AI agents</h1>
        <p className="au-hero__sub">
          Configure what AI does on your behalf. Everything here runs inside SGETAI — job matching,
          applications, and recruiter introductions. No external account is used on your behalf.
        </p>
      </header>

      <div className="au-kpis">
        {kpis.map((kpi) => (
          <div key={kpi.key} className="au-card au-kpi">
            <p className="au-kpi__label">
              <Icon name={kpi.icon} className="au-icon au-icon--sm" />
              {kpi.label}
            </p>
            <p className={`au-kpi__value${kpi.value === NOT_TRACKED ? " au-kpi__value--none" : ""}`}>
              {kpi.value === NOT_TRACKED ? "—" : kpi.value}
            </p>
            {kpi.sub && <p className="au-kpi__sub">{kpi.sub}</p>}
          </div>
        ))}
      </div>

      <div className="au-split">
        <div className="au-main">
          <section className="au-card" aria-labelledby="au-automations-heading">
            <div className="au-card__head">
              <div>
                <p className="au-eyebrow">Automation engine</p>
                <h2 className="au-card__title" id="au-automations-heading">
                  Active automations
                </h2>
              </div>
              {preferences.enabled ? (
                <span className="au-pill au-pill--success">Auto-apply on</span>
              ) : (
                <span className="au-pill">Auto-apply off</span>
              )}
            </div>

            <ul className="au-features">
              {automationFeatures.map((feature) => (
                <li
                  key={feature.id}
                  className={`au-feature${feature.disabled ? " au-feature--disabled" : ""}`}
                >
                  <span className="au-tile" aria-hidden="true">
                    <Icon name={feature.icon} className="au-icon au-icon--sm" />
                  </span>

                  <div className="au-feature__body">
                    <div className="au-feature__top">
                      <label className="au-feature__name" htmlFor={`au-toggle-${feature.id}`}>
                        {feature.name}
                      </label>
                      {feature.badge && <span className="au-pill au-pill--sm">{feature.badge}</span>}
                    </div>
                    <p className="au-feature__desc" id={`au-desc-${feature.id}`}>
                      {feature.description}
                    </p>
                    {feature.note && <p className="au-feature__note">{feature.note}</p>}
                  </div>

                  <div className="au-feature__control">
                    <Switch
                      id={`au-toggle-${feature.id}`}
                      label={feature.name}
                      checked={feature.enabled}
                      disabled={feature.disabled || updatePreferencesMutation.isPending}
                      onChange={(next) => handleToggleAutomation(feature.id, next)}
                    />
                    <span className="au-state" aria-hidden="true">
                      {feature.disabled ? "Off" : feature.enabled ? "On" : "Off"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>

            {matchThreshold !== null && (
              <div className="au-threshold">
                <div className="au-threshold__head">
                  <p className="au-eyebrow">Match threshold</p>
                  <p className="au-threshold__value">{matchThreshold}%</p>
                </div>
                {/* READ-ONLY, exactly as on the Pro home and the Jobs page: this is a
                    platform-wide policy value returned by getProAutoApplyPolicy(), not a
                    per-seeker preference, and no mutation on this page writes it. The custom
                    property is data binding for the track fill, not styling. */}
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={matchThreshold}
                  disabled
                  readOnly
                  aria-disabled="true"
                  aria-describedby="au-threshold-caption"
                  aria-label="Match threshold, set by the platform"
                  className="au-threshold__slider"
                  style={{ "--au-threshold-fill": `${matchThreshold}%` }}
                />
                <p className="au-threshold__caption" id="au-threshold-caption">
                  Set by the platform and applied to every Pro member. It is shown here so you know
                  what auto-apply is measuring against — it cannot be changed from this screen.
                </p>
              </div>
            )}
          </section>

          <section className="au-card" aria-labelledby="au-templates-heading">
            <div className="au-card__head">
              <div>
                <p className="au-eyebrow">Templates</p>
                <h2 className="au-card__title" id="au-templates-heading">
                  Message templates
                </h2>
              </div>
              <span className="au-pill">Not available</span>
            </div>

            {/* No template model, collection or endpoint exists, so there is nothing to list and
                nothing to edit. Rendering three sample rows behind a disabled "Edit" button would
                imply a store that does not exist. */}
            <p className="au-note">
              Saved templates aren&apos;t available yet — there is no template store behind this
              screen, so there is nothing to edit or apply.
            </p>
            <p className="au-note">
              Today every intro is drafted per-recruiter by the AI when it is sent, and you can read
              exactly what went out in Chat. To write one yourself, use the Recruiter DM tool.
            </p>
            <Link to="/pro/ai" className="au-btn au-btn--sm">
              <Icon name="bot" className="au-icon au-icon--sm" />
              Open the AI Generator
            </Link>
          </section>
        </div>

        <aside className="au-rail">
          <section className="au-card" aria-labelledby="au-activity-heading">
            <div className="au-card__head">
              <div>
                <p className="au-eyebrow">Live</p>
                <h2 className="au-card__title" id="au-activity-heading">
                  Activity stream
                </h2>
              </div>
              {/* A real control, not a decorative gear: it calls the existing dismiss-all
                  endpoint. Rendered only when there is something to clear. */}
              {activityStream.length > 0 && (
                <button
                  type="button"
                  className="au-btn au-btn--sm au-btn--ghost"
                  onClick={handleDismissAllActivity}
                  disabled={dismissAllActivityMutation.isPending}
                >
                  <Icon name="broom" className="au-icon au-icon--sm" />
                  Clear all
                </button>
              )}
            </div>

            {activityStream.length > 0 ? (
              <ul className="au-activity">
                {activityStream.map((activity) => (
                  <li key={activity.key} className="au-activity__row">
                    <span className="au-tile au-tile--sm" aria-hidden="true">
                      <Icon name={activity.icon} className="au-icon au-icon--xs" />
                    </span>
                    <div className="au-activity__body">
                      <p className="au-activity__title">{activity.title}</p>
                      <p className="au-activity__sub">{activity.subtitle}</p>
                    </div>
                    <div className="au-activity__side">
                      <span className="au-activity__time">{activity.time}</span>
                      <button
                        type="button"
                        className="au-dismiss"
                        onClick={() => dismissActivityMutation.mutate(activity.key)}
                        disabled={dismissActivityMutation.isPending}
                        aria-label={`Dismiss: ${activity.title}`}
                      >
                        <Icon name="close" className="au-icon au-icon--xs" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="au-empty">
                {runsQuery.isLoading
                  ? "Loading activity…"
                  : hasAnyRawActivity
                    ? "You have cleared every activity entry. New auto-apply runs will appear here."
                    : "No auto-apply activity yet. Turn on auto-apply to get started."}
              </p>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
