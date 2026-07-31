import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
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
                Recruiter command center
              </p>
              <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight lg:text-4xl">
                Welcome back, Hiring Team
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground lg:text-base">
                {overviewQuery.isLoading
                  ? "Loading your latest activity…"
                  : `${overview?.newApplicantsThisWeek ?? 0} new applications this week. ${overview?.verificationReadyForReview ?? 0} background ${
                      (overview?.verificationReadyForReview ?? 0) === 1 ? "check is" : "checks are"
                    } ready for review.`}
              </p>
            </div>
            <button
              onClick={() => navigate("/recruiter/job-postings/new")}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-recruiter px-5 py-2.5 text-sm font-semibold text-recruiter-foreground shadow-recruiter hover:opacity-95"
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
              Post a job
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
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
            Active postings
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <div className="font-display text-2xl font-semibold tabular-nums">
              {overview?.activePostings ?? "—"}
            </div>
            {overview ? (
              <div className="text-xs font-medium text-success">+{overview.postingsThisWeek} this wk</div>
            ) : null}
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
            New applicants (7d)
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <div className="font-display text-2xl font-semibold tabular-nums">
              {overview?.newApplicantsThisWeek ?? "—"}
            </div>
            {overview ? (
              <div className={`text-xs font-medium ${overview.newApplicantsChangePct >= 0 ? "text-success" : "text-red-500"}`}>
                {overview.newApplicantsChangePct >= 0 ? "+" : ""}
                {overview.newApplicantsChangePct}% vs prior wk
              </div>
            ) : null}
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
              <path d="M16 7h6v6"></path>
              <path d="m22 7-8.5 8.5-5-5L2 17"></path>
            </svg>
            Avg match (30d)
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            {overview?.avgMatchLast30Days !== null && overview?.avgMatchLast30Days !== undefined ? (
              <div className="font-display text-2xl font-semibold tabular-nums">{overview.avgMatchLast30Days}%</div>
            ) : (
              <div className="font-display text-sm font-semibold text-muted-foreground">Not enough data yet</div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-12 gap-6">
        <section className="col-span-12 space-y-5 lg:col-span-8">
          {/* Hiring Funnel */}
          <div className="relative rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-5 shadow-recruiter">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Pipeline
                </p>
                <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">Hiring funnel</h2>
              </div>
              <span className="text-xs text-muted-foreground">Last 30 days</span>
            </div>
            {overviewQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading funnel…</p>
            ) : (
              <div className="space-y-2.5">
                {funnelStages.map((stage) => (
                  <div key={stage.label} className="flex items-center gap-3">
                    <div className="w-36 text-xs font-medium text-muted-foreground">{stage.label}</div>
                    <div className="relative h-8 flex-1 overflow-hidden rounded-lg bg-muted/50">
                      <div
                        className="h-full rounded-lg bg-gradient-recruiter"
                        style={{ width: `${(stage.count / funnelMax) * 100}%` }}
                      ></div>
                      <div className="absolute inset-y-0 left-3 flex items-center text-xs font-semibold text-white mix-blend-difference">
                        {stage.count}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Top Candidates */}
          <div className="relative rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-5 shadow-elegant">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Ranked by ATS score
                </p>
                <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">Top candidates this week</h2>
              </div>
              <a
                href="/recruiter/applications"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary"
              >
                See all
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
                  className="lucide h-3 w-3"
                  aria-hidden="true"
                >
                  <path d="M5 12h14"></path>
                  <path d="m12 5 7 7-7 7"></path>
                </svg>
              </a>
            </div>
            <div className="space-y-3">
              {overviewQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading candidates…</p>
              ) : overview?.topCandidates?.length ? (
                overview.topCandidates.map((candidate) => (
                  <div
                    key={candidate.applicationId}
                    className="flex items-center gap-4 rounded-2xl border border-border/60 bg-surface/60 p-4 transition hover:bg-surface hover:shadow-elegant"
                  >
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-recruiter text-sm font-semibold text-recruiter-foreground">
                      {getInitials(candidate.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{candidate.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {candidate.title} · {candidate.location}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {candidate.skills.slice(0, 4).map((skill) => (
                          <span
                            key={skill}
                            className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-surface/70 px-2.5 py-0.5 text-xs font-medium"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div
                        className="relative grid shrink-0 place-items-center rounded-full font-semibold tabular-nums h-12 w-12 text-xs"
                        style={{
                          background: `conic-gradient(var(--gradient-recruiter) ${candidate.atsScore * 3.6}deg, oklch(0.93 0.01 250) 0deg)`
                        }}
                      >
                        <div className="grid h-[calc(100%-6px)] w-[calc(100%-6px)] place-items-center rounded-full bg-card">
                          {candidate.atsScore}%
                        </div>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          candidate.verificationStatus === "Submitted"
                            ? "bg-success/15 text-success"
                            : candidate.verificationStatus === "Pending"
                              ? "bg-primary/15 text-primary"
                              : candidate.verificationStatus === "Expired"
                                ? "bg-red-500/15 text-red-500"
                                : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {VERIFICATION_LABELS[candidate.verificationStatus] || candidate.verificationStatus}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No applications came in during the last 7 days.</p>
              )}
            </div>
          </div>

          {/* Open Roles */}
          <div className="relative rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-5 shadow-elegant">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Job postings
                </p>
                <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">Open roles</h2>
              </div>
            </div>
            <div className="space-y-2">
              {jobsQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading job postings…</p>
              ) : openRoles.length ? (
                openRoles.map((role) => (
                  <div
                    key={role._id}
                    onClick={() => navigate(`/recruiter/job-postings/${role._id}`)}
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-border/40 bg-surface/40 p-3 hover:bg-surface/70"
                  >
                    <div
                      className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
                        role.status === "Active" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
                      }`}
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
                        <path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
                        <rect width="20" height="14" x="2" y="6" rx="2"></rect>
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{role.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {role.industry || "General"} · {role.location || "Remote"} · {timeAgo(role.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-surface/70 px-2.5 py-0.5 text-xs font-medium">
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
                          className="lucide h-3 w-3"
                          aria-hidden="true"
                        >
                          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                          <path d="M16 3.128a4 4 0 0 1 0 7.744"></path>
                          <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
                          <circle cx="9" cy="7" r="4"></circle>
                        </svg>
                        {role.applicationCount || 0}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-surface/70 px-2.5 py-0.5 text-xs font-medium capitalize">
                        {role.status}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No job postings yet.</p>
              )}
            </div>
          </div>
        </section>

        {/* Right Sidebar */}
        <aside className="col-span-12 space-y-4 lg:col-span-4">
          {/* Background Checks */}
          <div className="relative rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-5 shadow-elegant">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Free service
                </p>
                <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">Background checks</h2>
              </div>
            </div>
            <div className="space-y-3">
              {overviewQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : overview?.backgroundChecks?.length ? (
                overview.backgroundChecks.map((check) => (
                  <div key={check.id} className="rounded-xl border border-border/60 bg-surface/60 p-3">
                    <div className="flex items-center gap-2">
                      {check.status === "Submitted" ? (
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
                          className="lucide h-4 w-4 text-success"
                          aria-hidden="true"
                        >
                          <circle cx="12" cy="12" r="10"></circle>
                          <path d="m9 12 2 2 4-4"></path>
                        </svg>
                      ) : check.status === "Pending" ? (
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
                          className="lucide h-4 w-4 text-primary"
                          aria-hidden="true"
                        >
                          <circle cx="12" cy="12" r="10"></circle>
                          <path d="M12 6v6l4 2"></path>
                        </svg>
                      ) : (
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
                          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"></path>
                          <path d="M12 9v4"></path>
                          <path d="M12 17h.01"></path>
                        </svg>
                      )}
                      <span className="text-sm font-semibold">{check.name}</span>
                      <span className="ml-auto text-[11px] text-muted-foreground">
                        {VERIFICATION_LABELS[check.status] || check.status}
                      </span>
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">Requested {timeAgo(check.requestedAt)}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No background checks requested yet.</p>
              )}
              <button
                onClick={() => navigate("/recruiter/applications")}
                className="w-full rounded-xl border border-dashed border-border bg-surface/40 py-2.5 text-sm font-medium text-muted-foreground hover:bg-surface hover:text-foreground"
              >
                + New background check
              </button>
            </div>
          </div>

          {/* ATS & HRIS Integrations */}
          <div className="relative rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-5 shadow-elegant">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Connect
                </p>
                <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">ATS &amp; HRIS</h2>
              </div>
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
                <path d="M12 22v-5"></path>
                <path d="M15 8V2"></path>
                <path d="M17 8a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1z"></path>
                <path d="M9 8V2"></path>
              </svg>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { name: "Greenhouse", emoji: "🌱" },
                { name: "Lever", emoji: "🎚️" },
                { name: "Workday", emoji: "💼" },
                { name: "BambooHR", emoji: "🎋" }
              ].map((integration) => (
                <div key={integration.name} className="rounded-xl border border-border/60 bg-surface/60 p-3 opacity-70">
                  <div className="text-2xl">{integration.emoji}</div>
                  <p className="mt-1.5 truncate text-sm font-semibold">{integration.name}</p>
                  <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground"></span>
                    Coming soon
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Messages */}
          <div className="relative rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-5 shadow-elegant">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Inbox
                </p>
                <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">Messages</h2>
              </div>
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
                <path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"></path>
              </svg>
            </div>
            <div className="space-y-2 text-sm">
              {chatQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading messages…</p>
              ) : recentMessages.length ? (
                recentMessages.map((chatSession) => (
                  <div
                    key={chatSession._id}
                    onClick={() => navigate("/chat")}
                    className="flex cursor-pointer items-center gap-2 border-t border-border/40 py-2 first:border-t-0"
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"></span>
                    <p className="truncate text-sm">
                      <strong>{chatSession.otherParticipant?.display?.name || "Conversation"}</strong>
                      {chatSession.lastMessage ? `: ${chatSession.lastMessage}` : " — no messages yet"}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No conversations yet.</p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
