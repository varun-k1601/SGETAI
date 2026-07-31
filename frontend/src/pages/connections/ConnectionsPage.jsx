import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../services/api";
import { AutoDismissFeedback } from "../../components/AutoDismissFeedback";
import { getMediaUrl } from "../../components/CompanyLogo";

const responseOptions = ["Accepted", "Rejected", "Ignored"];

// This app's global `button { background, border-radius, padding, border, box-shadow, color,
// font-weight, transform, transition }` rule in styles.css is unlayered, so it silently wins over
// any Tailwind utility class applied directly to a <button> (see AIGeneratorPage.jsx's
// PostToLinkedInButton for the original diagnosis, and confirmed again here by inspecting computed
// styles — every button on this page was rendering the global blue gradient/white-text/12px-radius
// regardless of className). Resetting those specific properties inline is the established
// workaround; layout/spacing/font-size classes are unaffected and stay as Tailwind classes.
const neutralPillStyle = {
  border: "1px solid var(--border)",
  borderRadius: "9999px",
  background: "var(--surface)",
  boxShadow: "none",
  color: "var(--text-muted)",
  fontWeight: 500,
  padding: "0.4rem 0.9rem",
  transform: "none",
  transition: "none",
};

const brandOutlinePillStyle = {
  border: "1px solid var(--brand)",
  borderRadius: "9999px",
  background: "var(--surface)",
  boxShadow: "none",
  color: "var(--brand)",
  fontWeight: 600,
  padding: "0.4rem 0.9rem",
  transform: "none",
  transition: "none",
};

const solidBrandPillStyle = {
  border: "1px solid transparent",
  borderRadius: "9999px",
  background: "linear-gradient(180deg, var(--brand), var(--brand-deep))",
  boxShadow: "none",
  color: "#ffffff",
  fontWeight: 600,
  padding: "0.4rem 0.9rem",
  transform: "none",
  transition: "none",
};

const dismissButtonStyle = {
  border: "none",
  borderRadius: "9999px",
  background: "#1f2937",
  boxShadow: "none",
  color: "#ffffff",
  padding: 0,
  transform: "none",
  transition: "none",
};

function getSeekerInitial(seeker) {
  const name = `${seeker?.firstName || ""} ${seeker?.lastName || ""}`.trim();
  return (name || seeker?.username || "S").charAt(0).toUpperCase();
}

function SeekerAvatar({ seeker, size = "sm" }) {
  const profilePictureUrl = getMediaUrl(seeker?.profilePicture);
  const initial = getSeekerInitial(seeker);

  return (
    <span className={`seeker-avatar seeker-avatar--${size}`} aria-hidden="true">
      {profilePictureUrl ? (
        <img src={profilePictureUrl} alt="" />
      ) : (
        <span style={{ color: "var(--text-muted)" }}>{initial}</span>
      )}
    </span>
  );
}

