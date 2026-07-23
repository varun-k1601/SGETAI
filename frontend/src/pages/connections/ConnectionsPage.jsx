import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../services/api";
import { AutoDismissFeedback } from "../../components/AutoDismissFeedback";
import { CompanyLogo, getMediaUrl } from "../../components/CompanyLogo";

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
      {profilePictureUrl ? <img src={profilePictureUrl} alt="" /> : <span>{initial}</span>}
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
    <div>
      <strong>
        {person?.firstName || "Unknown"} {person?.lastName || "seeker"}
      </strong>
      <p>
        {person?.username ? `@${person.username}` : person?.email || person?.tagline || "Profile summary not available"}
      </p>
      {person?.username && person?.email ? <p>{person.email}</p> : null}
      {person?.bio ? <p>{person.bio}</p> : null}
    </div>
  );
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

function getConnectionStatusLabel(connection) {
  if (!connection?.status) {
    return "";
  }

  if (connection.status === "Pending") {
    return "Pending";
  }

  return connection.direction ? `${connection.status} ${connection.direction}` : connection.status;
}

function SeekerDiscoveryCard({
  seeker,
  onConnect,
  onRespond,
  onRemove,
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
    <article className="connection-card">
      <div className="connection-card__header">
        <div className="seeker-line">
          <SeekerAvatar seeker={seeker} size="sm" />
          <PersonSummary person={seeker} />
        </div>
        <span className="pill">{seeker.currentStatus || "Seeker"}</span>
      </div>

      <div className="tag-row">
        {(seeker.skills || []).slice(0, 5).map((skill) => (
          <span key={skill} className="tag-pill">
            {skill}
          </span>
        ))}
        {!seeker.skills?.length ? (
          <span className="tag-pill muted-tag">No skills listed</span>
        ) : null}
      </div>

      {seeker.preferredRoles?.length ? (
        <p className="detail-summary">
          Interested in {seeker.preferredRoles.slice(0, 3).join(", ")}
        </p>
      ) : null}

      <div className="connection-card__actions">
        {isIncomingPending ? (
          <>
            <button
              type="button"
              disabled={isResponding}
              onClick={() => onRespond(connection.id, "Accepted")}
            >
              {isResponding ? "Updating..." : "Accept"}
            </button>
            <button
              type="button"
              className="outline-button"
              disabled={isResponding}
              onClick={() => onRespond(connection.id, "Rejected")}
            >
              Delete
            </button>
          </>
        ) : isOutgoingPending ? (
          <button
            type="button"
            className="outline-button"
            disabled={isRemoving}
            onClick={() => onRemove(connection.id)}
          >
            {isRemoving ? "Cancelling..." : "Cancel request"}
          </button>
        ) : isAccepted ? (
          <button
            type="button"
            className="outline-button"
            disabled={isRemoving}
            onClick={() => onRemove(connection.id)}
          >
            {isRemoving ? "Removing..." : "Unfollow"}
          </button>
        ) : (
          <button
            type="button"
            disabled={!canConnect || isSending}
            onClick={() => onConnect(seeker._id)}
          >
            {isSending ? "Sending..." : actionLabel}
          </button>
        )}
        {connection?.status ? (
          <span className="pill">
            {connection.status === "Pending" ? "◷ " : ""}
            {getConnectionStatusLabel(connection)}
          </span>
        ) : null}
      </div>
    </article>
  );
}

function OrganizationSearchCard({ organization, onFollow, onUnfollow, isUpdating }) {
  const isFollowing = Boolean(organization.follow);

  return (
    <article className="connection-card">
      <div className="connection-card__header">
        <div className="company-line">
          <CompanyLogo organization={organization} size="sm" />
          <div>
            <strong>{organization.companyName || "Organization"}</strong>
            <p>{organization.username ? `@${organization.username}` : organization.email || "Username unavailable"}</p>
            {organization.industry ? <p>{organization.industry}</p> : null}
          </div>
        </div>
        <span className="pill">{organization.verificationStatus || "Organization"}</span>
      </div>

      {organization.description ? (
        <p className="detail-summary">{organization.description}</p>
      ) : null}

      <div className="connection-card__actions">
        {isFollowing ? (
          <button
            type="button"
            className="outline-button"
            disabled={isUpdating}
            onClick={() => onUnfollow(organization._id)}
          >
            {isUpdating ? "Updating..." : "Unfollow"}
          </button>
        ) : (
          <button
            type="button"
            disabled={isUpdating}
            onClick={() => onFollow(organization._id)}
          >
            {isUpdating ? "Updating..." : "Follow"}
          </button>
        )}
        <span className="pill">{isFollowing ? "Following" : "Company"}</span>
      </div>
    </article>
  );
}

