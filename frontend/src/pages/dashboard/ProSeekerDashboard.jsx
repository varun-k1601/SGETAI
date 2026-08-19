import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { apiRequest, apiFormRequest } from "../../services/api";
import { AutoDismissFeedback } from "../../components/AutoDismissFeedback";
import { PostCard, formatRelativeTime, getInitials } from "../../components/feedPostKit";

// STYLING APPROACH — scoped global CSS (`.pro-home ...` in styles.css), not Tailwind and not
// inline style objects. This file previously mixed all three; it now uses exactly one.
//
// Tailwind was not a real option here. index.css contains `@import "tailwindcss"` plus an `@theme`
// block that declares FONTS ONLY — no colour tokens are wired into Tailwind v4's engine, and
// styles.css defines no fallback classes either. So `bg-card`, `border-border`,
// `text-muted-foreground`, `bg-primary` and friends generate zero CSS anywhere in this app: they
// are silent no-ops (grep styles.css for `.bg-card` — there is no such rule). On top of that, the
// global `button { background; border-radius; padding; border; box-shadow; transform; transition }`
// rule in styles.css is unlayered, so it beats any Tailwind utility applied to a <button>. Those
// two facts together are the entire reason the inline style objects existed.
//
// Scoped CSS sidesteps both: `.pro-home .ph-btn` (0,2,0) outranks bare `button` (0,0,1), and every
// colour is a real custom property, which is also what makes the dark-mode swap possible — the
// palette is declared once as tokens and overridden under `:root[data-theme="dark"] .pro-home`.
// This is the same pattern the admin console already uses.
//
// PostCard and its button style objects were moved to components/feedPostKit.jsx: three pages
// imported them from here, and they render on pages that have no `.pro-home` ancestor.

const ICON_PATHS = {
  radar: (
    <>
      <path d="M19.07 4.93A10 10 0 0 0 6.99 3.34" />
      <path d="M4 6h.01" />
      <path d="M2.29 9.62A10 10 0 1 0 21.31 8.35" />
      <path d="M16.24 7.76A6 6 0 1 0 8.23 16.67" />
      <path d="M12 18h.01" />
      <path d="M17.99 11.66A6 6 0 0 1 15.77 16.67" />
      <circle cx="12" cy="12" r="2" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </>
  ),
  "trending-up": (
    <>
      <path d="M16 7h6v6" />
      <path d="m22 7-8.5 8.5-5-5L2 17" />
    </>
  ),
  "user-plus": (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="19" x2="19" y1="8" y2="14" />
      <line x1="22" x2="16" y1="11" y2="11" />
    </>
  ),
  briefcase: (
    <>
      <path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      <rect width="20" height="14" x="2" y="6" rx="2" />
    </>
  ),
  "message-square": <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  refresh: (
    <>
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </>
  ),
  close: (
    <>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </>
  ),
  camera: (
    <>
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z" />
      <circle cx="12" cy="13" r="3" />
    </>
  ),
  video: (
    <>
      <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" />
      <rect x="2" y="6" width="14" height="12" rx="2" />
    </>
  ),
};

function Icon({ name, className = "ph-icon" }) {
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
    >
      {paths}
    </svg>
  );
}

