import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../services/api";
import { AutoDismissFeedback } from "../../components/AutoDismissFeedback";

/* ===============================================================================================
   Recruiter employment verification (/recruiter/background-check) — organization accounts only.
   ===============================================================================================
   REBUILT, not restyled. The previous version fetched nothing (zero useQuery/apiRequest calls) —
   "Alex Rivera" / "Jamie Tanaka" / "Sasha Patel", their progress bars and their five-step checklist
   (identity / education / employment / criminal record / references) were all hardcoded literals.
   None of that exists in this codebase.

   WHAT ACTUALLY EXISTS: VerificationRequest — one document per (applicationId, experienceId),
   emailing ONE named former manager to confirm ONE past employment entry. Status is a real
   three-value enum: Pending | Submitted | Expired (see VerificationRequest.js). "Expired" is a
   valid schema value that NO code path currently assigns — nothing in verificationController.js or
   workers/verificationCron.js ever sets it. It is still handled correctly below (it just reads 0
   today, honestly, rather than being omitted or faked).

   There is no identity check, no education check, no reference check, and — this one matters —
   NO criminal-record check anywhere in this codebase, and none is implemented here. That is a
   regulated activity requiring an accredited provider and candidate consent; this page does not
   claim, imply, or stub it.

   ENDPOINT ADDED: GET /verification/mine (verificationController.getMyVerificationRequests,
   routes/verification.js) — org-scoped via organizationId: req.user.id in the query itself (same
   pattern as getMyJobsOverview/getMyCandidates), with status filtering and pagination, returning a
   `summary` computed over the WHOLE matched set so the KPI cards stay correct regardless of which
   page or filter is currently showing.

   The applicant picker deliberately adds NO new backend surface: it is Job (GET /jobs/mine) then
   Applicant (GET /jobs/:jobId/applications), the same two real endpoints and the same eligibility
   check (an experience entry with managerEmail, mirrored from RecruiterJobApplicantsPage.jsx) —
   just surfaced before a submit attempt instead of after a 400/409.

   The root .employment-verification is a TRANSPARENT LAYOUT CONTAINER — no background, no padding
   of its own. .main-panel already pads and scrolls this region.
   =============================================================================================== */

// The model's real enum (VerificationRequest.status). "Expired" is included because it is a real,
// reachable schema value even though no worker currently assigns it — see the file header.
const STATUS_FILTERS = ["All", "Pending", "Submitted", "Expired"];

const STATUS_TONE = {
  Pending: "accent",
  Submitted: "ok",
  Expired: "warn",
};

const STATUS_LABEL = {
  Pending: "Awaiting manager",
  Submitted: "Manager responded",
  Expired: "Expired",
};

function formatDate(value) {
  if (!value) {
    return "Not available";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Not available";
  }
  return parsed.toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" });
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function IconShield(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    </svg>
  );
}

