import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../services/api";

function JobSelector({ job, onSelect }) {
  return (
    <div
      onClick={() => onSelect(job)}
      className="w-full cursor-pointer rounded-2xl border border-border/60 bg-card/70 p-5 text-left shadow-elegant backdrop-blur-xl transition hover:border-border"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{job.title}</p>
          <p className="truncate text-xs text-muted-foreground">{job.location || "Flexible"}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${
              job.status === "Active"
                ? "bg-success/15 text-success border-success/30"
                : "bg-muted text-muted-foreground border-border/60"
            }`}
          >
            {job.status || "Active"}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-surface/70 px-2.5 py-0.5 text-xs font-medium">
            {job.type || "Open role"}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-surface/70 px-2.5 py-0.5 text-xs font-medium">
            {job.applicationCount ?? 0} applicants
          </span>
        </div>
      </div>
    </div>
  );
}

export function RecruiterApplicationsPage() {
  const { session } = useAuth();
  const navigate = useNavigate();

  const jobsQuery = useQuery({
    queryKey: ["jobs", "recruiter-postings"],
    queryFn: () =>
      apiRequest("/jobs/mine?status=All", {
        token: session.accessToken,
      }),
    enabled: session?.role === "organization",
  });

  const recruiterJobs = jobsQuery.data?.jobs || [];

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

  return (
    <main className="flex-1 px-6 py-6 lg:px-8 lg:py-8">
      <article className="rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-5 shadow-elegant">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-semibold">Select a job</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              All of your job postings, regardless of status — pick one to review its applicants.
            </p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-surface/70 px-2.5 py-0.5 text-xs font-medium">
            {recruiterJobs.length} jobs
          </span>
        </div>

        {jobsQuery.isLoading ? (
          <p className="mt-4 text-sm text-muted-foreground">Loading your jobs...</p>
        ) : recruiterJobs.length ? (
          <div className="mt-4 space-y-3">
            {recruiterJobs.map((job) => (
              <JobSelector key={job._id} job={job} onSelect={(item) => navigate(`/recruiter/applications/${item._id}`)} />
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">No recruiter jobs available yet.</p>
        )}
      </article>
    </main>
  );
}
