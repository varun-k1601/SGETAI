import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../services/api";
import { formatSalary } from "../../utils/formatSalary";
import { CompanyLogo } from "../../components/CompanyLogo";

export function JobsPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlQuery = searchParams.get("q") || "";
  const [searchQuery, setSearchQuery] = useState(urlQuery);
  const [bookmarked, setBookmarked] = useState(new Set());
  const [activeCompanyId, setActiveCompanyId] = useState("");

  // Keep the input in sync if `q` changes from outside (e.g. the global header search
  // navigating here again with a new query) without fighting the user's own typing.
  useEffect(() => {
    setSearchQuery(urlQuery);
  }, [urlQuery]);

  const trimmedQuery = searchQuery.trim();

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (trimmedQuery) {
      next.set("q", trimmedQuery);
    } else {
      next.delete("q");
    }
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmedQuery]);

  const isSearchMode = Boolean(trimmedQuery);

  const recommendedJobsQuery = useQuery({
    queryKey: ["jobs", "recommended"],
    queryFn: () =>
      apiRequest("/recommendations/jobs?limit=10", {
        token: session.accessToken,
      }),
    enabled: Boolean(session?.accessToken) && !isSearchMode,
  });

  const searchJobsQuery = useQuery({
    queryKey: ["jobs", "search", trimmedQuery],
    queryFn: () =>
      apiRequest(`/search/jobs?q=${encodeURIComponent(trimmedQuery)}&limit=20`, {
        token: session?.accessToken,
      }),
    enabled: isSearchMode,
  });

  const companiesQuery = useQuery({
    queryKey: ["jobs", "search-companies", trimmedQuery],
    queryFn: () =>
      apiRequest(`/search/organizations?q=${encodeURIComponent(trimmedQuery)}&limit=6`, {
        token: session.accessToken,
      }),
    enabled: isSearchMode && Boolean(session?.accessToken) && session?.role === "seeker",
    retry: false,
  });

  const jobsQuery = isSearchMode ? searchJobsQuery : recommendedJobsQuery;
  const jobs = jobsQuery.data?.jobs || [];
  const companies = companiesQuery.data?.organizations || [];

  const filteredJobs = jobs.filter(
    (job) => !activeCompanyId || String(job.organizationId?._id || job.organizationId) === activeCompanyId
  );

  function handleSelectCompany(company) {
    setActiveCompanyId((current) => (current === company._id ? "" : company._id));
  }

  const toggleBookmark = (jobId) => {
    const newBookmarked = new Set(bookmarked);
    if (newBookmarked.has(jobId)) {
      newBookmarked.delete(jobId);
    } else {
      newBookmarked.add(jobId);
    }
    setBookmarked(newBookmarked);
  };

  const getInitial = (job) => {
    return job.organizationId?.companyName?.[0]?.toUpperCase() || "J";
  };

  const getMatchColor = (percentage) => {
    const percent = parseInt(percentage);
    if (percent >= 80) return "from-green-500";
    if (percent >= 60) return "from-blue-500";
    if (percent >= 40) return "from-yellow-500";
    return "from-orange-500";
  };

  return (
    <main className="flex-1 px-6 py-6 lg:px-8 lg:py-8">
      {/* Hero Banner */}
      <div className="relative mb-6 overflow-hidden rounded-3xl border border-border/60 bg-linear-to-br p-6 lg:p-8 from-primary/10 via-transparent to-transparent">
        <div className="absolute -right-20 -top-20 h-60 w-60 bg-primary/20 rounded-full blur-3xl"></div>
        <div className="relative">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Jobs
              </p>
              <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight lg:text-4xl">
                Find your next role
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground lg:text-base">
                {isSearchMode
                  ? `${filteredJobs.length} jobs matching "${trimmedQuery}".`
                  : `${filteredJobs.length} jobs · ranked by match to your profile.`}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="mb-5 flex items-center gap-3 rounded-2xl border border-border/60 bg-card/70 p-3 backdrop-blur">
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
          className="lucide h-4 w-4 text-muted-foreground"
          aria-hidden="true"
        >
          <path d="m21 21-4.34-4.34"></path>
          <circle cx="11" cy="11" r="8"></circle>
        </svg>
        <input
          placeholder="Search title, company, location…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 bg-transparent text-sm outline-none"
        />
      </div>

      {/* Companies matching the search — surfaces a real company by name even when it currently
          has zero active postings, since /search/organizations doesn't require any. */}
      {isSearchMode && companies.length ? (
        <div className="mb-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Companies matching &quot;{trimmedQuery}&quot;
          </p>
          <div className="flex flex-wrap gap-3">
            {companies.map((company) => (
              <div
                key={company._id}
                onClick={() => handleSelectCompany(company)}
                className="flex cursor-pointer items-center gap-3 rounded-2xl border p-3 backdrop-blur transition"
                style={{
                  borderColor: activeCompanyId === company._id ? "var(--color-primary, #2f80ff)" : undefined,
                  backgroundColor: activeCompanyId === company._id ? "rgba(47,128,255,0.08)" : undefined,
                }}
              >
                <CompanyLogo organization={company} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{company.companyName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {company.industry || "Company"}
                  </p>
                </div>
                <Link
                  to={`/organizations/${company._id}`}
                  onClick={(event) => event.stopPropagation()}
                  className="ml-2 shrink-0 text-xs font-semibold text-primary hover:underline"
                >
                  View profile
                </Link>
              </div>
            ))}
          </div>
          {activeCompanyId ? (
            <button
              type="button"
              onClick={() => setActiveCompanyId("")}
              className="mt-2 text-xs font-semibold hover:underline"
              style={{
                background: "none",
                border: "none",
                padding: 0,
                color: "var(--muted-foreground, inherit)",
                fontWeight: 600,
                boxShadow: "none",
              }}
            >
              Clear company filter
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Jobs List */}
      <div className="space-y-3">
        {jobsQuery.isLoading ? (
          <div className="rounded-2xl border border-border/60 bg-card/70 p-8 text-center text-muted-foreground">
            Loading jobs...
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="rounded-2xl border border-border/60 bg-card/70 p-8 text-center text-muted-foreground">
            No jobs found. Try adjusting your search.
          </div>
        ) : (
          filteredJobs.map((job) => (
            <div
              key={job._id}
              onClick={() => navigate(`/jobs/${job._id}`)}
              className="relative cursor-pointer rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-5 shadow-elegant flex items-center gap-4"
            >
              {/* Company Logo */}
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-surface text-xl font-bold">
                {getInitial(job)}
              </div>

              {/* Job Details */}
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-base font-semibold">{job.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {job.organizationId?.companyName || "Company"} · {job.location || "Remote"}
                  {formatSalary(job.salary) ? ` · ${formatSalary(job.salary)}` : ""}
                </p>

                {/* Skills Tags */}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(job.skillsRequired || job.skills || [])
                    .slice(0, 3)
                    .map((skill, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-surface/70 px-2.5 py-0.5 text-xs font-medium"
                      >
                        {skill}
                      </span>
                    ))}
                </div>
              </div>

              {/* Match Score & Actions */}
              <div className="flex flex-col items-end gap-2">
                {/* Match Circle */}
                <div
                  className={`relative grid shrink-0 place-items-center rounded-full font-semibold tabular-nums h-12 w-12 text-xs bg-linear-to-r ${getMatchColor(
                    job.matchScore || 75
                  )} to-purple-500`}
                  style={{
                    background: `conic-gradient(var(--gradient-primary) ${(job.matchScore || 75) * 3.6}deg, oklch(0.93 0.01 250) 0deg)`,
                  }}
                >
                  <div className="grid h-[calc(100%-6px)] w-[calc(100%-6px)] place-items-center rounded-full bg-card">
                    {Math.round(job.matchScore || 75)}%
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleBookmark(job._id);
                    }}
                    className="grid h-8 w-8 place-items-center rounded-lg border border-border bg-surface p-0! text-muted-foreground hover:bg-surface/80"
                    title={bookmarked.has(job._id) ? "Remove bookmark" : "Bookmark job"}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill={bookmarked.has(job._id) ? "currentColor" : "none"}
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="lucide h-4 w-4"
                      aria-hidden="true"
                    >
                      <path d="M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z"></path>
                    </svg>
                  </button>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      navigate(`/jobs/${job._id}#apply`);
                    }}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-transparent bg-foreground py-0! px-3! text-xs font-semibold text-background hover:opacity-90"
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
                      className="lucide h-3.5 w-3.5"
                      aria-hidden="true"
                    >
                      <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"></path>
                      <path d="m21.854 2.147-10.94 10.939"></path>
                    </svg>
                    Apply
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </main>
  );
}
