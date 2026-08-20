import { useEffect, useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../services/api";

// Every value on this page comes from GET /jobs/mine/candidates, which aggregates the
// organization's OWN applications. There is no fixture data here and there must never be any: the
// previous version of this file rendered a hardcoded array of five people who do not exist.

function initialsOf(firstName, lastName) {
  const first = (firstName || "").trim();
  const last = (lastName || "").trim();
  const letters = `${first.charAt(0)}${last.charAt(0)}`.trim();
  return (letters || first.charAt(0) || "?").toUpperCase();
}

function fullName(candidate) {
  return `${candidate.firstName || ""} ${candidate.lastName || ""}`.trim() || "Unnamed candidate";
}

// yearsOfExperience is null when the seeker has no dated experience — render nothing rather than
// claiming "0y".
function formatExperience(years) {
  if (typeof years !== "number" || !Number.isFinite(years)) return null;
  if (years < 1) return "<1y";
  return `${Math.round(years)}y`;
}

function timeAgo(dateString) {
  if (!dateString) return null;
  const days = Math.floor((Date.now() - new Date(dateString).getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
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

function IconShield(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="m9 12 2 2 4-4" />
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

function IconCalendar(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M3 10h18" />
    </svg>
  );
}

function IconSearch(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

export function RecruiterCandidatesPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const uid = useId();
  const searchId = `${uid}-search`;

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);

  // Debounced and sent to the server — the endpoint does the filtering, so search works across the
  // whole candidate set rather than only the rows currently on screen.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  const candidatesQuery = useQuery({
    queryKey: ["jobs", "recruiter-candidates", debouncedSearch, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: "10" });
      if (debouncedSearch) params.set("q", debouncedSearch);
      return apiRequest(`/jobs/mine/candidates?${params.toString()}`, {
        token: session.accessToken,
      });
    },
    enabled: session?.role === "organization",
    keepPreviousData: true,
  });

  const candidates = candidatesQuery.data?.candidates || [];
  const summary = candidatesQuery.data?.summary;
  const pagination = candidatesQuery.data?.pagination;

  function openCandidate(candidate) {
    // There is no seeker-profile page in this app's router — /seekers/:id is an API route only.
    // The review workspace for the candidate's most recent application is where a recruiter can
    // actually act on them, so that is where the row goes.
    if (candidate.lastJobId) {
      navigate(`/recruiter/applications/${candidate.lastJobId}`);
    }
  }

  const kpis = [
    { key: "total", label: "Candidates", icon: IconUsers, value: summary?.total },
    { key: "verified", label: "Verified", icon: IconShield, value: summary?.verified },
    {
      key: "avg",
      label: "Avg match",
      icon: IconGauge,
      value: typeof summary?.avgMatch === "number" ? `${Math.round(summary.avgMatch)}%` : null,
      helper: "Best match per person",
    },
    { key: "interview", label: "In interview", icon: IconCalendar, value: summary?.inInterview },
  ];

  return (
    <section className="candidates-page">
      <header className="cd-hero">
        <div className="cd-hero__text">
          <p className="cd-eyebrow">Applicant pool</p>
          <h1 className="cd-hero__title">Candidates</h1>
          {/* Describes the sort the endpoint actually applies: bestMatch desc, then most recent. */}
          <p className="cd-hero__sub">
            Everyone who has applied to your postings, one row per person, ranked by their best
            match across your jobs.
          </p>
        </div>
      </header>

      <ul className="cd-kpis">
        {kpis.map(({ key, label, icon: Icon, value, helper }) => (
          <li key={key} className="cd-card cd-kpi">
            <p className="cd-kpi__label">
              <Icon className="cd-icon cd-icon--sm" />
              {label}
            </p>
            {value === null || value === undefined ? (
              <p className="cd-kpi__value cd-kpi__value--none">—</p>
            ) : (
              <p className="cd-kpi__value">{value}</p>
            )}
            {helper && <p className="cd-kpi__helper">{helper}</p>}
          </li>
        ))}
      </ul>

      <div className="cd-search">
        <label className="cd-search__label" htmlFor={searchId}>
          Search candidates
        </label>
        <div className="cd-search__control">
          <IconSearch className="cd-icon cd-search__icon" />
          <input
            id={searchId}
            type="search"
            className="cd-search__input"
            placeholder="Name, headline or skill"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-describedby={`${searchId}-hint`}
          />
        </div>
        <p className="cd-search__hint" id={`${searchId}-hint`}>
          Searches every candidate in your pool, not just the ones listed below.
        </p>
      </div>

      {candidatesQuery.isLoading ? (
        <p className="cd-card cd-state">Loading candidates...</p>
      ) : candidatesQuery.isError ? (
        <p className="cd-card cd-state cd-state--error">
          {candidatesQuery.error?.message || "Could not load your candidates."}
        </p>
      ) : candidates.length === 0 ? (
        <div className="cd-card cd-state">
          <p className="cd-state__title">
            {debouncedSearch ? "No candidates match that search" : "No candidates yet"}
          </p>
          <p>
            {debouncedSearch
              ? "Try a different name, headline or skill."
              : "Candidates appear here as soon as someone applies to one of your postings."}
          </p>
        </div>
      ) : (
        <>
          <ul className="cd-rows">
            {candidates.map((candidate) => {
              const name = fullName(candidate);
              const experience = formatExperience(candidate.yearsOfExperience);
              const applied = timeAgo(candidate.lastAppliedAt);
              const hasMatch = typeof candidate.bestMatch === "number";

              const meta = [
                candidate.tagline,
                experience && `${experience} experience`,
                candidate.applicationCount > 1
                  ? `${candidate.applicationCount} applications`
                  : candidate.lastJobTitle,
              ].filter(Boolean);

              const label = [
                name,
                candidate.verified ? "verified" : null,
                hasMatch ? `${candidate.bestMatch}% best match` : null,
                candidate.lastJobTitle ? `last applied to ${candidate.lastJobTitle}` : null,
              ]
                .filter(Boolean)
                .join(", ");

              return (
                <li key={candidate.seekerId} className="cd-card cd-row">
                  <button
                    type="button"
                    className="cd-row__main"
                    onClick={() => openCandidate(candidate)}
                    disabled={!candidate.lastJobId}
                    aria-label={`${label}. Open the application review for this candidate.`}
                  >
                    <span className="cd-avatar" aria-hidden="true">
                      {initialsOf(candidate.firstName, candidate.lastName)}
                    </span>

                    <span className="cd-row__body">
                      <span className="cd-row__nameline">
                        <span className="cd-row__name">{name}</span>
                        {/* Real text, not a bare icon — derived from Application.verificationStatus. */}
                        {candidate.verified && (
                          <span className="cd-pill cd-pill--ok">
                            <IconShield className="cd-icon cd-icon--xs" />
                            Verified
                          </span>
                        )}
                        {candidate.inInterview && (
                          <span className="cd-pill cd-pill--accent">In interview</span>
                        )}
                      </span>

                      {meta.length > 0 && (
                        <span className="cd-row__meta">{meta.join(" · ")}</span>
                      )}

                      {candidate.skills.length > 0 && (
                        <span className="cd-row__skills">
                          {candidate.skills.map((skill) => (
                            <span key={skill} className="cd-pill">
                              {skill}
                            </span>
                          ))}
                          {candidate.skillCount > candidate.skills.length && (
                            <span className="cd-pill">
                              +{candidate.skillCount - candidate.skills.length} more
                            </span>
                          )}
                        </span>
                      )}
                    </span>

                    <span className="cd-row__side">
                      {hasMatch ? (
                        <>
                          <span className="cd-row__match">{candidate.bestMatch}%</span>
                          <span className="cd-row__matchLabel">Best match</span>
                        </>
                      ) : (
                        <>
                          <span className="cd-row__match cd-row__match--none">—</span>
                          <span className="cd-row__matchLabel">Not scored</span>
                        </>
                      )}
                      {applied && <span className="cd-row__applied">Applied {applied}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {pagination && pagination.totalPages > 1 && (
            <nav className="cd-pager" aria-label="Candidate pages">
              <button
                type="button"
                className="cd-btn"
                onClick={() => setPage((current) => Math.max(current - 1, 1))}
                disabled={page <= 1 || candidatesQuery.isFetching}
              >
                Previous
              </button>
              <p className="cd-pager__status" aria-live="polite">
                Page {pagination.page} of {pagination.totalPages} · {pagination.total} candidates
              </p>
              <button
                type="button"
                className="cd-btn"
                onClick={() => setPage((current) => Math.min(current + 1, pagination.totalPages))}
                disabled={page >= pagination.totalPages || candidatesQuery.isFetching}
              >
                Next
              </button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
