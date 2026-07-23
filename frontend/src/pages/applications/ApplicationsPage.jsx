import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { apiBlobRequest, apiRequest } from "../../services/api";
import { AutoDismissFeedback } from "../../components/AutoDismissFeedback";

function downloadBlob(fileName, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName || "resume";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function ApplicationsPage() {
  const { session } = useAuth();
  const [feedback, setFeedback] = useState({ type: "", message: "" });
  const [downloadingId, setDownloadingId] = useState("");

  const applicationsQuery = useQuery({
    queryKey: ["applications", "mine"],
    queryFn: () =>
      apiRequest("/applications/mine", {
        token: session.accessToken,
      }),
    enabled: Boolean(session?.accessToken),
  });

  const applications = applicationsQuery.data?.applications || [];

  // Group applications by the real Application.status enum
  // (Pending | UnderReview | Interview | Accepted | Rejected | Withdrawn).
  const groupedApplications = {
    applied: applications.filter((app) => app.status === "Pending"),
    inReview: applications.filter((app) => app.status === "UnderReview"),
    interview: applications.filter((app) => app.status === "Interview"),
    offer: applications.filter((app) => app.status === "Accepted"),
    closed: applications.filter((app) => app.status === "Rejected" || app.status === "Withdrawn"),
  };

  const totalApplications = applications.length;
  const appliedCount = groupedApplications.applied.length;
  const inReviewCount = groupedApplications.inReview.length;
  const interviewCount = groupedApplications.interview.length;
  const offerCount = groupedApplications.offer.length;

  const getInitial = (app) => {
    return app.organizationId?.companyName?.[0]?.toUpperCase() || "A";
  };

  const isAiTracked = (app) => app.source === "AutoApply" || app.source === "auto";

  const hasResume = (app) =>
    Boolean(
      app.attachedResume?.media?.filePath ||
        app.attachedResume?.media?.url ||
        app.tailoredResume?.latex
    );

  async function handleDownloadResume(event, app) {
    event.stopPropagation();
    setFeedback({ type: "", message: "" });
    setDownloadingId(app._id);

    try {
      const { blob, fileName } = await apiBlobRequest(
        `/applications/${app._id}/resume?disposition=attachment`,
        { token: session.accessToken }
      );
      downloadBlob(fileName, blob);
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setDownloadingId("");
    }
  }

  const ApplicationCard = ({ app }) => (
    <div className="rounded-xl border border-border/60 bg-card p-3 shadow-sm hover:shadow-md transition">
      <div className="flex items-center gap-2">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-surface text-base font-bold">
          {getInitial(app)}
        </div>
        <div
          className="relative grid shrink-0 place-items-center rounded-full font-semibold tabular-nums h-10 w-10 text-[10px]"
          style={{
            background: `conic-gradient(var(--gradient-primary) ${(app.atsScore ?? 0) * 3.6}deg, oklch(0.93 0.01 250) 0deg)`,
          }}
        >
          <div className="grid h-[calc(100%-6px)] w-[calc(100%-6px)] place-items-center rounded-full bg-card">
            {Math.round(app.atsScore ?? 0)}%
          </div>
        </div>
      </div>
      <p className="mt-2 truncate text-sm font-semibold">{app.jobId?.title || "Job Title"}</p>
      <p className="truncate text-xs text-muted-foreground">
        {app.organizationId?.companyName || "Company"} · {new Date(app.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
      </p>
      <span
        className={`mt-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
          isAiTracked(app)
            ? "border-primary/30 bg-primary/10 text-primary"
            : "border-border/60 bg-surface/70 text-muted-foreground"
        }`}
      >
        {isAiTracked(app) ? "AI tracking" : "Manually applied"}
      </span>
      {hasResume(app) ? (
        <button
          type="button"
          onClick={(event) => handleDownloadResume(event, app)}
          disabled={downloadingId === app._id}
          className="mt-2 w-full rounded-lg border border-border/60 bg-surface/70 px-2 py-1.5 text-[11px] font-medium text-foreground hover:bg-surface disabled:opacity-60"
        >
          {downloadingId === app._id
            ? "Downloading…"
            : isAiTracked(app)
              ? "Download AI-generated resume"
              : "Download resume"}
        </button>
      ) : null}
    </div>
  );

  return (
    <main className="flex-1 px-6 py-6 lg:px-8 lg:py-8">
      <AutoDismissFeedback feedback={feedback} onClear={() => setFeedback({ type: "", message: "" })} />

      {/* Hero Banner */}
      <div className="relative mb-6 overflow-hidden rounded-3xl border border-border/60 bg-linear-to-br p-6 lg:p-8 from-primary/10 via-transparent to-transparent">
        <div className="absolute -right-20 -top-20 h-60 w-60 bg-primary/20 rounded-full blur-3xl"></div>
        <div className="relative">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Pipeline
              </p>
              <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight lg:text-4xl">
                Your applications
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground lg:text-base">
                Tracking {totalApplications} active applications · AI sends nudges and follow-ups for you.
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
              <path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
              <rect width="20" height="14" x="2" y="6" rx="2"></rect>
            </svg>
            Applied
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <div className="font-display text-2xl font-semibold tabular-nums">{appliedCount}</div>
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
            In review
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <div className="font-display text-2xl font-semibold tabular-nums">{inReviewCount}</div>
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
              <path d="M8 2v4"></path>
              <path d="M16 2v4"></path>
              <rect width="18" height="18" x="3" y="4" rx="2"></rect>
              <path d="M3 10h18"></path>
            </svg>
            Interviews
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <div className="font-display text-2xl font-semibold tabular-nums">{interviewCount}</div>
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
              <path d="m9 12 2 2 4-4"></path>
            </svg>
            Offers
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <div className="font-display text-2xl font-semibold tabular-nums">{offerCount}</div>
          </div>
        </div>
      </div>

      {/* Kanban Pipeline */}
      {applicationsQuery.isLoading ? (
        <div className="rounded-2xl border border-border/60 bg-card/70 p-8 text-center text-muted-foreground">
          Loading applications...
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-5">
          {/* Applied Column */}
          <div className="rounded-2xl border border-border/60 bg-surface/50 p-3">
            <div className="mb-3 flex items-center justify-between px-1">
              <h3 className="font-display text-sm font-semibold">Applied</h3>
              <span className="text-xs font-semibold text-muted-foreground">{appliedCount}</span>
            </div>
            <div className="space-y-2">
              {groupedApplications.applied.length > 0 ? (
                groupedApplications.applied.map((app) => (
                  <ApplicationCard key={app._id} app={app} />
                ))
              ) : (
                <p className="text-xs text-muted-foreground p-2 text-center">No applications</p>
              )}
            </div>
          </div>

          {/* In Review Column */}
          <div className="rounded-2xl border border-border/60 bg-surface/50 p-3">
            <div className="mb-3 flex items-center justify-between px-1">
              <h3 className="font-display text-sm font-semibold">In Review</h3>
              <span className="text-xs font-semibold text-muted-foreground">{inReviewCount}</span>
            </div>
            <div className="space-y-2">
              {groupedApplications.inReview.length > 0 ? (
                groupedApplications.inReview.map((app) => (
                  <ApplicationCard key={app._id} app={app} />
                ))
              ) : (
                <p className="text-xs text-muted-foreground p-2 text-center">No applications</p>
              )}
            </div>
          </div>

          {/* Interview Column */}
          <div className="rounded-2xl border border-border/60 bg-surface/50 p-3">
            <div className="mb-3 flex items-center justify-between px-1">
              <h3 className="font-display text-sm font-semibold">Interview</h3>
              <span className="text-xs font-semibold text-muted-foreground">{interviewCount}</span>
            </div>
            <div className="space-y-2">
              {groupedApplications.interview.length > 0 ? (
                groupedApplications.interview.map((app) => (
                  <ApplicationCard key={app._id} app={app} />
                ))
              ) : (
                <p className="text-xs text-muted-foreground p-2 text-center">No applications</p>
              )}
            </div>
          </div>

          {/* Offer Column */}
          <div className="rounded-2xl border border-border/60 bg-surface/50 p-3">
            <div className="mb-3 flex items-center justify-between px-1">
              <h3 className="font-display text-sm font-semibold">Offer</h3>
              <span className="text-xs font-semibold text-muted-foreground">{offerCount}</span>
            </div>
            <div className="space-y-2">
              {groupedApplications.offer.length > 0 ? (
                groupedApplications.offer.map((app) => (
                  <ApplicationCard key={app._id} app={app} />
                ))
              ) : (
                <p className="text-xs text-muted-foreground p-2 text-center">No applications</p>
              )}
            </div>
          </div>

          {/* Closed Column */}
          <div className="rounded-2xl border border-border/60 bg-surface/50 p-3">
            <div className="mb-3 flex items-center justify-between px-1">
              <h3 className="font-display text-sm font-semibold">Closed</h3>
              <span className="text-xs font-semibold text-muted-foreground">{groupedApplications.closed.length}</span>
            </div>
            <div className="space-y-2">
              {groupedApplications.closed.length > 0 ? (
                groupedApplications.closed.map((app) => (
                  <ApplicationCard key={app._id} app={app} />
                ))
              ) : (
                <p className="text-xs text-muted-foreground p-2 text-center">No applications</p>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
