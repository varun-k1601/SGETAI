import { Link } from "react-router-dom";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../services/api";
import { AutoDismissFeedback } from "../../components/AutoDismissFeedback";
import { CompanyLogo } from "../../components/CompanyLogo";

function getOrganizationId(follow) {
  return follow.organizationId?._id || follow.organizationId;
}

function FollowCard({
  follow,
  isPro,
  onToggleNotifyJobs,
  onUnfollow,
  updatingPreference,
  removingFollow,
}) {
  const organization = follow.organizationId || {};
  const notifyJobs = Boolean(follow.notificationPreferences?.notifyJobs);

  return (
    <article className="follow-card">
      <div className="follow-card__main">
        <div>
          <span className="notification-type">{organization.industry || "Organization"}</span>
          <h3>{organization.companyName || "Unknown organization"}</h3>
          <p>{organization.websiteUrl || "Website not added yet"}</p>
        </div>
        <span className="pill">{organization.verificationStatus || "Pending"}</span>
      </div>

      <div className="follow-card__actions">
        <label className={isPro ? "toggle-row" : "toggle-row disabled"}>
          <input
            type="checkbox"
            checked={notifyJobs}
            disabled={!isPro || updatingPreference}
            onChange={(event) => onToggleNotifyJobs(follow, event.target.checked)}
          />
          <span>Job alerts</span>
        </label>
        {!isPro ? (
          <p className="detail-summary">Job alerts are Pro-only.</p>
        ) : null}
        <button
          type="button"
          className="outline-button"
          disabled={removingFollow}
          onClick={() => onUnfollow(follow)}
        >
          Unfollow
        </button>
        <Link className="detail-link" to={`/organizations/${getOrganizationId(follow)}`}>
          View profile
        </Link>
      </div>
    </article>
  );
}

