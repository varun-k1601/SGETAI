import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../services/api";
import { AutoDismissFeedback } from "../../components/AutoDismissFeedback";
import { getMediaUrl } from "../../components/CompanyLogo";

/* STYLING APPROACH — scoped global CSS (`.connections-page ...` in styles.css) on the shared
   --ph-* tokens, matching .applied-page / .notif-page / .ai-gen.

   This page used to be written in Tailwind utilities, which paint almost nothing here: index.css
   wires FONTS ONLY into Tailwind v4's @theme, so every semantic colour utility (bg-card,
   border-border, text-muted-foreground, bg-surface, text-foreground, shadow-elegant) generates no
   CSS at all, and opacity modifiers on var()-backed colours (/70, /60, /40) generate nothing
   either. Measured on the old markup: bg-card/70 computed to rgba(0,0,0,0) and shadow-elegant to
   none, while `border-border/60` never resolved, so `border` fell back to currentColor — the TEXT
   colour. That is why every card was a transparent box outlined in pure white in dark mode: 36
   elements carried a currentColor hairline, 48 in light. Only the geometry utilities survived.

   The fix is NOT to add colours to @theme — that would silently repaint every page in the app.
   Scoped CSS is what the rest of the product already uses, and because the --ph-* tokens flip for
   dark, one set of rules covers both themes.

   Note also that styles.css's unlayered `:root[data-theme="dark"] button` rule is (0,2,1) and
   outranks a two-class scoped rule, so every button rule in the .cn-* block is duplicated with a
   `button.` qualifier. That is why the inline style objects this file used to carry — four of
   them, re-declaring background/border/shadow/transform on every button to fight that rule — are
   gone. */

const responseOptions = ["Accepted", "Rejected", "Ignored"];

function getSeekerInitial(seeker) {
  const name = `${seeker?.firstName || ""} ${seeker?.lastName || ""}`.trim();
  return (name || seeker?.username || "S").charAt(0).toUpperCase();
}

