import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../services/api";

/* ===============================================================================================
   Recruiter application picker (/recruiter/applications) — organization accounts only.
   ===============================================================================================
   Ported from raw pasted Tailwind. Several of the old classes rendered as literally nothing:
   `shadow-elegant` was never defined, and `bg-card/70` / `border-border/60` / `bg-success/15`
   applied an opacity modifier to a colour that tailwind.config.js maps to a bare `var(--…)`
   string — which produces an invalid value that the browser drops. The cards therefore had no
   background and no border at all, which is why the page read as flat and borderless, and why
   the old `hover:border-border` was invisible: there was no border to change.

   This page is a PICKER. Its whole job is to forward to /recruiter/applications/:jobId, so the
   applicant count is the one number a recruiter came here to compare — it gets the visual weight,
   and a row with zero applicants is deliberately quieter than one with twelve.

   ------------------------------------------------------------------------------------------------
   HERO — .ra-hero on --rc-hero-soft, NOT .hero-card.recruiter
   ------------------------------------------------------------------------------------------------
   Despite its name, .hero-card.recruiter is the older BLUE wash, and its dark override
   (styles.css ~6811) drops the accent entirely for a flat --surface-soft. Its only remaining
   consumer is the PUBLIC OrganizationPage. Every actual recruiter surface — Overview (.ro-hero),
   Job Postings (.jp-hero), Background Check (.bv-hero), Integrations, Settings (.rs-hero) —
   builds its own hero on --rc-hero-soft, which is teal in both themes. This follows them.

   ------------------------------------------------------------------------------------------------
   ROOT
   ------------------------------------------------------------------------------------------------
   .recruiter-applications is a TRANSPARENT LAYOUT CONTAINER — no background, no padding, no
   border, no radius, no width. .main-panel already pads and scrolls this region; the old
   `<main className="flex-1 px-6 py-6">` stacked a second set of padding on top of it (and
   `flex-1` did nothing, since the root is not a flex child). Painting a background on a page root
   is the exact bug that made .pro-home render as one giant card in dark mode.
   =============================================================================================== */

function Icon({ name, className = "ra-icon" }) {
  const paths = {
    briefcase: (
      <>
        <rect width="20" height="14" x="2" y="7" rx="2" />
        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      </>
    ),
    mapPin: (
      <>
        <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
        <circle cx="12" cy="10" r="3" />
      </>
    ),
    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      </>
    ),
    alert: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4" />
        <path d="M12 16h.01" />
      </>
    ),
    plus: (
      <>
        <path d="M5 12h14" />
        <path d="M12 5v14" />
      </>
    ),
    chevron: <path d="m9 18 6-6-6-6" />,
  }[name];

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
      focusable="false"
    >
      {paths}
    </svg>
  );
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/* Each row is a real <Link>, not the old `<div onClick>`. That div had no role, no tabIndex and no
   focus ring, so a keyboard or screen-reader user could not select a job at all. A link also gets
   middle-click and open-in-new-tab for free, which a div never will.

   The accessible name carries the job title AND the applicant count, so the row is distinguishable
   from its neighbours when read out of context. Status is spelled out in text — never colour
   alone. */
function JobRow({ job }) {
  const applicants = job.applicationCount ?? 0;
  const status = job.status || "Active";
  const location = job.location || "Flexible";

  return (
    <li className="ra-item">
      <Link
        className={`ra-row${applicants === 0 ? " ra-row--quiet" : ""}`}
        to={`/recruiter/applications/${job._id}`}
        aria-label={`Review ${plural(applicants, "applicant")} for ${job.title}`}
      >
        <span className="ra-row__tile" aria-hidden="true">
          <Icon name="briefcase" className="ra-icon" />
        </span>

        <span className="ra-row__body">
          <span className="ra-row__title">{job.title}</span>
          <span className="ra-row__where">
            <Icon name="mapPin" className="ra-icon ra-icon--sm" />
            {location}
          </span>
        </span>

        <span className="ra-row__side">
          <span className={`ra-pill ra-pill--${status === "Active" ? "ok" : "muted"}`}>{status}</span>
          {/* Job.type is a real enum (Full-time / Part-time / Contract / Internship / Remote) but
              is optional, and plenty of postings leave it unset. The old fallback printed
              "Open role" — a pill that looks like an employment type and is not one. An absent
              value renders no pill rather than a placeholder dressed as data. */}
          {job.type ? <span className="ra-pill">{job.type}</span> : null}
          {/* The count is the reason a recruiter is on this page, so it is a distinct element
              rather than a third identical pill. */}
          <span className={`ra-count${applicants > 0 ? " ra-count--live" : ""}`}>
            <Icon name="users" className="ra-icon ra-icon--sm" />
            <span className="ra-count__value">{applicants}</span>
            <span className="ra-count__label">{applicants === 1 ? "applicant" : "applicants"}</span>
          </span>
          <Icon name="chevron" className="ra-icon ra-icon--sm ra-row__chevron" />
        </span>
      </Link>
    </li>
  );
}

