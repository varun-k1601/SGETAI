import { useState } from "react";

export function RecruiterBackgroundCheckPage() {
  const [candidateName, setCandidateName] = useState("");
  const [candidateEmail, setCandidateEmail] = useState("");

  const backgroundChecks = [
    {
      id: 1,
      name: "Alex Rivera",
      email: "alex@example.com",
      submittedDate: "Mar 14",
      status: "completed",
      progress: 100,
      checks: [
        { name: "Identity verification", status: "completed" },
        { name: "Education verification", status: "completed" },
        { name: "Employment history", status: "completed" },
        { name: "Criminal record", status: "completed" },
        { name: "Reference checks", status: "completed" },
      ],
    },
    {
      id: 2,
      name: "Jamie Tanaka",
      email: "jamie@example.com",
      submittedDate: "Mar 15",
      status: "in-progress",
      progress: 60,
      checks: [
        { name: "Identity verification", status: "completed" },
        { name: "Education verification", status: "completed" },
        { name: "Employment history", status: "completed" },
        { name: "Criminal record", status: "in-progress" },
        { name: "Reference checks", status: "in-progress" },
      ],
    },
    {
      id: 3,
      name: "Sasha Patel",
      email: "sasha@example.com",
      submittedDate: "Mar 16",
      status: "queued",
      progress: 0,
      checks: [
        { name: "Identity verification", status: "queued" },
        { name: "Education verification", status: "queued" },
        { name: "Employment history", status: "queued" },
        { name: "Criminal record", status: "queued" },
        { name: "Reference checks", status: "queued" },
      ],
    },
  ];

  const completedCount = backgroundChecks.filter((check) => check.status === "completed").length;
  const inProgressCount = backgroundChecks.filter((check) => check.status === "in-progress").length;
  const queuedCount = backgroundChecks.filter((check) => check.status === "queued").length;
  const flaggedCount = 0;

  const handleSubmitCheck = () => {
    if (candidateName.trim() && candidateEmail.trim()) {
      setCandidateName("");
      setCandidateEmail("");
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "completed":
        return "bg-success/15 text-success border-success/30";
      case "in-progress":
        return "bg-primary/15 text-primary border-primary/30";
      case "queued":
        return "bg-muted text-muted-foreground";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getCheckStatusIcon = (status) => {
    switch (status) {
      case "completed":
        return (
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
            <circle cx="12" cy="12" r="10"></circle>
            <path d="m9 12 2 2 4-4"></path>
          </svg>
        );
      case "in-progress":
      case "queued":
        return (
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
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M12 6v6l4 2"></path>
          </svg>
        );
      default:
        return null;
    }
  };

  const getCheckStatusColor = (status) => {
    switch (status) {
      case "completed":
        return "border-success/30 bg-success/10 text-success";
      case "in-progress":
      case "queued":
        return "border-border/40 bg-surface/40 text-muted-foreground";
      default:
        return "border-border/40 bg-surface/40 text-muted-foreground";
    }
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
                Trust layer
              </p>
              <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight lg:text-4xl">
                Background verification
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground lg:text-base">
                Free end-to-end background checks. Submit candidate details and we'll handle the rest.
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
              <circle cx="12" cy="12" r="10"></circle>
              <path d="m9 12 2 2 4-4"></path>
            </svg>
            Completed
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <div className="font-display text-2xl font-semibold tabular-nums">{completedCount}</div>
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
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M12 6v6l4 2"></path>
            </svg>
            In progress
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <div className="font-display text-2xl font-semibold tabular-nums">{inProgressCount}</div>
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
              <path d="M5 12h14"></path>
              <path d="M12 5v14"></path>
            </svg>
            Queued
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <div className="font-display text-2xl font-semibold tabular-nums">{queuedCount}</div>
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
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"></path>
              <path d="M12 9v4"></path>
              <path d="M12 17h.01"></path>
            </svg>
            Flagged
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <div className="font-display text-2xl font-semibold tabular-nums">{flaggedCount}</div>
          </div>
        </div>
      </div>

      {/* Submit New Check Section */}
      <div className="relative rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-5 shadow-elegant mb-5">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              New check
            </p>
            <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">Submit a candidate</h2>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <input
            placeholder="Candidate name"
            value={candidateName}
            onChange={(e) => setCandidateName(e.target.value)}
            className="rounded-xl border border-border/60 bg-surface/70 px-3 py-2 text-sm outline-none focus:bg-surface transition"
          />
          <input
            placeholder="Email"
            type="email"
            value={candidateEmail}
            onChange={(e) => setCandidateEmail(e.target.value)}
            className="rounded-xl border border-border/60 bg-surface/70 px-3 py-2 text-sm outline-none focus:bg-surface transition"
          />
          <button
            onClick={handleSubmitCheck}
            disabled={!candidateName.trim() || !candidateEmail.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-recruiter px-4 py-2 text-sm font-semibold text-recruiter-foreground shadow-recruiter hover:opacity-95 disabled:opacity-50 transition"
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
              <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"></path>
              <path d="m21.854 2.147-10.94 10.939"></path>
            </svg>
            Submit check
          </button>
        </div>
      </div>

      {/* Background Check Records */}
      <div className="space-y-3">
        {backgroundChecks.map((check) => (
          <div
            key={check.id}
            className="relative rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-5 shadow-elegant"
          >
            <div className="flex items-center gap-3">
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
                className={`lucide h-5 w-5 ${
                  check.status === "completed" ? "text-success" : "text-muted-foreground"
                }`}
                aria-hidden="true"
              >
                <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"></path>
                <path d="m9 12 2 2 4-4"></path>
              </svg>

              <div className="min-w-0 flex-1">
                <p className="font-display text-base font-semibold">{check.name}</p>
                <p className="text-xs text-muted-foreground">
                  {check.email} · submitted {check.submittedDate}
                </p>
              </div>

              <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${getStatusColor(check.status)}`}>
                {check.status}
              </span>
            </div>

            {/* Progress Bar */}
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground">Progress</span>
                <span className="text-sm font-semibold text-foreground">{check.progress}%</span>
              </div>
              <div className="relative h-3 overflow-hidden rounded-full bg-muted border border-border/30">
                <div
                  className="h-full transition-all duration-500 ease-out"
                  style={{
                    width: `${check.progress}%`,
                    background: "linear-gradient(90deg, #3b82f6 0%, #8b5cf6 100%)",
                  }}
                ></div>
              </div>
            </div>

            {/* Check Items Grid */}
            <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
              {check.checks.map((checkItem, idx) => (
                <div
                  key={idx}
                  className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] ${getCheckStatusColor(checkItem.status)}`}
                >
                  {getCheckStatusIcon(checkItem.status)}
                  {checkItem.name}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