function formatDate(value) {
  if (!value) {
    return "Not available";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "Not available";
  }

  return parsed.toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function PersonSummary({ person }) {
  return (
    <div className="min-w-0">
      <strong className="block truncate font-semibold text-foreground">
        {person?.firstName || "Unknown"} {person?.lastName || "seeker"}
      </strong>
      <p className="truncate text-xs text-muted-foreground">
        {person?.username ? `@${person.username}` : person?.email || person?.tagline || "Profile summary not available"}
      </p>
      {person?.username && person?.email ? <p className="truncate text-xs text-muted-foreground">{person.email}</p> : null}
      {person?.bio ? <p className="mt-1 text-xs text-muted-foreground">{person.bio}</p> : null}
    </div>
  );
}

// The most representative single line for a compact suggestion card — tagline is the seeker's
// own summary if they wrote one, otherwise fall back to their most specific structured fields.
function getSeekerSubtitle(seeker) {
  return seeker?.tagline || seeker?.preferredRoles?.[0] || seeker?.currentStatus || "Job seeker";
}

function getConnectionActionLabel(connection) {
  if (!connection) {
    return "Connect";
  }

  if (connection.status === "Accepted") {
    return "Connected";
  }

  if (connection.status === "Pending" && connection.direction === "sent") {
    return "Request sent";
  }

  if (connection.status === "Pending" && connection.direction === "received") {
    return "Accept";
  }

  return "Connect again";
}

function UserPlusIcon() {
  return (
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
      className="h-3.5 w-3.5"
      aria-hidden="true"
    >
      <path d="M2 21a8 8 0 0 1 13.292-6"></path>
      <circle cx="10" cy="8" r="5"></circle>
      <path d="M19 16v6"></path>
      <path d="M22 19h-6"></path>
    </svg>
  );
}

function DismissIcon() {
  return (
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
      className="h-3.5 w-3.5"
      aria-hidden="true"
    >
      <path d="M18 6 6 18"></path>
      <path d="m6 6 12 12"></path>
    </svg>
  );
}

function SeekerSuggestionCard({
  seeker,
  onConnect,
  onRespond,
  onRemove,
  onDismiss,
  isSending,
  isResponding,
  isRemoving,
}) {
  const connection = seeker.connection;
  const actionLabel = getConnectionActionLabel(connection);
  const isIncomingPending = connection?.status === "Pending" && connection.direction === "received";
  const isOutgoingPending = connection?.status === "Pending" && connection.direction === "sent";
  const isAccepted = connection?.status === "Accepted";
  const canConnect =
    !connection ||
    (connection.status !== "Accepted" &&
      !(connection.status === "Pending" && connection.direction === "sent") &&
      !(connection.status === "Pending" && connection.direction === "received"));

  return (
    <div className="relative flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/70 shadow-elegant backdrop-blur-xl">
      <button
        type="button"
        title="Dismiss suggestion"
        onClick={(event) => {
          event.stopPropagation();
          onDismiss(seeker._id);
        }}
        style={dismissButtonStyle}
        className="absolute right-2 top-2 z-10 grid h-6 w-6 place-items-center"
      >
        <DismissIcon />
      </button>

      {/* Muted, desaturated cover strip — this app's own surface/border tokens, not the vivid
          purple-to-blue brand gradient reserved for primary CTAs. */}
      <div
        className="h-14 shrink-0"
        style={{ background: "linear-gradient(135deg, var(--surface-muted), var(--surface-soft))" }}
      ></div>

      <div className="flex flex-1 flex-col items-center px-4 pb-4 text-center">
        <div className="-mt-8 rounded-full border-4" style={{ borderColor: "var(--surface)" }}>
          <SeekerAvatar seeker={seeker} size="lg" />
        </div>

        <p className="mt-3 w-full truncate text-sm font-semibold text-foreground">
          {seeker.firstName || "Unknown"} {seeker.lastName || "seeker"}
        </p>
        <p className="mt-0.5 w-full truncate text-xs text-muted-foreground">{getSeekerSubtitle(seeker)}</p>

        <div className="mt-2 flex flex-wrap justify-center gap-1.5">
          {(seeker.skills || []).slice(0, 3).map((skill) => (
            <span
              key={skill}
              className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-surface/70 px-2 py-0.5 text-[10px] font-medium"
            >
              {skill}
            </span>
          ))}
          {!seeker.skills?.length ? (
            <span className="text-[10px] text-muted-foreground">No skills listed</span>
          ) : null}
        </div>

        <div className="mt-3 w-full">
          {isIncomingPending ? (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={isResponding}
                onClick={() => onRespond(connection.id, "Accepted")}
                style={solidBrandPillStyle}
                className="flex-1 text-xs"
              >
                {isResponding ? "Updating..." : "Accept"}
              </button>
              <button
                type="button"
                disabled={isResponding}
                onClick={() => onRespond(connection.id, "Rejected")}
                style={neutralPillStyle}
                className="flex-1 text-xs"
              >
                Delete
              </button>
            </div>
          ) : isOutgoingPending ? (
            <button
              type="button"
              disabled={isRemoving}
              onClick={() => onRemove(connection.id)}
              style={neutralPillStyle}
              className="w-full text-xs"
            >
              {isRemoving ? "Cancelling..." : "Cancel request"}
            </button>
          ) : isAccepted ? (
            <button
              type="button"
              disabled={isRemoving}
              onClick={() => onRemove(connection.id)}
              style={neutralPillStyle}
              className="w-full text-xs"
            >
              {isRemoving ? "Removing..." : "Unfollow"}
            </button>
          ) : (
            <button
              type="button"
              disabled={!canConnect || isSending}
              onClick={() => onConnect(seeker._id)}
              style={brandOutlinePillStyle}
              className="inline-flex w-full items-center justify-center gap-1.5 text-xs disabled:cursor-not-allowed"
            >
              <UserPlusIcon />
              {isSending ? "Sending..." : actionLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function ConnectionsPage() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState({ type: "", message: "" });
  // Session-local only — there's no "dismissedSuggestions" concept on JobSeeker yet, so this
  // resets on refresh. Persisting it for real would need a new field + endpoint, out of scope here.
  const [dismissedSeekerIds, setDismissedSeekerIds] = useState(() => new Set());

  const seekerSearchQueryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", "12");
    return params.toString();
  }, []);

  const pendingQuery = useQuery({
    queryKey: ["connections", "pending"],
    queryFn: () =>
      apiRequest("/connections/pending", {
        token: session.accessToken,
      }),
    enabled: Boolean(session?.accessToken && session?.role === "seeker"),
  });

  const acceptedQuery = useQuery({
    queryKey: ["connections", "accepted"],
    queryFn: () =>
      apiRequest("/connections", {
        token: session.accessToken,
      }),
    enabled: Boolean(session?.accessToken && session?.role === "seeker"),
  });

  const seekerDiscoveryQuery = useQuery({
    queryKey: ["search-seekers", seekerSearchQueryString],
    queryFn: () =>
      apiRequest(`/search/seekers?${seekerSearchQueryString}`, {
        token: session.accessToken,
      }),
    enabled: Boolean(session?.accessToken && session?.role === "seeker"),
  });

  const invalidateConnections = () => {
    queryClient.invalidateQueries({ queryKey: ["connections"] });
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
    queryClient.invalidateQueries({ queryKey: ["search-seekers"] });
  };

  const sendRequestMutation = useMutation({
    mutationFn: (targetSeekerId) =>
      apiRequest(`/connections/request/${targetSeekerId}`, {
        method: "POST",
        token: session.accessToken,
      }),
    onSuccess: (response) => {
      setFeedback({ type: "success", message: response.message || "Connection request sent." });
      invalidateConnections();
    },
    onError: (error) => {
      setFeedback({ type: "error", message: error.message });
    },
  });

  const respondMutation = useMutation({
    mutationFn: ({ connectionId, status }) =>
      apiRequest(`/connections/respond/${connectionId}`, {
        method: "PUT",
        token: session.accessToken,
        body: { status },
      }),
    onSuccess: (response) => {
      setFeedback({
        type: "success",
        message: response.message || "Connection request updated.",
      });
      invalidateConnections();
    },
    onError: (error) => {
      setFeedback({ type: "error", message: error.message });
    },
  });

  const removeConnectionMutation = useMutation({
    mutationFn: (connectionId) =>
      apiRequest(`/connections/${connectionId}`, {
        method: "DELETE",
        token: session.accessToken,
      }),
    onSuccess: (response) => {
      setFeedback({
        type: "success",
        message: response.message || "Connection removed.",
      });
      invalidateConnections();
    },
    onError: (error) => {
      setFeedback({ type: "error", message: error.message });
    },
  });

  if (session?.role !== "seeker") {
    return (
      <main className="flex-1 px-6 py-6 lg:px-8 lg:py-8">
        <div className="rounded-2xl border border-border/60 bg-card/70 p-8 text-center text-muted-foreground">
          <h3 className="font-display text-lg font-semibold text-foreground">Connections are seeker-only</h3>
          <p className="mt-1 text-sm">This workspace is for job seekers building their professional network.</p>
        </div>
      </main>
    );
  }

  const pendingConnections = pendingQuery.data?.connections || [];
  const acceptedConnections = acceptedQuery.data?.connections || [];
  const discoveredSeekers = (seekerDiscoveryQuery.data?.seekers || []).filter(
    (seeker) => !dismissedSeekerIds.has(seeker._id)
  );

  function handleDismissSuggestion(seekerId) {
    setDismissedSeekerIds((current) => {
      const next = new Set(current);
      next.add(seekerId);
      return next;
    });
  }

  return (
    <main className="flex-1 px-6 py-6 lg:px-8 lg:py-8">
      <AutoDismissFeedback
        feedback={feedback}
        onClear={() => setFeedback({ type: "", message: "" })}
      />

      <div className="mt-6 space-y-5">
        {/* Pending Requests — first, per the reference layout */}
        <div className="rounded-2xl border border-border/60 bg-card/70 p-5 shadow-elegant backdrop-blur-xl">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Inbox
              </p>
              <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">Pending requests</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Accept, reject, or ignore incoming seeker connection requests.
              </p>
            </div>
            <span className="shrink-0 rounded-full border border-border/60 bg-surface/70 px-2.5 py-0.5 text-xs font-medium">
              {pendingConnections.length} pending
            </span>
          </div>

          {pendingQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading pending requests...</p>
          ) : pendingConnections.length ? (
            <div className="space-y-3">
              {pendingConnections.map((connection) => (
                <div
                  key={connection.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/40 bg-surface/40 p-3"
                >
                  <PersonSummary person={connection.requester} />
                  <div className="flex flex-wrap gap-2">
                    {responseOptions.map((status) => (
                      <button
                        key={status}
                        type="button"
                        disabled={respondMutation.isPending}
                        onClick={() =>
                          respondMutation.mutate({
                            connectionId: connection.id,
                            status,
                          })
                        }
                        style={status === "Accepted" ? solidBrandPillStyle : neutralPillStyle}
                        className="text-xs"
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-border/40 bg-surface/40 p-6 text-center text-muted-foreground">
              <p className="font-semibold text-foreground">No pending requests</p>
              <p className="mt-1 text-sm">Incoming connection invites will appear here.</p>
            </div>
          )}
        </div>

        {/* People You May Know — card grid */}
        <div className="rounded-2xl border border-border/60 bg-card/70 p-5 shadow-elegant backdrop-blur-xl">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Discover
              </p>
              <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">People you may know</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Seekers you might want to connect with.
              </p>
            </div>
            <span className="shrink-0 rounded-full border border-border/60 bg-surface/70 px-2.5 py-0.5 text-xs font-medium">
              {discoveredSeekers.length} shown
            </span>
          </div>

          {/* No real mutual-connections data source exists yet (discovering another seeker's
              own connections isn't exposed by any endpoint, and building one is beyond this
              restyle's scope) — that line from the reference design is intentionally omitted
              rather than faked. */}

          {seekerDiscoveryQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Searching seekers...</p>
          ) : discoveredSeekers.length ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {discoveredSeekers.map((seeker) => (
                <SeekerSuggestionCard
                  key={seeker._id}
                  seeker={seeker}
                  isSending={sendRequestMutation.isPending}
                  isResponding={respondMutation.isPending}
                  isRemoving={removeConnectionMutation.isPending}
                  onRemove={(connectionId) => removeConnectionMutation.mutate(connectionId)}
                  onDismiss={handleDismissSuggestion}
                  onRespond={(connectionId, status) =>
                    respondMutation.mutate({
                      connectionId,
                      status,
                    })
                  }
                  onConnect={(targetSeekerId) => {
                    setFeedback({ type: "", message: "" });
                    sendRequestMutation.mutate(targetSeekerId);
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-border/40 bg-surface/40 p-6 text-center text-muted-foreground">
              <p className="font-semibold text-foreground">No seekers found</p>
              <p className="mt-1 text-sm">Check back later for new suggestions.</p>
            </div>
          )}
        </div>

        {/* Accepted Connections */}
        <div className="rounded-2xl border border-border/60 bg-card/70 p-5 shadow-elegant backdrop-blur-xl">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Network
              </p>
              <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">Accepted connections</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Your active seeker network, sorted by most recent response.
              </p>
            </div>
            <span className="shrink-0 rounded-full border border-border/60 bg-surface/70 px-2.5 py-0.5 text-xs font-medium">
              {acceptedConnections.length} connected
            </span>
          </div>

          {acceptedQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading accepted connections...</p>
          ) : acceptedConnections.length ? (
            <div className="space-y-3">
              {acceptedConnections.map((connection) => (
                <div key={connection.id} className="rounded-xl border border-border/40 bg-surface/40 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <PersonSummary person={connection.counterpart} />
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-border/60 bg-surface/70 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                        {connection.direction}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Connected {formatDate(connection.respondedAt || connection.updatedAt)}
                      </span>
                      <button
                        type="button"
                        disabled={removeConnectionMutation.isPending}
                        onClick={() => removeConnectionMutation.mutate(connection.id)}
                        style={neutralPillStyle}
                        className="text-xs"
                      >
                        {removeConnectionMutation.isPending ? "Removing..." : "Unfollow"}
                      </button>
                    </div>
                  </div>
                  {connection.counterpart?.skills?.length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {connection.counterpart.skills.slice(0, 6).map((skill) => (
                        <span
                          key={skill}
                          className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-surface/70 px-2.5 py-0.5 text-xs font-medium"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-border/40 bg-surface/40 p-6 text-center text-muted-foreground">
              <p className="font-semibold text-foreground">No accepted connections yet</p>
              <p className="mt-1 text-sm">Send a request or accept one to start building your network.</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
