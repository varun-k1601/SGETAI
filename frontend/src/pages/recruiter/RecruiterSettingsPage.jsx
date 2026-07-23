import { useState } from "react";

export function RecruiterSettingsPage() {
  const [companyName, setCompanyName] = useState("Acme Talent");
  const [industry, setIndustry] = useState("SaaS / B2B");
  const [size, setSize] = useState("201–500");
  const [website, setWebsite] = useState("https://acme.com");

  const [notifications, setNotifications] = useState({
    dailyDigest: true,
    highMatch: true,
    backgroundCheck: true,
  });

  const recruiters = [
    {
      id: 1,
      initials: "MC",
      name: "Maya Cohen",
      email: "maya@acme.com",
      role: "Admin",
    },
    {
      id: 2,
      initials: "DP",
      name: "Devon Park",
      email: "devon@acme.com",
      role: "Recruiter",
    },
    {
      id: 3,
      initials: "SL",
      name: "Sara Lin",
      email: "sara@acme.com",
      role: "Hiring Manager",
    },
  ];

  const toggleNotification = (key) => {
    setNotifications((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

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
                Settings
              </p>
              <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight lg:text-4xl">
                Team & workspace
              </h1>
            </div>
          </div>
        </div>
      </div>

      {/* Settings Sections */}
      <div className="space-y-4">
        {/* Organization Profile */}
        <div className="relative rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-5 shadow-elegant">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Company
              </p>
              <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">
                Organization profile
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Company name
              </label>
              <input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border/60 bg-surface/70 px-3 py-2 text-sm outline-none focus:bg-surface transition"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Industry
              </label>
              <input
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border/60 bg-surface/70 px-3 py-2 text-sm outline-none focus:bg-surface transition"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Size
              </label>
              <input
                value={size}
                onChange={(e) => setSize(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border/60 bg-surface/70 px-3 py-2 text-sm outline-none focus:bg-surface transition"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Website
              </label>
              <input
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border/60 bg-surface/70 px-3 py-2 text-sm outline-none focus:bg-surface transition"
              />
            </div>
          </div>
        </div>

        {/* Team Section */}
        <div className="relative rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-5 shadow-elegant">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Team
              </p>
              <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">
                Recruiters
              </h2>
            </div>
            <button className="rounded-full bg-gradient-recruiter px-3 py-1 text-xs font-semibold text-recruiter-foreground shadow-recruiter hover:opacity-95 transition">
              Invite
            </button>
          </div>

          <div className="space-y-2">
            {recruiters.map((recruiter) => (
              <div
                key={recruiter.id}
                className="flex items-center gap-3 rounded-xl border border-border/40 bg-surface/40 p-3"
              >
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-recruiter text-xs font-semibold text-recruiter-foreground">
                  {recruiter.initials}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{recruiter.name}</p>
                  <p className="text-xs text-muted-foreground">{recruiter.email}</p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-surface/70 px-2.5 py-0.5 text-xs font-medium shrink-0">
                  {recruiter.role}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Notifications Section */}
        <div className="relative rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-5 shadow-elegant">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Notifications
              </p>
              <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">
                When to ping us
              </h2>
            </div>
          </div>

          <div className="space-y-3">
            {/* Daily Pipeline Digest */}
            <div className="flex items-center gap-4 rounded-xl border border-border/40 bg-surface/40 p-3">
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
                className="lucide h-4 w-4 text-muted-foreground shrink-0"
                aria-hidden="true"
              >
                <path d="M10.268 21a2 2 0 0 0 3.464 0"></path>
                <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"></path>
              </svg>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Daily pipeline digest</p>
                <p className="text-xs text-muted-foreground">
                  Morning summary of new applicants.
                </p>
              </div>
              <button
                onClick={() => toggleNotification("dailyDigest")}
                className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                  notifications.dailyDigest
                    ? "bg-gradient-recruiter"
                    : "bg-muted"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
                    notifications.dailyDigest ? "left-[22px]" : "left-0.5"
                  }`}
                ></span>
              </button>
            </div>

            {/* New High-Match Candidate */}
            <div className="flex items-center gap-4 rounded-xl border border-border/40 bg-surface/40 p-3">
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
                className="lucide h-4 w-4 text-muted-foreground shrink-0"
                aria-hidden="true"
              >
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                <path d="M16 3.128a4 4 0 0 1 0 7.744"></path>
                <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
                <circle cx="9" cy="7" r="4"></circle>
              </svg>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">New high-match candidate</p>
                <p className="text-xs text-muted-foreground">
                  Alert when match ≥ 90%.
                </p>
              </div>
              <button
                onClick={() => toggleNotification("highMatch")}
                className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                  notifications.highMatch
                    ? "bg-gradient-recruiter"
                    : "bg-muted"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
                    notifications.highMatch ? "left-[22px]" : "left-0.5"
                  }`}
                ></span>
              </button>
            </div>

            {/* Background Check Complete */}
            <div className="flex items-center gap-4 rounded-xl border border-border/40 bg-surface/40 p-3">
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
                className="lucide h-4 w-4 text-muted-foreground shrink-0"
                aria-hidden="true"
              >
                <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"></path>
                <path d="m9 12 2 2 4-4"></path>
              </svg>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Background check complete</p>
                <p className="text-xs text-muted-foreground">
                  Notify the moment a check finishes.
                </p>
              </div>
              <button
                onClick={() => toggleNotification("backgroundCheck")}
                className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                  notifications.backgroundCheck
                    ? "bg-gradient-recruiter"
                    : "bg-muted"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
                    notifications.backgroundCheck ? "left-[22px]" : "left-0.5"
                  }`}
                ></span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
