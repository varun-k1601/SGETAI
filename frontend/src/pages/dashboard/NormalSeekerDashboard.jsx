import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../services/api";
import { useState } from "react";

export function NormalSeekerDashboard() {
  const { session } = useAuth();
  const [commentText, setCommentText] = useState("");

  const applicationsQuery = useQuery({
    queryKey: ["applications", "dashboard"],
    queryFn: () =>
      apiRequest("/applications?limit=10", {
        token: session.accessToken,
      }),
    enabled: Boolean(session?.accessToken),
  });

  const jobsQuery = useQuery({
    queryKey: ["jobs", "recommended"],
    queryFn: () =>
      apiRequest("/jobs/recommended?limit=10", {
        token: session.accessToken,
      }),
    enabled: Boolean(session?.accessToken),
  });

  const firstName = session?.profile?.firstName || "User";
  const lastName = session?.profile?.lastName || "";
  const initials = `${firstName[0] || ""}${lastName[0] || ""}`.toUpperCase();
  const applications = applicationsQuery.data?.applications || [];
  const jobs = jobsQuery.data?.jobs || [];

  return (
    <main className="flex-1 px-6 py-6 lg:px-8 lg:py-8">
      <div className="relative mb-6 overflow-hidden rounded-3xl border border-border/60 bg-linear-to-br p-6 lg:p-8 from-primary/10 via-transparent to-transparent">
        <div className="absolute -right-20 -top-20 h-60 w-60 bg-primary/20 rounded-full blur-3xl"></div>
        <div className="relative">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Good morning
              </p>
              <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight lg:text-4xl">
                Welcome back, {firstName}
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground lg:text-base">
                {jobs.length} new jobs match your profile this week. Your network has 12 new updates.
              </p>
            </div>
            <a
              href="/upgrade"
              className="inline-flex items-center gap-2 rounded-full bg-linear-to-r from-purple-500 to-blue-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg hover:opacity-95"
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
                className="h-4 w-4"
              >
                <path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"></path>
                <path d="M20 2v4"></path>
                <path d="M22 4h-4"></path>
                <circle cx="4" cy="20" r="2"></circle>
              </svg>
              Upgrade to Pro
            </a>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Left Sidebar - Profile Card */}
        <aside className="col-span-12 space-y-4 lg:col-span-3">
          <div className="relative rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-5 shadow-elegant">
            <div className="-mx-5 -mt-5 h-16 rounded-t-2xl bg-linear-to-r from-purple-500 to-blue-500"></div>
            <div className="-mt-8 flex flex-col items-center text-center">
              <div className="grid h-16 w-16 place-items-center rounded-full border-4 border-card bg-linear-to-r from-purple-500 to-blue-500 text-lg font-semibold text-white shadow-lg">
                {initials}
              </div>
              <h3 className="mt-3 font-display font-semibold">
                {firstName} {lastName}
              </h3>
              <p className="text-xs text-muted-foreground">
                {session?.profile?.preferredRoles?.[0] || "Job Seeker"}
              </p>
            </div>
            <div className="mt-4 space-y-1 text-xs">
              <div className="flex items-center justify-between border-t border-border/60 py-2 first:border-t-0">
                <span className="text-muted-foreground">Profile views</span>
                <span className="font-semibold">284 <span className="text-green-500">+12%</span></span>
              </div>
              <div className="flex items-center justify-between border-t border-border/60 py-2 first:border-t-0">
                <span className="text-muted-foreground">Post impressions</span>
                <span className="font-semibold">3.2k <span className="text-green-500">+38%</span></span>
              </div>
              <div className="flex items-center justify-between border-t border-border/60 py-2 first:border-t-0">
                <span className="text-muted-foreground">Search appearances</span>
                <span className="font-semibold">47</span>
              </div>
            </div>
          </div>

          {/* Profile Strength */}
          <div className="relative rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-5 shadow-elegant">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  72% complete
                </p>
                <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">
                  Profile strength
                </h2>
              </div>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full w-[72%] rounded-full bg-linear-to-r from-purple-500 to-blue-500"></div>
            </div>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li className="flex items-center gap-2 text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-primary"></span> Add 2 more projects
              </li>
              <li className="flex items-center gap-2 text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-primary"></span> Upload intro video
              </li>
              <li className="flex items-center gap-2 text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-primary"></span> Add 3 more skills
              </li>
            </ul>
          </div>
        </aside>

        {/* Center - Feed */}
        <section className="col-span-12 space-y-4 lg:col-span-6">
          {/* Post Creation Widget */}
          <div className="rounded-2xl border border-border/60 bg-card/70 p-4 backdrop-blur-xl shadow-elegant">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-linear-to-r from-purple-500 to-blue-500 text-sm font-semibold text-white">
                {initials}
              </div>
              <button className="flex-1 rounded-full border border-border/60 bg-surface/80 px-4 py-2.5 text-left text-sm text-muted-foreground hover:bg-surface">
                Share an update, a job opening, or a win…
              </button>
            </div>
            <div className="mt-3 flex items-center gap-1 border-t border-border/60 pt-3 text-xs text-muted-foreground">
              <button className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 font-medium hover:bg-surface">
                📷 Photo
              </button>
              <button className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 font-medium hover:bg-surface">
                🎥 Video
              </button>
              <button className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 font-medium hover:bg-surface">
                📅 Event
              </button>
              <button className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 font-medium hover:bg-surface">
                ➤ Post job
              </button>
            </div>
          </div>

          {/* Feed Items - Job Recommendations */}
          {jobs.length > 0 ? (
            jobs.slice(0, 3).map((job, idx) => (
              <article
                key={job._id || idx}
                className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-xl shadow-elegant hover:shadow-xl transition"
              >
                <div className="flex items-start gap-3 p-5">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-linear-to-r from-purple-500 to-blue-500 text-sm font-semibold text-white">
                    {job.companyName?.[0]?.toUpperCase() || "J"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold leading-tight">{job.title}</h3>
                    <p className="text-xs text-muted-foreground">
                      {job.companyName || "Company"} · {job.location || "Remote"}
                    </p>
                    <p className="text-xs text-muted-foreground">2h ago</p>
                  </div>
                  <button className="rounded-full p-1.5 text-muted-foreground hover:bg-surface">
                    ⋯
                  </button>
                </div>
                <div className="px-5 pb-4">
                  <p className="text-[15px] leading-relaxed">{job.description || "Great opportunity matching your profile"}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-surface/70 px-2.5 py-0.5 text-xs font-medium text-primary">
                      #{job.type || "fulltime"}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-surface/70 px-2.5 py-0.5 text-xs font-medium text-primary">
                      #{job.industry || "tech"}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-border/60 px-3 py-2 text-sm text-muted-foreground">
                  <button className="flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium hover:bg-surface hover:text-foreground">
                    ❤️ 482
                  </button>
                  <button className="flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium hover:bg-surface hover:text-foreground">
                    💬 73
                  </button>
                  <button className="flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium hover:bg-surface hover:text-foreground">
                    ↗️ 41
                  </button>
                </div>
              </article>
            ))
          ) : (
            <div className="rounded-2xl border border-border/60 bg-card/70 p-8 text-center">
              <p className="text-muted-foreground">No job recommendations available yet</p>
            </div>
          )}
        </section>

        {/* Right Sidebar - Activity & Recommendations */}
        <aside className="col-span-12 space-y-4 lg:col-span-3">
          {/* Activity This Week */}
          <div className="relative rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-5 shadow-elegant">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Activity
                </p>
                <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">
                  This week
                </h2>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl border border-border/60 bg-card/70 p-4 backdrop-blur">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  👁️ Views
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <div className="font-display text-2xl font-semibold">284</div>
                  <div className="text-xs font-medium text-green-500">+12%</div>
                </div>
              </div>
              <div className="rounded-2xl border border-border/60 bg-card/70 p-4 backdrop-blur">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  💼 Apps
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <div className="font-display text-2xl font-semibold">{applications.length}</div>
                  <div className="text-xs font-medium text-green-500">Active</div>
                </div>
              </div>
              <div className="rounded-2xl border border-border/60 bg-card/70 p-4 backdrop-blur">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  💬 DMs
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <div className="font-display text-2xl font-semibold">4</div>
                  <div className="text-xs font-medium text-green-500">2 new</div>
                </div>
              </div>
              <div className="rounded-2xl border border-border/60 bg-card/70 p-4 backdrop-blur">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  📈 Match
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <div className="font-display text-2xl font-semibold">87%</div>
                  <div className="text-xs font-medium text-green-500">↑ 4</div>
                </div>
              </div>
            </div>
          </div>

          {/* Top Matches */}
          <div className="relative rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-5 shadow-elegant">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  For you
                </p>
                <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">
                  Top matches
                </h2>
              </div>
              <a href="/pro/jobs" className="text-xs font-medium text-primary inline-flex items-center gap-1">
                See all →
              </a>
            </div>
            <div className="space-y-3">
              {jobs.slice(0, 3).map((job, idx) => (
                <div key={job._id || idx} className="flex items-center gap-3 rounded-xl border border-border/60 bg-surface/60 p-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-surface text-base font-bold">
                    {job.companyName?.[0]?.toUpperCase() || "J"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{job.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {job.companyName} · {job.location}
                    </p>
                  </div>
                  <div className="relative grid shrink-0 place-items-center rounded-full font-semibold tabular-nums h-10 w-10 text-[10px] bg-linear-to-r from-purple-500/20 to-blue-500/20">
                    <div className="grid h-[calc(100%-6px)] w-[calc(100%-6px)] place-items-center rounded-full bg-card">
                      {87 - idx * 3}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Applications In Progress */}
          <div className="relative rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-5 shadow-elegant">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Applications
                </p>
                <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">
                  In progress
                </h2>
              </div>
            </div>
            <div className="space-y-2">
              {applications.slice(0, 3).map((app, idx) => (
                <div key={app._id || idx} className="flex items-center gap-2 text-sm">
                  <div className="grid h-7 w-7 place-items-center rounded-md bg-surface text-xs font-bold">
                    {app.jobTitle?.[0]?.toUpperCase() || "A"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{app.jobTitle || "Job Application"}</p>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-surface/70 px-2.5 py-0.5 text-xs font-medium capitalize">
                    {app.status || "applied"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
