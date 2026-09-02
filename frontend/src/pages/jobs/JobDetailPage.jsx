import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { apiRequest, apiFormRequest } from "../../services/api";
import { formatSalary } from "../../utils/formatSalary";
import { CompanyLogo } from "../../components/CompanyLogo";

// STYLING APPROACH — scoped global CSS (`.job-detail ...` in styles.css) on the shared --ph-*
// palette, the same system as .pro-home, .ai-gen and .jobs-page. This page is opened directly
// from the Jobs list, so it must not be the one surface still on Tailwind utilities: the
// semantic colour utilities this file used ("bg-card", "text-muted-foreground", "bg-foreground")
// generate NO CSS in this app, and the unlayered global `button { ... }` rule outranks any
// Tailwind utility on a <button>. Every colour below comes from --ph-* at :root.

const ICON_PATHS = {
  arrowLeft: (
    <>
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </>
  ),
  link: (
    <>
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </>
  ),
  mail: (
    <>
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </>
  ),
};

function Icon({ name, className = "jd-icon" }) {
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
      focusable="false"
    >
      {paths}
    </svg>
  );
}

function formatPostedOn(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

// The shell paints no page background of its own here, so these states are cards on the same
// canvas as the loaded page rather than the flat slab they used to be.
function JobDetailState({ backTo, children }) {
  return (
    <main className="job-detail">
      <Link to={backTo} className="jd-back">
        <Icon name="arrowLeft" className="jd-icon jd-icon--sm" />
        Back to jobs
      </Link>
      <p className="jd-state">{children}</p>
    </main>
  );
}

export function JobDetailPage() {
  const { jobId } = useParams();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [resumeFile, setResumeFile] = useState(null);
  const [fileError, setFileError] = useState("");
  const [applyError, setApplyError] = useState("");
  const [successResult, setSuccessResult] = useState(null);

  // /jobs is now the only path this page renders at. /pro/jobs/:jobId still resolves, but as a
  // redirect to /jobs/:jobId, so `pathname` can no longer start with /pro/ here and the old
  // two-way branch would have picked the same answer every time.
  const backTo = "/jobs";

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
    return <JobDetailState backTo={backTo}>Loading job…</JobDetailState>;
  }

  if (jobQuery.isError || !jobQuery.data?.job) {
    return <JobDetailState backTo={backTo}>Job not found.</JobDetailState>;
  }

  const { job, alreadyApplied, applicationStatus } = jobQuery.data;
  const organization = job.organizationId || {};
  const requiredSkills = job.skillsRequired || [];
  const preferredSkills = job.skills || [];
  const requirements = job.requirements || [];
  const customFields = job.customFields || [];
  const currentStatus = successResult ? "Pending" : applicationStatus;
  const showApplyForm = !alreadyApplied || currentStatus === "Withdrawn";

  const companyName = organization.companyName || "Company";
  // null for jobs posted before member attribution existed, or through the legacy shared
  // organization login. Stays null — the block below renders nothing rather than a placeholder.
  const postedBy = job.postedBy || null;
  const salaryLabel = formatSalary(job.salary);
  const postedOn = formatPostedOn(job.createdAt);
  // The backend rejects an application to a job that is not Active with a 400, so the form would
  // be a control that can never succeed. Both fields come straight off the Job document.
  const acceptingApplications = job.isActive !== false && job.status === "Active";
  // Only seekers can apply — applyToJob() throws 403 for anyone else, and /jobs/:jobId is also
  // reachable by SuperAdmin and Moderator sessions.
  const isSeeker = session?.role === "seeker";

  const metaParts = [companyName, job.location || "Remote", job.type].filter(Boolean);

  return (
    <main className="job-detail">
      <Link to={backTo} className="jd-back">
        <Icon name="arrowLeft" className="jd-icon jd-icon--sm" />
        Back to jobs
      </Link>

      <header className="jd-header">
        <CompanyLogo organization={organization} size="lg" />

        <div className="jd-header__body">
          <h1 className="jd-title">{job.title}</h1>
          <p className="jd-meta">{metaParts.join(" · ")}</p>
          {salaryLabel && <p className="jd-salary">{salaryLabel}</p>}
          {postedOn && <p className="jd-posted">Posted {postedOn}</p>}
        </div>

        {((isSeeker && alreadyApplied) || !acceptingApplications) && (
          <div className="jd-header__side">
            {isSeeker && alreadyApplied && (
              <span className="jd-pill jd-pill--success">
                Applied · {currentStatus || "Pending"}
              </span>
            )}
            {!acceptingApplications && <span className="jd-pill jd-pill--muted">Closed</span>}
          </div>
        )}
      </header>

      <div className="jd-split">
        {/* First in the DOM so that on a stacked layout the primary action sits above the
            description. Grid placement below moves it to the right rail on desktop — the visual
            order differs from the reading order without duplicating any markup. */}
        <section className="jd-card jd-apply" id="apply" aria-labelledby="jd-apply-heading">
          <h2 className="jd-card__title" id="jd-apply-heading">
            Apply
          </h2>

          {!isSeeker ? (
            <p className="jd-note">
              Applications are submitted by job seeker accounts. You are viewing this posting with
              a {session?.role || "staff"} account.
            </p>
          ) : !acceptingApplications ? (
            <p className="jd-note">This job is no longer accepting applications.</p>
          ) : !showApplyForm ? (
            <div className="jd-applied">
              <p className="jd-applied__title">Already applied</p>
              <p className="jd-applied__status">Status: {currentStatus || "Pending"}</p>
            </div>
          ) : successResult ? (
            <div className="jd-applied">
              <p className="jd-applied__title">
                Application submitted — ATS match: {Math.round(successResult.ats?.score ?? 0)}%
              </p>
              {successResult.ats?.tag && (
                <p className="jd-applied__status">{successResult.ats.tag}</p>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmitApplication} className="jd-form">
              <label className="jd-label" htmlFor="jd-resume">
                Resume (PDF)
              </label>
              <input
                id="jd-resume"
                type="file"
                accept="application/pdf"
                onChange={handleFileChange}
                className="jd-file"
              />
              {fileError && (
                <p className="jd-error" role="alert">
                  {fileError}
                </p>
              )}
              {applyError && (
                <p className="jd-error" role="alert">
                  {applyError}
                </p>
              )}
              <button
                type="submit"
                disabled={!resumeFile || applyMutation.isPending}
                className="jd-btn jd-btn--primary"
              >
                {applyMutation.isPending ? "Submitting…" : "Submit application"}
              </button>
            </form>
          )}
        </section>

        <div className="jd-main">
          {(requiredSkills.length > 0 || preferredSkills.length > 0) && (
            <section className="jd-card" aria-labelledby="jd-skills-heading">
              <h2 className="jd-card__title" id="jd-skills-heading">
                Skills
              </h2>

              {requiredSkills.length > 0 && (
                <div className="jd-skillgroup">
                  <p className="jd-eyebrow">Required</p>
                  <div className="jd-tags">
                    {requiredSkills.map((skill, idx) => (
                      <span key={idx} className="jd-tag">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {preferredSkills.length > 0 && (
                <div className="jd-skillgroup">
                  <p className="jd-eyebrow">Preferred</p>
                  <div className="jd-tags">
                    {preferredSkills.map((skill, idx) => (
                      <span key={idx} className="jd-tag jd-tag--preferred">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {job.description && (
            <section className="jd-card" aria-labelledby="jd-description-heading">
              <h2 className="jd-card__title" id="jd-description-heading">
                Description
              </h2>
              {/* Recruiter-authored free text. Rendered verbatim — whitespace-pre-line keeps the
                  author's own line and paragraph breaks; the string is never parsed or reflowed. */}
              <p className="jd-prose">{job.description}</p>
            </section>
          )}

          {requirements.length > 0 && (
            <section className="jd-card" aria-labelledby="jd-requirements-heading">
              <h2 className="jd-card__title" id="jd-requirements-heading">
                Requirements
              </h2>
              <ul className="jd-list">
                {requirements.map((requirement, idx) => (
                  <li key={idx}>{requirement}</li>
                ))}
              </ul>
            </section>
          )}

          {customFields.length > 0 && (
            <section className="jd-card" aria-labelledby="jd-details-heading">
              <h2 className="jd-card__title" id="jd-details-heading">
                Additional details
              </h2>
              <dl className="jd-dl">
                {customFields.map((field, idx) => (
                  <div key={idx} className="jd-dl__row">
                    <dt className="jd-dl__label">{field.label}</dt>
                    <dd className="jd-dl__value">{field.value || "—"}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {/* Posted by. Three states, and the whole block is omitted for the third:
                name + email  -> name, mailto link, company for context
                name only     -> name and company; NO mailto, no dangling label. This is a
                                 recruiter who has left, whose address the API withholds. The copy
                                 does not say so: why the email is missing is that person's
                                 employment information, not a job seeker's business.
                postedBy null -> nothing rendered. Jobs posted before member attribution existed
                                 have no person to name, and "About the company" below already
                                 carries the organisation. Never a fabricated name. */}
          {postedBy?.name && (
            <section className="jd-card jd-postedby" aria-labelledby="jd-postedby-heading">
              <p className="jd-eyebrow" id="jd-postedby-heading">
                Posted by
              </p>
              <p className="jd-postedby__name">{postedBy.name}</p>
              {postedBy.email && (
                <a className="jd-postedby__mail" href={`mailto:${postedBy.email}`}>
                  <Icon name="mail" className="jd-icon jd-icon--sm" />
                  <span className="jd-postedby__addr">{postedBy.email}</span>
                </a>
              )}
              <p className="jd-postedby__org">{companyName}</p>
            </section>
          )}
        </div>

        {(organization.description || organization.websiteUrl || organization.industry) && (
          <section className="jd-card jd-about" aria-labelledby="jd-about-heading">
            <p className="jd-eyebrow">About the company</p>
            <h2 className="jd-card__title" id="jd-about-heading">
              {companyName}
            </h2>

            {organization.description && (
              <p className="jd-about__text">{organization.description}</p>
            )}

            <dl className="jd-facts">
              {organization.industry && (
                <div className="jd-facts__row">
                  <dt>Industry</dt>
                  <dd>{organization.industry}</dd>
                </div>
              )}
              {organization.companySize && (
                <div className="jd-facts__row">
                  <dt>Size</dt>
                  <dd>{organization.companySize} employees</dd>
                </div>
              )}
              {organization.foundedYear && (
                <div className="jd-facts__row">
                  <dt>Founded</dt>
                  <dd>{organization.foundedYear}</dd>
                </div>
              )}
              {organization.headquartersLocation && (
                <div className="jd-facts__row">
                  <dt>Headquarters</dt>
                  <dd>{organization.headquartersLocation}</dd>
                </div>
              )}
            </dl>

            {organization.websiteUrl && (
              <a
                href={organization.websiteUrl}
                target="_blank"
                rel="noreferrer"
                className="jd-weblink"
              >
                <Icon name="link" className="jd-icon jd-icon--sm" />
                {organization.websiteUrl}
              </a>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
