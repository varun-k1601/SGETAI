import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { apiBlobRequest, apiRequest } from "../../services/api";
import { AutoDismissFeedback } from "../../components/AutoDismissFeedback";

/* ===============================================================================================
   Recruiter job applicants (/recruiter/applications/:jobId) — organization accounts only.
   ===============================================================================================
   Restyled onto the shared --ph-* / --rc-* token system used by RecruiterOverviewPage,
   RecruiterJobPostingsPage, RecruiterJobFormPage and RecruiterCandidatesPage, so all five recruiter
   surfaces read as one product. No second accent palette is declared here — .ja-* rules read the
   same --rc-accent / --rc-gradient / --rc-hero-soft as everywhere else.

   LAYOUT: the applicant list is genuinely short (often a handful of rows) while the candidate
   dossier is the long, dense side — snapshot, skills, links, resume, experience, education,
   verification state and status controls. So the narrow column holds the list (a mail-client
   sidebar) and the wide column holds the dossier, the reverse of the previous 8/4 split. Below the
   two-column breakpoint only one panel renders at a time, with a back control on the detail panel.

   The root .job-applicants is a TRANSPARENT LAYOUT CONTAINER — no background, no padding of its
   own. .main-panel already pads and scrolls this region; painting a second background here is the
   exact bug that made .pro-home render as one giant card in dark mode.

   All four real integrations are unchanged: GET /jobs/:jobId, GET /jobs/:jobId/applications,
   PUT /applications/:id/status (statusMutation), POST /verification/:applicationId/trigger
   (verificationMutation). No note field is added — there is no such field on Application and no
   endpoint to persist one, so inventing a textarea here would be exactly the kind of fabricated
   feature this codebase's other restyles have deliberately avoided.
   =============================================================================================== */

/* The recruiter's own IANA zone, read from the browser. Sent with every schedule so the event
   carries an explicit zone rather than a naive local time — Google would otherwise resolve it
   against the calendar's zone, which is not necessarily the one the recruiter is sitting in. */
function getBrowserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

