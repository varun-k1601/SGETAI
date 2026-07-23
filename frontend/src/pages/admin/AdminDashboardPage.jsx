import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../services/api";
import { AutoDismissFeedback } from "../../components/AutoDismissFeedback";

function formatDate(value) {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getPersonName(user) {
  return `${user?.firstName || ""} ${user?.lastName || ""}`.trim() || user?.companyName || user?.email || "Unknown";
}

function MetricCard({ label, value, helper }) {
  return (
    <article className="stat-surface">
      <span>{label}</span>
      <strong>{value}</strong>
      {helper ? <small>{helper}</small> : null}
    </article>
  );
}

function AdminListCard({ title, count, children }) {
  return (
    <section className="dashboard-card admin-list-card">
      <div className="section-head">
        <div>
          <h2>{title}</h2>
        </div>
        {count !== undefined ? <span className="pill">{count}</span> : null}
      </div>
      <div className="admin-list-stack">
        {children}
      </div>
    </section>
  );
}

export function AdminDashboardPage() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState({ type: "", message: "" });
  const [policyForm, setPolicyForm] = useState({
    enabled: true,
    matchThreshold: 70,
    maxDailyApplications: 10,
  });
  const overviewQuery = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () =>
      apiRequest("/admin/overview", {
        token: session.accessToken,
      }),
    enabled: Boolean(session?.accessToken),
  });

  const overview = overviewQuery.data || {};
  const metrics = overview.metrics || {};
  const proAutoApplyPolicy = overview.proAutoApplyPolicy || {};
  const revenue = Object.entries(metrics.revenueByCurrency || {})
    .map(([currency, amount]) => `${currency} ${Number(amount || 0).toLocaleString("en-IN")}`)
    .join(", ") || "No paid revenue yet";

  useEffect(() => {
    if (!overview.proAutoApplyPolicy) {
      return;
    }

    setPolicyForm({
      enabled: overview.proAutoApplyPolicy.enabled ?? true,
      matchThreshold: overview.proAutoApplyPolicy.matchThreshold ?? 70,
      maxDailyApplications: overview.proAutoApplyPolicy.maxDailyApplications ?? 10,
    });
  }, [overview.proAutoApplyPolicy]);

  const policyMutation = useMutation({
    mutationFn: () =>
      apiRequest("/admin/pro-auto-apply-policy", {
        method: "PUT",
        token: session.accessToken,
        body: {
          enabled: policyForm.enabled,
          matchThreshold: Number(policyForm.matchThreshold),
          maxDailyApplications: Number(policyForm.maxDailyApplications),
        },
      }),
    onSuccess: (response) => {
      setFeedback({ type: "success", message: response.message || "Policy updated." });
      queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
      queryClient.invalidateQueries({ queryKey: ["pro-tools", "auto-apply"] });
    },
    onError: (error) => {
      setFeedback({ type: "error", message: error.message });
    },
  });

  if (overviewQuery.isLoading) {
    return (
      <section className="dashboard-card">
        <h1>Admin dashboard</h1>
        <p className="muted">Loading platform health...</p>
      </section>
    );
  }

  if (overviewQuery.isError) {
    return (
      <section className="dashboard-card">
        <h1>Admin dashboard</h1>
        <p className="feedback-banner error">{overviewQuery.error.message}</p>
      </section>
    );
  }

  return (
    <div className="dashboard-stack admin-dashboard">
      <section className="stats-grid admin-stats-grid">
        <MetricCard label="Applicants" value={metrics.seekers || 0} helper={`${metrics.proSeekers || 0} Pro users`} />
        <MetricCard label="Recruiters" value={metrics.recruiters || 0} helper={`${metrics.verifiedRecruiters || 0} verified`} />
        <MetricCard label="Jobs" value={metrics.jobs || 0} helper={`${metrics.activeJobs || 0} active`} />
        <MetricCard label="Applications" value={metrics.applications || 0} helper={`${metrics.pendingApplications || 0} pending`} />
        <MetricCard label="Payments" value={metrics.payments || 0} helper={`${metrics.paidPayments || 0} paid`} />
        <MetricCard label="Revenue" value={revenue} helper="Paid subscription total" />
        <MetricCard label="Posts" value={metrics.posts || 0} helper="User and company posts" />
        <MetricCard label="Connections" value={metrics.connections || 0} helper="Network relationships" />
      </section>

      <AutoDismissFeedback
        feedback={feedback}
        onClear={() => setFeedback({ type: "", message: "" })}
      />

      <section className="dashboard-card admin-policy-card">
        <div className="section-head">
          <div>
            <p className="eyebrow">Pro Policy</p>
            <h2>Global auto-apply controls</h2>
            <p>
              These values are controlled by admin and apply to every Pro applicant.
              Users can only toggle auto-apply and set personal filters.
            </p>
          </div>
          <span className="pill accent">
            {proAutoApplyPolicy.enabled === false ? "Disabled" : `Threshold ${proAutoApplyPolicy.matchThreshold ?? 70}`}
          </span>
        </div>

        <form
          className="auth-form auth-form--wide"
          onSubmit={(event) => {
            event.preventDefault();
            setFeedback({ type: "", message: "" });
            policyMutation.mutate();
          }}
        >
          <div className="form-grid">
            <label className="form-field checkbox-field">
              <span>Enable global auto-apply</span>
              <input
                type="checkbox"
                checked={policyForm.enabled}
                onChange={(event) =>
                  setPolicyForm((current) => ({
                    ...current,
                    enabled: event.target.checked,
                  }))
                }
                disabled={session.role !== "SuperAdmin"}
              />
              <small className="form-inline-note">Turn this off to stop all background auto-apply runs.</small>
            </label>

            <label className="form-field">
              <span>Minimum auto-apply score</span>
              <input
                type="number"
                min="56"
                max="100"
                value={policyForm.matchThreshold}
                onChange={(event) =>
                  setPolicyForm((current) => ({
                    ...current,
                    matchThreshold: event.target.value,
                  }))
                }
                disabled={session.role !== "SuperAdmin"}
              />
              <small className="form-inline-note">Only jobs at or above this ATS score can be auto-applied.</small>
            </label>

            <label className="form-field">
              <span>Daily auto-apply limit per Pro user</span>
              <input
                type="number"
                min="1"
                max="50"
                value={policyForm.maxDailyApplications}
                onChange={(event) =>
                  setPolicyForm((current) => ({
                    ...current,
                    maxDailyApplications: event.target.value,
                  }))
                }
                disabled={session.role !== "SuperAdmin"}
              />
              <small className="form-inline-note">This cap is shared across all Pro accounts.</small>
            </label>
          </div>

          <button
            type="submit"
            disabled={policyMutation.isPending || session.role !== "SuperAdmin"}
          >
            {policyMutation.isPending ? "Saving policy..." : "Save global policy"}
          </button>
          {session.role !== "SuperAdmin" ? (
            <p className="form-inline-note">Only SuperAdmin can update this policy.</p>
          ) : null}
        </form>
      </section>

      <section className="dashboard-grid admin-dashboard-grid">
        <AdminListCard title="Recent applicants" count={overview.seekers?.length || 0}>
          {(overview.seekers || []).map((seeker) => (
            <article className="list-row" key={seeker._id}>
              <div>
                <strong>{getPersonName(seeker)}</strong>
                <p>@{seeker.username || "not-set"} - {seeker.email}</p>
                <small>{seeker.currentStatus || "No status"} - {seeker.openToWork ? "Open to work" : "Not open to work"}</small>
              </div>
              <span className={seeker.isPro ? "pill accent" : "pill"}>{seeker.isPro ? "Pro" : "Normal"}</span>
            </article>
          ))}
        </AdminListCard>

        <AdminListCard title="Recent recruiters" count={overview.recruiters?.length || 0}>
          {(overview.recruiters || []).map((recruiter) => (
            <article className="list-row" key={recruiter._id}>
              <div>
                <strong>{recruiter.companyName}</strong>
                <p>@{recruiter.username || "not-set"} - {recruiter.email}</p>
                <small>{recruiter.industry || "No industry"} - {recruiter.domainMatched ? "Domain matched" : "Domain not matched"}</small>
              </div>
              <span className={recruiter.verificationStatus === "Verified" ? "pill accent" : "pill"}>
                {recruiter.verificationStatus || "Pending"}
              </span>
            </article>
          ))}
        </AdminListCard>

        <AdminListCard title="Latest jobs" count={overview.jobs?.length || 0}>
          {(overview.jobs || []).map((job) => (
            <article className="list-row" key={job._id}>
              <div>
                <strong>{job.title}</strong>
                <p>{job.organizationId?.companyName || "Unknown company"} - {job.location || "No location"}</p>
                <small>{job.type || "No type"} - {job.industry || "No industry"} - {formatDate(job.createdAt)}</small>
              </div>
              <span className={job.status === "Active" ? "pill accent" : "pill"}>{job.status}</span>
            </article>
          ))}
        </AdminListCard>

        <AdminListCard title="Latest applications" count={overview.applications?.length || 0}>
          {(overview.applications || []).map((application) => (
            <article className="list-row" key={application._id}>
              <div>
                <strong>{application.jobId?.title || "Unknown job"}</strong>
                <p>{getPersonName(application.jobSeekerId)} to {application.organizationId?.companyName || "Unknown company"}</p>
                <small>{application.source} - ATS {application.atsScore || 0} - {formatDate(application.createdAt)}</small>
              </div>
              <span className="pill">{application.status}</span>
            </article>
          ))}
        </AdminListCard>

        <AdminListCard title="Recent payments" count={overview.payments?.length || 0}>
          {(overview.payments || []).map((payment) => (
            <article className="list-row" key={payment._id}>
              <div>
                <strong>{getPersonName(payment.seekerId)}</strong>
                <p>{payment.plan} plan - {payment.provider}</p>
                <small>{payment.currency} {Number(payment.amount || 0).toLocaleString("en-IN")} - {formatDate(payment.createdAt)}</small>
              </div>
              <span className={payment.status === "Paid" ? "pill accent" : "pill"}>{payment.status}</span>
            </article>
          ))}
        </AdminListCard>

        <AdminListCard title="Verification requests" count={overview.verificationRequests?.length || 0}>
          {(overview.verificationRequests || []).map((request) => (
            <article className="list-row" key={request._id}>
              <div>
                <strong>{getPersonName(request.jobSeekerId)}</strong>
                <p>{request.organizationId?.companyName || "Unknown company"} - {request.managerEmail}</p>
                <small>Reminders {request.reminderCount || 0} - {formatDate(request.requestedAt)}</small>
              </div>
              <span className="pill">{request.status}</span>
            </article>
          ))}
        </AdminListCard>
      </section>
    </div>
  );
}