export function RecruiterApplicationsPage() {
  const { session } = useAuth();

  const jobsQuery = useQuery({
    queryKey: ["jobs", "recruiter-postings"],
    queryFn: () =>
      apiRequest("/jobs/mine?status=All", {
        token: session.accessToken,
      }),
    enabled: session?.role === "organization",
  });

  const recruiterJobs = jobsQuery.data?.jobs || [];

  // Unreachable in practice — the route sits inside <RoleRoute allowedRoles={["organization"]}>
  // (AppRouter.jsx:124). Kept as a defence-in-depth branch rather than deleted, but restyled so
  // there is no orphaned Tailwind left in this file.
  if (session?.role !== "organization") {
    return (
      <section className="recruiter-applications">
        <div className="ra-card ra-state">
          <p className="ra-state__title">Applications is organization-only</p>
          <p className="ra-state__text">
            This page is for organization accounts reviewing candidates.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="recruiter-applications">
      {/* ---- 1. Hero ------------------------------------------------------------------------- */}
      <header className="ra-hero">
        <div className="ra-hero__text">
          <p className="ra-eyebrow">Applications</p>
          <h1 className="ra-hero__title">Select a job</h1>
          <p className="ra-hero__sub">
            All of your job postings, regardless of status — pick one to review its applicants.
          </p>
        </div>
        {/* Only meaningful once the list has actually loaded; showing "0 jobs" while the request
            is still in flight would state something the page does not yet know. */}
        {jobsQuery.isSuccess ? (
          <span className="ra-hero__count">{plural(recruiterJobs.length, "job")}</span>
        ) : null}
      </header>

      {/* ---- 2. Job list --------------------------------------------------------------------- */}
      <div className="ra-card">
        {jobsQuery.isLoading ? (
          <p className="ra-state" role="status">
            Loading your jobs…
          </p>
        ) : jobsQuery.isError ? (
          /* A real error state. The old page branched only on isLoading and length, so a failed
             /jobs/mine rendered "No recruiter jobs available yet." — telling a recruiter they have
             no jobs when the request had actually errored. */
          <div className="ra-state ra-state--error" role="alert">
            <Icon name="alert" className="ra-icon ra-icon--sm" />
            <div className="ra-state__body">
              <p className="ra-state__title">Could not load your job postings</p>
              <p className="ra-state__text">
                {jobsQuery.error?.message || "Something went wrong fetching your jobs."}
              </p>
            </div>
            <button
              type="button"
              className="ra-btn"
              onClick={() => jobsQuery.refetch()}
              disabled={jobsQuery.isFetching}
            >
              {jobsQuery.isFetching ? "Retrying…" : "Try again"}
            </button>
          </div>
        ) : recruiterJobs.length ? (
          <ul className="ra-rows">
            {recruiterJobs.map((job) => (
              <JobRow key={job._id} job={job} />
            ))}
          </ul>
        ) : (
          /* Not a dead end: a new organization can act on this directly. */
          <div className="ra-state ra-state--empty">
            <p className="ra-state__title">No job postings yet</p>
            <p className="ra-state__text">
              Publish a role and its applicants will show up here for review.
            </p>
            <Link className="ra-btn ra-btn--primary" to="/recruiter/job-postings/new">
              <Icon name="plus" className="ra-icon ra-icon--sm" />
              Create a job posting
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
