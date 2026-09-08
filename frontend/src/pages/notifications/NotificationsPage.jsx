import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../services/api";
import { AutoDismissFeedback } from "../../components/AutoDismissFeedback";

// STYLING APPROACH — scoped global CSS (`.notif-page ...` in styles.css) on the shared --ph-*
// palette, the same system as .pro-home, .ai-gen, .jobs-page, .job-detail, .applied-page,
// .automations-page and .chat-page. Tailwind's semantic colour utilities generate no CSS in this
// app, and the unlayered global `button { ... }` rule outranks any Tailwind utility on a <button>.

// ── THE TYPE REGISTRY ─────────────────────────────────────────────────────────────────────────
// Notification.type is a free-form String, so this list was enumerated from every actual
// createNotification() call site in backend/src — NOT from a grep for `type: "..."`, which also
// returns GeneratedArtifact.type ("resume", "linkedin_post", "recruiter_dm", "job_matches") and
// OAuth strings ("code", "authorization_code"). None of those are notification types.
//
// `connection_accepted` / `connection_rejected` are emitted as a template literal
// (`connection_${actionLabel}` in connectionController) — a literal grep misses them.
//
// Three types the old page counted on — "auto_connect", "recruiter_response" and a standalone
// "connection_accepted" KPI — were never wired to a real emit path, so those tiles read 0 forever.
// Everything below is verified against a live emit site.
const NOTIFICATION_TYPES = {
  auto_apply_success: { label: "Auto-apply", tone: "accent" },
  recruiter_introduction_sent: { label: "Introduction", tone: "accent" },
  recruiter_introduction_received: { label: "Introduction", tone: "accent" },
  chat_message: { label: "Message", tone: "success" },
  application_status: { label: "Application", tone: "success" },
  // Written by the Google Calendar connector when a recruiter schedules, moves or cancels an
  // interview. Registered here so they render with a real label rather than the generic fallback.
  interview_scheduled: { label: "Interview", tone: "success" },
  interview_rescheduled: { label: "Interview", tone: "accent" },
  interview_cancelled: { label: "Interview", tone: "neutral" },
  job_application: { label: "Application", tone: "neutral" },
  application_withdrawn: { label: "Application", tone: "neutral" },
  connection_request: { label: "Connection", tone: "neutral" },
  connection_accepted: { label: "Connection", tone: "success" },
  connection_rejected: { label: "Connection", tone: "neutral" },
  follow: { label: "Follow", tone: "neutral" },
  new_job: { label: "Job", tone: "neutral" },
  post_like: { label: "Post", tone: "neutral" },
  post_comment: { label: "Post", tone: "neutral" },
  support_reply: { label: "Support", tone: "neutral" },
  support_user_reply: { label: "Support", tone: "neutral" },
  verification_complete: { label: "Account", tone: "success" },
};

// Auto-connects and Auto-DMs are the SAME notification type. recruiterIntroductionWorker stamps
// metadata.deliveryMode ("connection_only" when no message was sent, "connection_and_message" when
// one was), so they are told apart by that field rather than by inventing a second type.
const DELIVERY_CONNECTION_ONLY = "connection_only";
const DELIVERY_WITH_MESSAGE = "connection_and_message";

const isAutoConnect = (n) =>
  n.type === "recruiter_introduction_sent" && n.metadata?.deliveryMode === DELIVERY_CONNECTION_ONLY;
const isAutoDm = (n) =>
  n.type === "recruiter_introduction_sent" && n.metadata?.deliveryMode === DELIVERY_WITH_MESSAGE;

