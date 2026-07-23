import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { apiBlobRequest, apiRequest } from "../../services/api";
import { AutoDismissFeedback } from "../../components/AutoDismissFeedback";

const statusOptions = ["Pending", "UnderReview", "Interview", "Accepted", "Rejected"];
const statusFilters = ["All", ...statusOptions, "Withdrawn"];

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

function ApplicationListCard({ application, selected, onSelect }) {
  const seeker = application.jobSeekerId || {};
  const verificationLabel =
    application.latestVerificationRequest?.status === "Pending"
      ? "Verification running"
      : application.latestVerificationRequest?.status === "Submitted"
        ? "Manager responded"
        : application.latestVerificationRequest?.status === "Expired"
          ? "Verification expired"
          : "Not started";
  const hasResume = Boolean(
    application.attachedResume?.media?.filePath ||
      application.attachedResume?.media?.url ||
      application.tailoredResume?.latex
  );

  return (
    <div
      onClick={() => onSelect(application)}
      className={`w-full cursor-pointer rounded-2xl border p-5 text-left backdrop-blur-xl shadow-elegant transition ${
        selected
          ? "border-transparent bg-gradient-recruiter text-recruiter-foreground shadow-recruiter"
          : "border-border/60 bg-card/70 hover:border-border"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            {seeker.firstName} {seeker.lastName}
          </p>
          <p className={`truncate text-xs ${selected ? "opacity-80" : "text-muted-foreground"}`}>
            {seeker.email}
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
            selected ? "border-white/30 bg-white/10" : "border-border/60 bg-surface/70 text-muted-foreground"
          }`}
        >
          {application.status}
        </span>
      </div>
      <div
        className={`mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs ${
          selected ? "opacity-80" : "text-muted-foreground"
        }`}
      >
        <span>ATS {application.atsScore ?? 0}</span>
        <span>{verificationLabel}</span>
        {hasResume && <span>Resume attached</span>}
      </div>
    </div>
  );
}

function DetailLink({ href, label }) {
  if (!href) {
    return null;
  }

  return (
    <a
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium hover:bg-surface/80"
      href={href}
      target="_blank"
      rel="noreferrer"
    >
      {label}
    </a>
  );
}

function DetailSectionHeading({ children }) {
  return <h4 className="font-display text-sm font-semibold">{children}</h4>;
}

