import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../services/api";
import { ConfirmDeleteModal } from "../../components/ConfirmDeleteModal";

function timeAgo(dateString) {
  if (!dateString) return "—";
  const diffMs = Date.now() - new Date(dateString).getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return "Today";
  if (days === 1) return "1d ago";
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

// Job.status is exactly ["Draft", "Active", "Closed"], so these chips are the enum itself plus an
// "All" passthrough — no mapping, and no chip that can never match anything.
const FILTERS = ["All", "Active", "Draft", "Closed"];

// Every pill renders its status word too, so the tone is decoration, never the only signal.
const STATUS_TONE = { Active: "ok", Draft: "accent", Closed: "muted" };

function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function IconBriefcase(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      <rect width="20" height="14" x="2" y="6" rx="2" />
    </svg>
  );
}

function IconDraft(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M12.659 22H18a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v9.34" />
      <path d="M14 2v5a1 1 0 0 0 1 1h5" />
      <path d="M10.378 12.622a1 1 0 0 1 3 3.003L8.36 20.637a2 2 0 0 1-.854.506l-2.867.837a.5.5 0 0 1-.62-.62l.836-2.869a2 2 0 0 1 .506-.853z" />
    </svg>
  );
}

function IconUsers(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <path d="M16 3.128a4 4 0 0 1 0 7.744" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <circle cx="9" cy="7" r="4" />
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

function IconArchive(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <rect width="20" height="5" x="2" y="3" rx="1" />
      <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
      <path d="M10 12h4" />
    </svg>
  );
}

