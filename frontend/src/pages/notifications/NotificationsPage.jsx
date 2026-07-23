import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../services/api";
import { AutoDismissFeedback } from "../../components/AutoDismissFeedback";

function formatDate(value) {
  if (!value) {
    return "Just now";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Recently";
  }

  const now = new Date();
  const seconds = Math.floor((now - parsed) / 1000);

  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";

  return parsed.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getNotificationIcon(type) {
  switch (type) {
    case "auto_apply_success":
      return "💼";
    case "auto_connect":
      return "🤝";
    case "auto_dm":
      return "💬";
    case "connection_accepted":
    case "recruiter_response":
      return "✨";
    default:
      return "📌";
  }
}

function getNotificationTypeLabel(type) {
  switch (type) {
    case "auto_apply_success":
      return "Auto-apply";
    case "auto_connect":
      return "Auto-connect";
    case "auto_dm":
      return "Auto-DM";
    case "connection_accepted":
    case "recruiter_response":
      return "Response";
    default:
      return "Notification";
  }
}

function NotificationItem({ notification, onMarkRead, onClear, isUpdating }) {
  const typeLabel = getNotificationTypeLabel(notification.type);
  const icon = getNotificationIcon(notification.type);

  return (
    <div className={`group relative flex items-start gap-3 rounded-xl border p-3 transition ${
      notification.isRead
        ? "border-border/60 bg-surface/50"
        : "border-border/60 bg-surface shadow-sm"
    }`}>
      {!notification.isRead && (
        <span className="absolute left-0 top-1/2 h-8 w-1 -translate-y-1/2 rounded-r-full bg-linear-to-r from-purple-500 to-blue-500"></span>
      )}

      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-lg bg-purple-500/20">
        {icon}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="truncate text-sm font-semibold text-foreground">{notification.title}</p>
          <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted px-2.5 py-0.5 font-medium shrink-0 text-[10px] text-muted-foreground">
            {typeLabel}
          </span>
          {!notification.isRead && (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-purple-500" aria-label="unread"></span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{notification.message}</p>
        <p className="mt-1 text-[11px] text-muted-foreground/70">{formatDate(notification.createdAt)}</p>
      </div>

      <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
        {!notification.isRead && (
          <button
            title="Mark as read"
            onClick={() => onMarkRead(notification._id)}
            disabled={isUpdating}
            className="grid h-8 w-8 place-items-center rounded-lg p-0! text-muted-foreground hover:bg-surface/80 hover:text-foreground disabled:opacity-50"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="lucide h-4 w-4"
              aria-hidden="true"
            >
              <path d="M20 6 9 17l-5-5"></path>
            </svg>
          </button>
        )}
        <button
          title="Dismiss"
          onClick={() => onClear(notification._id)}
          disabled={isUpdating}
          className="grid h-8 w-8 place-items-center rounded-lg p-0! text-muted-foreground hover:bg-surface/80 hover:text-foreground disabled:opacity-50"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="lucide h-4 w-4"
            aria-hidden="true"
          >
            <path d="M18 6 6 18"></path>
            <path d="m6 6 12 12"></path>
          </svg>
        </button>
      </div>
    </div>
  );
}

export function NotificationsPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState("All");
  const [feedback, setFeedback] = useState({ type: "", message: "" });

  const notificationsQuery = useQuery({
    queryKey: ["notifications", session?.role, "page"],
    queryFn: () =>
      apiRequest("/notifications?limit=50", {
        token: session.accessToken,
      }),
    enabled: Boolean(session?.accessToken),
  });

  const notifications = notificationsQuery.data?.notifications || [];
  const unreadCount = notifications.filter((notification) => !notification.isRead).length;
  const autoApplyCount = notifications.filter((n) => n.type === "auto_apply_success").length;
  const autoConnectCount = notifications.filter((n) => n.type === "auto_connect").length;
  const responsesCount = notifications.filter((n) =>
    n.type === "recruiter_response" || n.type === "connection_accepted"
  ).length;

  const typeOptions = useMemo(() => {
    const types = new Set(notifications.map((n) => n.type).filter(Boolean));
    return ["All", ...Array.from(types).sort()];
  }, [notifications]);

  const filteredNotifications = useMemo(() => {
    if (typeFilter === "All") return notifications;
    return notifications.filter((n) => n.type === typeFilter);
  }, [notifications, typeFilter]);

  const invalidateNotifications = () => {
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };

  const markReadMutation = useMutation({
    mutationFn: (notificationId) =>
      apiRequest(`/notifications/${notificationId}/read`, {
        method: "PUT",
        token: session.accessToken,
      }),
    onSuccess: () => {
      invalidateNotifications();
    },
    onError: (error) => {
      setFeedback({ type: "error", message: error.message });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () =>
      apiRequest("/notifications/read-all", {
        method: "PUT",
        token: session.accessToken,
      }),
    onSuccess: (response) => {
      setFeedback({ type: "success", message: response.message || "All marked as read" });
      invalidateNotifications();
    },
    onError: (error) => {
      setFeedback({ type: "error", message: error.message });
    },
  });

  const clearNotificationMutation = useMutation({
    mutationFn: (notificationId) =>
      apiRequest(`/notifications/${notificationId}`, {
        method: "DELETE",
        token: session.accessToken,
      }),
    onSuccess: () => {
      invalidateNotifications();
    },
    onError: (error) => {
      setFeedback({ type: "error", message: error.message });
    },
  });

  return (
    <main className="flex-1 overflow-y-auto px-6 py-6 lg:px-8 lg:py-8 bg-muted/30">
      <AutoDismissFeedback
        feedback={feedback}
        onClear={() => setFeedback({ type: "", message: "" })}
      />

      {/* Header Banner */}
      <div className="relative mb-6 overflow-hidden rounded-3xl border border-border/60 bg-card p-7 lg:p-8">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-linear-to-br from-purple-500 to-blue-500 opacity-5 blur-3xl"></div>
        <div className="absolute -bottom-32 left-1/3 h-80 w-80 rounded-full bg-linear-to-br from-purple-500 to-blue-500 opacity-3 blur-3xl"></div>

        <div className="relative">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Inbox</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight lg:text-4xl text-foreground">
                Notification center
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground lg:text-base">
                Every action your AI takes, plus inbound responses from recruiters — in one place.
              </p>
            </div>
            <button
              onClick={() => markAllReadMutation.mutate()}
              disabled={!unreadCount || markAllReadMutation.isPending}
              className="inline-flex items-center gap-2 rounded-full bg-linear-to-r from-purple-500 to-blue-500 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:opacity-90 disabled:opacity-50"
            >
              ✓ Mark all as read
            </button>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">🔔 Unread</div>
          <div className="mt-2 flex items-baseline gap-2">
            <div className="text-2xl font-bold text-foreground">{unreadCount}</div>
          </div>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">💼 Auto-applies</div>
          <div className="mt-2 flex items-baseline gap-2">
            <div className="text-2xl font-bold text-foreground">{autoApplyCount}</div>
          </div>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">🤝 Auto-connects</div>
          <div className="mt-2 flex items-baseline gap-2">
            <div className="text-2xl font-bold text-foreground">{autoConnectCount}</div>
          </div>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">✨ Responses</div>
          <div className="mt-2 flex items-baseline gap-2">
            <div className="text-2xl font-bold text-foreground">{responsesCount}</div>
          </div>
        </div>
      </div>

      {/* Activity Feed */}
      <div className="relative rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Activity</p>
            <h2 className="mt-1 text-xl font-bold tracking-tight text-foreground">AI events & responses</h2>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            🔽 {filteredNotifications.length} shown
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="mb-4 flex flex-wrap gap-2">
          {typeOptions.map((type) => {
            const count = type === "All"
              ? notifications.length
              : notifications.filter((n) => n.type === type).length;
            return (
              <button
                key={type}
                onClick={() => setTypeFilter(type)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  typeFilter === type
                    ? "border-transparent bg-linear-to-r from-purple-500 to-blue-500 text-white shadow-lg"
                    : "border-border/60 bg-surface text-foreground hover:bg-surface/80"
                }`}
              >
                {type}
                <span className={`rounded-full px-1.5 text-[10px] tabular-nums ${
                  typeFilter === type ? "bg-white/20" : "bg-muted text-muted-foreground"
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Notifications List */}
        <div className="space-y-2">
          {notificationsQuery.isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading notifications...</div>
          ) : filteredNotifications.length ? (
            filteredNotifications.map((notification) => (
              <NotificationItem
                key={notification._id}
                notification={notification}
                isUpdating={markReadMutation.isPending || clearNotificationMutation.isPending}
                onMarkRead={(id) => markReadMutation.mutate(id)}
                onClear={(id) => clearNotificationMutation.mutate(id)}
              />
            ))
          ) : (
            <div className="text-center py-8 text-muted-foreground">No notifications</div>
          )}
        </div>
      </div>
    </main>
  );
}