export function FollowsPage() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");

  const followsQuery = useQuery({
    queryKey: ["follows", "mine"],
    queryFn: () =>
      apiRequest("/follows", {
        token: session.accessToken,
      }),
    enabled: Boolean(session?.accessToken && session?.role === "seeker"),
  });

  const searchQuery_ = useQuery({
    queryKey: ["search", "organizations", searchQuery],
    queryFn: () =>
      apiRequest(`/search/organizations?q=${encodeURIComponent(searchQuery)}&limit=5`, {
        token: session.accessToken,
      }),
    enabled: Boolean(searchQuery.trim() && session?.accessToken && session?.role === "seeker"),
  });

  const updatePreferencesMutation = useMutation({
    mutationFn: ({ organizationId, notifyJobs }) =>
      apiRequest(`/follows/${organizationId}/preferences`, {
        method: "PUT",
        token: session.accessToken,
        body: { notifyJobs },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["follows"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const unfollowMutation = useMutation({
    mutationFn: (organizationId) =>
      apiRequest(`/follows/${organizationId}`, {
        method: "DELETE",
        token: session.accessToken,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["follows"] });
      queryClient.invalidateQueries({ queryKey: ["search", "organizations"] });
    },
  });

  const followNewMutation = useMutation({
    mutationFn: (organizationId) =>
      apiRequest(`/follows/${organizationId}`, {
        method: "POST",
        token: session.accessToken,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["follows"] });
      queryClient.invalidateQueries({ queryKey: ["search", "organizations"] });
    },
  });

  if (session?.role !== "seeker") {
    return (
      <section className="info-card">
        <h3>Following is seeker-only</h3>
        <p>Organization follows are designed for job seekers tracking companies.</p>
      </section>
    );
  }

  const follows = followsQuery.data?.follows || [];
  const proAlertCount = follows.filter((follow) => follow.notificationPreferences?.notifyJobs).length;

  return (
    <section className="dashboard-stack">
      <section className="stats-grid">
        <article className="stat-surface">
          <span>Followed organizations</span>
          <strong>{follows.length}</strong>
          <small>Companies saved to your seeker workspace</small>
        </article>
        <article className="stat-surface">
          <span>Job alerts</span>
          <strong>{proAlertCount}</strong>
          <small>Pro notification preferences currently enabled</small>
        </article>
        <article className="stat-surface">
          <span>Plan</span>
          <strong>{session?.isPro ? "Pro" : "Standard"}</strong>
          <small>{session?.isPro ? "Job alerts available" : "Upgrade required for job alerts"}</small>
        </article>
        <article className="stat-surface">
          <span>Discovery</span>
          <strong>Jobs</strong>
          <small>Use search to follow more organizations</small>
        </article>
      </section>

      <AutoDismissFeedback
        feedback={
          updatePreferencesMutation.isError
            ? { type: "error", message: updatePreferencesMutation.error.message }
            : null
        }
        onClear={() => updatePreferencesMutation.reset()}
      />
      <AutoDismissFeedback
        feedback={
          unfollowMutation.isError
            ? { type: "error", message: unfollowMutation.error.message }
            : null
        }
        onClear={() => unfollowMutation.reset()}
      />

      <section className="follow-layout">
        <article className="info-card">
          <div className="section-head">
            <div>
              <h3>Search organizations</h3>
              <p>Find companies to follow and manage job alerts.</p>
            </div>
          </div>

          <div className="search-box">
            <input
              type="text"
              placeholder="Username or email"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {searchQuery.trim() && searchQuery_ ? (
            <div className="organization-search-results">
              {searchQuery_.isLoading ? (
                <p>Searching organizations...</p>
              ) : searchQuery_.isError ? (
                <p>Error searching organizations</p>
              ) : (searchQuery_.data?.organizations || []).length ? (
                <div className="search-results-list">
                  {searchQuery_.data.organizations.map((organization) => {
                    const isFollowing = followsQuery.data?.follows.some(
                      (f) => String(getOrganizationId(f)) === String(organization._id)
                    );

                    return (
                      <div key={organization._id} className="search-result-card">
                        <Link to={`/organizations/${organization._id}`} className="search-result-link">
                          <div className="search-result-header">
                            <div className="search-result-logo">
                              <CompanyLogo organization={organization} size="md" />
                            </div>
                            <div className="search-result-info">
                              <h4>{organization.companyName}</h4>
                              <p className="search-result-meta">@{organization.username}</p>
                              <p className="search-result-industry">{organization.industry}</p>
                            </div>
                            <span className="search-result-badge">{organization.verificationStatus}</span>
                          </div>
                        </Link>
                        <div className="search-result-actions">
                          {isFollowing ? (
                            <button
                              type="button"
                              className="outline-button"
                              disabled={unfollowMutation.isPending}
                              onClick={() => unfollowMutation.mutate(organization._id)}
                            >
                              Unfollow
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={followNewMutation.isPending}
                              onClick={() => followNewMutation.mutate(organization._id)}
                            >
                              Follow
                            </button>
                          )}
                          <Link className="detail-link" to={`/organizations/${organization._id}`}>
                            View profile
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-muted">No organizations found</p>
              )}
            </div>
          ) : null}
        </article>

        <article className="info-card">
          <div className="section-head">
            <div>
              <h3>Followed organizations</h3>
              <p>Manage your company watchlist and notification preferences.</p>
            </div>
            <Link className="inline-link" to="/jobs">
              Find more jobs
            </Link>
          </div>

          {followsQuery.isLoading ? (
            <p>Loading followed organizations...</p>
          ) : follows.length ? (
            <div className="follow-list">
              {follows.map((follow) => (
                <FollowCard
                  key={follow._id}
                  follow={follow}
                  isPro={session?.isPro}
                  updatingPreference={updatePreferencesMutation.isPending}
                  removingFollow={unfollowMutation.isPending}
                  onToggleNotifyJobs={(item, notifyJobs) =>
                    updatePreferencesMutation.mutate({
                      organizationId: getOrganizationId(item),
                      notifyJobs,
                    })
                  }
                  onUnfollow={(item) => unfollowMutation.mutate(getOrganizationId(item))}
                />
              ))}
            </div>
          ) : (
            <div className="empty-state-card">
              <h4>No followed organizations yet</h4>
              <p>
                Follow companies from the jobs page to build a focused list of
                organizations you want to track.
              </p>
              <Link className="detail-link" to="/jobs">
                Search jobs
              </Link>
            </div>
          )}
        </article>

        <aside className="info-card">
          <h3>How this helps</h3>
          <div className="detail-list">
            <div className="detail-list__item">
              <strong>Company watchlist</strong>
              <span>Keep important organizations in one place.</span>
            </div>
            <div className="detail-list__item">
              <strong>Pro job alerts</strong>
              <span>Enable `notifyJobs` for followed organizations when you are Pro.</span>
            </div>
            <div className="detail-list__item">
              <strong>Recruiter signal</strong>
              <span>Organizations receive a notification when you follow them.</span>
            </div>
          </div>
        </aside>
      </section>
    </section>
  );
}
