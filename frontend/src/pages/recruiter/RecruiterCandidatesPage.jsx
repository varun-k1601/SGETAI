import { useState } from "react";

export function RecruiterCandidatesPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [shortlisted, setShortlisted] = useState(new Set());

  const candidates = [
    {
      id: 1,
      initials: "AR",
      name: "Alex Rivera",
      headline: "Senior Frontend Engineer",
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
      headline: "Full-Stack Engineer",
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
      headline: "Staff Engineer",
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
      headline: "Senior Engineer",
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
      headline: "Frontend Engineer",
      experience: "5y",
      location: "Berlin",
      skills: ["Vue", "TypeScript", "CSS"],
      match: 78,
      verified: false,
    },
    {
      id: 6,
      initials: "MR",
      name: "Mia Rodríguez",
      headline: "Junior Engineer",
      experience: "2y",
      location: "Mexico City",
      skills: ["React", "Tailwind"],
      match: 64,
      verified: false,
    },
  ];

  const filteredCandidates = candidates.filter(
    (candidate) =>
      !searchQuery.trim() ||
      candidate.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      candidate.headline.toLowerCase().includes(searchQuery.toLowerCase()) ||
      candidate.skills.some((skill) =>
        skill.toLowerCase().includes(searchQuery.toLowerCase())
      )
  );

  const verifiedCount = candidates.filter((c) => c.verified).length;
  const avgMatch = Math.round(
    candidates.reduce((sum, c) => sum + c.match, 0) / candidates.length
  );
  const shortlistedCount = shortlisted.size;

  const toggleShortlist = (candidateId) => {
    const newShortlisted = new Set(shortlisted);
    if (newShortlisted.has(candidateId)) {
      newShortlisted.delete(candidateId);
    } else {
      newShortlisted.add(candidateId);
    }
    setShortlisted(newShortlisted);
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
                Talent pool
              </p>
              <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight lg:text-4xl">
                AI-ranked candidates
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground lg:text-base">
                Sorted by match to your active postings — verified candidates highlighted.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
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
            Total
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <div className="font-display text-2xl font-semibold tabular-nums">{candidates.length}</div>
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
              <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"></path>
              <path d="m9 12 2 2 4-4"></path>
            </svg>
            Verified
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <div className="font-display text-2xl font-semibold tabular-nums">{verifiedCount}</div>
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
              <path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"></path>
              <path d="M20 2v4"></path>
              <path d="M22 4h-4"></path>
              <circle cx="4" cy="20" r="2"></circle>
            </svg>
            Avg match
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <div className="font-display text-2xl font-semibold tabular-nums">{avgMatch}%</div>
            <div className="text-xs font-medium text-success">+6%</div>
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
            Shortlisted
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <div className="font-display text-2xl font-semibold tabular-nums">{shortlistedCount}</div>
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
          placeholder="Search name, headline, skill…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 bg-transparent text-sm outline-none"
        />
      </div>

      {/* Candidates List */}
      <div className="space-y-3">
        {filteredCandidates.length > 0 ? (
          filteredCandidates.map((candidate) => (
            <div
              key={candidate.id}
              className="relative rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-5 shadow-elegant"
            >
              <div className="flex items-center gap-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gradient-recruiter text-sm font-semibold text-recruiter-foreground">
                  {candidate.initials}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-display text-base font-semibold">{candidate.name}</p>
                    {candidate.verified && (
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
                        <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"></path>
                        <path d="m9 12 2 2 4-4"></path>
                      </svg>
                    )}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {candidate.headline} · {candidate.experience || candidate.company} · {candidate.location}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
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

                  <div className="flex gap-1">
                    <button className="grid h-8 w-8 place-items-center rounded-lg border border-border bg-surface text-muted-foreground hover:text-foreground transition">
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
                        <path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"></path>
                      </svg>
                    </button>
                    <button
                      onClick={() => toggleShortlist(candidate.id)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        shortlisted.has(candidate.id)
                          ? "bg-gradient-recruiter text-recruiter-foreground shadow-recruiter"
                          : "bg-gradient-recruiter text-recruiter-foreground shadow-recruiter hover:opacity-95"
                      }`}
                    >
                      {shortlisted.has(candidate.id) ? "Shortlisted" : "Shortlist"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-2xl border border-border/60 bg-card/70 p-8 text-center text-muted-foreground">
            No candidates found matching your search.
          </div>
        )}
      </div>
    </main>
  );
}
