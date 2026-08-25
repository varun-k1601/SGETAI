import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../services/api";
import { AutoDismissFeedback } from "../../components/AutoDismissFeedback";
import { getTrustScoreTag, getTrustScoreTone } from "../../utils/trustScore";

/* ===============================================================================================
   Recruiter background verification (/recruiter/background-check) — organization accounts only.
   ===============================================================================================
   The previous version of this file fetched NOTHING — zero useQuery/apiRequest calls, with a
   hardcoded `const backgroundChecks = [...]`. "Alex Rivera" / "Jamie Tanaka" / "Sasha Patel", their
   progress percentages and their five green step chips were all literals. None of it existed.

   ------------------------------------------------------------------------------------------------
   STATE HONESTY — the rule that governs this whole file
   ------------------------------------------------------------------------------------------------
   The five-step layout is rendered in full, but exactly ONE step is backed by anything real:

     Employment history  REAL. VerificationRequest (applicationId, experienceId, managerEmail).
                         triggerVerification emails the candidate's former manager; the manager
                         replies via the public POST /verification/submit; workers/verificationCron
                         sends reminders. This step's state is driven by the request's real status.

     Identity · Education · Criminal record · Reference checks
                         NO backend, no provider, no integration — anywhere in this codebase.
                         They render PERMANENTLY in the not-started visual state, are marked
                         aria-disabled, carry a visible "Not available" caption plus a title
                         attribute naming the reason, and are EXCLUDED from the progress count.

   Progress is therefore reported as "{completed} of 5 complete" over all five steps, with the bar
   filled to completed/5 — deliberately NOT completed÷available, because that arithmetic renders
   100% the moment a single manager replies, which would read as "this candidate is fully screened"
   when four of the five checks never ran. The maximum this row can currently show is 1 of 5 (20%).

   Criminal-record screening in particular is a REGULATED activity — FCRA in the US, DBS in the UK,
   and India's own framework — requiring an accredited provider and recorded candidate consent. The
   chip exists as a labelled placeholder only. No result is ever displayed for it.

   ------------------------------------------------------------------------------------------------
   DATA
   ------------------------------------------------------------------------------------------------
   GET /verification/mine (verificationController.getMyVerificationRequests, routes/verification.js)
   — org-scoped via organizationId: req.user.id inside the QUERY itself, with status filtering and
   pagination, returning a `summary` counted over the whole matched set so the KPI cards stay
   correct while paging or filtering.

   The submit form keeps the reference's three-slot row but is functional: job picker → applicant
   picker → submit, over this org's own jobs/applications (GET /jobs/mine, GET
   /jobs/:jobId/applications). Both real failure modes are surfaced BEFORE the click rather than as
   a 400/409 after it — no verifiable employment on file, or a request already pending.

   The root .background-verification is a TRANSPARENT LAYOUT CONTAINER — no background, no padding
   of its own. .main-panel already pads and scrolls this region; painting a second background here
   is the exact bug that made .pro-home render as one giant card in dark mode.
   =============================================================================================== */

// VerificationRequest.status is exactly ["Pending", "Submitted", "Expired"] (see the model). The
// reference's "Queued"/"Flagged" have no equivalent — nothing is ever queued (the email sends on
// create) and no status means flagged — so the KPI set below uses the real enum plus one derived
// count instead of showing two permanently-zero cards under invented labels.
const STATUS_FILTERS = ["All", "Pending", "Submitted", "Expired"];

const STATUS_TONE = {
  Pending: "progress",
  Submitted: "ok",
  Expired: "muted",
};

// Human wording for the raw enum. Chips filter on the enum VALUE but display this label, so a chip
// and the pills it filters to always read as the same words.
const STATUS_LABEL = {
  All: "All",
  Pending: "In progress",
  Submitted: "Completed",
  Expired: "Expired",
};

const UNAVAILABLE_REASON = "Not available — no screening provider connected";

// Order is fixed by the reference. `backed: false` steps have no implementation anywhere and can
// never report a result; nothing in this file can flip that flag.
const VERIFICATION_STEPS = [
  { key: "identity", label: "Identity verification", backed: false },
  { key: "education", label: "Education verification", backed: false },
  { key: "employment", label: "Employment history", backed: true },
  { key: "criminal", label: "Criminal record", backed: false },
  { key: "references", label: "Reference checks", backed: false },
];

const TOTAL_STEPS = VERIFICATION_STEPS.length;