export function RecruiterJobApplicantsPage() {
  const { jobId } = useParams();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [selectedApplicationId, setSelectedApplicationId] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [feedback, setFeedback] = useState({ type: "", message: "" });

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

    return counts;
  }, [allApplications]);

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
      const { blob } = await fetchApplicationResume(applicationId, "inline");
      openBlob(blob);
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    }
  }

  async function handleDownloadResume(applicationId) {
    try {
      setFeedback({ type: "", message: "" });
      const { blob, fileName } = await fetchApplicationResume(applicationId);
      downloadBlob(fileName, blob);
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
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
      <main className="flex-1 px-6 py-6 lg:px-8 lg:py-8">
        <div className="rounded-2xl border border-border/60 bg-card/70 p-8 text-center text-muted-foreground">
          <h3 className="font-display text-lg font-semibold text-foreground">
            Recruiter applications is organization-only
          </h3>
          <p className="mt-1 text-sm">This page is designed for organization accounts reviewing candidates.</p>
        </div>
      </main>
    );
  }

  const seeker = selectedApplication?.jobSeekerId || {};
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

  return (
    <main className="flex-1 px-6 py-6 lg:px-8 lg:py-8">
      <Link
        to="/recruiter/applications"
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        ← Back to jobs
      </Link>

      <AutoDismissFeedback
        feedback={feedback}
        onClear={() => setFeedback({ type: "", message: "" })}
      />

      <div className="mt-4 grid grid-cols-12 gap-6">
        <div className="col-span-12 space-y-6 lg:col-span-8">
          <article className="rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-5 shadow-elegant">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-lg font-semibold">
                  {jobQuery.isLoading ? "Loading job..." : job?.title || "Applicants"}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {job?.location || "Filter by pipeline stage to focus on the candidates that need action now."}
                </p>
              </div>
              {job ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-surface/70 px-2.5 py-0.5 text-xs font-medium">
                  {allApplications.length} applicants
                </span>
              ) : null}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {statusFilters.map((filterValue) => (
                <button
                  key={filterValue}
                  type="button"
                  onClick={() => {
                    setStatusFilter(filterValue);
                    setSelectedApplicationId("");
                  }}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    statusFilter === filterValue
                      ? "border-transparent bg-gradient-recruiter text-recruiter-foreground shadow-recruiter"
                      : "border-border bg-surface/70 text-muted-foreground hover:bg-surface"
                  }`}
                >
                  {filterValue} ({statusCounts[filterValue] ?? 0})
                </button>
              ))}
            </div>

            {applicationsQuery.isLoading ? (
              <p className="mt-4 text-sm text-muted-foreground">Loading applicants...</p>
            ) : (
              <div className="mt-4 space-y-3">
                {filteredApplications.map((application) => (
                  <ApplicationListCard
                    key={application._id}
                    application={application}
                    selected={selectedApplication?._id === application._id}
                    onSelect={(item) => setSelectedApplicationId(item._id)}
                  />
                ))}
                {!filteredApplications.length ? (
                  <p className="text-sm text-muted-foreground">No applicants matched the current filter.</p>
                ) : null}
              </div>
            )}
          </article>
        </div>

        <aside className="col-span-12 lg:col-span-4">
          <article className="rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-5 shadow-elegant">
            {selectedApplication ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gradient-recruiter text-sm font-semibold text-recruiter-foreground">
                      {getInitials(seeker.firstName, seeker.lastName)}
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        Candidate Detail
                      </p>
                      <h3 className="font-display text-lg font-semibold">
                        {seeker.firstName} {seeker.lastName}
                      </h3>
                    </div>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/60 bg-surface/70 px-2.5 py-0.5 text-xs font-medium">
                    {selectedApplication.status}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-border/60 bg-surface/40 p-3">
                    <p className="text-xs text-muted-foreground">Email</p>
                    <p className="mt-0.5 truncate text-sm font-semibold">{seeker.email || "Not available"}</p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-surface/40 p-3">
                    <p className="text-xs text-muted-foreground">ATS score</p>
                    <p className="mt-0.5 text-sm font-semibold">{selectedApplication.atsScore ?? 0}</p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-surface/40 p-3">
                    <p className="text-xs text-muted-foreground">Verification</p>
                    <p className="mt-0.5 text-sm font-semibold">{selectedApplication.verificationStatus || "Pending"}</p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-surface/40 p-3">
                    <p className="text-xs text-muted-foreground">Trust score</p>
                    <p className="mt-0.5 text-sm font-semibold">{selectedApplication.trustScore ?? 0}</p>
                  </div>
                </div>

                <div className="mt-5">
                  <DetailSectionHeading>Candidate snapshot</DetailSectionHeading>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {seeker.tagline || seeker.bio || "No short profile summary available yet."}
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Current status</p>
                      <p className="text-sm font-semibold">{seeker.currentStatus || "Not specified"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Open to work</p>
                      <p className="text-sm font-semibold">{seeker.openToWork ? "Yes" : "No"}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-5">
                  <DetailSectionHeading>Skills</DetailSectionHeading>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(seeker.skills || []).map((skill) => (
                      <span
                        key={skill}
                        className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-surface/70 px-2.5 py-0.5 text-xs font-medium"
                      >
                        {skill}
                      </span>
                    ))}
                    {!seeker.skills?.length ? (
                      <span className="text-xs text-muted-foreground">No skills listed</span>
                    ) : null}
                  </div>
                </div>

                <div className="mt-5">
                  <DetailSectionHeading>Preferred roles</DetailSectionHeading>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(seeker.preferredRoles || []).map((role) => (
                      <span
                        key={role}
                        className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-surface/70 px-2.5 py-0.5 text-xs font-medium"
                      >
                        {role}
                      </span>
                    ))}
                    {!seeker.preferredRoles?.length ? (
                      <span className="text-xs text-muted-foreground">No preferred roles listed</span>
                    ) : null}
                  </div>
                </div>

                <div className="mt-5">
                  <DetailSectionHeading>Professional links</DetailSectionHeading>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <DetailLink href={seeker.portfolioUrl} label="Portfolio" />
                    <DetailLink href={seeker.linkedinUrl} label="LinkedIn" />
                    <DetailLink href={seeker.githubUrl} label="GitHub" />
                  </div>
                  {!seeker.portfolioUrl && !seeker.linkedinUrl && !seeker.githubUrl ? (
                    <p className="mt-2 text-sm text-muted-foreground">No professional links shared yet.</p>
                  ) : null}
                </div>

                <div className="mt-5">
                  <DetailSectionHeading>Resume attached</DetailSectionHeading>
                  {selectedApplication.attachedResume?.media?.filePath ||
                  selectedApplication.attachedResume?.media?.url ? (
                    <div className="mt-2 rounded-xl border border-border/60 bg-surface/40 p-4">
                      <p className="text-sm font-semibold">
                        {selectedApplication.attachedResume.originalName || "Manual resume"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        The applicant manually attached this resume during application submission.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenResume(selectedApplication._id)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium hover:bg-surface/80"
                        >
                          Preview resume
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadResume(selectedApplication._id)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium hover:bg-surface/80"
                        >
                          Download resume
                        </button>
                      </div>
                    </div>
                  ) : selectedApplication.tailoredResume?.latex ? (
                    <div className="mt-2 rounded-xl border border-border/60 bg-surface/40 p-4">
                      <p className="text-sm font-semibold">Job-matched resume attached</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        This resume was generated from the applicant profile for this job.
                        Education is included in every generated resume.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenResume(selectedApplication._id)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium hover:bg-surface/80"
                        >
                          Preview resume
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadResume(selectedApplication._id)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium hover:bg-surface/80"
                        >
                          Download tailored resume PDF
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">No resume is attached to this application.</p>
                  )}
                </div>

                <div className="mt-5">
                  <DetailSectionHeading>Experience summary</DetailSectionHeading>
                  <div className="mt-2 space-y-2">
                    {(seeker.experience || []).slice(-3).reverse().map((item) => (
                      <div
                        key={item._id || `${item.companyName}-${item.jobTitle}`}
                        className="rounded-xl border border-border/60 bg-surface/40 p-3"
                      >
                        <p className="text-sm font-semibold">{item.jobTitle || "Untitled role"}</p>
                        <p className="text-xs text-muted-foreground">{item.companyName || "Unknown company"}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {item.isCurrent ? "Current role" : formatDate(item.endDate)} ·{" "}
                          {item.verificationStatus || "Pending verification"}
                        </p>
                      </div>
                    ))}
                    {!seeker.experience?.length ? (
                      <p className="text-sm text-muted-foreground">No experience entries shared yet.</p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-5">
                  <DetailSectionHeading>Education summary</DetailSectionHeading>
                  <div className="mt-2 space-y-2">
                    {(seeker.education || []).slice(-2).reverse().map((item) => (
                      <div
                        key={item._id || `${item.institution}-${item.degree}`}
                        className="rounded-xl border border-border/60 bg-surface/40 p-3"
                      >
                        <p className="text-sm font-semibold">{item.degree || "Degree not specified"}</p>
                        <p className="text-xs text-muted-foreground">{item.institution || "Institution not specified"}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{item.fieldOfStudy || "Field not specified"}</p>
                      </div>
                    ))}
                    {!seeker.education?.length ? (
                      <p className="text-sm text-muted-foreground">No education entries shared yet.</p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-5">
                  <DetailSectionHeading>Verification state</DetailSectionHeading>
                  {!latestVerificationRequest ? (
                    <div className="mt-2 rounded-xl border border-border/60 bg-surface/40 p-4">
                      <p className="text-sm font-semibold">Verification not started</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        No verification request has been sent yet for this application.
                        Use the action below when you want to begin the background check.
                      </p>
                    </div>
                  ) : (
                    <div className="mt-2 rounded-xl border border-border/60 bg-surface/40 p-4">
                      <p className="text-sm font-semibold">
                        {latestVerificationRequest.status === "Pending"
                          ? "Manager response pending"
                          : latestVerificationRequest.status === "Submitted"
                            ? "Manager submitted verification"
                            : "Verification request expired"}
                      </p>
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Requested</span>
                          <span className="font-medium">{formatDate(latestVerificationRequest.requestedAt)}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Manager email</span>
                          <span className="font-medium">{latestVerificationRequest.managerEmail || "Not available"}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Grace period ends</span>
                          <span className="font-medium">{formatDate(latestVerificationRequest.gracePeriodEndsAt)}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Next reminder</span>
                          <span className="font-medium">{formatDate(latestVerificationRequest.nextReminderAt)}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Reminder count</span>
                          <span className="font-medium">{latestVerificationRequest.reminderCount ?? 0}</span>
                        </div>
                        {latestVerificationRequest.submittedAt ? (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Submitted</span>
                            <span className="font-medium">{formatDate(latestVerificationRequest.submittedAt)}</span>
                          </div>
                        ) : null}
                      </div>
                      {selectedApplication.verificationStatus === "Verified" ? (
                        <p className="mt-3 text-xs text-muted-foreground">
                          Verification completed with trust tag{" "}
                          <strong className="text-foreground">{selectedApplication.trustScoreTag || "Not available"}</strong>.
                          {selectedApplication.status === "Rejected"
                            ? " This application is currently in a rejected state after verification."
                            : ""}
                        </p>
                      ) : null}
                    </div>
                  )}
                </div>

                <div className="mt-5">
                  <DetailSectionHeading>Update status</DetailSectionHeading>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {statusOptions.map((status) => (
                      <button
                        key={status}
                        type="button"
                        disabled={statusMutation.isPending}
                        onClick={() => {
                          if (selectedApplication.status === status) {
                            return;
                          }
                          setFeedback({ type: "", message: "" });
                          statusMutation.mutate(status);
                        }}
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                          selectedApplication.status === status
                            ? "border-transparent bg-gradient-recruiter text-recruiter-foreground shadow-recruiter"
                            : "border-border bg-surface/70 text-muted-foreground hover:bg-surface"
                        }`}
                      >
                        Mark {status}
                      </button>
                    ))}
                  </div>
                </div>

                {!hasExperienceEntries ? (
                  <div className="mt-5 rounded-xl border border-border/60 bg-surface/40 p-3 text-xs text-muted-foreground">
                    This applicant has not added work experience, so background verification is not applicable yet.
                    You can still move the application through Pending, UnderReview, Accepted, or Rejected.
                  </div>
                ) : !hasVerifiableExperience ? (
                  <div className="mt-5 rounded-xl border border-border/60 bg-surface/40 p-3 text-xs text-muted-foreground">
                    This applicant has experience entries, but none include a manager email for background verification.
                    You can still mark the application status without triggering verification.
                  </div>
                ) : null}

                <button
                  type="button"
                  disabled={verificationButtonDisabled}
                  onClick={() => {
                    setFeedback({ type: "", message: "" });
                    verificationMutation.mutate();
                  }}
                  className="mt-3 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-transparent bg-gradient-recruiter px-4 text-xs font-semibold text-recruiter-foreground shadow-recruiter hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {verificationButtonLabel}
                </button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {applicationsQuery.isLoading
                  ? "Loading applicants..."
                  : "Select an applicant to review status controls and verification actions."}
              </p>
            )}
          </article>
        </aside>
      </div>
    </main>
  );
}