// Categories are declared over verified types only. A category with no matching notification is
// not rendered — which also means the chip row adapts to the account: a seeker never sees the
// organization-only "Introductions received" chip, and an admin sees "Support".
const CATEGORIES = [
  { id: "all", label: "All", match: () => true, alwaysShow: true, empty: "No notifications yet." },
  {
    id: "unread",
    label: "Unread",
    match: (n) => !n.isRead,
    alwaysShow: true,
    empty: "No unread notifications.",
  },
  {
    id: "auto-applies",
    label: "Auto-applies",
    match: (n) => n.type === "auto_apply_success",
    empty: "No auto-applies yet.",
  },
  { id: "auto-connects", label: "Auto-connects", match: isAutoConnect, empty: "No auto-connects yet." },
  { id: "auto-dms", label: "Auto-DMs", match: isAutoDm, empty: "No auto-DMs yet." },
  {
    id: "responses",
    label: "Responses",
    match: (n) => n.type === "chat_message" || n.type === "application_status",
    empty: "No responses yet.",
  },
  {
    id: "connections",
    label: "Connections",
    match: (n) =>
      ["connection_request", "connection_accepted", "connection_rejected", "follow"].includes(n.type),
    empty: "No connection activity yet.",
  },
  {
    id: "applications",
    label: "Applications",
    match: (n) => ["job_application", "application_withdrawn"].includes(n.type),
    empty: "No application activity yet.",
  },
  { id: "jobs", label: "Jobs", match: (n) => n.type === "new_job", empty: "No job alerts yet." },
  {
    id: "posts",
    label: "Posts",
    match: (n) => ["post_like", "post_comment"].includes(n.type),
    empty: "No post activity yet.",
  },
  {
    id: "introductions",
    label: "Introductions received",
    match: (n) => n.type === "recruiter_introduction_received",
    empty: "No introductions received yet.",
  },
  {
    id: "support",
    label: "Support",
    match: (n) => ["support_reply", "support_user_reply"].includes(n.type),
    empty: "No support replies yet.",
  },
  {
    id: "account",
    label: "Account",
    match: (n) => n.type === "verification_complete",
    empty: "No account updates yet.",
  },
];

// Rendered wherever a figure cannot be computed from what the API returned.
const NOT_COUNTABLE = null;

const ICON_PATHS = {
  bell: (
    <>
      <path d="M10.268 21a2 2 0 0 0 3.464 0" />
      <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
    </>
  ),
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
  message: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  check: <path d="M20 6 9 17l-5-5" />,
  trash: (
    <>
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </>
  ),
  close: <path d="M18 6 6 18M6 6l12 12" />,
};