function formatDate(value) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" });
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function IconCheckCircle(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
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

function IconSlash(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="m4.9 4.9 14.2 14.2" />
    </svg>
  );
}

function IconShieldCheck(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
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

function IconSend(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" />
      <path d="m21.854 2.147-10.94 10.939" />
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
    <li className={`bv-card bv-kpi${tone ? ` bv-kpi--${tone}` : ""}`}>
      <p className="bv-kpi__label">
        {icon}
        {label}
      </p>
      <p className="bv-kpi__value">{value}</p>
    </li>
  );
}

// Renders the five step chips for one request. Only the `employment` step can ever be "done", and
// only when the real VerificationRequest status says so.
function StepChips({ employmentDone, requestId }) {
  return (
    <ul className="bv-steps">
      {VERIFICATION_STEPS.map((step) => {
        if (!step.backed) {
          return (
            <li
              key={step.key}
              className="bv-step bv-step--unavailable"
              aria-disabled="true"
              title={`${step.label}: ${UNAVAILABLE_REASON}`}
            >
              <IconSlash className="bv-step__icon" />
              <span className="bv-step__label">{step.label}</span>
              {/* Visible, not just a title attribute — the state is never icon/colour-only. */}
              <span className="bv-step__note">Not available</span>
            </li>
          );
        }

        const done = employmentDone;
        return (
          <li
            key={step.key}
            className={`bv-step${done ? " bv-step--done" : " bv-step--pending"}`}
            id={`${requestId}-step-${step.key}`}
          >
            {done ? <IconCheckCircle className="bv-step__icon" /> : <IconClock className="bv-step__icon" />}
            <span className="bv-step__label">{step.label}</span>
            <span className="bv-step__note">{done ? "Verified" : "Awaiting manager"}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function RecruiterBackgroundCheckPage() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const uid = useId();
  const [feedback, setFeedback] = useState({ type: "", message: "" });
  const [selectedJobId, setSelectedJobId] = useState("");
  const [selectedApplicationId, setSelectedApplicationId] = useState("");
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
  // This organization's own auto-reject rule, so a Rejected application can be explained by the
  // rating and threshold that actually triggered it rather than left unaccounted for.
  const autoReject = verificationQuery.data?.autoReject || null;
  const summary = verificationQuery.data?.summary;
  const pagination = verificationQuery.data?.pagination;

  const triggerMutation = useMutation({
    mutationFn: (applicationId) =>
      apiRequest(`/verification/${applicationId}/trigger`, {
        method: "POST",
        token: session.accessToken,
      }),
    onSuccess: (response) => {
      setFeedback({ type: "success", message: response.message || "Verification request sent." });
      setSelectedApplicationId("");
      queryClient.invalidateQueries({ queryKey: ["verification", "mine"] });
      queryClient.invalidateQueries({
        queryKey: ["job-applications", selectedJobId, "recruiter-review"],
      });
    },
    onError: (error) => {
      setFeedback({ type: "error", message: error.message });
    },
  });

  if (!isOrganization) {
    return (
      <section className="background-verification">
        <div className="bv-card bv-state">
          <p className="bv-state__title">Background verification is organization-only</p>
          <p>This page is designed for organization accounts verifying candidates.</p>
        </div>
      </section>
    );
  }

  // ---- Eligibility, computed BEFORE submit so the button is never a guaranteed 400/409. --------
  const selectedApplication = applications.find((item) => item._id === selectedApplicationId) || null;
  const selectedSeeker = selectedApplication?.jobSeekerId || {};
  const verifiableExperience = (selectedSeeker.experience || []).find((item) =>
    String(item.managerEmail || "").trim()
  );
  const latestVerificationRequest = selectedApplication?.latestVerificationRequest;
  const alreadyPending =
    latestVerificationRequest?.status === "Pending" ||
    selectedApplication?.verificationStatus === "InProgress";
  const hasExperienceEntries = Boolean((selectedSeeker.experience || []).length);

  let ineligibleReason = "";
  if (selectedApplication) {
    if (alreadyPending) {
      ineligibleReason = `A verification request is already pending with ${
        latestVerificationRequest?.managerEmail || "the manager on file"
      }.`;
    } else if (!hasExperienceEntries) {
      ineligibleReason = "This applicant has no employment history on file, so there is no manager to contact.";
    } else if (!verifiableExperience) {
      ineligibleReason =
        "None of this applicant's experience entries include a manager email, so verification cannot be sent.";
    }
  }
  const canSubmit = Boolean(selectedApplication) && !ineligibleReason && !triggerMutation.isPending;

  const jobSelectId = `${uid}-job`;
  const applicantSelectId = `${uid}-applicant`;
  const managerFieldId = `${uid}-manager`;

  return (
    <section className="background-verification">
      {/* ---- 1. Hero ------------------------------------------------------------------------ */}
      <header className="bv-hero">
        <p className="bv-eyebrow">Trust layer</p>
        <h1 className="bv-hero__title">Background verification</h1>
        <p className="bv-hero__sub">
          We email a candidate's former manager to confirm their employment history — one manager,
          one past role, per request.
        </p>
      </header>

      <AutoDismissFeedback feedback={feedback} onClear={() => setFeedback({ type: "", message: "" })} />

      {/* ---- 2. KPI cards -------------------------------------------------------------------
          The reference's "Queued" and "Flagged" are not rendered under those names: nothing is ever
          queued (triggerVerification emails immediately on create) and no status means flagged.
          These four are the real enum plus one count derived from reminderCount, which
          verificationCron genuinely maintains. */}
      <ul className="bv-kpis">
        <KpiCard
          icon={<IconCheckCircle className="bv-icon bv-icon--sm" />}
          label="Completed"
          value={summary ? summary.Submitted : "—"}
          tone="ok"
        />
        <KpiCard
          icon={<IconClock className="bv-icon bv-icon--sm" />}
          label="In progress"
          value={summary ? summary.Pending : "—"}
          tone="progress"
        />
        <KpiCard
          icon={<IconAlertTriangle className="bv-icon bv-icon--sm" />}
          label="Needs a nudge"
          value={summary ? summary.needsAttention : "—"}
          tone="warn"
        />
        <KpiCard
          icon={<IconAlertCircle className="bv-icon bv-icon--sm" />}
          label="Expired"
          value={summary ? summary.Expired : "—"}
        />
      </ul>

      {/* ---- 3. New check card --------------------------------------------------------------- */}
      <form
        className="bv-card bv-compose"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSubmit) return;
          setFeedback({ type: "", message: "" });
          triggerMutation.mutate(selectedApplicationId);
        }}
      >
        <p className="bv-eyebrow">New check</p>
        <h2 className="bv-compose__title">Submit a candidate</h2>

        <div className="bv-compose__row">
          <div className="bv-field">
            <label className="bv-field__label" htmlFor={jobSelectId}>
              Job posting
            </label>
            <select
              id={jobSelectId}
              className="bv-input"
              value={selectedJobId}
              onChange={(event) => {
                setSelectedJobId(event.target.value);
                setSelectedApplicationId("");
              }}
            >
              <option value="">Select a posting…</option>
              {jobs.map((job) => (
                <option key={job._id} value={job._id}>
                  {job.title}
                </option>
              ))}
            </select>
          </div>

          <div className="bv-field">
            <label className="bv-field__label" htmlFor={applicantSelectId}>
              Candidate
            </label>
            <select
              id={applicantSelectId}
              className="bv-input"
              value={selectedApplicationId}
              onChange={(event) => setSelectedApplicationId(event.target.value)}
              disabled={!selectedJobId || applicationsQuery.isLoading}
              aria-describedby={ineligibleReason ? `${applicantSelectId}-reason` : undefined}
            >
              <option value="">
                {!selectedJobId
                  ? "Pick a posting first"
                  : applicationsQuery.isLoading
                    ? "Loading applicants…"
                    : applications.length
                      ? "Select a candidate…"
                      : "No applicants yet"}
              </option>
              {applications.map((application) => {
                const seeker = application.jobSeekerId || {};
                const name = `${seeker.firstName || ""} ${seeker.lastName || ""}`.trim() || "Unnamed applicant";
                const blocked =
                  application.latestVerificationRequest?.status === "Pending" ||
                  application.verificationStatus === "InProgress" ||
                  !(seeker.experience || []).some((item) => String(item.managerEmail || "").trim());

                return (
                  <option key={application._id} value={application._id}>
                    {name}
                    {blocked ? " — not eligible" : ""}
                  </option>
                );
              })}
            </select>
          </div>

          {/* The reference's second text field is an email box. The email that actually matters is
              the MANAGER's — that is who receives the request — so it is shown read-only, resolved
              from the selected applicant's experience entry, rather than as a free-text field whose
              value the API would ignore. */}
          <div className="bv-field">
            <label className="bv-field__label" htmlFor={managerFieldId}>
              Manager email
            </label>
            <input
              id={managerFieldId}
              className="bv-input"
              type="text"
              readOnly
              value={verifiableExperience?.managerEmail || ""}
              placeholder={selectedApplication ? "None on file" : "Resolved from the candidate"}
            />
          </div>

          <button type="submit" className="bv-submit" disabled={!canSubmit}>
            <IconSend className="bv-icon bv-icon--sm" />
            {triggerMutation.isPending ? "Sending…" : "Submit check"}
          </button>
        </div>

        {ineligibleReason ? (
          <p className="bv-notice bv-notice--warn" id={`${applicantSelectId}-reason`} role="status">
            <IconAlertTriangle className="bv-icon bv-icon--sm" />
            {ineligibleReason}
          </p>
        ) : selectedApplication && verifiableExperience ? (
          <p className="bv-notice" role="status">
            <IconCheckCircle className="bv-icon bv-icon--sm" />
            We'll email {verifiableExperience.managerEmail} to confirm{" "}
            {verifiableExperience.jobTitle || "this role"}
            {verifiableExperience.companyName ? ` at ${verifiableExperience.companyName}` : ""}.
          </p>
        ) : null}
      </form>

      {/* ---- 4. Check rows ------------------------------------------------------------------- */}
      <div className="bv-list-head">
        <h2 className="bv-list-head__title">Verification requests</h2>
        <div className="bv-chips" role="group" aria-label="Filter by status">
          {STATUS_FILTERS.map((filterValue) => (
            <button
              key={filterValue}
              type="button"
              aria-pressed={statusFilter === filterValue}
              className={`bv-chip${statusFilter === filterValue ? " bv-chip--on" : ""}`}
              onClick={() => {
                setStatusFilter(filterValue);
                setPage(1);
              }}
            >
              {STATUS_LABEL[filterValue] || filterValue}
              {summary ? (
                <span className="bv-chip__count">
                  {filterValue === "All" ? summary.total : summary[filterValue]}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {verificationQuery.isLoading ? (
        <p className="bv-card bv-state">Loading verification requests…</p>
      ) : verificationQuery.isError ? (
        <p className="bv-card bv-state bv-state--error">
          <IconAlertCircle className="bv-icon bv-icon--sm" />
          {verificationQuery.error?.message || "Could not load verification requests."}
        </p>
      ) : requests.length ? (
        <>
          <div className="bv-rows">
            {requests.map((request) => {
              const employmentDone = request.status === "Submitted";
              const completedSteps = employmentDone ? 1 : 0;
              // Denominator is all FIVE steps on purpose — see the file header. completed÷available
              // would render 100% off a single manager reply.
              const percent = Math.round((completedSteps / TOTAL_STEPS) * 100);
              const requestedOn = formatDate(request.requestedAt);
              const submittedOn = formatDate(request.submittedAt);
              const needsNudge = request.status === "Pending" && (request.reminderCount || 0) >= 1;
              const progressText = `${completedSteps} of ${TOTAL_STEPS} complete`;

              // Only a Submitted request has an assessment. Pending/Expired rows render no
              // feedback block at all rather than an empty labelled shell.
              const hasAssessment =
                request.status === "Submitted" && request.managerRating !== null &&
                request.managerRating !== undefined;
              const ratingTag = hasAssessment ? getTrustScoreTag(request.managerRating) : null;
              const ratingTone = hasAssessment ? getTrustScoreTone(request.managerRating) : "muted";
              // Stated only when all three are true: the rule is on, this rating is under the
              // threshold, and the application really is Rejected. Inferring it from the rating
              // and the CURRENT threshold alone would mislabel rows whose settings changed later.
              const autoRejected =
                hasAssessment &&
                Boolean(autoReject?.enabled) &&
                typeof autoReject?.threshold === "number" &&
                request.managerRating < autoReject.threshold &&
                request.applicationStatus === "Rejected";

              const metaParts = [
                request.candidateEmail,
                requestedOn ? `requested ${requestedOn}` : null,
                submittedOn ? `submitted ${submittedOn}` : null,
              ].filter(Boolean);

              return (
                <article className="bv-card bv-row" key={request._id}>
                  <div className="bv-row__head">
                    <IconShieldCheck
                      className={`bv-icon bv-row__shield${employmentDone ? " bv-row__shield--done" : ""}`}
                    />
                    <div className="bv-row__ident">
                      <p className="bv-row__name">{request.candidateName}</p>
                      <p className="bv-row__meta">{metaParts.join(" · ")}</p>
                    </div>
                    <div className="bv-row__pills">
                      {needsNudge ? (
                        <span className="bv-pill bv-pill--warn">
                          {plural(request.reminderCount, "reminder")} sent
                        </span>
                      ) : null}
                      <span className={`bv-pill bv-pill--${STATUS_TONE[request.status] || "muted"}`}>
                        {STATUS_LABEL[request.status] || request.status}
                      </span>
                    </div>
                  </div>

                  <div className="bv-progress">
                    <div className="bv-progress__labels">
                      <span className="bv-progress__caption">Progress</span>
                      <span className="bv-progress__value">{progressText}</span>
                    </div>
                    <div
                      className="bv-progress__track"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={TOTAL_STEPS}
                      aria-valuenow={completedSteps}
                      aria-valuetext={`${progressText}. Four checks are unavailable — no screening provider is connected.`}
                      aria-label={`Verification progress for ${request.candidateName}`}
                    >
                      <span className="bv-progress__fill" style={{ width: `${percent}%` }} />
                    </div>
                  </div>

                  <StepChips employmentDone={employmentDone} requestId={request._id} />

                  {hasAssessment ? (
                    <section
                      className="bv-assessment"
                      aria-labelledby={`bv-assessment-${request._id}`}
                    >
                      <div className="bv-assessment__head">
                        <p className="bv-assessment__title" id={`bv-assessment-${request._id}`}>
                          Manager assessment
                        </p>
                        <span className={`bv-pill bv-pill--${ratingTone}`}>
                          {request.managerRating} / 100 · {ratingTag}
                        </span>
                      </div>

                      <p className="bv-assessment__by">
                        {request.managerEmail}
                        {submittedOn ? ` · ${submittedOn}` : ""}
                      </p>

                      {autoRejected ? (
                        <p className="bv-assessment__auto" role="status">
                          <IconAlertTriangle className="bv-icon bv-icon--sm" />
                          <span>
                            Application automatically rejected — this rating of{" "}
                            {request.managerRating} is below your auto-reject threshold of{" "}
                            {autoReject.threshold}.{" "}
                            <Link className="bv-row__link" to="/recruiter/settings">
                              Change the threshold
                            </Link>
                          </span>
                        </p>
                      ) : null}

                      {request.managerFeedback ? (
                        <blockquote className="bv-assessment__quote">
                          {request.managerFeedback}
                        </blockquote>
                      ) : (
                        <p className="bv-assessment__none">
                          The manager submitted a rating without written comments.
                        </p>
                      )}
                    </section>
                  ) : null}

                  <p className="bv-row__foot">
                    Only employment history is verifiable on this platform — no screening provider is
                    connected for identity, education, criminal record or reference checks.
                    {request.jobId ? (
                      <>
                        {" "}
                        <Link className="bv-row__link" to={`/recruiter/applications/${request.jobId}`}>
                          {request.jobTitle ? `View ${request.jobTitle} application` : "View application"}
                        </Link>
                      </>
                    ) : null}
                  </p>
                </article>
              );
            })}
          </div>

          {pagination && pagination.totalPages > 1 ? (
            <nav className="bv-pager" aria-label="Verification request pages">
              <button
                type="button"
                className="bv-btn"
                onClick={() => setPage((current) => Math.max(current - 1, 1))}
                disabled={page <= 1 || verificationQuery.isFetching}
              >
                Previous
              </button>
              <p className="bv-pager__status" aria-live="polite">
                Page {pagination.page} of {pagination.totalPages} · {plural(pagination.total, "request")}
              </p>
              <button
                type="button"
                className="bv-btn"
                onClick={() => setPage((current) => Math.min(current + 1, pagination.totalPages))}
                disabled={page >= pagination.totalPages || verificationQuery.isFetching}
              >
                Next
              </button>
            </nav>
          ) : null}
        </>
      ) : (
        <div className="bv-card bv-empty-state">
          <IconInbox className="bv-icon bv-icon--lg" />
          <p className="bv-empty-state__title">
            {statusFilter === "All"
              ? "No verification requests yet"
              : `No ${(STATUS_LABEL[statusFilter] || statusFilter).toLowerCase()} requests`}
          </p>
          <p>Submit a candidate above to send your first verification request.</p>
        </div>
      )}
    </section>
  );
}
