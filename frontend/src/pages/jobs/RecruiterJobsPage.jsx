import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { apiBlobRequest, apiRequest } from "../../services/api";
import { AutoDismissFeedback } from "../../components/AutoDismissFeedback";

const initialJobForm = {
  title: "",
  description: "",
  location: "",
  industry: "",
  type: "Full-time",
  skillsRequired: "",
  requirements: "",
};

function splitCsv(value) {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
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

export function RecruiterJobsPage() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(initialJobForm);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [feedback, setFeedback] = useState({ type: "", message: "" });

  const jobsQuery = useQuery({
    queryKey: ["jobs", "recruiter-mine"],
    queryFn: () =>
      apiRequest("/jobs/mine?status=All", {
        token: session.accessToken,
      }),
    enabled: session?.role === "organization",
  });

  const createJobMutation = useMutation({
    mutationFn: () =>
      apiRequest("/jobs", {
        method: "POST",
        token: session.accessToken,
        body: {
          title: form.title,
          description: form.description,
          location: form.location,
          industry: form.industry,
          type: form.type,
          skillsRequired: splitCsv(form.skillsRequired),
          requirements: splitCsv(form.requirements),
        },
      }),
    onSuccess: (response) => {
      setFeedback({ type: "success", message: response.message || "Job created." });
      setForm(initialJobForm);
      queryClient.invalidateQueries({ queryKey: ["jobs", "recruiter-mine"] });
      queryClient.invalidateQueries({ queryKey: ["notifications", "recruiter"] });
    },
    onError: (error) => {
      setFeedback({ type: "error", message: error.message });
    },
  });

  const recruiterJobs = useMemo(() => {
    const jobs = jobsQuery.data?.jobs || [];
    return jobs;
  }, [jobsQuery.data]);

  const selectedJob = recruiterJobs.find((job) => job._id === selectedJobId) || recruiterJobs[0] || null;

  const applicationsQuery = useQuery({
    queryKey: ["job-applications", selectedJob?._id],
    queryFn: () =>
      apiRequest(`/jobs/${selectedJob._id}/applications`, {
        token: session.accessToken,
      }),
    enabled: Boolean(session?.role === "organization" && selectedJob?._id),
  });

  const closeJobMutation = useMutation({
    mutationFn: (jobId) =>
      apiRequest(`/jobs/${jobId}/close`, {
        method: "PUT",
        token: session.accessToken,
      }),
    onSuccess: (response) => {
      setFeedback({ type: "success", message: response.message || "Job closed." });
      queryClient.invalidateQueries({ queryKey: ["jobs", "recruiter-mine"] });
      queryClient.invalidateQueries({ queryKey: ["search-jobs"] });
    },
    onError: (error) => {
      setFeedback({ type: "error", message: error.message });
    },
  });

  const deleteJobMutation = useMutation({
    mutationFn: (jobId) =>
      apiRequest(`/jobs/${jobId}`, {
        method: "DELETE",
        token: session.accessToken,
      }),
    onSuccess: (response) => {
      setFeedback({ type: "success", message: response.message || "Job deleted." });
      setSelectedJobId("");
      queryClient.invalidateQueries({ queryKey: ["jobs", "recruiter-mine"] });
      queryClient.invalidateQueries({ queryKey: ["search-jobs"] });
    },
    onError: (error) => {
      setFeedback({ type: "error", message: error.message });
    },
  });

  const updateJobMutation = useMutation({
    mutationFn: ({ jobId, body }) =>
      apiRequest(`/jobs/${jobId}`, {
        method: "PUT",
        token: session.accessToken,
        body,
      }),
    onSuccess: (response) => {
      setFeedback({ type: "success", message: response.message || "Job updated." });
      queryClient.invalidateQueries({ queryKey: ["jobs", "recruiter-mine"] });
      queryClient.invalidateQueries({ queryKey: ["search-jobs"] });
    },
    onError: (error) => {
      setFeedback({ type: "error", message: error.message });
    },
  });

  function handleChange(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    setFeedback({ type: "", message: "" });
    createJobMutation.mutate();
  }

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

  return (
    <section className="dashboard-stack">
      {session?.role !== "organization" ? (
        <article className="info-card">
          <h3>Recruiter jobs are organization-only</h3>
          <p>Sign in as an organization account to create and review jobs.</p>
        </article>
      ) : (
        <>
          <AutoDismissFeedback
            feedback={feedback}
            onClear={() => setFeedback({ type: "", message: "" })}
          />

          <section className="jobs-layout">
            <article className="info-card">
              <h3>Create a new job</h3>
              <form className="auth-form auth-form--wide" onSubmit={handleSubmit}>
                <div className="form-grid">
                  <label className="form-field">
                    <span>Title</span>
                    <input
                      type="text"
                      value={form.title}
                      onChange={(event) => handleChange("title", event.target.value)}
                      placeholder="Senior Frontend Engineer"
                      required
                    />
                  </label>

                  <label className="form-field">
                    <span>Type</span>
                    <select
                      value={form.type}
                      onChange={(event) => handleChange("type", event.target.value)}
                    >
                      <option value="Full-time">Full-time</option>
                      <option value="Part-time">Part-time</option>
                      <option value="Contract">Contract</option>
                      <option value="Internship">Internship</option>
                      <option value="Remote">Remote</option>
                    </select>
                  </label>
                </div>

                <div className="form-grid">
                  <label className="form-field">
                    <span>Location</span>
                    <input
                      type="text"
                      value={form.location}
                      onChange={(event) => handleChange("location", event.target.value)}
                      placeholder="Bangalore / Remote"
                    />
                  </label>

                  <label className="form-field">
                    <span>Industry</span>
                    <input
                      type="text"
                      value={form.industry}
                      onChange={(event) => handleChange("industry", event.target.value)}
                      placeholder="SaaS"
                    />
                  </label>
                </div>

                <label className="form-field">
                  <span>Description</span>
                  <textarea
                    rows={5}
                    value={form.description}
                    onChange={(event) => handleChange("description", event.target.value)}
                  />
                </label>

                <label className="form-field">
                  <span>Skills required</span>
                  <textarea
                    rows={4}
                    value={form.skillsRequired}
                    onChange={(event) => handleChange("skillsRequired", event.target.value)}
                  />
                  <small>Add one skill per line, or separate with commas.</small>
                </label>

                <label className="form-field">
                  <span>Requirements</span>
                  <textarea
                    rows={5}
                    value={form.requirements}
                    onChange={(event) => handleChange("requirements", event.target.value)}
                  />
                  <small>Add one requirement per line, or separate with commas.</small>
                </label>

                <button type="submit" disabled={createJobMutation.isPending}>
                  {createJobMutation.isPending ? "Creating..." : "Create job"}
                </button>
              </form>
            </article>

            <div className="jobs-column">
              <article className="info-card">
                <div className="section-head">
                  <div>
                    <h3>Your active jobs</h3>
                    <p>Manage active and closed roles owned by your organization.</p>
                  </div>
                  <span className="pill">{recruiterJobs.length} jobs</span>
                </div>

                {jobsQuery.isLoading ? (
                  <p>Loading recruiter jobs...</p>
                ) : recruiterJobs.length ? (
                  <div className="list-stack">
                    {recruiterJobs.map((job) => (
                      <button
                        key={job._id}
                        type="button"
                        className={selectedJob?._id === job._id ? "job-card selected" : "job-card"}
                        onClick={() => setSelectedJobId(job._id)}
                      >
                        <div className="job-card__body">
                          <div>
                            <strong>{job.title}</strong>
                            <p>
                              {job.location || "Remote / flexible"}
                              {job.applicationCount !== undefined ? ` • ${job.applicationCount} applications` : ""}
                            </p>
                          </div>
                          <div className="list-row__meta">
                            <span className="pill">{job.type || "Open role"}</span>
                            <span className={job.status === "Closed" ? "pill danger-pill" : "pill accent"}>
                              {job.status || "Active"}
                            </span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p>No recruiter jobs yet. Create your first role from the form.</p>
                )}
              </article>

              <article className="info-card">
                <div className="section-head">
                  <div>
                    <h3>Applications</h3>
                    <p>Live applicant list from the selected job.</p>
                  </div>
                  {selectedJob ? <span className="pill">{selectedJob.title}</span> : null}
                </div>

                {!selectedJob ? (
                  <p>Select a job to review applicants.</p>
                ) : applicationsQuery.isLoading ? (
                  <p>Loading applications...</p>
                ) : applicationsQuery.isError ? (
                  <p>We could not load applications for this job.</p>
                ) : (
                  <div className="list-stack">
                    <article className="job-management-panel">
                      <div>
                        <strong>{selectedJob.title}</strong>
                        <p>
                          {selectedJob.status === "Closed"
                            ? "This job is closed. New applications are blocked, but existing candidates remain available."
                            : "This job is active and accepting applications."}
                        </p>
                      </div>
                      <div className="connection-card__actions">
                        {selectedJob.status !== "Closed" ? (
                          <button
                            type="button"
                            className="outline-button"
                            disabled={closeJobMutation.isPending}
                            onClick={() => closeJobMutation.mutate(selectedJob._id)}
                          >
                            {closeJobMutation.isPending ? "Closing..." : "Close job"}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="outline-button danger-button"
                          disabled={deleteJobMutation.isPending}
                          onClick={() => deleteJobMutation.mutate(selectedJob._id)}
                        >
                          {deleteJobMutation.isPending ? "Deleting..." : "Delete job"}
                        </button>
                      </div>
                    </article>

                    {(applicationsQuery.data?.applications || []).map((application) => (
                      <article key={application._id} className="list-row">
                        <div>
                          <strong>
                            {application.jobSeekerId?.firstName} {application.jobSeekerId?.lastName}
                          </strong>
                          <p>{application.jobSeekerId?.email}</p>
                          <p>
                            Resume:{" "}
                            {application.attachedResume?.originalName ||
                              application.tailoredResume?.fileName ||
                              "Not attached"}
                          </p>
                        </div>
                        <div className="list-row__meta">
                          <span className="score-chip">ATS {application.atsScore ?? 0}</span>
                          <span className="pill">{application.status}</span>
                          {application.attachedResume?.media?.filePath ||
                          application.attachedResume?.media?.url ? (
                            <>
                              <button
                                type="button"
                                className="outline-button compact-button"
                                onClick={() => handleOpenResume(application._id)}
                              >
                                Preview
                              </button>
                              <button
                                type="button"
                                className="outline-button compact-button"
                                onClick={() => handleDownloadResume(application._id)}
                              >
                                Download
                              </button>
                            </>
                          ) : application.tailoredResume?.latex ? (
                            <>
                              <button
                                type="button"
                                className="outline-button compact-button"
                                onClick={() => handleOpenResume(application._id)}
                              >
                                Preview
                              </button>
                              <button
                                type="button"
                                className="outline-button compact-button"
                                onClick={() => handleDownloadResume(application._id)}
                              >
                                Download
                              </button>
                            </>
                          ) : (
                            <span className="muted-chip">No resume</span>
                          )}
                        </div>
                      </article>
                    ))}
                    {!applicationsQuery.data?.applications?.length ? (
                      <p>No applications for this job yet.</p>
                    ) : null}
                  </div>
                )}
              </article>
            </div>
          </section>
        </>
      )}
    </section>
  );
}