function IconClock(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

function IconCheck(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function IconAlertTriangle(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function IconAlertCircle(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </svg>
  );
}

function IconInbox(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" />
    </svg>
  );
}

function KpiCard({ icon, label, value, tone }) {
  return (
    <li className={`ev-card ev-kpi${tone ? ` ev-kpi--${tone}` : ""}`}>
      <p className="ev-kpi__label">
        {icon}
        {label}
      </p>
      <p className="ev-kpi__value">{value}</p>
    </li>
  );
}

export function RecruiterBackgroundCheckPage() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const uid = useId();
  const [feedback, setFeedback] = useState({ type: "", message: "" });
  const [selectedJobId, setSelectedJobId] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [page, setPage] = useState(1);

  const isOrganization = session?.role === "organization";

  const jobsQuery = useQuery({
    queryKey: ["jobs", "recruiter-postings"],
    queryFn: () => apiRequest("/jobs/mine?status=All", { token: session.accessToken }),
    enabled: isOrganization,
  });

  const jobs = jobsQuery.data?.jobs || [];

  const applicationsQuery = useQuery({
    queryKey: ["job-applications", selectedJobId, "recruiter-review"],
    queryFn: () => apiRequest(`/jobs/${selectedJobId}/applications`, { token: session.accessToken }),
    enabled: Boolean(isOrganization && selectedJobId),
  });

  const applications = applicationsQuery.data?.applications || [];

  const verificationQuery = useQuery({
    queryKey: ["verification", "mine", page, statusFilter],
    queryFn: () =>
      apiRequest(`/verification/mine?page=${page}&limit=10&status=${statusFilter}`, {
        token: session.accessToken,
      }),
    enabled: isOrganization,
  });

  const requests = verificationQuery.data?.requests || [];
  const summary = verificationQuery.data?.summary;
  const pagination = verificationQuery.data?.pagination;

  function invalidateVerification() {
    queryClient.invalidateQueries({ queryKey: ["verification", "mine"] });
  }

  const triggerMutation = useMutation({
    mutationFn: (applicationId) =>
      apiRequest(`/verification/${applicationId}/trigger`, {
        method: "POST",
        token: session.accessToken,
      }),
    onSuccess: (response) => {
      setFeedback({ type: "success", message: response.message || "Verification request sent." });
      invalidateVerification();
      queryClient.invalidateQueries({ queryKey: ["job-applications", selectedJobId, "recruiter-review"] });
    },
    onError: (error) => {
      setFeedback({ type: "error", message: error.message });
    },
  });

  if (!isOrganization) {
    return (
      <section className="employment-verification">
        <div className="ev-card ev-state">
          <p className="ev-state__title">Employment verification is organization-only</p>
          <p>This page is designed for organization accounts verifying candidates.</p>
        </div>
      </section>
    );
  }

  const jobSelectId = `${uid}-job`;

  return (
    <section className="employment-verification">
      <header className="ev-hero">
        <div className="ev-hero__text">
          <p className="ev-eyebrow">Trust layer</p>
          <h1 className="ev-hero__title">Employment verification</h1>
          <p className="ev-hero__sub">
            We email the candidate's former manager to confirm their employment history. There is
            no identity, education, reference or criminal-record check on this platform.
          </p>
        </div>
      </header>

      <AutoDismissFeedback feedback={feedback} onClear={() => setFeedback({ type: "", message: "" })} />

      <ul className="ev-kpis">
        <KpiCard
          icon={<IconClock className="ev-icon ev-icon--sm" />}
          label="Awaiting manager"
          value={summary ? summary.Pending : "—"}
          tone="accent"
        />
        <KpiCard
          icon={<IconAlertTriangle className="ev-icon ev-icon--sm" />}
          label="Needs attention"
          value={summary ? summary.needsAttention : "—"}
          tone="warn"
        />
        <KpiCard
          icon={<IconCheck className="ev-icon ev-icon--sm" />}
          label="Manager responded"
          value={summary ? summary.Submitted : "—"}
          tone="ok"
        />
        <KpiCard
          icon={<IconAlertCircle className="ev-icon ev-icon--sm" />}
          label="Expired"
          value={summary ? summary.Expired : "—"}
        />
      </ul>

      <div className="ev-card ev-picker">
        <p className="ev-eyebrow">Request a verification</p>
        <h2 className="ev-picker__title">Pick an applicant</h2>
        <p className="ev-picker__desc">
          Choose one of your job postings, then request verification for an applicant who has a
          past employer with a manager email on file.
        </p>

        <label className="ev-field-label" htmlFor={jobSelectId}>
          Job posting
        </label>
        <select
          id={jobSelectId}
          className="ev-select"
          value={selectedJobId}
          onChange={(event) => setSelectedJobId(event.target.value)}
        >
          <option value="">Select a job posting…</option>
          {jobs.map((job) => (
            <option key={job._id} value={job._id}>
              {job.title} · {job.applicationCount || 0} {job.applicationCount === 1 ? "applicant" : "applicants"}
            </option>
          ))}
        </select>

        {!selectedJobId ? null : applicationsQuery.isLoading ? (
          <p className="ev-empty">Loading applicants…</p>
        ) : applicationsQuery.isError ? (
          <p className="ev-empty ev-empty--error">
            <IconAlertCircle className="ev-icon ev-icon--sm" />
            {applicationsQuery.error?.message || "Could not load applicants for this job."}
          </p>
        ) : applications.length ? (
          <ul className="ev-applicant-list">
            {applications.map((application) => {
              const seeker = application.jobSeekerId || {};
              const name = `${seeker.firstName || ""} ${seeker.lastName || ""}`.trim() || "Unnamed applicant";
              const hasExperienceEntries = Boolean((seeker.experience || []).length);
              const hasVerifiableExperience = Boolean(
                (seeker.experience || []).some((item) => String(item.managerEmail || "").trim())
              );
              const latestVerificationRequest = application.latestVerificationRequest;
              const alreadyPending =
                latestVerificationRequest?.status === "Pending" ||
                application.verificationStatus === "InProgress";
              const eligible = hasVerifiableExperience && !alreadyPending;
              const reason = alreadyPending
                ? `Verification already requested from ${latestVerificationRequest?.managerEmail || "the manager on file"}.`
                : !hasExperienceEntries
                  ? "No employment history on file for this applicant."
                  : !hasVerifiableExperience
                    ? "None of this applicant's experience entries include a manager email."
                    : "";
              const isTriggeringThis =
                triggerMutation.isPending && triggerMutation.variables === application._id;

              return (
                <li
                  key={application._id}
                  className={`ev-applicant-row${eligible ? "" : " ev-applicant-row--disabled"}`}
                  aria-disabled={!eligible}
                >
                  <span className="ev-applicant-row__name">{name}</span>
                  {alreadyPending ? (
                    <span className={`ev-pill ev-pill--${STATUS_TONE.Pending}`}>Pending</span>
                  ) : eligible ? (
                    <button
                      type="button"
                      className="ev-btn ev-btn--primary"
                      disabled={triggerMutation.isPending}
                      onClick={() => {
                        setFeedback({ type: "", message: "" });
                        triggerMutation.mutate(application._id);
                      }}
                    >
                      {isTriggeringThis ? "Requesting…" : "Request verification"}
                    </button>
                  ) : (
                    <span className="ev-applicant-row__reason">{reason}</span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="ev-empty">This job posting has no applicants yet.</p>
        )}
      </div>

      <div className="ev-card ev-list-card">
        <div className="ev-list-card__head">
          <div>
            <p className="ev-eyebrow">Requests</p>
            <h2 className="ev-picker__title">Verification requests</h2>
          </div>
          <div className="ev-chips" role="group" aria-label="Filter by status">
            {STATUS_FILTERS.map((filterValue) => (
              <button
                key={filterValue}
                type="button"
                aria-pressed={statusFilter === filterValue}
                className={`ev-chip${statusFilter === filterValue ? " ev-chip--on" : ""}`}
                onClick={() => {
                  setStatusFilter(filterValue);
                  setPage(1);
                }}
              >
                {filterValue}
                {summary ? (
                  <span className="ev-chip__count">
                    {filterValue === "All" ? summary.total : summary[filterValue]}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>

        {verificationQuery.isLoading ? (
          <p className="ev-empty">Loading verification requests…</p>
        ) : verificationQuery.isError ? (
          <p className="ev-empty ev-empty--error">
            <IconAlertCircle className="ev-icon ev-icon--sm" />
            {verificationQuery.error?.message || "Could not load verification requests."}
          </p>
        ) : requests.length ? (
          <>
            <ul className="ev-requests">
              {requests.map((request) => {
                const tone = STATUS_TONE[request.status] || "muted";
                const needsAttention = request.status === "Pending" && (request.reminderCount || 0) >= 1;

                return (
                  <li key={request._id} className="ev-request">
                    <div className="ev-request__main">
                      <p className="ev-request__name">{request.candidateName}</p>
                      <p className="ev-request__meta">
                        {request.jobId ? (
                          <Link to={`/recruiter/applications/${request.jobId}`} className="ev-request__link">
                            {request.jobTitle || "View application"}
                          </Link>
                        ) : (
                          <span>{request.jobTitle || "Application no longer available"}</span>
                        )}
                      </p>
                      <p className="ev-request__meta">Manager: {request.managerEmail}</p>
                    </div>
                    <div className="ev-request__side">
                      <span className={`ev-pill ev-pill--${tone}`}>{STATUS_LABEL[request.status] || request.status}</span>
                      {needsAttention ? (
                        <span className="ev-pill ev-pill--warn">
                          {plural(request.reminderCount, "reminder")} sent
                        </span>
                      ) : null}
                      <p className="ev-request__date">Requested {formatDate(request.requestedAt)}</p>
                      {request.submittedAt ? (
                        <p className="ev-request__date">Submitted {formatDate(request.submittedAt)}</p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>

            {pagination && pagination.totalPages > 1 ? (
              <nav className="ev-pager" aria-label="Verification request pages">
                <button
                  type="button"
                  className="ev-btn"
                  onClick={() => setPage((current) => Math.max(current - 1, 1))}
                  disabled={page <= 1 || verificationQuery.isFetching}
                >
                  Previous
                </button>
                <p className="ev-pager__status" aria-live="polite">
                  Page {pagination.page} of {pagination.totalPages} · {pagination.total}{" "}
                  {pagination.total === 1 ? "request" : "requests"}
                </p>
                <button
                  type="button"
                  className="ev-btn"
                  onClick={() => setPage((current) => Math.min(current + 1, pagination.totalPages))}
                  disabled={page >= pagination.totalPages || verificationQuery.isFetching}
                >
                  Next
                </button>
              </nav>
            ) : null}
          </>
        ) : (
          <div className="ev-empty-state">
            <IconInbox className="ev-icon ev-icon--lg" />
            <p className="ev-empty-state__title">
              {statusFilter === "All" ? "No verification requests yet" : `No ${statusFilter.toLowerCase()} requests`}
            </p>
            <p>Request one from the applicant picker above to get started.</p>
          </div>
        )}
      </div>
    </section>
  );
}
