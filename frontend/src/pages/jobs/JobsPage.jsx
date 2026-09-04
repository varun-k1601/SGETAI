import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../services/api";
import { formatSalary } from "../../utils/formatSalary";
import { CompanyLogo } from "../../components/CompanyLogo";

// STYLING APPROACH — scoped global CSS (`.jobs-page ...` in styles.css), matching .pro-home and
// .ai-gen. Tailwind's semantic colour utilities generate no CSS in this app, and the unlayered
// global `button { ... }` rule outranks Tailwind utilities on a <button>. Colours all come from
// the shared --ph-* palette at :root, so the three Pro surfaces cannot drift.

const JOB_TYPES = ["Full-time", "Part-time", "Contract", "Internship", "Remote"];

// Applications written by the auto-apply worker. Both spellings are live in Application's own
// source enum (["Manual", "AutoApply", "auto"]), so matching one would undercount.
const AUTO_APPLY_SOURCES = new Set(["auto", "AutoApply"]);

// Rendered wherever a figure has no source in this system, so "we cannot measure this" is never
// confused with a measured zero.
const NOT_TRACKED = null;

const ICON_PATHS = {
  search: (
    <>
      <path d="m21 21-4.34-4.34" />
      <circle cx="11" cy="11" r="8" />
    </>
  ),
  filter: <path d="M3 4.5h18l-7 8v6l-4 2v-8z" />,
  zap: <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />,
  bell: (
    <>
      <path d="M10.268 21a2 2 0 0 0 3.464 0" />
      <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
    </>
  ),
  send: (
    <>
      <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" />
      <path d="m21.854 2.147-10.94 10.939" />
    </>
  ),
};

function Icon({ name, className = "jp-icon" }) {
  const paths = ICON_PATHS[name];

  if (!paths) {
    return null;
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {paths}
    </svg>
  );
}

function isWithinDays(dateValue, days) {
  const time = new Date(dateValue).getTime();
  if (Number.isNaN(time)) {
    return false;
  }
  return Date.now() - time <= days * 24 * 60 * 60 * 1000;
}

function jobIdOf(application) {
  return String(application.jobId?._id || application.jobId || "");
}