function SeekerAvatar({ seeker, size = "sm" }) {
  const profilePictureUrl = getMediaUrl(seeker?.profilePicture);
  const initial = getSeekerInitial(seeker);

  return (
    <span className={`seeker-avatar seeker-avatar--${size}`} aria-hidden="true">
      {profilePictureUrl ? <img src={profilePictureUrl} alt="" /> : <span className="cn-avatar__initial">{initial}</span>}
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
    <div className="cn-person-summary">
      <strong className="cn-person-summary__name">
        {person?.firstName || "Unknown"} {person?.lastName || "seeker"}
      </strong>
      <p className="cn-person-summary__line">
        {person?.username ? `@${person.username}` : person?.email || person?.tagline || "Profile summary not available"}
      </p>
      {person?.username && person?.email ? <p className="cn-person-summary__line">{person.email}</p> : null}
      {person?.bio ? <p className="cn-person-summary__bio">{person.bio}</p> : null}
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
      className="cn-icon cn-icon--sm"
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
      className="cn-icon cn-icon--sm"
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
    <article className="cn-person">
      <button
        type="button"
        title="Dismiss suggestion"
        aria-label="Dismiss suggestion"
        onClick={(event) => {
          event.stopPropagation();
          onDismiss(seeker._id);
        }}
        className="cn-icon-btn cn-person__dismiss"
      >
        <DismissIcon />
      </button>

      {/* Muted, desaturated cover strip — this app's own surface tokens, not the vivid
          purple-to-blue brand gradient reserved for primary CTAs. */}
      <div className="cn-person__cover" aria-hidden="true"></div>

      <div className="cn-person__body">
        <span className="cn-person__ring">
          <SeekerAvatar seeker={seeker} size="lg" />
        </span>

        <p className="cn-person__name">
          {seeker.firstName || "Unknown"} {seeker.lastName || "seeker"}
        </p>
        <p className="cn-person__subtitle">{getSeekerSubtitle(seeker)}</p>

        {/* Fixed height whether or not there are skills, so the action below starts at the same
            offset on every card in the row — see .cn-person__skills in styles.css. */}
        <div className="cn-person__skills">
          {(seeker.skills || []).slice(0, 3).map((skill) => (
            <span key={skill} className="cn-pill cn-pill--xs">
              {skill}
            </span>
          ))}
          {!seeker.skills?.length ? <span className="cn-person__noskills">No skills listed</span> : null}
        </div>

        <div className="cn-person__action">
          {isIncomingPending ? (
            <div className="cn-btn-row">
              <button
                type="button"
                disabled={isResponding}
                onClick={() => onRespond(connection.id, "Accepted")}
                className="cn-btn cn-btn--primary"
              >
                {isResponding ? "Updating..." : "Accept"}
              </button>
              <button
                type="button"
                disabled={isResponding}
                onClick={() => onRespond(connection.id, "Rejected")}
                className="cn-btn"
              >
                Delete
              </button>
            </div>
          ) : isOutgoingPending ? (
            <button
              type="button"
              disabled={isRemoving}
              onClick={() => onRemove(connection.id)}
              className="cn-btn cn-btn--block"
            >
              {isRemoving ? "Cancelling..." : "Cancel request"}
            </button>
          ) : isAccepted ? (
            <button
              type="button"
              disabled={isRemoving}
              onClick={() => onRemove(connection.id)}
              className="cn-btn cn-btn--block"
            >
              {isRemoving ? "Removing..." : "Unfollow"}
            </button>
          ) : (
            <button
              type="button"
              disabled={!canConnect || isSending}
              onClick={() => onConnect(seeker._id)}
              className="cn-btn cn-btn--outline cn-btn--block"
            >
              <UserPlusIcon />
              {isSending ? "Sending..." : actionLabel}
            </button>
          )}
        </div>
      </div>
    </article>
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
      <main className="connections-page">
        <div className="cn-card-surface cn-gate">
          <h3 className="cn-gate__title">Connections are seeker-only</h3>
          <p className="cn-gate__sub">This workspace is for job seekers building their professional network.</p>
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
    <main className="connections-page">
      <AutoDismissFeedback feedback={feedback} onClear={() => setFeedback({ type: "", message: "" })} />

      {/* The hero every sibling seeker page opens with (/applied, /notifications, /ai, /learn all
          carry the same --ph-hero-soft wash). Connections used to start cold on a bare card, which
          is most of why it did not read as part of the set. */}
      <header className="cn-hero">
        <p className="cn-eyebrow">Network</p>
        <h1 className="cn-hero__title">Grow your professional network</h1>
        <p className="cn-hero__sub">
          Respond to incoming requests, discover seekers worth knowing, and keep track of the connections you have
          already made.
        </p>
      </header>

      {/* Pending Requests — first, per the reference layout */}
      <section className="cn-card-surface" aria-labelledby="cn-pending-heading">
        <div className="cn-section__head">
          <div className="cn-section__headings">
            <p className="cn-eyebrow">Inbox</p>
            <h2 className="cn-section-title" id="cn-pending-heading">
              Pending requests
            </h2>
            <p className="cn-section__sub">Accept, reject, or ignore incoming seeker connection requests.</p>
          </div>
          <span className="cn-count">{pendingConnections.length} pending</span>
        </div>

        {pendingQuery.isLoading ? (
          <p className="cn-state">Loading pending requests...</p>
        ) : pendingConnections.length ? (
          <div className="cn-rows">
            {pendingConnections.map((connection) => (
              <div key={connection.id} className="cn-row">
                <PersonSummary person={connection.requester} />
                <div className="cn-row__actions">
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
                      className={status === "Accepted" ? "cn-btn cn-btn--primary" : "cn-btn"}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="cn-empty">
            <p className="cn-empty__title">No pending requests</p>
            <p className="cn-empty__sub">Incoming connection invites will appear here.</p>
          </div>
        )}
      </section>

      {/* People You May Know — card grid */}
      <section className="cn-card-surface" aria-labelledby="cn-discover-heading">
        <div className="cn-section__head">
          <div className="cn-section__headings">
            <p className="cn-eyebrow">Discover</p>
            <h2 className="cn-section-title" id="cn-discover-heading">
              People you may know
            </h2>
            <p className="cn-section__sub">Seekers you might want to connect with.</p>
          </div>
          <span className="cn-count">{discoveredSeekers.length} shown</span>
        </div>

        {/* No real mutual-connections data source exists yet (discovering another seeker's
            own connections isn't exposed by any endpoint, and building one is beyond this
            restyle's scope) — that line from the reference design is intentionally omitted
            rather than faked. */}

        {seekerDiscoveryQuery.isLoading ? (
          <p className="cn-state">Searching seekers...</p>
        ) : discoveredSeekers.length ? (
          <div className="cn-people">
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
          <div className="cn-empty">
            <p className="cn-empty__title">No seekers found</p>
            <p className="cn-empty__sub">Check back later for new suggestions.</p>
          </div>
        )}
      </section>

      {/* Accepted Connections */}
      <section className="cn-card-surface" aria-labelledby="cn-accepted-heading">
        <div className="cn-section__head">
          <div className="cn-section__headings">
            <p className="cn-eyebrow">Network</p>
            <h2 className="cn-section-title" id="cn-accepted-heading">
              Accepted connections
            </h2>
            <p className="cn-section__sub">Your active seeker network, sorted by most recent response.</p>
          </div>
          <span className="cn-count">{acceptedConnections.length} connected</span>
        </div>

        {acceptedQuery.isLoading ? (
          <p className="cn-state">Loading accepted connections...</p>
        ) : acceptedConnections.length ? (
          <div className="cn-rows">
            {acceptedConnections.map((connection) => (
              <div key={connection.id} className="cn-row cn-row--stacked">
                <div className="cn-row__top">
                  <PersonSummary person={connection.counterpart} />
                  <div className="cn-row__actions">
                    <span className="cn-pill">{connection.direction}</span>
                    <span className="cn-row__meta">
                      Connected {formatDate(connection.respondedAt || connection.updatedAt)}
                    </span>
                    <button
                      type="button"
                      disabled={removeConnectionMutation.isPending}
                      onClick={() => removeConnectionMutation.mutate(connection.id)}
                      className="cn-btn"
                    >
                      {removeConnectionMutation.isPending ? "Removing..." : "Unfollow"}
                    </button>
                  </div>
                </div>
                {connection.counterpart?.skills?.length ? (
                  <div className="cn-skills">
                    {connection.counterpart.skills.slice(0, 6).map((skill) => (
                      <span key={skill} className="cn-pill">
                        {skill}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="cn-empty">
            <p className="cn-empty__title">No accepted connections yet</p>
            <p className="cn-empty__sub">Send a request or accept one to start building your network.</p>
          </div>
        )}
      </section>
    </main>
  );
}
