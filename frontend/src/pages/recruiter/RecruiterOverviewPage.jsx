import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../services/api";

/* ===============================================================================================
   Recruiter overview (/recruiter/overview) — organization accounts only.
   ===============================================================================================
   DATA SOURCE IS UNCHANGED. All three queries and their keys are exactly what this page already
   used: /jobs/mine?status=All, /jobs/mine/overview and /chat/sessions. Nothing here reads
   /dashboard/recruiter — that controller invents match scores with Math.random(), hardcodes
   viewCount: 0, and filters Application on "Interviewed"/"OfferSent", which are not in the
   status enum, so those counts are structurally always zero.

   WHAT THE RESTYLE DID *NOT* ADD, AND WHY
     AI-screened funnel stage  The endpoint's funnel has five keys and none of them is an
                               AI-screening stage; the pipeline genuinely does not have one.
                               The honest alternative the brief allows — "applications carrying
                               an atsScore" — is not derivable either, because the endpoint
                               returns funnel COUNTS, not the underlying rows, and topCandidates
                               is capped at five. Adding it would need a backend change, so the
                               bar is omitted rather than faked.
     Profile views             Nothing counts views anywhere — not Organization, not Job, not
                               JobSeeker. The fourth KPI is verificationReadyForReview instead,
                               which is a real count off the same payload.
     "n of 5 checks complete"  VerificationRequest has a three-value status enum
                               (Pending / Submitted / Expired), not a checklist. Progress is
                               derived from that status and the status word is always shown.

   THE TEAL IS NEW IN A LITERAL SENSE: the previous version reached for bg-gradient-recruiter,
   shadow-recruiter and text-recruiter-foreground, none of which generate any CSS in this app —
   the @theme block declares fonts only. Every recruiter-accented element was rendering
   unstyled. The accent now comes from real --rc-* tokens.

   The root .recruiter-overview is a TRANSPARENT LAYOUT CONTAINER — no background, no padding of
   its own. .main-panel already pads and scrolls the region.
   =============================================================================================== */

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

function getInitials(name) {
  const initials = (name || "")
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return initials.slice(0, 2) || "?";
}

const VERIFICATION_LABELS = {
  NotStarted: "Not started",
  Pending: "Awaiting manager response",
  Submitted: "Ready for review",
  Expired: "Expired"
};

// Tone per VerificationRequest status. The enum is Pending / Submitted / Expired; "NotStarted" is
// synthesised by the controller for candidates with no request at all.
const VERIFICATION_TONE = {
  Submitted: "ok",
  Pending: "accent",
  Expired: "warn",
  NotStarted: "muted"
};

// Progress derived from the real status, NOT an invented step count. Pending means the request is
// out with the manager; Submitted means it came back and is waiting on the recruiter; Expired is
// terminal without an answer. There is no further state in the enum to progress to.
const VERIFICATION_PROGRESS = {
  NotStarted: 0,
  Pending: 50,
  Submitted: 100,
  Expired: 100
};

// Rendered visibly disabled with no Connect handler and no connected state. There is no
// integration model, route, controller or OAuth for any of these anywhere in the backend.
const ATS_PROVIDERS = ["Greenhouse", "Lever", "Workday", "BambooHR"];

function Icon({ path, className = "ro-icon" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {path}
    </svg>
  );
}

const ICONS = {
  plus: <><path d="M5 12h14" /><path d="M12 5v14" /></>,
  briefcase: <><path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /><rect width="20" height="14" x="2" y="6" rx="2" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><path d="M16 3.128a4 4 0 0 1 0 7.744" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><circle cx="9" cy="7" r="4" /></>,
  trend: <><path d="M16 7h6v6" /><path d="m22 7-8.5 8.5-5-5L2 17" /></>,
  shield: <><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /></>,
  arrow: <><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></>,
  plug: <><path d="M12 22v-5" /><path d="M15 8V2" /><path d="M17 8a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1z" /><path d="M9 8V2" /></>,
  inbox: <><path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z" /></>
};

function KpiCard({ icon, label, value, delta, helper }) {
  return (
    <li className="ro-card ro-kpi">
      <div className="ro-kpi__head">
        <p className="ro-kpi__label">{label}</p>
        <span className="ro-tile ro-tile--muted">
          <Icon path={icon} className="ro-icon ro-icon--sm" />
        </span>
      </div>
      <p className={`ro-kpi__value${value === "—" ? " ro-kpi__value--none" : ""}`}>{value}</p>
      <div className="ro-kpi__foot">
        {/* Only rendered when a real prior-period comparison exists. */}
        {delta ? (
          <span className={`ro-pill ro-pill--${delta.tone}`}>{delta.label}</span>
        ) : null}
        <span className="ro-kpi__helper">{helper}</span>
      </div>
    </li>
  );
}

