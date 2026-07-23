import { Link, useParams } from "react-router-dom";
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../services/api";
import { CompanyLogo } from "../../components/CompanyLogo";

function getOrganizationId(follow) {
  return follow.organizationId?._id || follow.organizationId;
}

export function OrganizationPage() {
  const { id } = useParams();
  const { session } = useAuth();
  const queryClient = useQueryClient();

  const organizationQuery = useQuery({
    queryKey: ["organization", id],
    queryFn: () =>
      apiRequest(`/organizations/${id}`, {
        token: session?.accessToken,
      }),
    enabled: Boolean(id),
  });

  const followsQuery = useQuery({
    queryKey: ["follows", "mine"],
    queryFn: () =>
      apiRequest("/follows", {
        token: session.accessToken,
      }),
    enabled: Boolean(session?.accessToken && session?.role === "seeker"),
  });

  const jobsQuery = useQuery({
    queryKey: ["search-jobs", "organization", id],
    queryFn: () => apiRequest("/search/jobs?status=Active&limit=50"),
    enabled: Boolean(id),
  });

  const followMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/follows/${id}`, {
        method: "POST",
        token: session.accessToken,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["follows"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const unfollowMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/follows/${id}`, {
        method: "DELETE",
        token: session.accessToken,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["follows"] });
    },
  });

  const updatePreferencesMutation = useMutation({
    mutationFn: (notifyJobs) =>
      apiRequest(`/follows/${id}/preferences`, {
        method: "PUT",
        token: session.accessToken,
        body: { notifyJobs },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["follows"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const organization = organizationQuery.data?.profile || {};
  const follow = (followsQuery.data?.follows || []).find(
    (item) => String(getOrganizationId(item)) === String(id)
  );
  const isFollowing = Boolean(follow);
  const notifyJobs = Boolean(follow?.notificationPreferences?.notifyJobs);
  const activeJobs = useMemo(() => {
    const jobs = jobsQuery.data?.jobs || [];

    return jobs.filter(
      (job) => String(job.organizationId?._id || job.organizationId) === String(id)
    );
  }, [jobsQuery.data, id]);
  const canManageOwnOrganization =
    session?.role === "organization" && String(session?.userId) === String(id);

  if (organizationQuery.isLoading) {
    return (
      <section className="info-card">
        <p>Loading organization profile...</p>
      </section>
    );
  }

  if (organizationQuery.isError) {
    return (
      <section className="info-card">
        <h3>Organization unavailable</h3>
        <p>{organizationQuery.error.message}</p>
      </section>
    );
  }

  return (
    <section className="dashboard-stack">
      <div className="hero-card recruiter">
        <div className="company-profile-hero">
          <CompanyLogo organization={organization} size="lg" />
          <div>
            <p className="eyebrow">{organization.industry || "Organization"}</p>
            <h1>{organization.companyName || "Organization profile"}</h1>
            <p>{organization.description || "Company description has not been added yet."}</p>
          </div>
        </div>
      </div>

      <section className="stats-grid">
        <article className="stat-surface">
          <span>Verification</span>
          <strong>{organization.verificationStatus || "Pending"}</strong>
          <small>Organization verification state</small>
        </article>
        <article className="stat-surface">
          <span>Company size</span>
          <strong>{organization.companySize || "N/A"}</strong>
          <small>Reported team size</small>
        </article>
        <article className="stat-surface">
          <span>Active jobs</span>
          <strong>{activeJobs.length}</strong>
          <small>Open roles found in search</small>
        </article>
        <article className="stat-surface">
          <span>Founded</span>
          <strong>{organization.foundedYear || "N/A"}</strong>
          <small>Company founding year</small>
        </article>
      </section>

      <section className="organization-layout">
        <div className="organization-main">
          <article className="info-card">
            <div className="section-head">
              <div>
                <h3>Company overview</h3>
                <p>Core company details available from the backend organization profile.</p>
              </div>
              {organization.websiteUrl ? (
                <a className="inline-link" href={organization.websiteUrl} target="_blank" rel="noreferrer">
                  Website
                </a>
              ) : null}
            </div>

            <div className="metric-list">
              <div>
                <span>Industry</span>
                <strong>{organization.industry || "Not specified"}</strong>
              </div>
              <div>
                <span>Headquarters</span>
                <strong>{organization.headquartersLocation || "Not specified"}</strong>
              </div>
              <div>
                <span>LinkedIn</span>
                <strong>{organization.linkedinPage || "Not shared"}</strong>
              </div>
              <div>
                <span>Domain match</span>
                <strong>{organization.domainMatched ? "Matched" : "Review"}</strong>
              </div>
            </div>
          </article>

          <article className="info-card">
            <div className="section-head">
              <div>
                <h3>Open jobs</h3>
                <p>Active roles currently visible from job search.</p>
              </div>
              <Link className="inline-link" to="/jobs">
                Search all jobs
              </Link>
            </div>

            {jobsQuery.isLoading ? (
              <p>Loading organization jobs...</p>
            ) : activeJobs.length ? (
              <div className="list-stack">
                {activeJobs.slice(0, 6).map((job) => (
                  <article key={job._id} className="list-row">
                    <div>
                      <strong>{job.title}</strong>
                      <p>{job.location || "Flexible"} | {job.type || "Open role"}</p>
                    </div>
                    <span className="pill">{job.industry || "General"}</span>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state-card">
                <h4>No active jobs found</h4>
                <p>This organization does not have visible active jobs right now.</p>
              </div>
            )}
          </article>
        </div>

        <aside className="organization-side">
          <article className="info-card">
            <h3>Actions</h3>
            {session?.role === "seeker" ? (
              <div className="detail-list">
                {isFollowing ? (
                  <button
                    type="button"
                    className="outline-button"
                    disabled={unfollowMutation.isPending}
                    onClick={() => unfollowMutation.mutate()}
                  >
                    {unfollowMutation.isPending ? "Unfollowing..." : "Unfollow organization"}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={followMutation.isPending}
                    onClick={() => followMutation.mutate()}
                  >
                    {followMutation.isPending ? "Following..." : "Follow organization"}
                  </button>
                )}

                <label className={session?.isPro && isFollowing ? "toggle-row" : "toggle-row disabled"}>
                  <input
                    type="checkbox"
                    checked={notifyJobs}
                    disabled={!session?.isPro || !isFollowing || updatePreferencesMutation.isPending}
                    onChange={(event) => updatePreferencesMutation.mutate(event.target.checked)}
                  />
                  <span>Job alerts</span>
                </label>
                {!session?.isPro ? (
                  <p className="detail-summary">Job alerts are available for Pro seekers.</p>
                ) : null}
              </div>
            ) : canManageOwnOrganization ? (
              <div className="detail-list">
                <Link className="detail-link" to="/profile">
                  Edit profile
                </Link>
                <Link className="detail-link" to="/recruiter/jobs">
                  Manage jobs
                </Link>
              </div>
            ) : (
              <p>Sign in as a seeker to follow this organization.</p>
            )}
          </article>

          <article className="info-card">
            <h3>Representative details</h3>
            {organization.representativeDetails ? (
              <div className="detail-list">
                <div className="detail-list__item">
                  <strong>{organization.representativeDetails.name || "Representative"}</strong>
                  <span>{organization.representativeDetails.email || "Email not shared"}</span>
                </div>
                <div className="detail-list__item">
                  <strong>Role</strong>
                  <span>{organization.representativeDetails.role || "Not specified"}</span>
                </div>
              </div>
            ) : (
              <p className="detail-summary">
                Representative details are hidden unless you are the owner or a Pro seeker.
              </p>
            )}
          </article>
        </aside>
      </section>
    </section>
  );
}