function isWithinDays(dateValue, days) {
  const time = new Date(dateValue).getTime();
  if (Number.isNaN(time)) {
    return false;
  }
  return Date.now() - time <= days * 24 * 60 * 60 * 1000;
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

// Applications written by the auto-apply worker. Both spellings are live in the Application
// model's own source enum (["Manual", "AutoApply", "auto"]), so matching only one would undercount.
const AUTO_APPLY_SOURCES = new Set(["auto", "AutoApply"]);

// Rendered wherever a figure has no source in this system. A single sentinel rather than scattered
// literals, so "we cannot measure this" can never be confused with a measured zero.
const NOT_TRACKED = null;

function HeroStat({ icon, value, label, note }) {
  const isAvailable = value !== NOT_TRACKED && value !== undefined;

  return (
    <div className="ph-stat">
      <Icon name={icon} className="ph-stat__icon" />
      <p className="ph-stat__value">{isAvailable ? value : "—"}</p>
      <p className="ph-stat__label">{label}</p>
      {!isAvailable && note ? <p className="ph-stat__note">{note}</p> : null}
    </div>
  );
}

// A real checkbox with role="switch". The visible track/knob is the ::before/::after of the
// adjacent span, so the control the user clicks IS the input — not a <button> imitating one.
function Switch({ id, checked, disabled, onChange, label }) {
  return (
    <span className="ph-switch">
      <input
        id={id}
        type="checkbox"
        role="switch"
        className="ph-switch__input"
        checked={checked}
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="ph-switch__track" aria-hidden="true" />
    </span>
  );
}

export function ProSeekerDashboard() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState({ type: "", message: "" });
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [postContent, setPostContent] = useState("");
  const [postFiles, setPostFiles] = useState([]);
  const [commentDrafts, setCommentDrafts] = useState({});
  const photoInputRef = useRef(null);
  const videoInputRef = useRef(null);

  const feedQuery = useQuery({
    queryKey: ["posts", "feed"],
    queryFn: () => apiRequest("/posts/feed?limit=30", { token: session.accessToken }),
    enabled: Boolean(session?.accessToken),
  });

  const posts = feedQuery.data?.posts || [];

  const createPostMutation = useMutation({
    mutationFn: () => {
      const formData = new FormData();
      formData.append("content", postContent);
      postFiles.forEach((file) => formData.append("files", file));

      return apiFormRequest("/posts", {
        method: "POST",
        token: session.accessToken,
        formData,
      });
    },
    onSuccess: (response) => {
      setFeedback({ type: "success", message: response.message || "Post published." });
      setPostContent("");
      setPostFiles([]);
      setIsComposerOpen(false);
      if (photoInputRef.current) {
        photoInputRef.current.value = "";
      }
      if (videoInputRef.current) {
        videoInputRef.current.value = "";
      }
      queryClient.invalidateQueries({ queryKey: ["posts", "feed"] });
    },
    onError: (error) => {
      setFeedback({ type: "error", message: error.message });
    },
  });

  const likePostMutation = useMutation({
    mutationFn: (postId) =>
      apiRequest(`/posts/${postId}/like`, {
        method: "POST",
        token: session.accessToken,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts", "feed"] });
    },
    onError: (error) => {
      setFeedback({ type: "error", message: error.message });
    },
  });

  const commentPostMutation = useMutation({
    mutationFn: ({ postId, content }) =>
      apiRequest(`/posts/${postId}/comment`, {
        method: "POST",
        token: session.accessToken,
        body: { content },
      }),
    onSuccess: (_response, variables) => {
      setCommentDrafts((current) => ({ ...current, [variables.postId]: "" }));
      queryClient.invalidateQueries({ queryKey: ["posts", "feed"] });
    },
    onError: (error) => {
      setFeedback({ type: "error", message: error.message });
    },
  });

  const deletePostMutation = useMutation({
    mutationFn: (postId) =>
      apiRequest(`/posts/${postId}`, {
        method: "DELETE",
        token: session.accessToken,
      }),
    onSuccess: () => {
      setFeedback({ type: "success", message: "Post deleted." });
      queryClient.invalidateQueries({ queryKey: ["posts", "feed"] });
    },
    onError: (error) => {
      setFeedback({ type: "error", message: error.message });
    },
  });

  function handleDeletePost(postId) {
    const confirmed = window.confirm("Delete this post? This can't be undone.");
    if (confirmed) {
      deletePostMutation.mutate(postId);
    }
  }

  function handleLikePost(postId) {
    likePostMutation.mutate(postId);
  }

  function handleCommentPost(postId) {
    const content = (commentDrafts[postId] || "").trim();
    if (!content) {
      return;
    }
    commentPostMutation.mutate({ postId, content });
  }

  // Same query keys as AutomationsPage.jsx so both pages share one React Query
  // cache entry for the seeker's real auto-apply preference — toggling it here
  // updates Automations too, instead of tracking a second independent flag.
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

  const applicationsQuery = useQuery({
    queryKey: ["applications", "mine"],
    queryFn: () => apiRequest("/applications/mine", { token: session.accessToken }),
    enabled: Boolean(session?.accessToken),
  });

  // Nothing the seeker already fetches exposes RecruiterIntroduction, so the auto-connects tile
  // had no source until this endpoint was added to proFeaturesController.
  const introductionStatsQuery = useQuery({
    queryKey: ["automations", "recruiter-introductions", "stats"],
    queryFn: () =>
      apiRequest("/pro/recruiter-introductions/stats", { token: session.accessToken }),
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
  // filtered out of `activityStream` below. The underlying run history is never touched.
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
  const applications = applicationsQuery.data?.applications || [];

  // ---- Hero figures. Every one of these is computed from a real document; nothing is a literal.
  const autoAppliedThisWeek = applications.filter(
    (app) => AUTO_APPLY_SOURCES.has(app.source) && isWithinDays(app.createdAt, 7)
  ).length;
  const interviewsScheduled = applications.filter((app) => app.status === "Interview").length;
  const jobsScanned = runs.reduce((sum, run) => sum + (run.jobsChecked || 0), 0);

  // Averaged over applications that actually carry a score. atsScore has no schema default, so an
  // unscored application is `undefined` — counting those as 0 would drag the mean toward zero and
  // report a worse match rate than the seeker actually has.
  const scoredApplications = applications.filter((app) => Number.isFinite(app.atsScore));
  const avgMatch = scoredApplications.length
    ? Math.round(
        scoredApplications.reduce((sum, app) => sum + app.atsScore, 0) / scoredApplications.length
      )
    : NOT_TRACKED;

  const autoConnects = introductionStatsQuery.data?.stats?.total ?? NOT_TRACKED;

  // NO SOURCE EXISTS for either of these.
  //
  // "Recruiters responded": Application has no reply/response field at all, and although
  // RecruiterIntroduction.status carries Accepted/Declined with a respondedAt date, NOTHING in the
  // codebase ever writes them — every introduction stays Pending for its whole life. Rendering a
  // count would mean rendering a permanent 0 that reads as "no recruiter ever replied".
  //
  // "Reply rate": there is no baseline anywhere to compare against, so the reference's "4.2x" is
  // not a number this system could ever produce.
  const recruitersResponded = NOT_TRACKED;
  const replyRate = NOT_TRACKED;

  const dismissedActivityKeys = preferencesQuery.data?.dismissedActivityKeys || [];
  const dismissedActivityKeySet = new Set(dismissedActivityKeys);
  const hasAnyRawActivity = runs.some((run) => (run.results || []).length);

  const activityStream = runs
    .flatMap((run) =>
      (run.results || []).map((result) => ({
        ...result,
        ranAt: run.ranAt || run.createdAt,
        // Stable across refetches — unlike an array index, this doesn't shift if `runs` changes
        // order or grows, so a dismissed entry can never silently re-attach to a different result.
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
          tone: "applied",
          icon: "briefcase",
          title: `Applied to ${result.title}`,
          subtitle: `${result.companyName || "Company"} · ${result.score}% match · tailored resume`,
          time: formatRelativeTime(result.ranAt),
        };
      }

      return {
        key: result.key,
        tone: "skipped",
        icon: "close",
        title: `Skipped: ${result.title}`,
        subtitle: `${result.companyName || "Company"} · ${
          Number.isFinite(result.score) ? `${result.score}% match · ` : ""
        }${humanizeSkipReason(result.reason)}`,
        time: formatRelativeTime(result.ranAt),
      };
    });

  function handleDismissActivity(key) {
    dismissActivityMutation.mutate(key);
  }

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

  function handleToggleAutomation(field, nextEnabled) {
    if (updatePreferencesMutation.isPending) {
      return;
    }
    updatePreferencesMutation.mutate({ [field]: nextEnabled });
  }

  const isAutoApplyOn = Boolean(preferences.enabled);
  // The master consent for reaching out to a named human. Auto-connect and auto-DM are only
  // CHANNEL choices underneath it: recruiterIntroductionWorker's candidate filter requires
  // autoIntroduceToRecruiters before it ever looks at the two flags below. Surfacing that here
  // rather than letting someone flip a switch that provably does nothing.
  const introductionsOptedIn = Boolean(preferences.autoIntroduceToRecruiters);
  const isAutoConnectOn = Boolean(preferences.autoConnectEnabled);
  const isAutoDMOn = Boolean(preferences.autoDMEnabled);

  const automationRows = [
    {
      field: "enabled",
      icon: "briefcase",
      title: "Auto-apply engine",
      description: "Applies to roles that clear the platform match threshold, with a tailored resume.",
      enabled: isAutoApplyOn,
      note: null,
    },
    {
      field: "autoConnectEnabled",
      icon: "user-plus",
      title: "Auto-connect to recruiters",
      description:
        "Sends a connection request to the hiring contact on a matched role, on your behalf.",
      enabled: isAutoConnectOn,
      note: introductionsOptedIn
        ? null
        : "Recruiter introductions are off, so this has no effect yet — turn them on in Automations.",
    },
    {
      field: "autoDMEnabled",
      icon: "message-square",
      title: "Auto-DM warm intros",
      // Reference copy said "after a connection is accepted". There is no acceptance step:
      // recruiterIntroductionWorker writes the connection and the message in the same pass, and
      // nothing ever moves an introduction out of Pending. Worded to match what actually happens.
      description:
        "Sends an AI-drafted first message under your name at the same time the connection is made.",
      enabled: isAutoDMOn,
      note: !introductionsOptedIn
        ? "Recruiter introductions are off, so this has no effect yet — turn them on in Automations."
        : !isAutoConnectOn
          ? "Needs auto-connect: a message is never sent without the connection it belongs to."
          : null,
    },
  ];

  const matchThreshold =
    typeof preferences.matchThreshold === "number" ? preferences.matchThreshold : null;

  return (
    <main className="pro-home">
      <AutoDismissFeedback
        feedback={feedback}
        onClear={() => setFeedback({ type: "", message: "" })}
      />

      {/* ---------------------------------------------------------------- Hero */}
      <section className="ph-hero">
        <p className="ph-hero__badge">
          <span aria-hidden="true">✨</span> AI is working for you
        </p>
        <h1 className="ph-hero__title">
          {autoAppliedThisWeek} job{autoAppliedThisWeek === 1 ? "" : "s"} auto-applied this week
        </h1>
        <p className="ph-hero__sub">
          <span>{recruitersResponded === NOT_TRACKED ? "—" : recruitersResponded} recruiters responded</span>
          <span aria-hidden="true"> · </span>
          <span>
            {interviewsScheduled} interview{interviewsScheduled === 1 ? "" : "s"} scheduled
          </span>
          <span aria-hidden="true"> · </span>
          <span>avg match {avgMatch === NOT_TRACKED ? "—" : `${avgMatch}%`}</span>
        </p>

        <div className="ph-hero__stats">
          <HeroStat icon="radar" value={jobsScanned} label="Jobs scanned" />
          <HeroStat
            icon="target"
            value={avgMatch === NOT_TRACKED ? NOT_TRACKED : `${avgMatch}%`}
            label="Avg match"
            note="No scored applications yet"
          />
          <HeroStat
            icon="trending-up"
            value={replyRate}
            label="Reply rate"
            note="Not tracked by this platform"
          />
          <HeroStat icon="user-plus" value={autoConnects} label="Auto-connects" note="Unavailable" />
        </div>
      </section>

      {/* ---------------------------------- Row 2: community feed + automation rail

          The rail is FIRST in the DOM on purpose. Stacked, this reads
          hero -> automation -> activity -> community: on a phone the controls a Pro seeker opened
          the page for sit above the feed rather than below an infinite scroll of it. The desktop
          two-column arrangement is pure CSS grid placement (.ph-rail is assigned column 2), so the
          visual order is achieved without a second copy of the markup and without a reading order
          that disagrees with the DOM.

          <aside> because the rail is complementary to the feed, which is the page's main content;
          the centre column stays inside <main> and outside any complementary landmark. */}
      <div className="ph-split">
        <aside className="ph-rail" aria-label="Automation">
          <section className="ph-card">
            <div className="ph-card__head">
              <div>
                <p className="ph-eyebrow">Automation engine</p>
                <h2 className="ph-card__title">Pro AI is on duty</h2>
              </div>
              <p className={`ph-status ${isAutoApplyOn ? "ph-status--on" : "ph-status--off"}`}>
                <span className="ph-status__dot" aria-hidden="true" />
                {/* The word carries the state; the dot only reinforces it. */}
                {isAutoApplyOn ? "Active" : "Paused"}
              </p>
            </div>

            <ul className="ph-toggles">
              {automationRows.map((row) => (
                <li key={row.field} className="ph-toggle">
                  <span className="ph-tile" aria-hidden="true">
                    <Icon name={row.icon} />
                  </span>
                  <div className="ph-toggle__body">
                    <label className="ph-toggle__title" htmlFor={`ph-toggle-${row.field}`}>
                      {row.title}
                    </label>
                    <p className="ph-toggle__desc">{row.description}</p>
                    {row.note ? <p className="ph-toggle__note">{row.note}</p> : null}
                  </div>
                  <Switch
                    id={`ph-toggle-${row.field}`}
                    checked={row.enabled}
                    disabled={updatePreferencesMutation.isPending}
                    label={row.title}
                    onChange={(next) => handleToggleAutomation(row.field, next)}
                  />
                </li>
              ))}
            </ul>

            {/* Match threshold — READ-ONLY BY DESIGN, not by omission.
                getAutoApplyPreferences overwrites the seeker's stored matchThreshold with
                platformPolicy.matchThreshold before responding, updateAutoApplyPreferences ignores
                any matchThreshold in the body, and autoApplyWorker resolves it from
                job.autoApplyThreshold ?? platformPolicy — the seeker's own value is never read by
                anything. A draggable control here would be a lie the backend silently discards. */}
            {matchThreshold === null ? null : (
              <div className="ph-threshold">
                <div className="ph-threshold__head">
                  <p className="ph-eyebrow">Match threshold</p>
                  <p className="ph-threshold__value">{matchThreshold}%+</p>
                </div>
                <input
                  type="range"
                  className="ph-threshold__slider"
                  /* Data, not styling: the platform value drives how far the filled portion runs. */
                  style={{ "--ph-threshold-fill": `${matchThreshold}%` }}
                  min="0"
                  max="100"
                  value={matchThreshold}
                  disabled
                  readOnly
                  aria-disabled="true"
                  aria-label={`Match threshold, set by platform policy to ${matchThreshold} percent`}
                  aria-describedby="ph-threshold-caption"
                />
                <p className="ph-threshold__caption" id="ph-threshold-caption">
                  Set by platform policy and the same for every seeker — auto-apply only fires at
                  {" "}
                  {matchThreshold}% match or above. This is not adjustable from your account.
                </p>
              </div>
            )}
          </section>

          {/* ------------------------------------------------------- AI activity feed */}
          <section className="ph-card">
            <div className="ph-card__head">
              <div>
                <p className="ph-eyebrow ph-eyebrow--live">
                  <span className="ph-status__dot" aria-hidden="true" /> Live
                </p>
                <h2 className="ph-card__title">AI activity feed</h2>
              </div>
              <div className="ph-card__actions">
                {activityStream.length ? (
                  <button
                    type="button"
                    className="ph-btn ph-btn--ghost"
                    disabled={dismissAllActivityMutation.isPending}
                    onClick={handleDismissAllActivity}
                  >
                    {dismissAllActivityMutation.isPending ? "Closing…" : "Close all"}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="ph-btn ph-btn--ghost"
                  disabled={runsQuery.isFetching}
                  onClick={() => runsQuery.refetch()}
                >
                  <Icon name="refresh" />
                  {runsQuery.isFetching ? "Refreshing…" : "Refresh"}
                </button>
              </div>
            </div>

            {activityStream.length ? (
              <ul className="ph-activity">
                {activityStream.map((activity) => (
                  <li key={activity.key} className="ph-activity__row">
                    <span
                      className={`ph-tile ph-tile--${activity.tone === "applied" ? "brand" : "muted"}`}
                      aria-hidden="true"
                    >
                      <Icon name={activity.icon} />
                    </span>
                    <div className="ph-activity__body">
                      <p className="ph-activity__title">{activity.title}</p>
                      <p className="ph-activity__sub">{activity.subtitle}</p>
                      <p className="ph-activity__time">{activity.time}</p>
                    </div>
                    <button
                      type="button"
                      className="ph-btn ph-btn--icon"
                      title="Dismiss"
                      aria-label={`Dismiss: ${activity.title}`}
                      disabled={dismissActivityMutation.isPending}
                      onClick={() => handleDismissActivity(activity.key)}
                    >
                      <Icon name="close" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ph-empty">
                {runsQuery.isLoading
                  ? "Loading activity…"
                  : hasAnyRawActivity
                    ? "No activity to show — everything here has been closed."
                    : "No auto-apply activity yet. Turn on the auto-apply engine above to get started."}
              </p>
            )}
          </section>
        </aside>

        <section className="ph-centre" aria-label="Community feed">
          {/* --------------------------------------------------------- Community feed
              Not part of the reference crop, but real, working functionality on this route — the
              composer posts to /posts and the list is the shared social feed. Restyled to sit under
              the same tokens rather than removed. */}
          <section className="ph-card ph-composer">
            <p className="ph-eyebrow">Community</p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                setFeedback({ type: "", message: "" });
                createPostMutation.mutate();
              }}
            >
              <div className="ph-composer__row">
                <span className="ph-avatar" aria-hidden="true">
                  {getInitials(`${session?.profile?.firstName || ""} ${session?.profile?.lastName || ""}`)}
                </span>
                {isComposerOpen ? (
                  <>
                    <label className="ph-sr-only" htmlFor="ph-post-content">
                      Share an update
                    </label>
                    <textarea
                      id="ph-post-content"
                      autoFocus
                      rows={3}
                      value={postContent}
                      onChange={(event) => setPostContent(event.target.value)}
                      placeholder="Share an update, a job opening, or a win…"
                      className="ph-textarea"
                      required
                    />
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsComposerOpen(true)}
                    className="ph-btn ph-btn--field"
                  >
                    Share an update, a job opening, or a win…
                  </button>
                )}
              </div>

              {postFiles.length ? (
                <p className="ph-composer__files">{postFiles.map((file) => file.name).join(", ")}</p>
              ) : null}

              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(event) => {
                  setPostFiles((current) => [...current, ...Array.from(event.target.files || [])]);
                  setIsComposerOpen(true);
                }}
              />
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                multiple
                hidden
                onChange={(event) => {
                  setPostFiles((current) => [...current, ...Array.from(event.target.files || [])]);
                  setIsComposerOpen(true);
                }}
              />

              <div className="ph-composer__actions">
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  className="ph-btn ph-btn--ghost"
                >
                  <Icon name="camera" /> Photo
                </button>
                <button
                  type="button"
                  onClick={() => videoInputRef.current?.click()}
                  className="ph-btn ph-btn--ghost"
                >
                  <Icon name="video" /> Video
                </button>
                {isComposerOpen ? (
                  <button
                    type="submit"
                    className="ph-btn ph-btn--primary"
                    disabled={createPostMutation.isPending || !postContent.trim()}
                  >
                    {createPostMutation.isPending ? "Posting…" : "Post"}
                  </button>
                ) : null}
              </div>
            </form>
          </section>

          <div className="ph-feed">
            {feedQuery.isLoading ? (
              <p className="ph-empty">Loading feed…</p>
            ) : feedQuery.isError ? (
              <p className="ph-empty">We could not load posts right now.</p>
            ) : posts.length ? (
              posts.map((post) => (
                <PostCard
                  key={post._id}
                  post={post}
                  session={session}
                  commentValue={commentDrafts[post._id]}
                  onCommentChange={(postId, value) =>
                    setCommentDrafts((current) => ({ ...current, [postId]: value }))
                  }
                  isMutating={likePostMutation.isPending || commentPostMutation.isPending}
                  onLike={handleLikePost}
                  onComment={handleCommentPost}
                  onDelete={handleDeletePost}
                  isDeleting={deletePostMutation.isPending}
                />
              ))
            ) : (
              <p className="ph-empty">No posts yet. Be the first to share an update.</p>
            )}
          </div>
        </section>
      </div>

    </main>
  );
}