export function RecruiterOverviewPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const isOrganization = session?.role === "organization";

  const jobsQuery = useQuery({
    queryKey: ["jobs", "recruiter-postings"],
    queryFn: () => apiRequest("/jobs/mine?status=All", { token: session.accessToken }),
    enabled: isOrganization
  });

  const overviewQuery = useQuery({
    queryKey: ["jobs", "recruiter-overview"],
    queryFn: () => apiRequest("/jobs/mine/overview", { token: session.accessToken }),
    enabled: isOrganization
  });

  const chatQuery = useQuery({
    queryKey: ["chat", "sessions"],
    queryFn: () => apiRequest("/chat/sessions", { token: session.accessToken }),
    enabled: Boolean(session?.accessToken)
  });

  const openRoles = jobsQuery.data?.jobs || [];
  const overview = overviewQuery.data?.overview;
  const chatSessions = chatQuery.data?.sessions || [];
  const recentMessages = [...chatSessions]
    .sort((left, right) => new Date(right.lastMessageAt || right.updatedAt || 0) - new Date(left.lastMessageAt || left.updatedAt || 0))
    .slice(0, 5);

  // Five stages, matching the five keys the endpoint actually returns. `offer` counts
  // Application status "Accepted" server-side — the label follows the endpoint, not the enum.
  const funnelStages = overview
    ? [
        { label: "Applied", count: overview.funnel.applied },
        { label: "Under review", count: overview.funnel.underReview },
        { label: "Interview", count: overview.funnel.interview },
        { label: "Offer", count: overview.funnel.offer },
        { label: "Rejected/Withdrawn", count: overview.funnel.rejectedOrWithdrawn }
      ]
    : [];
  const funnelMax = Math.max(1, ...funnelStages.map((stage) => stage.count));

  const readyForReview = overview?.verificationReadyForReview ?? 0;
  const companyName =
    session?.profile?.companyName || session?.username || "Hiring Team";

  const hasMatchAverage =
    overview?.avgMatchLast30Days !== null && overview?.avgMatchLast30Days !== undefined;

  return (
    <section className="recruiter-overview" aria-labelledby="ro-hero-title">
      <header className="ro-hero">
        <div className="ro-hero__text">
          <p className="ro-eyebrow">Recruiter command center</p>
          <h1 className="ro-hero__title" id="ro-hero-title">
            Welcome back, {companyName}
          </h1>
          <p className="ro-hero__sub">
            {overviewQuery.isLoading
              ? "Loading your latest activity…"
              : `${overview?.newApplicantsThisWeek ?? 0} new applications this week. ${readyForReview} background ${
                  readyForReview === 1 ? "check is" : "checks are"
                } ready for review.`}
          </p>
        </div>
        <button
          className="ro-btn ro-btn--primary"
          type="button"
          onClick={() => navigate("/recruiter/job-postings/new")}
        >
          <Icon path={ICONS.plus} className="ro-icon ro-icon--sm" />
          Post a job
        </button>
      </header>

      <ul className="ro-kpis">
        <KpiCard
          icon={ICONS.briefcase}
          label="Active postings"
          value={overview?.activePostings ?? "—"}
          helper={
            overview
              ? `${overview.postingsThisWeek} posted in the last 7 days`
              : "Roles currently open"
          }
        />
        <KpiCard
          icon={ICONS.users}
          label="New applicants (7d)"
          value={overview?.newApplicantsThisWeek ?? "—"}
          // The ONLY KPI on this page with a real prior-period comparison: the endpoint counts
          // the 7–14 day window separately and returns the change itself.
          delta={
            overview
              ? {
                  tone: overview.newApplicantsChangePct >= 0 ? "ok" : "warn",
                  label: `${overview.newApplicantsChangePct >= 0 ? "+" : ""}${overview.newApplicantsChangePct}% vs prior week`
                }
              : null
          }
          helper="Applications received"
        />
        <KpiCard
          icon={ICONS.trend}
          label="Avg match (30d)"
          value={hasMatchAverage ? `${overview.avgMatchLast30Days}%` : "—"}
          helper={hasMatchAverage ? "Mean ATS score across applicants" : "Not enough data yet"}
        />
        <KpiCard
          icon={ICONS.shield}
          label="Checks ready for review"
          value={overview ? readyForReview : "—"}
          helper="Background checks awaiting you"
        />
      </ul>

      <div className="ro-split">
        <div className="ro-column">
          {/* ---- Hiring funnel ---------------------------------------------------------- */}
          <article className="ro-card" aria-labelledby="ro-funnel-title">
            <div className="ro-card__head">
              <div>
                <p className="ro-eyebrow">Pipeline</p>
                <h2 className="ro-card__title" id="ro-funnel-title">
                  Hiring funnel
                </h2>
              </div>
              {/* Stated because it is what the endpoint computes, not a decorative label. */}
              <span className="ro-pill">Last 30 days</span>
            </div>

            {overviewQuery.isLoading ? (
              <p className="ro-empty">Loading funnel…</p>
            ) : overviewQuery.isError ? (
              <p className="ro-error">{overviewQuery.error?.message || "Could not load the funnel."}</p>
            ) : (
              // A real list with the count as text on every row — the bar is decorative and
              // aria-hidden, so nothing here depends on being able to compare bar lengths.
              <ul className="ro-funnel">
                {funnelStages.map((stage) => (
                  <li className="ro-funnel__row" key={stage.label}>
                    <span className="ro-funnel__label">{stage.label}</span>
                    <span className="ro-funnel__track" aria-hidden="true">
                      <span
                        className="ro-funnel__bar"
                        style={{ width: `${(stage.count / funnelMax) * 100}%` }}
                      />
                    </span>
                    <span className="ro-funnel__count">{stage.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </article>

          {/* ---- Top candidates --------------------------------------------------------- */}
          <article className="ro-card" aria-labelledby="ro-candidates-title">
            <div className="ro-card__head">
              <div>
                <p className="ro-eyebrow">Ranked by ATS score</p>
                <h2 className="ro-card__title" id="ro-candidates-title">
                  Top candidates this week
                </h2>
              </div>
              <a className="ro-link" href="/recruiter/applications">
                See all
                <Icon path={ICONS.arrow} className="ro-icon ro-icon--sm" />
              </a>
            </div>

            {overviewQuery.isLoading ? (
              <p className="ro-empty">Loading candidates…</p>
            ) : overview?.topCandidates?.length ? (
              <ul className="ro-rows">
                {overview.topCandidates.map((candidate) => {
                  const statusLabel =
                    VERIFICATION_LABELS[candidate.verificationStatus] || candidate.verificationStatus;

                  return (
                    <li key={candidate.applicationId}>
                      {/* A real button, so the row is keyboard-reachable. Its accessible name
                          carries the score and the check status as words, since the ring and the
                          pill both convey those with colour. */}
                      <button
                        className="ro-candidate"
                        type="button"
                        onClick={() => navigate("/recruiter/applications")}
                        aria-label={`${candidate.name}, ${candidate.atsScore}% match, ${statusLabel}`}
                      >
                        <span className="ro-avatar">{getInitials(candidate.name)}</span>

                        <span className="ro-candidate__body">
                          <span className="ro-candidate__name">{candidate.name}</span>
                          <span className="ro-candidate__meta">
                            {candidate.title} · {candidate.location}
                          </span>
                          <span className="ro-tags">
                            {candidate.skills.slice(0, 4).map((skill) => (
                              <span className="ro-tag" key={skill}>
                                {skill}
                              </span>
                            ))}
                          </span>
                        </span>

                        <span className="ro-candidate__side">
                          <span
                            className="ro-score"
                            style={{ "--ro-score-deg": `${candidate.atsScore * 3.6}deg` }}
                          >
                            <span className="ro-score__inner">{candidate.atsScore}%</span>
                          </span>
                          <span
                            className={`ro-pill ro-pill--${VERIFICATION_TONE[candidate.verificationStatus] || "muted"}`}
                          >
                            {statusLabel}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="ro-empty">No applications came in during the last 7 days.</p>
            )}
          </article>

          {/* ---- Open roles ------------------------------------------------------------- */}
          <article className="ro-card" aria-labelledby="ro-roles-title">
            <div className="ro-card__head">
              <div>
                <p className="ro-eyebrow">Job postings</p>
                <h2 className="ro-card__title" id="ro-roles-title">
                  Open roles
                </h2>
              </div>
            </div>

            {jobsQuery.isLoading ? (
              <p className="ro-empty">Loading job postings…</p>
            ) : openRoles.length ? (
              <ul className="ro-rows">
                {openRoles.map((role) => (
                  <li key={role._id}>
                    <button
                      className="ro-role"
                      type="button"
                      onClick={() => navigate(`/recruiter/job-postings/${role._id}`)}
                    >
                      <span className={`ro-tile${role.status === "Active" ? "" : " ro-tile--muted"}`}>
                        <Icon path={ICONS.briefcase} className="ro-icon ro-icon--sm" />
                      </span>
                      <span className="ro-role__body">
                        <span className="ro-role__title">{role.title}</span>
                        <span className="ro-role__meta">
                          {role.industry || "General"} · {role.location || "Remote"} ·{" "}
                          {timeAgo(role.createdAt)}
                        </span>
                      </span>
                      <span className="ro-role__side">
                        <span className="ro-pill">
                          <Icon path={ICONS.users} className="ro-icon ro-icon--sm" />
                          {role.applicationCount || 0}
                        </span>
                        <span className={`ro-pill ro-pill--${role.status === "Active" ? "ok" : "muted"}`}>
                          {role.status}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ro-empty">No job postings yet.</p>
            )}
          </article>
        </div>

        <aside className="ro-column">
          {/* ---- Background checks ------------------------------------------------------- */}
          <article className="ro-card" aria-labelledby="ro-checks-title">
            <div className="ro-card__head">
              <div>
                <p className="ro-eyebrow">Free service</p>
                <h2 className="ro-card__title" id="ro-checks-title">
                  Background checks
                </h2>
              </div>
            </div>

            {overviewQuery.isLoading ? (
              <p className="ro-empty">Loading…</p>
            ) : overview?.backgroundChecks?.length ? (
              <ul className="ro-rows">
                {overview.backgroundChecks.map((check) => {
                  const statusLabel = VERIFICATION_LABELS[check.status] || check.status;
                  const progress = VERIFICATION_PROGRESS[check.status] ?? 0;

                  return (
                    <li className="ro-check" key={check.id}>
                      <div className="ro-check__head">
                        <span className="ro-check__name">{check.name}</span>
                        <span className={`ro-pill ro-pill--${VERIFICATION_TONE[check.status] || "muted"}`}>
                          {statusLabel}
                        </span>
                      </div>
                      {/* Progress comes from the status, and the status word is always visible
                          above it — the bar never carries information on its own. */}
                      <div
                        className="ro-progress"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={progress}
                        aria-label={`${check.name}: ${statusLabel}`}
                      >
                        <span
                          className={`ro-progress__fill${check.status === "Expired" ? " ro-progress__fill--warn" : ""}`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <p className="ro-check__meta">Requested {timeAgo(check.requestedAt)}</p>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="ro-empty">No background checks requested yet.</p>
            )}

            {/* Kept, but labelled for what it does: a check is triggered per application
                (POST /verification/:applicationId/trigger), so this goes to the list where an
                application can be picked rather than pretending to create one from here. */}
            <button
              className="ro-btn ro-btn--dashed"
              type="button"
              onClick={() => navigate("/recruiter/applications")}
            >
              <Icon path={ICONS.plus} className="ro-icon ro-icon--sm" />
              Request a check from an application
            </button>
          </article>

          {/* ---- ATS & HRIS -------------------------------------------------------------- */}
          <article className="ro-card" aria-labelledby="ro-ats-title">
            <div className="ro-card__head">
              <div>
                <p className="ro-eyebrow">Connect</p>
                <h2 className="ro-card__title" id="ro-ats-title">
                  ATS &amp; HRIS
                </h2>
              </div>
              <span className="ro-tile ro-tile--muted">
                <Icon path={ICONS.plug} className="ro-icon ro-icon--sm" />
              </span>
            </div>

            <p className="ro-note">
              None of these are built yet — there is no integration behind any of them, so none can
              be connected. They are listed so it is clear what is planned, not what is running.
            </p>

            <ul className="ro-ats">
              {ATS_PROVIDERS.map((name) => (
                <li className="ro-ats__item" key={name} aria-disabled="true">
                  <span className="ro-ats__name">{name}</span>
                  <span className="ro-pill">Not built</span>
                </li>
              ))}
            </ul>
          </article>

          {/* ---- Messages ---------------------------------------------------------------- */}
          <article className="ro-card" aria-labelledby="ro-inbox-title">
            <div className="ro-card__head">
              <div>
                <p className="ro-eyebrow">Inbox</p>
                <h2 className="ro-card__title" id="ro-inbox-title">
                  Messages
                </h2>
              </div>
              <span className="ro-tile ro-tile--muted">
                <Icon path={ICONS.inbox} className="ro-icon ro-icon--sm" />
              </span>
            </div>

            {chatQuery.isLoading ? (
              <p className="ro-empty">Loading messages…</p>
            ) : recentMessages.length ? (
              <ul className="ro-rows">
                {recentMessages.map((chatSession) => (
                  <li key={chatSession._id}>
                    <button className="ro-message" type="button" onClick={() => navigate("/chat")}>
                      <span className="ro-dot" aria-hidden="true" />
                      <span className="ro-message__body">
                        <span className="ro-message__name">
                          {chatSession.otherParticipant?.display?.name || "Conversation"}
                        </span>
                        <span className="ro-message__preview">
                          {chatSession.lastMessage || "No messages yet"}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ro-empty">No conversations yet.</p>
            )}
          </article>
        </aside>
      </div>
    </section>
  );
}