// A <input type="datetime-local"> value is a naive wall-clock string with no zone. Converting it
// here would guess; instead it is sent as an ISO instant built from the browser's own clock, and
// the zone travels beside it as a name. The two together are unambiguous.
function toIsoFromLocalInput(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function formatInterviewWhen(interview) {
  if (!interview?.startAt) {
    return "";
  }

  return new Date(interview.startAt).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

/* SCHEDULING AN INTERVIEW — a deliberate action, not a side effect of a status change.

   Moving an application to "Interview" from the status buttons above creates no calendar event:
   a status change carries no time, no duration and no zone, so it could only invent them, and a
   recruiter correcting a mis-click would already have emailed the candidate an invite. Scheduling
   here is explicit, carries the time the recruiter picked, and sets the status to Interview as a
   consequence — which is unambiguously what just happened.

   The panel only appears once the acting member has connected their own Google Calendar; before
   that it says so and links to Integrations, rather than offering a form that would fail on
   submit. */
function InterviewPanel({
  application,
  candidateName,
  calendarStatus,
  onSchedule,
  onReschedule,
  onCancel,
  isBusy,
}) {
  const interview = application.interview;
  const [startAt, setStartAt] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [notes, setNotes] = useState("");

  const connected = Boolean(calendarStatus?.connected && calendarStatus?.canSchedule);

  function submit(event) {
    event.preventDefault();
    const iso = toIsoFromLocalInput(startAt);

    if (!iso) {
      return;
    }

    const payload = {
      startAt: iso,
      durationMinutes: Number(durationMinutes),
      timezone: getBrowserTimezone(),
      notes,
    };

    if (interview) {
      onReschedule({ interviewId: interview._id, ...payload });
      return;
    }

    onSchedule(payload);
  }

  return (
    <div className="ja-card" aria-labelledby="ja-interview-heading">
      <h3 className="ja-card__title" id="ja-interview-heading">
        Interview
      </h3>

      {interview ? (
        <div className="ja-interview__current">
          <p className="ja-status-current">
            Scheduled <strong>{formatInterviewWhen(interview)}</strong>
          </p>
          <p className="ja-card__desc">
            {candidateName} was invited by email and notified in SGETAI.
            {interview.meetLink ? " A Google Meet link is on the invite." : ""}
          </p>
          <div className="ja-interview__links">
            {interview.meetLink ? (
              <a className="ja-link" href={interview.meetLink} target="_blank" rel="noreferrer">
                Join Google Meet
              </a>
            ) : null}
            {interview.htmlLink ? (
              <a className="ja-link" href={interview.htmlLink} target="_blank" rel="noreferrer">
                Open in Google Calendar
              </a>
            ) : null}
          </div>
        </div>
      ) : null}

      {!connected ? (
        <p className="ja-callout">
          {calendarStatus?.configured === false
            ? "Google Calendar is not configured on this server, so interviews cannot be scheduled from here yet."
            : "Connect your Google Calendar to schedule interviews. The connection is yours alone — each teammate connects their own account."}
        </p>
      ) : (
        <form className="ja-interview__form" onSubmit={submit}>
          <label className="ja-field">
            <span>{interview ? "New date and time" : "Date and time"}</span>
            <input
              type="datetime-local"
              value={startAt}
              onChange={(event) => setStartAt(event.target.value)}
              required
            />
          </label>
          <label className="ja-field">
            <span>Duration (minutes)</span>
            <input
              type="number"
              min="5"
              max="480"
              value={durationMinutes}
              onChange={(event) => setDurationMinutes(event.target.value)}
              required
            />
          </label>
          {!interview ? (
            <label className="ja-field ja-field--wide">
              <span>Notes for the candidate (optional)</span>
              <textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
            </label>
          ) : null}
          <div className="ja-interview__actions">
            <button type="submit" className="ja-status-btn" disabled={isBusy || !startAt}>
              {interview ? "Reschedule" : "Schedule interview"}
            </button>
            {interview ? (
              <button
                type="button"
                className="ja-status-btn ja-status-btn--danger"
                disabled={isBusy}
                onClick={() => onCancel(interview._id)}
                title="Cancels the Google Calendar event as well, and notifies the candidate."
              >
                Cancel interview
              </button>
            ) : null}
          </div>
        </form>
      )}
    </div>
  );
}

const statusOptions = ["Pending", "UnderReview", "Interview", "Accepted", "Rejected"];
const statusFilters = ["All", ...statusOptions, "Withdrawn"];

// Every status pill also renders its status word, so tone is never the only signal.
const STATUS_TONE = {
  Pending: "muted",
  UnderReview: "accent",
  Interview: "accent",
  Accepted: "ok",
  Rejected: "warn",
  Withdrawn: "muted",
};

function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
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

function getInitials(firstName, lastName) {
  const initials = `${firstName?.[0] || ""}${lastName?.[0] || ""}`.trim();
  return initials.toUpperCase() || "?";
}

function downloadBlob(fileName, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName || "candidate-resume";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function openBlob(blob) {
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function IconArrowLeft(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
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

function IconMapPin(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function IconFileText(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5z" />
      <path d="M14 2v6h6" />
      <path d="M9 13h6" />
      <path d="M9 17h6" />
    </svg>
  );
}

function IconMail(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

function IconGauge(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="m12 14 4-4" />
      <path d="M3.34 19a10 10 0 1 1 17.32 0" />
    </svg>
  );
}

function IconShield(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    </svg>
  );
}

function IconAward(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <circle cx="12" cy="8" r="6" />
      <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
    </svg>
  );
}

function IconExternalLink(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  );
}

function IconDownload(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M12 15V3" />
      <path d="m7 10 5 5 5-5" />
      <path d="M20 21H4" />
    </svg>
  );
}

function IconEye(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
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

function DetailLink({ href, label }) {
  if (!href) {
    return null;
  }

  return (
    <a className="ja-link" href={href} target="_blank" rel="noreferrer">
      <IconExternalLink className="ja-icon ja-icon--sm" />
      {label}
    </a>
  );
}

export function RecruiterJobApplicantsPage() {
  const { jobId } = useParams();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [selectedApplicationId, setSelectedApplicationId] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [feedback, setFeedback] = useState({ type: "", message: "" });
  // Below the two-column breakpoint only one panel is visible at a time; this flips to the detail
  // panel on selection and back on the detail panel's own back control. Above the breakpoint both
  // panels render side by side regardless of this flag (handled purely in CSS).
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  // { id, type: "preview" | "download" } while a resume fetch is in flight, so the triggering
  // button can show a pending label and both resume actions can be disabled meanwhile.
  const [resumeAction, setResumeAction] = useState(null);

  const jobQuery = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => apiRequest(`/jobs/${jobId}`, { token: session?.accessToken }),
    enabled: Boolean(jobId && session?.accessToken),
  });

  const job = jobQuery.data?.job;

  const applicationsQuery = useQuery({
    queryKey: ["job-applications", jobId, "recruiter-review"],
    queryFn: () =>
      apiRequest(`/jobs/${jobId}/applications`, {
        token: session.accessToken,
      }),
    enabled: Boolean(session?.role === "organization" && jobId),
  });

  const allApplications = applicationsQuery.data?.applications || [];
  const filteredApplications = useMemo(() => {
    const rankedApplications = [...allApplications].sort((left, right) => {
      const scoreDifference = (right.atsScore ?? -1) - (left.atsScore ?? -1);

      if (scoreDifference !== 0) {
        return scoreDifference;
      }

      return new Date(left.createdAt || 0) - new Date(right.createdAt || 0);
    });

    if (statusFilter === "All") {
      return rankedApplications;
    }

    return rankedApplications.filter((application) => application.status === statusFilter);
  }, [allApplications, statusFilter]);

  const selectedApplication =
    filteredApplications.find((item) => item._id === selectedApplicationId) ||
    allApplications.find((item) => item._id === selectedApplicationId) ||
    filteredApplications[0] ||
    allApplications[0] ||
    null;

  const statusCounts = useMemo(() => {
    const counts = { All: allApplications.length };

    statusOptions.forEach((status) => {
      counts[status] = allApplications.filter((application) => application.status === status).length;
    });
    counts.Withdrawn = allApplications.filter((application) => application.status === "Withdrawn").length;

    return counts;
  }, [allApplications]);

  // Same status endpoint the integrations card reads. Decides whether the scheduling form is
  // offered at all, so a recruiter is never shown a form that will 400 on submit.
  const calendarStatusQuery = useQuery({
    queryKey: ["recruiter", "calendar", "status"],
    queryFn: () => apiRequest("/recruiter/calendar/status", { token: session?.accessToken }),
    enabled: Boolean(session?.accessToken),
  });

  function afterInterviewChange(response) {
    // The interview rides on the application payload, so the applicants list is what refreshes.
    queryClient.invalidateQueries({ queryKey: ["job-applications", jobId, "recruiter-review"] });
    setFeedback({ type: "success", message: response.message || "Interview updated." });
  }

  const scheduleInterviewMutation = useMutation({
    mutationFn: (body) =>
      apiRequest(`/recruiter/calendar/applications/${selectedApplication._id}/interview`, {
        method: "POST",
        token: session.accessToken,
        body,
      }),
    onSuccess: afterInterviewChange,
    onError: (error) => setFeedback({ type: "error", message: error.message }),
  });

  const rescheduleInterviewMutation = useMutation({
    mutationFn: ({ interviewId, ...body }) =>
      apiRequest(`/recruiter/calendar/interviews/${interviewId}`, {
        method: "PATCH",
        token: session.accessToken,
        body,
      }),
    onSuccess: afterInterviewChange,
    onError: (error) => setFeedback({ type: "error", message: error.message }),
  });

  const cancelInterviewMutation = useMutation({
    mutationFn: (interviewId) =>
      apiRequest(`/recruiter/calendar/interviews/${interviewId}`, {
        method: "DELETE",
        token: session.accessToken,
      }),
    onSuccess: afterInterviewChange,
    onError: (error) => setFeedback({ type: "error", message: error.message }),
  });

  const statusMutation = useMutation({
    mutationFn: (status) =>
      apiRequest(`/applications/${selectedApplication._id}/status`, {
        method: "PUT",
        token: session.accessToken,
        body: { status },
      }),
    onSuccess: (response) => {
      setFeedback({
        type: "success",
        message: response.message || "Application status updated.",
      });
      queryClient.invalidateQueries({
        queryKey: ["job-applications", jobId, "recruiter-review"],
      });
      queryClient.invalidateQueries({ queryKey: ["notifications", "recruiter"] });
    },
    onError: (error) => {
      setFeedback({ type: "error", message: error.message });
    },
  });

  async function fetchApplicationResume(applicationId, disposition = "attachment") {
    return apiBlobRequest(`/applications/${applicationId}/resume?disposition=${disposition}`, {
      token: session.accessToken,
    });
  }

  async function handleOpenResume(applicationId) {
    try {
      setFeedback({ type: "", message: "" });
      setResumeAction({ id: applicationId, type: "preview" });
      const { blob } = await fetchApplicationResume(applicationId, "inline");
      openBlob(blob);
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setResumeAction(null);
    }
  }

  async function handleDownloadResume(applicationId) {
    try {
      setFeedback({ type: "", message: "" });
      setResumeAction({ id: applicationId, type: "download" });
      const { blob, fileName } = await fetchApplicationResume(applicationId);
      downloadBlob(fileName, blob);
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setResumeAction(null);
    }
  }

  const verificationMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/verification/${selectedApplication._id}/trigger`, {
        method: "POST",
        token: session.accessToken,
      }),
    onSuccess: (response) => {
      setFeedback({
        type: "success",
        message: response.message || "Verification triggered successfully.",
      });
      queryClient.invalidateQueries({
        queryKey: ["job-applications", jobId, "recruiter-review"],
      });
      queryClient.invalidateQueries({ queryKey: ["notifications", "recruiter"] });
    },
    onError: (error) => {
      setFeedback({ type: "error", message: error.message });
    },
  });

  if (session?.role !== "organization") {
    return (
      <section className="job-applicants">
        <Link to="/recruiter/applications" className="ja-back">
          <IconArrowLeft className="ja-icon ja-icon--sm" />
          Back to job postings
        </Link>
        <div className="ja-card ja-state">
          <p className="ja-state__title">Recruiter applications is organization-only</p>
          <p>This page is designed for organization accounts reviewing candidates.</p>
        </div>
      </section>
    );
  }

  function selectApplication(applicationId) {
    setSelectedApplicationId(applicationId);
    setMobileDetailOpen(true);
  }

  function selectStatusFilter(filterValue) {
    setStatusFilter(filterValue);
    setSelectedApplicationId("");
    setMobileDetailOpen(false);
  }

  const seeker = selectedApplication?.jobSeekerId || {};
  const candidateName = `${seeker.firstName || ""} ${seeker.lastName || ""}`.trim() || "this candidate";
  const latestVerificationRequest = selectedApplication?.latestVerificationRequest;
  const hasExperienceEntries = Boolean((seeker.experience || []).length);
  const hasVerifiableExperience = Boolean(
    (seeker.experience || []).some((item) => String(item.managerEmail || "").trim())
  );
  const verificationButtonDisabled =
    verificationMutation.isPending ||
    !hasVerifiableExperience ||
    latestVerificationRequest?.status === "Pending" ||
    selectedApplication?.verificationStatus === "InProgress";
  const verificationButtonLabel =
    !hasExperienceEntries
      ? "Verification not applicable"
      : !hasVerifiableExperience
        ? "Verification unavailable"
      : latestVerificationRequest?.status === "Pending" || selectedApplication?.verificationStatus === "InProgress"
      ? "Verification in progress"
      : verificationMutation.isPending
        ? "Triggering verification..."
        : "Trigger verification";

  const hasManualResume = Boolean(
    selectedApplication?.attachedResume?.media?.filePath || selectedApplication?.attachedResume?.media?.url
  );
  const hasTailoredResume = Boolean(selectedApplication?.tailoredResume?.latex);
  const isPreviewing = Boolean(
    selectedApplication && resumeAction?.id === selectedApplication._id && resumeAction.type === "preview"
  );
  const isDownloading = Boolean(
    selectedApplication && resumeAction?.id === selectedApplication._id && resumeAction.type === "download"
  );
  const resumeActionsDisabled = isPreviewing || isDownloading;

  const jobMetaParts = [job?.location, job?.type].filter(Boolean);

  return (
    <section className="job-applicants">
      <Link to="/recruiter/applications" className="ja-back">
        <IconArrowLeft className="ja-icon ja-icon--sm" />
        Back to job postings
      </Link>

      <AutoDismissFeedback
        feedback={feedback}
        onClear={() => setFeedback({ type: "", message: "" })}
      />

      <header className="ja-hero">
        <div className="ja-hero__text">
          <p className="ja-eyebrow">Pipeline</p>
          <h1 className="ja-hero__title">
            {jobQuery.isLoading ? "Loading job…" : job?.title || "Applicants"}
          </h1>
          {jobMetaParts.length ? (
            <p className="ja-hero__meta">
              <IconMapPin className="ja-icon ja-icon--sm" />
              {jobMetaParts.join(" · ")}
            </p>
          ) : null}
        </div>
        {job ? (
          <span className="ja-pill ja-pill--accent ja-hero__count">
            <IconUsers className="ja-icon ja-icon--sm" />
            {plural(allApplications.length, "applicant")}
          </span>
        ) : null}
      </header>

      {jobQuery.isError ? (
        <p className="ja-card ja-state ja-state--error">
          {jobQuery.error?.message || "Could not load this job posting."}
        </p>
      ) : null}

      <div className="ja-chips" role="group" aria-label="Filter applicants by status">
        {statusFilters.map((filterValue) => {
          const count = statusCounts[filterValue] ?? 0;
          return (
            <button
              key={filterValue}
              type="button"
              aria-pressed={statusFilter === filterValue}
              className={`ja-chip${statusFilter === filterValue ? " ja-chip--on" : ""}${
                count === 0 ? " ja-chip--zero" : ""
              }`}
              onClick={() => selectStatusFilter(filterValue)}
            >
              {filterValue}
              <span className="ja-chip__count">{count}</span>
            </button>
          );
        })}
      </div>

      <div className={`ja-split${mobileDetailOpen ? " ja-split--detail" : ""}`}>
        <nav className="ja-list" aria-label="Applicants" role="listbox">
          {applicationsQuery.isLoading ? (
            <p className="ja-empty">Loading applicants…</p>
          ) : applicationsQuery.isError ? (
            <p className="ja-empty ja-empty--error">
              <IconAlertCircle className="ja-icon" />
              {applicationsQuery.error?.message || "Could not load applicants."}
            </p>
          ) : filteredApplications.length ? (
            filteredApplications.map((application) => {
              const applicant = application.jobSeekerId || {};
              const applicantName = `${applicant.firstName || ""} ${applicant.lastName || ""}`.trim() || "Unnamed applicant";
              const selected = selectedApplication?._id === application._id;
              const tone = STATUS_TONE[application.status] || "muted";
              const hasResume = Boolean(
                application.attachedResume?.media?.filePath ||
                  application.attachedResume?.media?.url ||
                  application.tailoredResume?.latex
              );

              return (
                <button
                  key={application._id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`ja-row${selected ? " ja-row--selected" : ""}`}
                  onClick={() => selectApplication(application._id)}
                >
                  <span className="ja-row__accent" aria-hidden="true" />
                  <span className="ja-avatar" aria-hidden="true">
                    {getInitials(applicant.firstName, applicant.lastName)}
                  </span>
                  <span className="ja-row__body">
                    <span className="ja-row__name">{applicantName}</span>
                    <span className="ja-row__metaline">
                      <span className={`ja-pill ja-pill--${tone}`}>{application.status}</span>
                      <span className="ja-row__match">Match {application.atsScore ?? 0}</span>
                    </span>
                  </span>
                  {hasResume ? (
                    <span className="ja-row__resume" title="Resume attached" aria-label="Resume attached">
                      <IconFileText className="ja-icon ja-icon--sm" />
                    </span>
                  ) : null}
                </button>
              );
            })
          ) : (
            <p className="ja-empty">No applicants matched the current filter.</p>
          )}
        </nav>

        <div className="ja-detail">
          {selectedApplication ? (
            <>
              <button type="button" className="ja-detail__back" onClick={() => setMobileDetailOpen(false)}>
                <IconArrowLeft className="ja-icon ja-icon--sm" />
                Back to applicants
              </button>

              <div className="ja-card ja-candidate-card">
                <div className="ja-candidate-head">
                  <span className="ja-avatar ja-avatar--lg" aria-hidden="true">
                    {getInitials(seeker.firstName, seeker.lastName)}
                  </span>
                  <div className="ja-candidate-head__body">
                    <p className="ja-eyebrow">Candidate detail</p>
                    <h2 className="ja-candidate-head__name">
                      {seeker.firstName} {seeker.lastName}
                    </h2>
                  </div>
                  <span
                    className={`ja-pill ja-pill--${STATUS_TONE[selectedApplication.status] || "muted"} ja-candidate-head__status`}
                  >
                    {selectedApplication.status}
                  </span>
                </div>

                <dl className="ja-stats">
                  <div className="ja-stat">
                    <dt>
                      <IconMail className="ja-icon ja-icon--sm" />
                      Email
                    </dt>
                    <dd>{seeker.email || "Not available"}</dd>
                  </div>
                  <div className="ja-stat">
                    <dt>
                      <IconGauge className="ja-icon ja-icon--sm" />
                      Match score
                    </dt>
                    <dd>{selectedApplication.atsScore ?? 0}</dd>
                  </div>
                  <div className="ja-stat">
                    <dt>
                      <IconShield className="ja-icon ja-icon--sm" />
                      Verification
                    </dt>
                    <dd>{selectedApplication.verificationStatus || "Pending"}</dd>
                  </div>
                  <div className="ja-stat">
                    <dt>
                      <IconAward className="ja-icon ja-icon--sm" />
                      Trust score
                    </dt>
                    <dd>{selectedApplication.trustScore ?? 0}</dd>
                  </div>
                  {Number.isFinite(selectedApplication.resumeMatchScore) && (
                    <div className="ja-stat">
                      <dt>
                        <IconGauge className="ja-icon ja-icon--sm" />
                        Resume score
                      </dt>
                      <dd>{selectedApplication.resumeMatchScore}</dd>
                    </div>
                  )}
                </dl>
              </div>

              <div className="ja-card">
                <h3 className="ja-card__title">Candidate snapshot</h3>
                <p className="ja-card__desc">
                  {seeker.tagline || seeker.bio || "No short profile summary available yet."}
                </p>
                <div className="ja-minigrid">
                  <div>
                    <p className="ja-minigrid__label">Current status</p>
                    <p className="ja-minigrid__value">{seeker.currentStatus || "Not specified"}</p>
                  </div>
                  <div>
                    <p className="ja-minigrid__label">Open to work</p>
                    <p className="ja-minigrid__value">{seeker.openToWork ? "Yes" : "No"}</p>
                  </div>
                </div>
              </div>

              <div className="ja-card">
                <h3 className="ja-card__title">Skills</h3>
                <div className="ja-tags">
                  {(seeker.skills || []).map((skill) => (
                    <span key={skill} className="ja-tag">
                      {skill}
                    </span>
                  ))}
                  {!seeker.skills?.length ? <p className="ja-card__empty">No skills listed</p> : null}
                </div>
              </div>

              <div className="ja-pair">
                <div className="ja-card">
                  <h3 className="ja-card__title">Preferred roles</h3>
                  <div className="ja-tags">
                    {(seeker.preferredRoles || []).map((role) => (
                      <span key={role} className="ja-tag">
                        {role}
                      </span>
                    ))}
                    {!seeker.preferredRoles?.length ? (
                      <p className="ja-card__empty">No preferred roles listed</p>
                    ) : null}
                  </div>
                </div>

                <div className="ja-card">
                  <h3 className="ja-card__title">Professional links</h3>
                  {seeker.portfolioUrl || seeker.linkedinUrl || seeker.githubUrl ? (
                    <div className="ja-links">
                      <DetailLink href={seeker.portfolioUrl} label="Portfolio" />
                      <DetailLink href={seeker.linkedinUrl} label="LinkedIn" />
                      <DetailLink href={seeker.githubUrl} label="GitHub" />
                    </div>
                  ) : (
                    <p className="ja-card__empty">No professional links shared yet.</p>
                  )}
                </div>
              </div>

              <div className="ja-card">
                <h3 className="ja-card__title">Resume</h3>
                {hasManualResume ? (
                  <div className="ja-resume">
                    <p className="ja-resume__title">
                      {selectedApplication.attachedResume.originalName || "Manual resume"}
                    </p>
                    <p className="ja-resume__desc">
                      The applicant manually attached this resume during application submission.
                    </p>
                    <div className="ja-resume__actions">
                      <button
                        type="button"
                        className="ja-btn ja-btn--outline"
                        disabled={resumeActionsDisabled}
                        onClick={() => handleOpenResume(selectedApplication._id)}
                      >
                        <IconEye className="ja-icon ja-icon--sm" />
                        {isPreviewing ? "Opening…" : "Preview resume"}
                      </button>
                      <button
                        type="button"
                        className="ja-btn ja-btn--primary"
                        disabled={resumeActionsDisabled}
                        onClick={() => handleDownloadResume(selectedApplication._id)}
                      >
                        <IconDownload className="ja-icon ja-icon--sm" />
                        {isDownloading ? "Preparing download…" : "Download resume"}
                      </button>
                    </div>
                  </div>
                ) : hasTailoredResume ? (
                  <div className="ja-resume">
                    <p className="ja-resume__title">Job-matched resume attached</p>
                    <p className="ja-resume__desc">
                      This resume was generated from the applicant profile for this job. Education is
                      included in every generated resume.
                    </p>
                    <div className="ja-resume__actions">
                      <button
                        type="button"
                        className="ja-btn ja-btn--outline"
                        disabled={resumeActionsDisabled}
                        onClick={() => handleOpenResume(selectedApplication._id)}
                      >
                        <IconEye className="ja-icon ja-icon--sm" />
                        {isPreviewing ? "Opening…" : "Preview resume"}
                      </button>
                      <button
                        type="button"
                        className="ja-btn ja-btn--primary"
                        disabled={resumeActionsDisabled}
                        onClick={() => handleDownloadResume(selectedApplication._id)}
                      >
                        <IconDownload className="ja-icon ja-icon--sm" />
                        {isDownloading ? "Preparing download…" : "Download tailored resume PDF"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="ja-card__empty">No resume is attached to this application.</p>
                )}
              </div>

              <div className="ja-pair">
                <div className="ja-card">
                  <h3 className="ja-card__title">Experience summary</h3>
                  <ul className="ja-entries">
                    {(seeker.experience || [])
                      .slice(-3)
                      .reverse()
                      .map((item) => (
                        <li key={item._id || `${item.companyName}-${item.jobTitle}`} className="ja-entry">
                          <p className="ja-entry__title">{item.jobTitle || "Untitled role"}</p>
                          <p className="ja-entry__sub">{item.companyName || "Unknown company"}</p>
                          <p className="ja-entry__meta">
                            {item.isCurrent ? "Current role" : formatDate(item.endDate)} ·{" "}
                            {item.verificationStatus || "Pending verification"}
                          </p>
                        </li>
                      ))}
                  </ul>
                  {!seeker.experience?.length ? (
                    <p className="ja-card__empty">No experience entries shared yet.</p>
                  ) : null}
                </div>

                <div className="ja-card">
                  <h3 className="ja-card__title">Education summary</h3>
                  <ul className="ja-entries">
                    {(seeker.education || [])
                      .slice(-2)
                      .reverse()
                      .map((item) => (
                        <li key={item._id || `${item.institution}-${item.degree}`} className="ja-entry">
                          <p className="ja-entry__title">{item.degree || "Degree not specified"}</p>
                          <p className="ja-entry__sub">{item.institution || "Institution not specified"}</p>
                          <p className="ja-entry__meta">{item.fieldOfStudy || "Field not specified"}</p>
                        </li>
                      ))}
                  </ul>
                  {!seeker.education?.length ? (
                    <p className="ja-card__empty">No education entries shared yet.</p>
                  ) : null}
                </div>
              </div>

              <div className="ja-card">
                <h3 className="ja-card__title">Verification state</h3>
                {!latestVerificationRequest ? (
                  <div className="ja-verify">
                    <p className="ja-verify__title">Verification not started</p>
                    <p className="ja-card__desc">
                      No verification request has been sent yet for this application. Use the action
                      below when you want to begin the background check.
                    </p>
                  </div>
                ) : (
                  <div className="ja-verify">
                    <p className="ja-verify__title">
                      {latestVerificationRequest.status === "Pending"
                        ? "Manager response pending"
                        : latestVerificationRequest.status === "Submitted"
                          ? "Manager submitted verification"
                          : "Verification request expired"}
                    </p>
                    <div className="ja-kv">
                      <div className="ja-kv__row">
                        <span>Requested</span>
                        <span>{formatDate(latestVerificationRequest.requestedAt)}</span>
                      </div>
                      <div className="ja-kv__row">
                        <span>Manager email</span>
                        <span>{latestVerificationRequest.managerEmail || "Not available"}</span>
                      </div>
                      <div className="ja-kv__row">
                        <span>Grace period ends</span>
                        <span>{formatDate(latestVerificationRequest.gracePeriodEndsAt)}</span>
                      </div>
                      <div className="ja-kv__row">
                        <span>Next reminder</span>
                        <span>{formatDate(latestVerificationRequest.nextReminderAt)}</span>
                      </div>
                      <div className="ja-kv__row">
                        <span>Reminder count</span>
                        <span>{latestVerificationRequest.reminderCount ?? 0}</span>
                      </div>
                      {latestVerificationRequest.submittedAt ? (
                        <div className="ja-kv__row">
                          <span>Submitted</span>
                          <span>{formatDate(latestVerificationRequest.submittedAt)}</span>
                        </div>
                      ) : null}
                    </div>
                    {selectedApplication.verificationStatus === "Verified" ? (
                      <p className="ja-card__desc">
                        Verification completed with trust tag{" "}
                        <strong>{selectedApplication.trustScoreTag || "Not available"}</strong>.
                        {selectedApplication.status === "Rejected"
                          ? " This application is currently in a rejected state after verification."
                          : ""}
                      </p>
                    ) : null}
                  </div>
                )}
              </div>

              <InterviewPanel
                application={selectedApplication}
                candidateName={candidateName}
                calendarStatus={calendarStatusQuery.data}
                onSchedule={(body) => {
                  setFeedback({ type: "", message: "" });
                  scheduleInterviewMutation.mutate(body);
                }}
                onReschedule={(body) => {
                  setFeedback({ type: "", message: "" });
                  rescheduleInterviewMutation.mutate(body);
                }}
                onCancel={(interviewId) => {
                  setFeedback({ type: "", message: "" });
                  cancelInterviewMutation.mutate(interviewId);
                }}
                isBusy={
                  scheduleInterviewMutation.isPending ||
                  rescheduleInterviewMutation.isPending ||
                  cancelInterviewMutation.isPending
                }
              />

              <div className="ja-card" aria-labelledby="ja-status-heading">
                <h3 className="ja-card__title" id="ja-status-heading">
                  Update status
                </h3>
                <p className="ja-status-current">
                  Current status{" "}
                  <span className={`ja-pill ja-pill--${STATUS_TONE[selectedApplication.status] || "muted"}`}>
                    {selectedApplication.status}
                  </span>
                </p>
                <div className="ja-status-actions" role="group" aria-label="Move to a different status">
                  {statusOptions
                    .filter((status) => status !== selectedApplication.status)
                    .map((status) => (
                      <button
                        key={status}
                        type="button"
                        disabled={statusMutation.isPending}
                        onClick={() => {
                          setFeedback({ type: "", message: "" });
                          statusMutation.mutate(status);
                        }}
                        aria-label={`Mark ${candidateName} as ${status}`}
                        className={`ja-status-btn${
                          status === "Rejected" ? " ja-status-btn--danger" : ""
                        }`}
                      >
                        Mark {status}
                      </button>
                    ))}
                </div>

                {!hasExperienceEntries ? (
                  <p className="ja-callout">
                    This applicant has not added work experience, so background verification is not
                    applicable yet. You can still move the application through Pending, UnderReview,
                    Accepted, or Rejected.
                  </p>
                ) : !hasVerifiableExperience ? (
                  <p className="ja-callout">
                    This applicant has experience entries, but none include a manager email for
                    background verification. You can still mark the application status without
                    triggering verification.
                  </p>
                ) : null}

                <button
                  type="button"
                  disabled={verificationButtonDisabled}
                  onClick={() => {
                    setFeedback({ type: "", message: "" });
                    verificationMutation.mutate();
                  }}
                  className="ja-btn ja-btn--primary ja-btn--block"
                >
                  {verificationButtonLabel}
                </button>
              </div>
            </>
          ) : (
            <div className="ja-empty-state">
              <IconInbox className="ja-icon ja-icon--lg" />
              <p className="ja-empty-state__title">
                {applicationsQuery.isLoading ? "Loading applicants…" : "No applicant selected"}
              </p>
              <p>
                {applicationsQuery.isLoading
                  ? "Fetching this posting's applicants."
                  : "Select an applicant from the list to review status controls and verification actions."}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
