import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { apiRequest, apiFormRequest } from "../../services/api";
import { formatSalary } from "../../utils/formatSalary";

export function JobDetailPage() {
  const { jobId } = useParams();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [resumeFile, setResumeFile] = useState(null);
  const [fileError, setFileError] = useState("");
  const [applyError, setApplyError] = useState("");
  const [successResult, setSuccessResult] = useState(null);

  const jobQuery = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => apiRequest(`/jobs/${jobId}`, { token: session?.accessToken }),
    enabled: Boolean(jobId && session?.accessToken),
  });

  const applyMutation = useMutation({
    mutationFn: () => {
      const formData = new FormData();
      formData.append("file", resumeFile);
      return apiFormRequest(`/jobs/${jobId}/apply`, {
        method: "POST",
        token: session.accessToken,
        formData,
      });
    },
    onSuccess: (data) => {
      setApplyError("");
      setSuccessResult(data);
      queryClient.invalidateQueries({ queryKey: ["job", jobId] });
    },
    onError: (error) => {
      setApplyError(error.message || "Failed to submit application.");
    },
  });

  const handleFileChange = (event) => {
    const file = event.target.files?.[0] || null;
    setFileError("");
    setApplyError("");

    if (file && file.type !== "application/pdf") {
      setResumeFile(null);
      setFileError("Only PDF files are accepted. Please attach a PDF resume.");
      return;
    }

    setResumeFile(file);
  };

  const handleSubmitApplication = (event) => {
    event.preventDefault();

    if (!resumeFile) {
      setFileError("Attach a PDF resume before applying.");
      return;
    }

    if (resumeFile.type !== "application/pdf") {
      setFileError("Only PDF files are accepted. Please attach a PDF resume.");
      return;
    }

    applyMutation.mutate();
  };

  if (jobQuery.isLoading) {
    return (
      <main className="flex-1 px-6 py-6 lg:px-8 lg:py-8">
        <div className="rounded-2xl border border-border/60 bg-card/70 p-8 text-center text-muted-foreground">
          Loading job...
        </div>
      </main>
    );
  }

  if (jobQuery.isError || !jobQuery.data?.job) {
    return (
      <main className="flex-1 px-6 py-6 lg:px-8 lg:py-8">
        <div className="rounded-2xl border border-border/60 bg-card/70 p-8 text-center text-muted-foreground">
          Job not found.
        </div>
      </main>
    );
  }

  const { job, alreadyApplied, applicationStatus } = jobQuery.data;
  const organization = job.organizationId || {};
  const skills = job.skillsRequired || job.skills || [];
  const requirements = job.requirements || [];
  const currentStatus = successResult ? "Pending" : applicationStatus;
  const showApplyForm = !alreadyApplied || currentStatus === "Withdrawn";

  return (
    <main className="flex-1 px-6 py-6 lg:px-8 lg:py-8">
      <Link
        to="/jobs"
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        ← Back to jobs
      </Link>

      <div className="rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-6 shadow-elegant">
        <div className="flex items-start gap-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-surface text-2xl font-bold">
            {organization.companyName?.[0]?.toUpperCase() || "J"}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl font-semibold tracking-tight">{job.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {organization.companyName || "Company"} · {job.location || "Remote"}
              {job.type ? ` · ${job.type}` : ""}
            </p>
            {formatSalary(job.salary) && (
              <p className="mt-1 text-sm text-muted-foreground">{formatSalary(job.salary)}</p>
            )}
          </div>
        </div>

        {skills.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {skills.map((skill, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-surface/70 px-2.5 py-0.5 text-xs font-medium"
              >
                {skill}
              </span>
            ))}
          </div>
        )}

        {job.description && (
          <div className="mt-6">
            <h2 className="font-display text-lg font-semibold">Description</h2>
            <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{job.description}</p>
          </div>
        )}

        {requirements.length > 0 && (
          <div className="mt-6">
            <h2 className="font-display text-lg font-semibold">Requirements</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {requirements.map((requirement, idx) => (
                <li key={idx}>{requirement}</li>
              ))}
            </ul>
          </div>
        )}

        {(organization.description || organization.websiteUrl) && (
          <div className="mt-6 rounded-xl border border-border/60 bg-surface/50 p-4">
            <h2 className="font-display text-lg font-semibold">About {organization.companyName || "the company"}</h2>
            {organization.description && (
              <p className="mt-2 text-sm text-muted-foreground">{organization.description}</p>
            )}
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {organization.industry && <span>{organization.industry}</span>}
              {organization.companySize && <span>{organization.companySize} employees</span>}
              {organization.foundedYear && <span>Founded {organization.foundedYear}</span>}
              {organization.headquartersLocation && <span>{organization.headquartersLocation}</span>}
              {organization.websiteUrl && (
                <a
                  href={organization.websiteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-foreground hover:underline"
                >
                  {organization.websiteUrl}
                </a>
              )}
            </div>
          </div>
        )}

        {/* Apply Section */}
        <div id="apply" className="mt-8 border-t border-border/60 pt-6">
          <h2 className="font-display text-lg font-semibold">Apply</h2>

          {!showApplyForm ? (
            <div className="mt-3 rounded-xl border border-border/60 bg-surface/50 p-4 text-sm">
              <p className="font-medium">Already applied</p>
              <p className="mt-1 text-muted-foreground">Status: {currentStatus || "Pending"}</p>
            </div>
          ) : successResult ? (
            <div className="mt-3 rounded-xl border border-border/60 bg-surface/50 p-4 text-sm">
              <p className="font-medium">Application submitted — ATS match: {Math.round(successResult.ats?.score ?? 0)}%</p>
              {successResult.ats?.tag && (
                <p className="mt-1 text-muted-foreground">{successResult.ats.tag}</p>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmitApplication} className="mt-3 space-y-3">
              <input
                type="file"
                accept="application/pdf"
                onChange={handleFileChange}
                className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-foreground"
              />
              {fileError && <p className="text-xs font-medium text-red-500">{fileError}</p>}
              {applyError && <p className="text-xs font-medium text-red-500">{applyError}</p>}
              <button
                type="submit"
                disabled={!resumeFile || applyMutation.isPending}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-transparent bg-foreground px-4 text-xs font-semibold text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {applyMutation.isPending ? "Submitting..." : "Submit Application"}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
