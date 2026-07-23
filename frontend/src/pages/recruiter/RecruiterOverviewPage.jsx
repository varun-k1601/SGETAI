export function RecruiterOverviewPage() {
  const candidates = [
    {
      id: 1,
      initials: "AR",
      name: "Alex Rivera",
      title: "Senior Frontend Engineer",
      experience: "8y",
      location: "San Francisco",
      skills: ["React", "TypeScript", "GraphQL"],
      match: 96,
      verified: true,
    },
    {
      id: 2,
      initials: "JT",
      name: "Jamie Tanaka",
      title: "Full-Stack Engineer",
      experience: "6y",
      location: "Remote (NYC)",
      skills: ["Next.js", "Node", "Postgres"],
      match: 92,
      verified: false,
    },
    {
      id: 3,
      initials: "SP",
      name: "Sasha Patel",
      title: "Staff Engineer",
      company: "ex-Stripe",
      location: "Seattle",
      skills: ["Go", "Distributed", "K8s"],
      match: 89,
      verified: false,
    },
    {
      id: 4,
      initials: "OB",
      name: "Olivia Brooks",
      title: "Senior Engineer",
      experience: "7y",
      location: "London",
      skills: ["React", "Rust", "WebGPU"],
      match: 84,
      verified: false,
    },
    {
      id: 5,
      initials: "DO",
      name: "Daniel Okafor",
      title: "Frontend Engineer",
      experience: "5y",
      location: "Berlin",
      skills: ["Vue", "TypeScript", "CSS"],
      match: 78,
      verified: false,
    },
  ];

  const backgroundChecks = [
    {
      id: 1,
      name: "Alex Rivera",
      status: "completed",
      progress: 100,
      checks: { completed: 5, total: 5 },
    },
    {
      id: 2,
      name: "Jamie Tanaka",
      status: "in-progress",
      progress: 60,
      checks: { completed: 3, total: 5 },
    },
    {
      id: 3,
      name: "Sasha Patel",
      status: "queued",
      progress: 0,
      checks: { completed: 0, total: 5 },
    },
  ];

  const openRoles = [
    {
      id: 1,
      title: "Senior Frontend Engineer",
      department: "Engineering",
      location: "San Francisco / Remote",
      postedDaysAgo: "5d ago",
      applicants: 142,
      status: "active",
    },
    {
      id: 2,
      title: "Staff Backend Engineer",
      department: "Engineering",
      location: "Seattle",
      postedDaysAgo: "2d ago",
      applicants: 88,
      status: "active",
    },
    {
      id: 3,
      title: "Product Designer",
      department: "Design",
      location: "Remote",
      postedDaysAgo: "1w ago",
      applicants: 213,
      status: "active",
    },
    {
      id: 4,
      title: "Engineering Manager",
      department: "Engineering",
      location: "New York",
      postedDaysAgo: "—",
      applicants: 34,
      status: "draft",
    },
  ];

  const messages = [
    "Alex Rivera asked about timeline",
    "Jamie Tanaka accepted interview",
    "Sasha Patel sent portfolio",
  ];

  const integrations = [
    { name: "Greenhouse", emoji: "🌱", connected: true },
    { name: "Lever", emoji: "🎚️", connected: false },
    { name: "Workday", emoji: "💼", connected: true },
    { name: "BambooHR", emoji: "🎋", connected: false },
  ];

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
                AI ranked 482 new applicants this week. 3 background checks are ready for review.
              </p>
            </div>
            <button className="inline-flex items-center gap-2 rounded-full bg-gradient-recruiter px-5 py-2.5 text-sm font-semibold text-recruiter-foreground shadow-recruiter hover:opacity-95">
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
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
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
            <div className="font-display text-2xl font-semibold tabular-nums">12</div>
            <div className="text-xs font-medium text-success">+2 this wk</div>
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
            New applicants
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <div className="font-display text-2xl font-semibold tabular-nums">482</div>
            <div className="text-xs font-medium text-success">+38%</div>
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
            Profile views
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <div className="font-display text-2xl font-semibold tabular-nums">2.1k</div>
            <div className="text-xs font-medium text-success">+12%</div>
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
            Avg match
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <div className="font-display text-2xl font-semibold tabular-nums">84%</div>
            <div className="text-xs font-medium text-success">↑ 5</div>
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
            <div className="space-y-2.5">
              {[
                { label: "Applied", count: 482, percentage: 100 },
                { label: "AI-screened", count: 264, percentage: 54.77 },
                { label: "Recruiter review", count: 96, percentage: 19.92 },
                { label: "Interview", count: 38, percentage: 7.88 },
                { label: "Offer", count: 9, percentage: 1.87 },
              ].map((stage, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <div className="w-32 text-xs font-medium text-muted-foreground">{stage.label}</div>
                  <div className="relative h-8 flex-1 overflow-hidden rounded-lg bg-muted/50">
                    <div
                      className="h-full rounded-lg bg-gradient-recruiter"
                      style={{ width: `${stage.percentage}%` }}
                    ></div>
                    <div className="absolute inset-y-0 left-3 flex items-center text-xs font-semibold text-white mix-blend-difference">
                      {stage.count}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Top Candidates */}
          <div className="relative rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-5 shadow-elegant">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  AI-ranked
                </p>
                <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">Top candidates this week</h2>
              </div>
              <a href="/recruiter/candidates" className="inline-flex items-center gap-1 text-xs font-medium text-primary">
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
              {candidates.map((candidate) => (
                <div
                  key={candidate.id}
                  className="flex items-center gap-4 rounded-2xl border border-border/60 bg-surface/60 p-4 transition hover:bg-surface hover:shadow-elegant"
                >
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-recruiter text-sm font-semibold text-recruiter-foreground">
                    {candidate.initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{candidate.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {candidate.title} · {candidate.experience || candidate.company} · {candidate.location}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {candidate.skills.map((skill, idx) => (
                        <span
                          key={idx}
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
                        background: `conic-gradient(var(--gradient-recruiter) ${candidate.match * 3.6}deg, oklch(0.93 0.01 250) 0deg)`,
                      }}
                    >
                      <div className="grid h-[calc(100%-6px)] w-[calc(100%-6px)] place-items-center rounded-full bg-card">
                        {candidate.match}%
                      </div>
                    </div>
                    {candidate.verified && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success">
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
                          className="lucide h-2.5 w-2.5"
                          aria-hidden="true"
                        >
                          <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"></path>
                          <path d="m9 12 2 2 4-4"></path>
                        </svg>
                        Verified
                      </span>
                    )}
                  </div>
                </div>
              ))}
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
              {openRoles.map((role) => (
                <div key={role.id} className="flex items-center gap-3 rounded-xl border border-border/40 bg-surface/40 p-3">
                  <div
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
                      role.status === "active" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
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
                      {role.department} · {role.location} · {role.postedDaysAgo}
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
                      {role.applicants}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-surface/70 px-2.5 py-0.5 text-xs font-medium capitalize">
                      {role.status}
                    </span>
                  </div>
                </div>
              ))}
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
              {backgroundChecks.map((check) => (
                <div key={check.id} className="rounded-xl border border-border/60 bg-surface/60 p-3">
                  <div className="flex items-center gap-2">
                    {check.status === "completed" ? (
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
                    ) : check.status === "in-progress" ? (
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
                    <span className="ml-auto text-[11px] capitalize text-muted-foreground">{check.status.replace("-", " ")}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-gradient-recruiter"
                      style={{ width: `${check.progress}%` }}
                    ></div>
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {check.checks.completed} / {check.checks.total} checks complete
                  </p>
                </div>
              ))}
              <button className="w-full rounded-xl border border-dashed border-border bg-surface/40 py-2.5 text-sm font-medium text-muted-foreground hover:bg-surface hover:text-foreground">
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
              {integrations.map((integration) => (
                <div key={integration.name} className="rounded-xl border border-border/60 bg-surface/60 p-3">
                  <div className="text-2xl">{integration.emoji}</div>
                  <p className="mt-1.5 truncate text-sm font-semibold">{integration.name}</p>
                  <span className={`mt-1 inline-flex items-center gap-1 text-[10px] font-semibold ${integration.connected ? "text-success" : "text-muted-foreground"}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${integration.connected ? "bg-success animate-pulse" : "bg-muted-foreground"}`}></span>
                    {integration.connected ? "Connected" : "Connect"}
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
              {messages.map((message, idx) => (
                <div key={idx} className="flex items-center gap-2 border-t border-border/40 py-2 first:border-t-0">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"></span>
                  <p className="truncate text-sm">{message}</p>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
