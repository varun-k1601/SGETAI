import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../services/api";

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

export function RecruiterJobPostingsPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [activeFilter, setActiveFilter] = useState("All");

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

  const filters = ["All", "Active", "Draft", "Closed"];

  const filteredPostings = useMemo(
    () =>
      activeFilter === "All"
        ? jobPostings
        : jobPostings.filter((job) => job.status === activeFilter),
    [jobPostings, activeFilter]
  );

  const activeCount = jobPostings.filter((job) => job.status === "Active").length;
  const draftCount = jobPostings.filter((job) => job.status === "Draft").length;
  const totalApplicants = jobPostings.reduce((sum, job) => sum + (job.applicationCount || 0), 0);

  function handleArchive(event, job) {
    event.stopPropagation();
    const confirmed = window.confirm(
      `Close "${job.title}"? This stops it from accepting new applications. Existing applicants remain available.`
    );
    if (confirmed) {
      closeJobMutation.mutate(job._id);
    }
  }

  function handleDelete(event, job) {
    event.stopPropagation();
    const confirmed = window.confirm(
      `Permanently delete "${job.title}"? This cannot be undone.`
    );
    if (confirmed) {
      deleteJobMutation.mutate(job._id);
    }
  }

  function handleJobClick(job) {
    navigate(`/recruiter/job-postings/${job._id}`);
  }

  return (
    <main className="flex-1 px-6 py-6 lg:px-8 lg:py-8">
      {/* Hero Banner */}
      <div className="relative mb-6 overflow-hidden rounded-3xl border border-border/60 bg-linear-to-br p-6 lg:p-8 from-recruiter/15 via-primary/10 to-transparent">
        <div className="orb absolute -right-20 -top-20 h-60 w-60 bg-primary/20 rounded-full blur-3xl"></div>
        <div className="orb absolute -bottom-24 -left-24 h-72 w-72 bg-recruiter/25 rounded-full blur-3xl"></div>
        <div className="relative">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Hiring
              </p>
              <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight lg:text-4xl">
                Job postings
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground lg:text-base">
                {jobPostings.length} postings · AI is sourcing candidates 24/7.
              </p>
            </div>
            <button
              onClick={() => navigate("/recruiter/job-postings/new")}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-recruiter px-4 py-2 text-sm font-semibold text-recruiter-foreground shadow-recruiter hover:opacity-95"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="lucide h-4 w-4"
                aria-hidden="true"
              >
                <path d="M5 12h14"></path>
                <path d="M12 5v14"></path>
              </svg>
              New posting
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-border/60 bg-card/70 p-4 backdrop-blur">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="lucide h-3.5 w-3.5"
              aria-hidden="true"
            >
              <path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
              <rect width="20" height="14" x="2" y="6" rx="2"></rect>
            </svg>
            Active
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <div className="font-display text-2xl font-semibold tabular-nums">{activeCount}</div>
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card/70 p-4 backdrop-blur">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="lucide h-3.5 w-3.5"
              aria-hidden="true"
            >
              <path d="M12.659 22H18a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v9.34"></path>
              <path d="M14 2v5a1 1 0 0 0 1 1h5"></path>
              <path d="M10.378 12.622a1 1 0 0 1 3 3.003L8.36 20.637a2 2 0 0 1-.854.506l-2.867.837a.5.5 0 0 1-.62-.62l.836-2.869a2 2 0 0 1 .506-.853z"></path>
            </svg>
            Drafts
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <div className="font-display text-2xl font-semibold tabular-nums">{draftCount}</div>
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card/70 p-4 backdrop-blur">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="lucide h-3.5 w-3.5"
              aria-hidden="true"
            >
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
              <path d="M16 3.128a4 4 0 0 1 0 7.744"></path>
              <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
              <circle cx="9" cy="7" r="4"></circle>
            </svg>
            Applicants
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <div className="font-display text-2xl font-semibold tabular-nums">{totalApplicants}</div>
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card/70 p-4 backdrop-blur">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="lucide h-3.5 w-3.5"
              aria-hidden="true"
            >
              <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
            Avg time-to-fill
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            {avgTimeToFillDays !== null ? (
              <div className="font-display text-2xl font-semibold tabular-nums">
                {Math.round(avgTimeToFillDays)}d
              </div>
            ) : (
              <div className="font-display text-sm font-semibold text-muted-foreground">
                Not enough data yet
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Filter Buttons */}
      <div className="mb-4 flex gap-2">
        {filters.map((filter) => (
          <button
            key={filter}
            onClick={() => setActiveFilter(filter)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              activeFilter === filter
                ? "border-transparent bg-gradient-recruiter text-recruiter-foreground shadow-recruiter"
                : "border-border bg-surface/70 text-muted-foreground hover:bg-surface"
            }`}
          >
            {filter}
          </button>
        ))}
      </div>

      {/* Job Postings List */}
      <div className="space-y-3">
        {jobsQuery.isLoading ? (
          <div className="rounded-2xl border border-border/60 bg-card/70 p-8 text-center text-muted-foreground">
            Loading job postings...
          </div>
        ) : filteredPostings.length > 0 ? (
          filteredPostings.map((job) => (
            <div
              key={job._id}
              onClick={() => handleJobClick(job)}
              className="relative cursor-pointer rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-5 shadow-elegant hover:border-border"
            >
              <div className="flex items-center gap-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-recruiter text-recruiter-foreground">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="lucide h-5 w-5"
                    aria-hidden="true"
                  >
                    <path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
                    <rect width="20" height="14" x="2" y="6" rx="2"></rect>
                  </svg>
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-base font-semibold">{job.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {job.industry || "General"} · {job.location || "Remote"} · {job.type || "Full-time"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${
                        job.status === "Active"
                          ? "bg-success/15 text-success border-success/30"
                          : "bg-muted text-muted-foreground border-border/60"
                      }`}
                    >
                      {job.status}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-surface/70 px-2.5 py-0.5 text-xs font-medium">
                      {timeAgo(job.createdAt)}
                    </span>
                    {job.postedBy?.name && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-surface/70 px-2.5 py-0.5 text-xs font-medium">
                        Posted by {job.postedBy.name}
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-right">
                  <p className="font-display text-xl font-semibold">{job.applicationCount || 0}</p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">applicants</p>
                </div>

                {job.status !== "Closed" && (
                  <button
                    onClick={(event) => handleArchive(event, job)}
                    disabled={closeJobMutation.isPending}
                    title="Close job"
                    className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-surface p-0! text-muted-foreground hover:text-foreground transition disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="lucide h-4 w-4"
                      aria-hidden="true"
                    >
                      <rect width="20" height="5" x="2" y="3" rx="1"></rect>
                      <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"></path>
                      <path d="M10 12h4"></path>
                    </svg>
                  </button>
                )}

                <button
                  onClick={(event) => handleDelete(event, job)}
                  disabled={deleteJobMutation.isPending}
                  title="Delete job"
                  className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-surface p-0! text-muted-foreground hover:text-foreground transition disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="lucide h-4 w-4"
                    aria-hidden="true"
                  >
                    <path d="M10 11v6"></path>
                    <path d="M14 11v6"></path>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path>
                    <path d="M3 6h18"></path>
                    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-2xl border border-border/60 bg-card/70 p-8 text-center text-muted-foreground">
            No job postings found for the selected filter.
          </div>
        )}
      </div>
    </main>
  );
}