function IconTrash(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function IconPlus(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}

export function RecruiterJobPostingsPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [activeFilter, setActiveFilter] = useState("All");
  // { job, action: "close" | "delete" }. Close and delete each raise their own dialog with its own
  // wording and its own button label, so the two can never be confused at the point of confirming.
  const [pendingAction, setPendingAction] = useState(null);

  const jobsQuery = useQuery({
    queryKey: ["jobs", "recruiter-postings"],
    queryFn: () =>
      apiRequest("/jobs/mine?status=All", {
        token: session.accessToken,
      }),
    enabled: session?.role === "organization",
  });

  const closeJobMutation = useMutation({
    mutationFn: (jobId) =>
      apiRequest(`/jobs/${jobId}/close`, {
        method: "PUT",
        token: session.accessToken,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs", "recruiter-postings"] });
    },
  });

  const deleteJobMutation = useMutation({
    mutationFn: (jobId) =>
      apiRequest(`/jobs/${jobId}`, {
        method: "DELETE",
        token: session.accessToken,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs", "recruiter-postings"] });
    },
    onError: (error) => {
      window.alert(error.message);
    },
  });

  const jobPostings = jobsQuery.data?.jobs || [];
  const avgTimeToFillDays = jobsQuery.data?.avgTimeToFillDays ?? null;

  // One request, filtered in memory. /jobs/mine does support ?status=, but every chip also has to
  // show a live count for the other three states, so the full set has to be in hand regardless —
  // refetching per chip would mean four requests to render what one already answers.
  const filteredPostings = useMemo(
    () =>
      activeFilter === "All"
        ? jobPostings
        : jobPostings.filter((job) => job.status === activeFilter),
    [jobPostings, activeFilter]
  );

  const activeCount = jobPostings.filter((job) => job.status === "Active").length;
  const draftCount = jobPostings.filter((job) => job.status === "Draft").length;
  const closedCount = jobPostings.filter((job) => job.status === "Closed").length;
  const totalApplicants = jobPostings.reduce((sum, job) => sum + (job.applicationCount || 0), 0);

  const filterCounts = {
    All: jobPostings.length,
    Active: activeCount,
    Draft: draftCount,
    Closed: closedCount,
  };

  // The server refuses DELETE on any job that has applications: jobController.deleteJob counts
  // them first and returns 400 telling the recruiter to close it instead. Mirroring that rule here
  // means the destructive control is simply unavailable where it could not have worked, rather
  // than being offered, confirmed, and only then rejected.
  function canDelete(job) {
    return (job.applicationCount || 0) === 0;
  }

  function handleConfirm() {
    if (!pendingAction) return;
    const { job, action } = pendingAction;
    if (action === "close") {
      closeJobMutation.mutate(job._id);
    } else {
      deleteJobMutation.mutate(job._id);
    }
    setPendingAction(null);
  }

  function handleJobClick(job) {
    navigate(`/recruiter/job-postings/${job._id}`);
  }

  function buildDialog() {
    if (!pendingAction) return null;
    const { job, action } = pendingAction;
    const applicants = plural(job.applicationCount || 0, "applicant");

    if (action === "close") {
      return {
        title: "Close this posting?",
        confirmLabel: "Close posting",
        destructive: false,
        message: `"${job.title}" will stop accepting new applications. Its ${applicants} stay available for review, and you can still open the posting to edit it.`,
      };
    }

    return {
      title: "Delete this posting?",
      confirmLabel: "Delete posting",
      destructive: true,
      message: `"${job.title}" will be permanently deleted. It has ${applicants}, so no candidate records are affected. This cannot be undone.`,
    };
  }

  const dialog = buildDialog();

  return (
    <section className="job-postings">
      <header className="jp-hero">
        <div className="jp-hero__text">
          <p className="jp-eyebrow">Hiring</p>
          <h1 className="jp-hero__title">Job postings</h1>
          {/* Nothing sources candidates on a schedule: auto-apply runs on job create/publish and
              on a threshold change, and the only cron workers reset daily counters and send
              verification reminders. So this says what actually happens. */}
          <p className="jp-hero__sub">
            {plural(jobPostings.length, "posting")} · AI matches candidates as they apply.
          </p>
        </div>
        <button
          type="button"
          className="jp-btn jp-btn--primary"
          onClick={() => navigate("/recruiter/job-postings/new")}
        >
          <IconPlus className="jp-icon" />
          New posting
        </button>
      </header>

      {/* No KPI carries a delta chip: /jobs/mine returns current values only, with no prior-period
          cohort to compare any of them against. */}
      <ul className="jp-kpis">
        <li className="jp-card jp-kpi">
          <p className="jp-kpi__label">
            <IconBriefcase className="jp-icon jp-icon--sm" />
            Active
          </p>
          <p className="jp-kpi__value">{activeCount}</p>
        </li>

        <li className="jp-card jp-kpi">
          <p className="jp-kpi__label">
            <IconDraft className="jp-icon jp-icon--sm" />
            Drafts
          </p>
          <p className="jp-kpi__value">{draftCount}</p>
        </li>

        <li className="jp-card jp-kpi">
          <p className="jp-kpi__label">
            <IconUsers className="jp-icon jp-icon--sm" />
            Applicants
          </p>
          <p className="jp-kpi__value">{totalApplicants}</p>
          <p className="jp-kpi__helper">Across every posting</p>
        </li>

        <li className="jp-card jp-kpi">
          <p className="jp-kpi__label">
            <IconClock className="jp-icon jp-icon--sm" />
            Avg time-to-fill
          </p>
          {avgTimeToFillDays !== null ? (
            <>
              <p className="jp-kpi__value">{Math.round(avgTimeToFillDays)}d</p>
              <p className="jp-kpi__helper">Created to first accepted hire</p>
            </>
          ) : (
            <>
              <p className="jp-kpi__value jp-kpi__value--none">—</p>
              <p className="jp-kpi__helper">No accepted hires yet</p>
            </>
          )}
        </li>
      </ul>

      <div className="jp-chips" role="group" aria-label="Filter postings by status">
        {FILTERS.map((filter) => (
          <button
            key={filter}
            type="button"
            className={`jp-chip${activeFilter === filter ? " jp-chip--on" : ""}`}
            aria-pressed={activeFilter === filter}
            onClick={() => setActiveFilter(filter)}
          >
            {filter}
            <span className="jp-chip__count">{filterCounts[filter]}</span>
          </button>
        ))}
      </div>

      {jobsQuery.isLoading ? (
        <p className="jp-card jp-state">Loading job postings...</p>
      ) : jobsQuery.isError ? (
        <p className="jp-card jp-state jp-state--error">
          {jobsQuery.error?.message || "Could not load your job postings."}
        </p>
      ) : jobPostings.length === 0 ? (
        <div className="jp-card jp-state">
          <p className="jp-state__title">No postings yet</p>
          <p>Create your first posting and candidates can start applying to it.</p>
          <button
            type="button"
            className="jp-btn jp-btn--primary"
            onClick={() => navigate("/recruiter/job-postings/new")}
          >
            <IconPlus className="jp-icon" />
            New posting
          </button>
        </div>
      ) : filteredPostings.length === 0 ? (
        <p className="jp-card jp-state">No job postings found for the selected filter.</p>
      ) : (
        <ul className="jp-rows">
          {filteredPostings.map((job) => {
            const applicants = job.applicationCount || 0;
            const applicantLabel = plural(applicants, "applicant");
            const deletable = canDelete(job);
            const tone = STATUS_TONE[job.status] || "muted";

            return (
              <li key={job._id} className="jp-card jp-row">
                {/* The row's navigation is a real button rather than a click handler on the card,
                    so it is keyboard-reachable — and the two action buttons are its siblings, not
                    controls nested inside another control. */}
                <button
                  type="button"
                  className="jp-row__main"
                  onClick={() => handleJobClick(job)}
                  aria-label={`${job.title}, ${job.status}, ${applicantLabel}. Open to edit.`}
                >
                  <span className="jp-tile">
                    <IconBriefcase className="jp-icon jp-icon--lg" />
                  </span>

                  <span className="jp-row__body">
                    <span className="jp-row__title">{job.title}</span>
                    <span className="jp-row__meta">
                      {job.industry || "General"} · {job.location || "Remote"} ·{" "}
                      {job.type || "Full-time"}
                    </span>
                    <span className="jp-row__pills">
                      <span className={`jp-pill jp-pill--${tone}`}>{job.status}</span>
                      {/* Job stores no publish date, only createdAt, so this is labelled as
                          creation rather than dressed up as a posted age it cannot know. */}
                      <span className="jp-pill">Created {timeAgo(job.createdAt)}</span>
                      {job.postedBy?.name && (
                        <span className="jp-pill">Posted by {job.postedBy.name}</span>
                      )}
                    </span>
                  </span>

                </button>

                {/* THE ENTRY POINT for /recruiter/applications/:jobId. This count used to sit
                    inside the button above, so the one number a recruiter wants to click opened
                    the EDITOR instead of the applicant list. It is now a real link, a sibling of
                    the button rather than nested inside it, so Tab reaches it in order and the
                    applicant list is reachable from the page a recruiter is already on. */}
                <Link
                  className="jp-row__count"
                  to={`/recruiter/applications/${job._id}`}
                  aria-label={
                    applicants
                      ? `View ${applicantLabel} for ${job.title}`
                      : `${job.title} has no applicants yet. Open the applicant list.`
                  }
                  title={`View applicants for ${job.title}`}
                >
                  <span className="jp-row__countValue">{applicants}</span>
                  {/* "View applicants", not "Applicants" — the word that makes it discoverable as
                      a destination rather than a statistic. Colour and hover alone would not. */}
                  <span className="jp-row__countLabel">View applicants</span>
                </Link>

                <div className="jp-row__actions">
                  {job.status !== "Closed" && (
                    <button
                      type="button"
                      className="jp-action"
                      onClick={() => setPendingAction({ job, action: "close" })}
                      disabled={closeJobMutation.isPending}
                      aria-label={`Close ${job.title}`}
                      title={`Close ${job.title}`}
                    >
                      <IconArchive className="jp-icon" />
                    </button>
                  )}

                  <button
                    type="button"
                    className="jp-action jp-action--danger"
                    onClick={() => setPendingAction({ job, action: "delete" })}
                    disabled={deleteJobMutation.isPending || !deletable}
                    aria-label={
                      deletable
                        ? `Delete ${job.title}`
                        : `Cannot delete ${job.title}. It has ${applicantLabel} — close it instead.`
                    }
                    title={
                      deletable
                        ? `Delete ${job.title}`
                        : `Cannot delete: this posting has ${applicantLabel}. Close it instead.`
                    }
                  >
                    <IconTrash className="jp-icon" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {dialog && (
        <ConfirmDeleteModal
          title={dialog.title}
          message={dialog.message}
          confirmLabel={dialog.confirmLabel}
          destructive={dialog.destructive}
          onConfirm={handleConfirm}
          onCancel={() => setPendingAction(null)}
        />
      )}
    </section>
  );
}