function Icon({ name, className = "nt-icon" }) {
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

function iconForType(type) {
  if (type === "auto_apply_success" || type === "job_application" || type === "application_status") {
    return "briefcase";
  }
  if (type?.startsWith("recruiter_introduction") || type?.startsWith("connection") || type === "follow") {
    return "userPlus";
  }
  if (type === "chat_message" || type === "post_comment" || type?.startsWith("support")) {
    return "message";
  }
  return "bell";
}

function formatDate(value) {
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

// Only routes that actually exist. metadata carries jobId / applicationId / sessionId /
// introductionId / connectionId; anything without a real destination stays non-navigable rather
// than pretending to be a link.
function destinationFor(notification) {
  const meta = notification.metadata || {};

  if (meta.sessionId || notification.type === "chat_message") {
    return "/chat";
  }
  if (notification.type?.startsWith("recruiter_introduction")) {
    return "/chat";
  }
  if (meta.jobId) {
    return `/jobs/${meta.jobId}`;
  }
  if (meta.applicationId || notification.type === "application_status") {
    return "/applications";
  }
  if (notification.type?.startsWith("support")) {
    return "/help";
  }
  if (["connection_request", "connection_accepted", "connection_rejected", "follow"].includes(notification.type)) {
    return "/connections";
  }
  return "";
}

export function NotificationsPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState({ type: "", message: "" });
  const [activeCategory, setActiveCategory] = useState("all");

  const notificationsKey = ["notifications", session?.role, "page"];

  const notificationsQuery = useQuery({
    queryKey: notificationsKey,
    queryFn: () =>
      apiRequest("/notifications?limit=50", {
        token: session.accessToken,
      }),
    enabled: Boolean(session?.accessToken),
    // Matches AppShell's badge cadence exactly. Two different query keys at the same interval
    // refresh together rather than one lagging the other.
    refetchInterval: 30000,
  });

  const notifications = notificationsQuery.data?.notifications || [];
  const pagination = notificationsQuery.data?.pagination || {};

  // GET /notifications IS paginated, and normalizePagination() hard-caps limit at 50. Once a user
  // has more than 50 notifications, this page holds a partial list and every count derived from it
  // would be wrong — so the KPI tiles refuse to report rather than under-count.
  const totalNotifications = Number.isFinite(pagination.total) ? pagination.total : notifications.length;
  const hasCompleteList = notifications.length >= totalNotifications;

  const countOf = (predicate) =>
    hasCompleteList ? notifications.filter(predicate).length : NOT_COUNTABLE;

  const unreadCount = countOf((n) => !n.isRead);
  // Used for the "Mark all as read" enablement — a local truth about the loaded page, which is
  // fine because the endpoint marks everything server-side regardless of what is displayed.
  const hasUnreadOnPage = notifications.some((n) => !n.isRead);

  const kpis = [
    { key: "unread", icon: "bell", label: "Unread", value: unreadCount },
    {
      key: "auto-applies",
      icon: "briefcase",
      label: "Auto-applies",
      value: countOf((n) => n.type === "auto_apply_success"),
    },
    { key: "auto-connects", icon: "userPlus", label: "Auto-connects", value: countOf(isAutoConnect) },
    {
      key: "responses",
      icon: "message",
      label: "Responses",
      value: countOf((n) => n.type === "chat_message" || n.type === "application_status"),
    },
  ];

  // Counts here are over the loaded page and are labelled as such by the "{n} shown" indicator —
  // they describe what is on screen, unlike the KPI tiles which claim to describe the account.
  const categories = useMemo(
    () =>
      CATEGORIES.map((category) => ({
        ...category,
        count: notifications.filter(category.match).length,
      })).filter((category) => category.alwaysShow || category.count > 0),
    [notifications]
  );

  const activeDefinition =
    categories.find((category) => category.id === activeCategory) || categories[0];

  const filteredNotifications = useMemo(
    () => notifications.filter(activeDefinition?.match || (() => true)),
    [notifications, activeDefinition]
  );

  // Prefix match: this covers BOTH this page's key and AppShell's
  // ["notifications", session?.role, "navbar"], so the sidebar badge updates with the list.
  const invalidateNotifications = () => {
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };

  // Optimistic helpers. Every mutation below snapshots the cache, applies the change immediately,
  // and restores the snapshot if the request fails.
  async function beginOptimistic(update) {
    await queryClient.cancelQueries({ queryKey: notificationsKey });
    const previous = queryClient.getQueryData(notificationsKey);
    queryClient.setQueryData(notificationsKey, (old) => {
      if (!old?.notifications) {
        return old;
      }
      return { ...old, ...update(old) };
    });
    return { previous };
  }

  function rollback(context, error) {
    if (context?.previous !== undefined) {
      queryClient.setQueryData(notificationsKey, context.previous);
    }
    setFeedback({ type: "error", message: error.message });
  }

  const markReadMutation = useMutation({
    mutationFn: (notificationId) =>
      apiRequest(`/notifications/${notificationId}/read`, {
        method: "PUT",
        token: session.accessToken,
      }),
    onMutate: (notificationId) =>
      beginOptimistic((old) => ({
        notifications: old.notifications.map((n) =>
          n._id === notificationId ? { ...n, isRead: true } : n
        ),
      })),
    onError: (error, _id, context) => rollback(context, error),
    onSettled: () => invalidateNotifications(),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () =>
      apiRequest("/notifications/read-all", {
        method: "PUT",
        token: session.accessToken,
      }),
    onMutate: () =>
      beginOptimistic((old) => ({
        notifications: old.notifications.map((n) => ({ ...n, isRead: true })),
      })),
    onSuccess: (response) => {
      setFeedback({ type: "success", message: response.message || "All marked as read." });
    },
    onError: (error, _vars, context) => rollback(context, error),
    onSettled: () => invalidateNotifications(),
  });

  const clearNotificationMutation = useMutation({
    mutationFn: (notificationId) =>
      apiRequest(`/notifications/${notificationId}`, {
        method: "DELETE",
        token: session.accessToken,
      }),
    onMutate: (notificationId) =>
      beginOptimistic((old) => ({
        notifications: old.notifications.filter((n) => n._id !== notificationId),
        pagination: old.pagination
          ? { ...old.pagination, total: Math.max((old.pagination.total || 1) - 1, 0) }
          : old.pagination,
      })),
    onError: (error, _id, context) => rollback(context, error),
    onSettled: () => invalidateNotifications(),
  });

  const clearAllNotificationsMutation = useMutation({
    mutationFn: () =>
      apiRequest("/notifications", {
        method: "DELETE",
        token: session.accessToken,
      }),
    onMutate: () =>
      beginOptimistic((old) => ({
        notifications: [],
        pagination: old.pagination ? { ...old.pagination, total: 0 } : old.pagination,
      })),
    onSuccess: (response) => {
      setFeedback({ type: "success", message: response.message || "All notifications cleared." });
    },
    onError: (error, _vars, context) => rollback(context, error),
    onSettled: () => invalidateNotifications(),
  });

  // Mirrors ConnectionsPage.jsx's own respondMutation exactly (same endpoint/body shape) so
  // accepting/declining from a notification behaves identically to doing it from the Connections
  // page's Pending Requests list.
  const respondConnectionMutation = useMutation({
    mutationFn: ({ connectionId, status }) =>
      apiRequest(`/connections/respond/${connectionId}`, {
        method: "PUT",
        token: session.accessToken,
        body: { status },
      }),
    onSuccess: (response) => {
      setFeedback({ type: "success", message: response.message || "Connection request updated." });
      // The server deletes the recipient's prompt as part of responding, so the refetch is what
      // removes this row — nothing local needs to remember that it was answered.
      invalidateNotifications();
      queryClient.invalidateQueries({ queryKey: ["connections"] });
    },
    /* The same request can be answered somewhere else first — the Connections page, a second tab,
       a phone. This endpoint then replies 400 ("already been responded to") or 404 ("not found",
       the connection having been removed outright). Neither is a failure the user should be shown
       in red: the request is in exactly the state they were asking for. Refetch so the row goes,
       and say what happened. 403 and everything else stay real errors.

       Keyed off the status code rather than the message text, which is safe here because these
       buttons hard-code status to "Accepted" or "Rejected" — the endpoint's only other 400, an
       invalid status string, is unreachable from this page. */
    onError: (error) => {
      const alreadyResolved = error.status === 400 || error.status === 404;

      if (alreadyResolved) {
        setFeedback({
          type: "success",
          message: "That request was already answered somewhere else.",
        });
        invalidateNotifications();
        queryClient.invalidateQueries({ queryKey: ["connections"] });
        return;
      }

      setFeedback({ type: "error", message: error.message });
    },
  });

  function handleOpen(notification) {
    const destination = destinationFor(notification);
    if (!notification.isRead) {
      markReadMutation.mutate(notification._id);
    }
    if (destination) {
      navigate(destination);
    }
  }

  function handleClearAll() {
    if (
      !window.confirm("Delete every notification? This removes them permanently and cannot be undone.")
    ) {
      return;
    }
    clearAllNotificationsMutation.mutate();
  }

  return (
    // ONE modifier class is the whole of the recruiter treatment. The page is mounted at two
    // paths (/notifications and /recruiter/notifications; /pro/notifications is now a redirect to
    // the first) and shared by all three roles, so the accent is keyed off the SESSION, not the
    // route — an organization arriving on
    // the shared /notifications path still gets its own hero. Everything the modifier changes is
    // written under .notif-page--recruiter in styles.css; the base rules are untouched, so seeker
    // and admin renderings are byte-identical to before.
    <main
      className={`notif-page${session?.role === "organization" ? " notif-page--recruiter" : ""}`}
    >
      <AutoDismissFeedback
        feedback={feedback}
        onClear={() => setFeedback({ type: "", message: "" })}
      />

      <header className="nt-hero">
        <div className="nt-hero__body">
          <p className="nt-eyebrow">Inbox</p>
          <h1 className="nt-hero__title">Notification center</h1>
          <p className="nt-hero__sub">
            Every action your AI took on your behalf, plus inbound activity from recruiters,
            connections and support — all in one place.
          </p>
        </div>
        <div className="nt-hero__actions">
          <button
            type="button"
            className="nt-btn nt-btn--primary"
            onClick={() => markAllReadMutation.mutate()}
            disabled={!hasUnreadOnPage || markAllReadMutation.isPending}
          >
            <Icon name="check" className="nt-icon nt-icon--sm" />
            Mark all as read
          </button>
          <button
            type="button"
            className="nt-btn nt-btn--ghost"
            onClick={handleClearAll}
            disabled={!notifications.length || clearAllNotificationsMutation.isPending}
          >
            <Icon name="trash" className="nt-icon nt-icon--sm" />
            Clear all
          </button>
        </div>
      </header>

      <div className="nt-kpis">
        {kpis.map((kpi) => (
          <div key={kpi.key} className="nt-card nt-kpi">
            <p className="nt-kpi__label">
              <Icon name={kpi.icon} className="nt-icon nt-icon--sm" />
              {kpi.label}
            </p>
            <p className={`nt-kpi__value${kpi.value === NOT_COUNTABLE ? " nt-kpi__value--none" : ""}`}>
              {kpi.value === NOT_COUNTABLE ? "—" : kpi.value}
            </p>
          </div>
        ))}
      </div>

      {!hasCompleteList && (
        <p className="nt-notice">
          Showing the {notifications.length} most recent of {totalNotifications} notifications. The
          list endpoint caps a page at 50, so the totals above cannot be computed from it and are
          shown as &ldquo;—&rdquo; rather than under-counted.
        </p>
      )}

      <section className="nt-card nt-activity" aria-labelledby="nt-activity-heading">
        <div className="nt-activity__head">
          <div>
            <p className="nt-eyebrow">Activity</p>
            <h2 className="nt-card__title" id="nt-activity-heading">
              Recent notifications
            </h2>
          </div>
          <span className="nt-shown">{filteredNotifications.length} shown</span>
        </div>

        <div className="nt-chips" role="group" aria-label="Filter notifications by category">
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              className={`nt-chip${activeCategory === category.id ? " nt-chip--active" : ""}`}
              aria-pressed={activeCategory === category.id}
              onClick={() => setActiveCategory(category.id)}
            >
              {category.label}
              <span className="nt-chip__count">{category.count}</span>
            </button>
          ))}
        </div>

        <div className="nt-list" aria-label="Notifications" aria-live="polite">
          {notificationsQuery.isLoading ? (
            <p className="nt-empty">Loading notifications…</p>
          ) : notificationsQuery.isError ? (
            <p className="nt-empty nt-empty--error">
              {notificationsQuery.error?.message || "Could not load your notifications."}
            </p>
          ) : filteredNotifications.length === 0 ? (
            <p className="nt-empty">{activeDefinition?.empty || "Nothing here yet."}</p>
          ) : (
            <ul className="nt-rows">
              {filteredNotifications.map((notification) => {
                const meta = NOTIFICATION_TYPES[notification.type] || {
                  label: "Notification",
                  tone: "neutral",
                };
                const destination = destinationFor(notification);
                const connectionId = notification.metadata?.connectionId;
                const isConnectionRequest = notification.type === "connection_request";

                return (
                  <li
                    key={notification._id}
                    className={`nt-row${notification.isRead ? "" : " nt-row--unread"}`}
                  >
                    <span className={`nt-tile nt-tile--${meta.tone}`} aria-hidden="true">
                      <Icon name={iconForType(notification.type)} className="nt-icon nt-icon--sm" />
                    </span>

                    <div className="nt-row__body">
                      <div className="nt-row__top">
                        {destination ? (
                          <button
                            type="button"
                            className="nt-row__title nt-row__title--link"
                            onClick={() => handleOpen(notification)}
                          >
                            {notification.title}
                          </button>
                        ) : (
                          <p className="nt-row__title">{notification.title}</p>
                        )}
                        <span className="nt-pill">{meta.label}</span>
                        {!notification.isRead && (
                          <span className="nt-unread">
                            <span className="nt-unread__dot" aria-hidden="true" />
                            Unread
                          </span>
                        )}
                      </div>

                      <p className="nt-row__message">{notification.message}</p>
                      <p className="nt-row__time">{formatDate(notification.createdAt)}</p>

                      {/* No answered state to render. A connection_request notification exists
                          only while the request is still answerable — the server deletes it the
                          moment it is responded to or the connection is removed — so if this row
                          is on screen, these two buttons are live. */}
                      {isConnectionRequest && connectionId ? (
                        <div className="nt-row__inline">
                          <button
                            type="button"
                            className="nt-btn nt-btn--sm"
                            disabled={respondConnectionMutation.isPending}
                            onClick={() =>
                              respondConnectionMutation.mutate({
                                connectionId,
                                status: "Accepted",
                              })
                            }
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            className="nt-btn nt-btn--sm nt-btn--ghost"
                            disabled={respondConnectionMutation.isPending}
                            onClick={() =>
                              respondConnectionMutation.mutate({
                                connectionId,
                                status: "Rejected",
                              })
                            }
                          >
                            Decline
                          </button>
                        </div>
                      ) : null}
                    </div>

                    {/* Always in the DOM, not hover-only: a hover-revealed control is unreachable
                        on touch and invisible to keyboard users. Hover only changes opacity. */}
                    <div className="nt-row__actions">
                      {!notification.isRead && (
                        <button
                          type="button"
                          className="nt-act"
                          onClick={() => markReadMutation.mutate(notification._id)}
                          disabled={markReadMutation.isPending}
                          aria-label={`Mark as read: ${notification.title}`}
                        >
                          <Icon name="check" className="nt-icon nt-icon--xs" />
                        </button>
                      )}
                      <button
                        type="button"
                        className="nt-act nt-act--danger"
                        onClick={() => clearNotificationMutation.mutate(notification._id)}
                        disabled={clearNotificationMutation.isPending}
                        aria-label={`Dismiss: ${notification.title}`}
                      >
                        <Icon name="close" className="nt-icon nt-icon--xs" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