export function JobsPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // Read-only now: the write side goes through navigate() below so the fragment survives.
  const [searchParams] = useSearchParams();
  const urlQuery = searchParams.get("q") || "";
  const [searchQuery, setSearchQuery] = useState(urlQuery);
  const [activeCompanyId, setActiveCompanyId] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [jobType, setJobType] = useState("");
  const [remoteOnly, setRemoteOnly] = useState(false);

  // This route is reachable by admins too (/jobs allows SuperAdmin and Moderator), and by
  // non-Pro seekers (/pro/jobs sits in the seeker group, not behind ProRoute). Several endpoints
  // this page would like to call are gated server-side, so each is enabled only for the role that
  // can actually reach it — otherwise an admin's page would be built out of 403s.
  const isSeeker = session?.role === "seeker";
  const isProSeeker = isSeeker && Boolean(session?.isPro);

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
    /* navigate() with an explicit location object, not setSearchParams(). setSearchParams rewrites
       the URL as pathname + search ONLY and silently drops any fragment, so this effect erased the
       #hash of every deep link into this page the moment it first ran — /jobs#top settled on /jobs
       for free seekers, Pro seekers and admins alike. Naming search and hash separately keeps both.

       window.location.hash rather than useLocation().hash deliberately: this effect intentionally
       depends on trimmedQuery alone (adding more deps re-runs it on every URL write, which is a
       loop), so a hash captured in the closure would go stale. Read at call time it is always the
       live one. */
    const nextSearch = next.toString();
    navigate(
      { search: nextSearch ? `?${nextSearch}` : "", hash: window.location.hash },
      { replace: true }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmedQuery]);

  const hasFilters = Boolean(jobType) || remoteOnly;
  // The recommended-vs-search distinction is preserved: no query and no filters means the
  // profile-ranked recommendation feed. Two things also force search mode — an active filter
  // (recommendations take no filter params) and a non-seeker session, because
  // GET /recommendations/jobs throws 403 for anyone who is not a seeker.
  const isSearchMode = Boolean(trimmedQuery) || hasFilters || !isSeeker;

  const recommendedJobsQuery = useQuery({
    queryKey: ["jobs", "recommended"],
    queryFn: () =>
      apiRequest("/recommendations/jobs?limit=10", {
        token: session.accessToken,
      }),
    enabled: Boolean(session?.accessToken) && isSeeker && !isSearchMode,
  });

  const searchJobsQuery = useQuery({
    queryKey: ["jobs", "search", trimmedQuery, jobType, remoteOnly],
    queryFn: () => {
      const params = new URLSearchParams({ limit: "20" });
      if (trimmedQuery) {
        params.set("q", trimmedQuery);
      }
      if (jobType) {
        params.set("type", jobType);
      }
      if (remoteOnly) {
        params.set("remoteOnly", "true");
      }
      return apiRequest(`/search/jobs?${params.toString()}`, { token: session?.accessToken });
    },
    enabled: isSearchMode,
  });

  // /search/organizations is seeker-only server-side, which is why this stays gated on the role.
  const companiesQuery = useQuery({
    queryKey: ["jobs", "search-companies", trimmedQuery],
    queryFn: () =>
      apiRequest(`/search/organizations?q=${encodeURIComponent(trimmedQuery)}&limit=6`, {
        token: session.accessToken,
      }),
    enabled: Boolean(trimmedQuery) && Boolean(session?.accessToken) && isSeeker,
    retry: false,
  });

  // Shares its key with the Pro home so both pages read one cache entry.
  const applicationsQuery = useQuery({
    queryKey: ["applications", "mine"],
    queryFn: () => apiRequest("/applications/mine", { token: session.accessToken }),
    enabled: Boolean(session?.accessToken) && isSeeker,
  });

  const preferencesQuery = useQuery({
    queryKey: ["automations", "preferences"],
    queryFn: () => apiRequest("/pro/auto-apply/preferences", { token: session.accessToken }),
    enabled: Boolean(session?.accessToken) && isProSeeker,
  });

  const runsQuery = useQuery({
    queryKey: ["automations", "runs"],
    queryFn: () => apiRequest("/pro/auto-apply/runs", { token: session.accessToken }),
    enabled: Boolean(session?.accessToken) && isProSeeker,
  });

  const updatePreferencesMutation = useMutation({
    mutationFn: (patch) =>
      apiRequest("/pro/auto-apply/preferences", {
        method: "PUT",
        token: session.accessToken,
        body: patch,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations", "preferences"] });
      queryClient.invalidateQueries({ queryKey: ["automations", "runs"] });
    },
  });

  const jobsQuery = isSearchMode ? searchJobsQuery : recommendedJobsQuery;
  const jobs = jobsQuery.data?.jobs || [];
  const companies = companiesQuery.data?.organizations || [];
  const applications = applicationsQuery.data?.applications || [];
  const preferences = preferencesQuery.data?.preferences || {};
  const runs = runsQuery.data?.runs || [];

  const filteredJobs = jobs.filter(
    (job) => !activeCompanyId || String(job.organizationId?._id || job.organizationId) === activeCompanyId
  );

  const appliedJobIds = new Set(applications.map(jobIdOf));
  const autoAppliedJobIds = new Set(
    applications.filter((app) => AUTO_APPLY_SOURCES.has(app.source)).map(jobIdOf)
  );

  // ---- Real figures only. Anything without a source stays NOT_TRACKED.
  const matchThreshold =
    typeof preferences.matchThreshold === "number" ? preferences.matchThreshold : NOT_TRACKED;
  const jobsScanned = isProSeeker
    ? runs.reduce((sum, run) => sum + (run.jobsChecked || 0), 0)
    : NOT_TRACKED;
  // Only countable when the listed jobs actually carry a score. /search/jobs returns a text
  // relevance score, NOT a profile match, so search results have no matchScore at all — and this
  // deliberately reports nothing rather than counting them as zeroes.
  const scoredJobs = filteredJobs.filter((job) => Number.isFinite(job.matchScore));
  const aboveThreshold =
    matchThreshold === NOT_TRACKED || !scoredJobs.length
      ? NOT_TRACKED
      : scoredJobs.filter((job) => job.matchScore >= matchThreshold).length;

  const autoAppliedThisWeek = applications.filter(
    (app) => AUTO_APPLY_SOURCES.has(app.source) && isWithinDays(app.createdAt, 7)
  ).length;
  const interviews = applications.filter((app) => app.status === "Interview").length;
  // NO SOURCE: Application has no reply/response field of any kind, so a recruiter-response count
  // cannot be derived. A rendered 0 would read as "nobody replied" rather than "not tracked".
  const responses = NOT_TRACKED;

  const isAutoApplyOn = Boolean(preferences.enabled);

  function handleSelectCompany(company) {
    setActiveCompanyId((current) => (current === company._id ? "" : company._id));
  }

  function handleToggleAutoApply() {
    if (updatePreferencesMutation.isPending) {
      return;
    }
    updatePreferencesMutation.mutate({ enabled: !isAutoApplyOn });
  }

  const show = (value) => (value === NOT_TRACKED ? "—" : value);

  return (
    <main className="jobs-page">
      {/* ---------------------------------------------------------------- Hero */}
      <section className="jp-hero">
        <p className="jp-eyebrow">Job search</p>
        <h1 className="jp-hero__title">AI-curated openings</h1>
        <p className="jp-hero__sub">
          AI scanned {show(jobsScanned)} jobs · {show(aboveThreshold)} above your{" "}
          {matchThreshold === NOT_TRACKED ? "—" : `${matchThreshold}%`} threshold.
        </p>
        {isProSeeker ? null : (
          <p className="jp-hero__note">
            Those figures come from Pro auto-apply, which this account doesn&apos;t have — the
            listings below are live either way.
          </p>
        )}
      </section>

      {/* -------------------------------------------------------- Control bar */}
      <section className="jp-card">
        <div className="jp-controls__row">
          <label className="jp-sr-only" htmlFor="jobs-search">
            Search jobs
          </label>
          <span className="jp-search">
            <Icon name="search" />
            <input
              id="jobs-search"
              type="search"
              placeholder="Search role, company, or skill…"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </span>

          <button
            type="button"
            className="jp-btn"
            aria-expanded={filtersOpen}
            aria-controls="jobs-filters"
            onClick={() => setFiltersOpen((current) => !current)}
          >
            <Icon name="filter" />
            Filters{hasFilters ? " · on" : ""}
          </button>

          {/* Only rendered for accounts that actually have auto-apply — the PUT behind it is
              requirePro, so showing this to anyone else would be a control that 403s. */}
          {isProSeeker ? (
            <button
              type="button"
              className={`jp-btn ${isAutoApplyOn ? "jp-btn--toggle-on" : ""}`}
              aria-pressed={isAutoApplyOn}
              disabled={updatePreferencesMutation.isPending}
              onClick={handleToggleAutoApply}
            >
              <Icon name="zap" />
              Auto-apply: {isAutoApplyOn ? "ON" : "OFF"}
            </button>
          ) : null}
        </div>

        {filtersOpen ? (
          <div className="jp-filters" id="jobs-filters">
            {/* Both of these are real query parameters on GET /search/jobs. */}
            <span className="jp-field">
              <label htmlFor="jobs-type">Type</label>
              <select
                id="jobs-type"
                value={jobType}
                onChange={(event) => setJobType(event.target.value)}
              >
                <option value="">Any</option>
                {JOB_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </span>
            <span className="jp-field">
              <input
                id="jobs-remote"
                type="checkbox"
                checked={remoteOnly}
                onChange={(event) => setRemoteOnly(event.target.checked)}
              />
              <label htmlFor="jobs-remote">Remote only</label>
            </span>
            {hasFilters ? (
              <button
                type="button"
                className="jp-btn jp-btn--ghost jp-btn--sm"
                onClick={() => {
                  setJobType("");
                  setRemoteOnly(false);
                }}
              >
                Clear filters
              </button>
            ) : null}
          </div>
        ) : null}

        {/* MATCH THRESHOLD — READ-ONLY BY DESIGN, identical treatment to the Pro seeker home.
            getAutoApplyPreferences overwrites the seeker's stored matchThreshold with
            platformPolicy.matchThreshold before responding, updateAutoApplyPreferences ignores
            any matchThreshold in the body, and autoApplyWorker resolves
            job.autoApplyThreshold ?? platformPolicy — the seeker's own value is never read.
            A draggable control here would be a lie the backend silently discards. */}
        {matchThreshold === NOT_TRACKED ? null : (
          <div className="jp-threshold">
            <div className="jp-threshold__head">
              <p className="jp-eyebrow">Match threshold</p>
              <p className="jp-threshold__value">{matchThreshold}%</p>
            </div>
            <input
              type="range"
              className="jp-threshold__slider"
              /* Data, not styling: the platform value drives how far the filled portion runs. */
              style={{ "--jp-threshold-fill": `${matchThreshold}%` }}
              min="0"
              max="100"
              value={matchThreshold}
              disabled
              readOnly
              aria-disabled="true"
              aria-label={`Match threshold, set by platform policy to ${matchThreshold} percent`}
              aria-describedby="jobs-threshold-caption"
            />
            <p className="jp-threshold__caption" id="jobs-threshold-caption">
              Set by platform policy and the same for every seeker — auto-apply only fires at{" "}
              {matchThreshold}% match or above. This is not adjustable from your account.
            </p>
          </div>
        )}
      </section>

      <div className="jp-split">
        {/* --------------------------------------------------------- Job list */}
        <div className="jp-results">
          <div className="jp-results__head">
            <p className="jp-eyebrow">
              {isSearchMode ? "Search results" : "Recommended for you"}
            </p>
            <p className="jp-eyebrow">
              {filteredJobs.length} {filteredJobs.length === 1 ? "role" : "roles"}
            </p>
          </div>

          {jobsQuery.isLoading ? (
            <p className="jp-card jp-empty">Loading jobs…</p>
          ) : jobsQuery.isError ? (
            <p className="jp-card jp-empty">
              {jobsQuery.error?.message || "We could not load jobs right now."}
            </p>
          ) : filteredJobs.length === 0 ? (
            <p className="jp-card jp-empty">No jobs found. Try adjusting your search.</p>
          ) : (
            <ul className="jp-jobs">
              {filteredJobs.map((job) => {
                const jobId = String(job._id);
                const isApplied = appliedJobIds.has(jobId);
                const isAutoApplied = autoAppliedJobIds.has(jobId);
                const hasScore = Number.isFinite(job.matchScore);
                const salary = formatSalary(job.salary);

                return (
                  <li key={job._id}>
                    <article
                      className="jp-job"
                      onClick={() => navigate(`/jobs/${job._id}`)}
                    >
                      <CompanyLogo organization={job.organizationId} size="md" />

                      <div className="jp-job__body">
                        <div className="jp-job__top">
                          {/* The link is what makes the card keyboard-reachable and gives it its
                              accessible name; the card-level click is a mouse convenience. */}
                          <Link
                            className="jp-job__title"
                            to={`/jobs/${job._id}`}
                            onClick={(event) => event.stopPropagation()}
                          >
                            {job.title}
                          </Link>
                          {isAutoApplied ? (
                            <span className="jp-pill jp-pill--success">Auto-applied</span>
                          ) : null}
                        </div>

                        <p className="jp-job__meta">
                          {job.organizationId?.companyName || "Company"} ·{" "}
                          {job.location || "Remote"}
                          {salary ? ` · ${salary}` : ""}
                        </p>

                        {job.description ? (
                          <p className="jp-job__desc">{job.description}</p>
                        ) : null}

                        {(job.skillsRequired || job.skills || []).length ? (
                          <div className="jp-job__skills">
                            {(job.skillsRequired || job.skills || [])
                              .slice(0, 4)
                              .map((skill, index) => (
                                <span key={`${skill}-${index}`} className="jp-pill">
                                  {skill}
                                </span>
                              ))}
                          </div>
                        ) : null}
                      </div>

                      <div className="jp-job__side">
                        {/* The number and the word "match" carry the value — never colour alone.
                            Search results genuinely have no profile match score (the backend
                            returns text relevance instead), so they show an em dash rather than a
                            made-up percentage. */}
                        <p className={`jp-match ${hasScore ? "" : "jp-match--none"}`}>
                          <span className="jp-match__value">
                            {hasScore ? `${Math.round(job.matchScore)}%` : "—"}
                          </span>
                          <span className="jp-match__label">Match</span>
                          {hasScore ? null : (
                            <span className="jp-sr-only">
                              Match score is only calculated for recommended roles.
                            </span>
                          )}
                        </p>

                        {isApplied ? (
                          <span className="jp-pill jp-pill--success">Applied</span>
                        ) : (
                          <button
                            type="button"
                            className="jp-btn jp-btn--primary jp-btn--sm"
                            aria-label={`Apply to ${job.title}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              navigate(`/jobs/${job._id}#apply`);
                            }}
                          >
                            <Icon name="send" />
                            Apply
                          </button>
                        )}
                      </div>
                    </article>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* -------------------------------------------------------------- Rail */}
        <aside className="jp-rail" aria-label="Job search summary">
          {/* Companies matching the search. AppShell's global search routes ambiguous queries
              here and expects BOTH jobs and companies (see handleGlobalSearch), so this section
              moved into the rail rather than being dropped — the reference has no slot for it. */}
          {trimmedQuery && companies.length ? (
            <section className="jp-card">
              <p className="jp-eyebrow">Companies</p>
              <h2 className="jp-card__title">Matching &ldquo;{trimmedQuery}&rdquo;</h2>
              <ul className="jp-companies">
                {companies.map((company) => (
                  <li key={company._id}>
                    <button
                      type="button"
                      className={`jp-company ${
                        activeCompanyId === company._id ? "jp-company--active" : ""
                      }`}
                      aria-pressed={activeCompanyId === company._id}
                      onClick={() => handleSelectCompany(company)}
                    >
                      <CompanyLogo organization={company} size="sm" />
                      <span className="jp-company__body">
                        <span className="jp-company__name">{company.companyName}</span>
                        <span className="jp-company__industry">
                          {company.industry || "Company"}
                        </span>
                      </span>
                      <Link
                        to={`/organizations/${company._id}`}
                        className="jp-company__link"
                        onClick={(event) => event.stopPropagation()}
                      >
                        View
                      </Link>
                    </button>
                  </li>
                ))}
              </ul>
              {activeCompanyId ? (
                <button
                  type="button"
                  className="jp-btn jp-btn--ghost jp-btn--sm jp-clear-filter"
                  onClick={() => setActiveCompanyId("")}
                >
                  Clear company filter
                </button>
              ) : null}
            </section>
          ) : null}

          <section className="jp-card">
            <p className="jp-eyebrow">Saved searches</p>
            <h2 className="jp-card__title">Alerts</h2>
            {/* There is no SavedSearch or Alert model, endpoint or controller in this codebase,
                and no "new since last view" tracking either. Rendering a save button or a "3 new"
                counter would be inventing both the data and the feature, so this is an honest
                empty state with no interactive control behind it. */}
            <p className="jp-empty">
              <Icon name="bell" />
              <br />
              Saved searches and alerts aren&apos;t available yet.
            </p>
          </section>

          <section className="jp-card">
            <p className="jp-eyebrow">This week</p>
            <h2 className="jp-card__title">Auto-apply summary</h2>
            <p className="jp-summary__value">{show(isSeeker ? autoAppliedThisWeek : NOT_TRACKED)}</p>
            <p className="jp-summary__line">
              jobs applied · {show(responses)} responses · {show(isSeeker ? interviews : NOT_TRACKED)}{" "}
              interviews
            </p>
            <p className="jp-summary__note">
              Recruiter responses aren&apos;t tracked on applications, so that figure has no source
              to read from.
            </p>
          </section>
        </aside>
      </div>
    </main>
  );
}