export function ConnectionsPage() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [directSearch, setDirectSearch] = useState(searchParams.get("q") || "");
  const [filters, setFilters] = useState({
    q: "",
    skill: "",
    role: "",
    currentStatus: "",
  });
  const [feedback, setFeedback] = useState({ type: "", message: "" });

  useEffect(() => {
    const query = searchParams.get("q") || "";
    setDirectSearch((current) => (current === query ? current : query));
  }, [searchParams]);

  const seekerSearchQueryString = useMemo(() => {
    const params = new URLSearchParams();

    Object.entries(filters).forEach(([key, value]) => {
      if (String(value || "").trim()) {
        params.set(key, String(value).trim());
      }
    });

    params.set("limit", "12");
    return params.toString();
  }, [filters]);

  const directSearchQueryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("q", directSearch.trim());
    params.set("limit", "5");
    return params.toString();
  }, [directSearch]);

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

  const directSearchQuery = useQuery({
    queryKey: ["search-seekers", "direct", directSearchQueryString],
    queryFn: () =>
      apiRequest(`/search/seekers?${directSearchQueryString}`, {
        token: session.accessToken,
      }),
    enabled: Boolean(
      session?.accessToken &&
      session?.role === "seeker" &&
      directSearch.trim().length >= 2
    ),
  });

  const directOrganizationSearchQuery = useQuery({
    queryKey: ["search-organizations", "direct", directSearchQueryString],
    queryFn: () =>
      apiRequest(`/search/organizations?${directSearchQueryString}`, {
        token: session.accessToken,
      }),
    enabled: Boolean(
      session?.accessToken &&
      session?.role === "seeker" &&
      directSearch.trim().length >= 2
    ),
  });

  const invalidateConnections = () => {
    queryClient.invalidateQueries({ queryKey: ["connections"] });
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
    queryClient.invalidateQueries({ queryKey: ["search-seekers"] });
    queryClient.invalidateQueries({ queryKey: ["search-organizations"] });
  };

  const sendRequestMutation = useMutation({
    mutationFn: (targetSeekerId) =>
      apiRequest(`/connections/request/${targetSeekerId}`, {
        method: "POST",
        token: session.accessToken,
      }),
    onSuccess: (response) => {
      setFeedback({ type: "success", message: response.message || "Connection request sent." });
      setDirectSearch("");
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

  const followOrganizationMutation = useMutation({
    mutationFn: (organizationId) =>
      apiRequest(`/follows/${organizationId}`, {
        method: "POST",
        token: session.accessToken,
      }),
    onSuccess: (response) => {
      setFeedback({ type: "success", message: response.message || "Organization followed." });
      queryClient.invalidateQueries({ queryKey: ["search-organizations"] });
      queryClient.invalidateQueries({ queryKey: ["follows"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => {
      setFeedback({ type: "error", message: error.message });
    },
  });

  const unfollowOrganizationMutation = useMutation({
    mutationFn: (organizationId) =>
      apiRequest(`/follows/${organizationId}`, {
        method: "DELETE",
        token: session.accessToken,
      }),
    onSuccess: (response) => {
      setFeedback({ type: "success", message: response.message || "Organization unfollowed." });
      queryClient.invalidateQueries({ queryKey: ["search-organizations"] });
      queryClient.invalidateQueries({ queryKey: ["follows"] });
    },
    onError: (error) => {
      setFeedback({ type: "error", message: error.message });
    },
  });

  if (session?.role !== "seeker") {
    return (
      <section className="info-card">
        <h3>Connections are seeker-only</h3>
        <p>This workspace is for job seekers building their professional network.</p>
      </section>
    );
  }

  const pendingConnections = pendingQuery.data?.connections || [];
  const acceptedConnections = acceptedQuery.data?.connections || [];
  const discoveredSeekers = seekerDiscoveryQuery.data?.seekers || [];
  const directSearchResults = directSearchQuery.data?.seekers || [];
  const directOrganizationResults = directOrganizationSearchQuery.data?.organizations || [];

  function handleFilterChange(field, value) {
    setFilters((current) => ({
      ...current,
      [field]: value,
    }));
  }

  return (
    <section className="dashboard-stack">
      <section className="stats-grid">
        <article className="stat-surface">
          <span>Pending requests</span>
          <strong>{pendingConnections.length}</strong>
          <small>Requests waiting for your response</small>
        </article>
        <article className="stat-surface">
          <span>Accepted connections</span>
          <strong>{acceptedConnections.length}</strong>
          <small>People in your seeker network</small>
        </article>
        <article className="stat-surface">
          <span>Discovery results</span>
          <strong>{discoveredSeekers.length}</strong>
          <small>Seekers matching your current filters</small>
        </article>
        <article className="stat-surface">
          <span>Privacy</span>
          <strong>Public</strong>
          <small>Private profiles stay out of discovery</small>
        </article>
      </section>

      <AutoDismissFeedback
        feedback={feedback}
        onClear={() => setFeedback({ type: "", message: "" })}
      />

      <section className="connections-layout">
        <div className="connections-main">
          <article className="info-card">
            <div className="section-head">
              <div>
                <h3>Discover seekers</h3>
                <p>Find people by name, skill, preferred role, or current status.</p>
              </div>
              <span className="pill">{discoveredSeekers.length} shown</span>
            </div>

            <section className="connections-filter-grid">
              <label className="form-field">
                <span>Name or keyword</span>
                <input
                  type="text"
                  value={filters.q}
                  onChange={(event) => handleFilterChange("q", event.target.value)}
                  placeholder="Aarav, frontend, AI..."
                />
              </label>

              <label className="form-field">
                <span>Skill</span>
                <input
                  type="text"
                  value={filters.skill}
                  onChange={(event) => handleFilterChange("skill", event.target.value)}
                  placeholder="React, Python..."
                />
              </label>

              <label className="form-field">
                <span>Preferred role</span>
                <input
                  type="text"
                  value={filters.role}
                  onChange={(event) => handleFilterChange("role", event.target.value)}
                  placeholder="Frontend Developer"
                />
              </label>

              <label className="form-field">
                <span>Status</span>
                <select
                  value={filters.currentStatus}
                  onChange={(event) => handleFilterChange("currentStatus", event.target.value)}
                >
                  <option value="">Any status</option>
                  <option value="Student">Student</option>
                  <option value="Professional">Professional</option>
                  <option value="Unemployed">Unemployed</option>
                </select>
              </label>
            </section>

            {seekerDiscoveryQuery.isLoading ? (
              <p>Searching seekers...</p>
            ) : discoveredSeekers.length ? (
              <div className="connection-list">
                {discoveredSeekers.map((seeker) => (
                  <SeekerDiscoveryCard
                    key={seeker._id}
                    seeker={seeker}
                    isSending={sendRequestMutation.isPending}
                    isResponding={respondMutation.isPending}
                    isRemoving={removeConnectionMutation.isPending}
                    onRemove={(connectionId) => removeConnectionMutation.mutate(connectionId)}
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
              <div className="empty-state-card">
                <h4>No seekers found</h4>
                <p>Try a broader keyword or remove one of the filters.</p>
              </div>
            )}
          </article>

          <article className="info-card">
            <div className="section-head">
              <div>
                <h3>Pending requests</h3>
                <p>Accept, reject, or ignore incoming seeker connection requests.</p>
              </div>
              <span className="pill">{pendingConnections.length} pending</span>
            </div>

            {pendingQuery.isLoading ? (
              <p>Loading pending requests...</p>
            ) : pendingConnections.length ? (
              <div className="connection-list">
                {pendingConnections.map((connection) => (
                  <article key={connection.id} className="connection-card">
                    <PersonSummary person={connection.requester} />
                    <div className="connection-card__actions">
                      {responseOptions.map((status) => (
                        <button
                          key={status}
                          type="button"
                          className={status === "Accepted" ? "" : "outline-button"}
                          disabled={respondMutation.isPending}
                          onClick={() =>
                            respondMutation.mutate({
                              connectionId: connection.id,
                              status,
                            })
                          }
                        >
                          {status}
                        </button>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state-card">
                <h4>No pending requests</h4>
                <p>Incoming connection invites will appear here.</p>
              </div>
            )}
          </article>

          <article className="info-card">
            <div className="section-head">
              <div>
                <h3>Accepted connections</h3>
                <p>Your active seeker network, sorted by most recent response.</p>
              </div>
              <span className="pill">{acceptedConnections.length} connected</span>
            </div>

            {acceptedQuery.isLoading ? (
              <p>Loading accepted connections...</p>
            ) : acceptedConnections.length ? (
              <div className="connection-list">
                {acceptedConnections.map((connection) => (
                  <article key={connection.id} className="connection-card">
                    <PersonSummary person={connection.counterpart} />
                    <div className="connection-card__meta">
                      <span className="pill">{connection.direction}</span>
                      <span>Connected {formatDate(connection.respondedAt || connection.updatedAt)}</span>
                    </div>
                    <div className="connection-card__actions">
                      <button
                        type="button"
                        className="outline-button"
                        disabled={removeConnectionMutation.isPending}
                        onClick={() => removeConnectionMutation.mutate(connection.id)}
                      >
                        {removeConnectionMutation.isPending ? "Removing..." : "Unfollow"}
                      </button>
                    </div>
                    {connection.counterpart?.skills?.length ? (
                      <div className="tag-row">
                        {connection.counterpart.skills.slice(0, 6).map((skill) => (
                          <span key={skill} className="tag-pill">
                            {skill}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state-card">
                <h4>No accepted connections yet</h4>
                <p>Send a request or accept one to start building your network.</p>
              </div>
            )}
          </article>
        </div>

        <aside className="info-card">
          <h3>Find people or companies</h3>
          <p>Search by username or email. Connect with people or follow organizations.</p>
          <form
            className="auth-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!directSearch.trim()) {
                setFeedback({ type: "error", message: "Enter a username or email to search." });
              }
            }}
          >
            <label className="form-field">
              <span>Username or email</span>
              <input
                type="text"
                value={directSearch}
                onChange={(event) => setDirectSearch(event.target.value)}
                placeholder="varunraj or varun@example.com"
              />
            </label>
          </form>

          {directSearch.trim().length < 2 ? (
            <div className="detail-list">
              <div className="detail-list__item">
                <strong>Tip</strong>
                <span>Type at least 2 characters from a username or email.</span>
              </div>
            </div>
          ) : directSearchQuery.isLoading || directOrganizationSearchQuery.isLoading ? (
            <p>Searching...</p>
          ) : directSearchResults.length || directOrganizationResults.length ? (
            <div className="connection-list compact-list">
              {directOrganizationResults.map((organization) => (
                <OrganizationSearchCard
                  key={organization._id}
                  organization={organization}
                  isUpdating={followOrganizationMutation.isPending || unfollowOrganizationMutation.isPending}
                  onFollow={(organizationId) => followOrganizationMutation.mutate(organizationId)}
                  onUnfollow={(organizationId) => unfollowOrganizationMutation.mutate(organizationId)}
                />
              ))}
              {directSearchResults.map((seeker) => (
                <SeekerDiscoveryCard
                  key={seeker._id}
                  seeker={seeker}
                  isSending={sendRequestMutation.isPending}
                  isResponding={respondMutation.isPending}
                  isRemoving={removeConnectionMutation.isPending}
                  onRemove={(connectionId) => removeConnectionMutation.mutate(connectionId)}
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
            <div className="empty-state-card">
              <h4>No match found</h4>
              <p>Check the username/email spelling or ask them for their SGETAI username.</p>
            </div>
          )}
        </aside>
      </section>
    </section>
  );
}
