import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../services/api";
import { AutoDismissFeedback } from "../../components/AutoDismissFeedback";
import { AutomationSection } from "../../components/AutomationSection";
import { useState } from "react";

function formatRelativeTime(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return "just now";
  }

  const diffSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));

  if (diffSeconds < 60) {
    return "just now";
  }

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) {
    return "yesterday";
  }

  return `${diffDays}d ago`;
}

function isWithinDays(dateValue, days) {
  const time = new Date(dateValue).getTime();
  if (Number.isNaN(time)) {
    return false;
  }
  return Date.now() - time <= days * 24 * 60 * 60 * 1000;
}

function humanizeSkipReason(reason) {
  if (!reason) {
    return "skipped";
  }
  if (reason === "below_threshold") {
    return "below threshold";
  }
  return String(reason).replace(/_/g, " ");
}

export function AutomationsPage() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState(null);

  const preferencesQuery = useQuery({
    queryKey: ["automations", "preferences"],
    queryFn: () => apiRequest("/pro/auto-apply/preferences", { token: session.accessToken }),
    enabled: Boolean(session?.accessToken),
  });

  const runsQuery = useQuery({
    queryKey: ["automations", "runs"],
    queryFn: () => apiRequest("/pro/auto-apply/runs", { token: session.accessToken }),
    enabled: Boolean(session?.accessToken),
  });

  const updatePreferencesMutation = useMutation({
    mutationFn: (patch) =>
      apiRequest("/pro/auto-apply/preferences", {
        method: "PUT",
        token: session.accessToken,
        body: patch,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations", "preferences"] });
      queryClient.invalidateQueries({ queryKey: ["automations", "runs"] });
    },
    onError: (error) => {
      setFeedback({ type: "error", message: error.message });
    },
  });

  const preferences = preferencesQuery.data?.preferences || {};
  const runs = runsQuery.data?.runs || [];
  // Admin-controlled caps for recruiter introductions — shown alongside the toggle so turning it
  // on is an informed choice about how much outreach it can actually produce.
  const recruiterIntroPolicy = preferencesQuery.data?.recruiterIntroPolicy || {};
  const recruiterIntroCountToday = preferencesQuery.data?.recruiterIntroCountToday || 0;

  function handleToggleAutomation(featureId, nextEnabled) {
    if (updatePreferencesMutation.isPending) {
      return;
    }

    if (featureId === "autoApply") {
      updatePreferencesMutation.mutate({ enabled: nextEnabled });
    } else if (featureId === "recruiterIntro") {
      updatePreferencesMutation.mutate({ autoIntroduceToRecruiters: nextEnabled });
    } else if (featureId === "autoConnect") {
      updatePreferencesMutation.mutate({ autoConnectEnabled: nextEnabled });
    } else if (featureId === "autoDM") {
      updatePreferencesMutation.mutate({ autoDMEnabled: nextEnabled });
    } else if (featureId === "safetyGuards") {
      updatePreferencesMutation.mutate({ safetyGuardrailsEnabled: nextEnabled });
    }
    // followUp / profileSync have no backend behind them yet — their toggles are
    // rendered disabled below and never reach this handler.
  }

  const automationFeatures = [
    {
      id: "autoApply",
      icon: "briefcase",
      name: "Auto-apply to jobs",
      description: "Apply automatically when match is above threshold.",
      enabled: Boolean(preferences.enabled),
    },
    // In-platform only, and unrelated to the LinkedIn block below it: when an organization
    // publishes a job you match, this introduces you to the individual recruiter who posted it
    // and delivers an AI-drafted first message into your own chat thread — where you can read
    // exactly what was sent.
    {
      id: "recruiterIntro",
      icon: "user-plus",
      name: "Auto-introduce to recruiters",
      description:
        "On a strong match, connect with the recruiter who posted the job and send an AI-drafted intro in chat.",
      note: recruiterIntroPolicy.maxDailyIntroductionsPerSeeker
        ? `Up to ${recruiterIntroPolicy.maxDailyIntroductionsPerSeeker}/day · ${recruiterIntroCountToday} sent today · you can read every message in Chat.`
        : "Every message is visible to you in Chat.",
      enabled: Boolean(preferences.autoIntroduceToRecruiters),
      disabled: recruiterIntroPolicy.enabled === false,
      badge: recruiterIntroPolicy.enabled === false ? "Paused by admin" : undefined,
    },
    {
      id: "autoConnect",
      icon: "linkedin",
      name: "Auto-connect",
      description: "Connect with recruiters automatically.",
      enabled: Boolean(preferences.autoConnectEnabled),
    },
    {
      id: "autoDM",
      icon: "message-square",
      name: "Auto-DM intros",
      description: "Send a first message after connecting.",
      enabled: Boolean(preferences.autoDMEnabled),
    },
    {
      id: "followUp",
      icon: "mail",
      name: "Auto follow-up emails",
      description: "Polite nudges 5 days after silence.",
      enabled: false,
      disabled: true,
      badge: "Coming soon",
    },
    {
      id: "profileSync",
      icon: "refresh",
      name: "LinkedIn profile sync",
      description: "Mirror updates from your sgetai profile to LinkedIn.",
      enabled: false,
      disabled: true,
      badge: "Coming soon",
    },
    {
      id: "safetyGuards",
      icon: "shield",
      name: "Safety guardrails",
      description: "Skip auto-apply on excluded companies, mismatched location, or salary.",
      enabled: Boolean(preferences.safetyGuardrailsEnabled),
    },
  ];

  const runsLast7Days = runs.filter((run) => isWithinDays(run.ranAt || run.createdAt, 7));
  const runsLast24Hours = runs.filter((run) => isWithinDays(run.ranAt || run.createdAt, 1));
  const autoAppliesThisWeek = runsLast7Days.reduce((sum, run) => sum + (run.applicationsCreated || 0), 0);
  const actionsToday = runsLast24Hours.reduce((sum, run) => sum + (run.results?.length || 0), 0);

  const activityStream = runs
    .flatMap((run) =>
      (run.results || []).map((result) => ({ ...result, ranAt: run.ranAt || run.createdAt }))
    )
    .sort((a, b) => new Date(b.ranAt) - new Date(a.ranAt))
    .slice(0, 8)
    .map((result, index) => {
      if (result.status === "applied") {
        return {
          key: result.applicationId || `applied-${index}`,
          icon: "bot",
          title: `Applied to ${result.title}`,
          subtitle: `${result.companyName || "Company"} · ${result.score}% match · tailored resume`,
          time: formatRelativeTime(result.ranAt),
          matchScore: Number.isFinite(result.score) ? result.score : undefined,
        };
      }

      return {
        key: `skipped-${result.jobId || index}-${index}`,
        icon: "bot",
        title: `Skipped: ${result.title}`,
        subtitle: `${result.companyName || "Company"} · ${
          Number.isFinite(result.score) ? `${result.score}% match · ` : ""
        }${humanizeSkipReason(result.reason)}`,
        time: formatRelativeTime(result.ranAt),
        matchScore: Number.isFinite(result.score) ? result.score : undefined,
      };
    });

  const getIconSvg = (iconName) => {
    const icons = {
      briefcase: <><path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path><rect width="20" height="14" x="2" y="6" rx="2"></rect></>,
      linkedin: <><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path><rect width="4" height="12" x="2" y="9"></rect><circle cx="4" cy="4" r="2"></circle></>,
      zap: <><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"></path></>,
      bot: <><path d="M12 8V4H8"></path><rect width="16" height="12" x="4" y="8" rx="2"></rect><path d="M2 14h2"></path><path d="M20 14h2"></path><path d="M15 13v2"></path><path d="M9 13v2"></path></>,
    };
    return icons[iconName] || null;
  };

  return (
    <main className="flex-1 px-6 py-6 lg:px-8 lg:py-8">
      <AutoDismissFeedback feedback={feedback} onClear={() => setFeedback(null)} />

      {/* Hero Banner */}
      <div className="relative mb-6 overflow-hidden rounded-3xl border border-border/60 bg-linear-to-br p-6 lg:p-8 from-primary/15 via-pro/15 to-transparent">
        <div className="orb -right-20 -top-20 h-60 w-60 bg-primary/20"></div>
        <div className="orb -bottom-24 -left-24 h-72 w-72 bg-pro/25"></div>
        <div className="relative">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Automation OS</p>
              <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight lg:text-4xl">Your AI agents</h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground lg:text-base">Configure what AI does on your behalf — across job boards, LinkedIn, and email.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-border/60 bg-card/70 p-4 backdrop-blur">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide h-3.5 w-3.5" aria-hidden="true">
              {getIconSvg("zap")}
            </svg>
            Auto-apply actions today
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <div className="font-display text-2xl font-semibold tabular-nums">{actionsToday}</div>
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card/70 p-4 backdrop-blur">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide h-3.5 w-3.5" aria-hidden="true">
              {getIconSvg("briefcase")}
            </svg>
            Auto-applies
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <div className="font-display text-2xl font-semibold tabular-nums">{autoAppliesThisWeek}</div>
            <div className="text-xs font-medium text-success">this wk</div>
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card/70 p-4 backdrop-blur">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide h-3.5 w-3.5" aria-hidden="true">
              {getIconSvg("linkedin")}
            </svg>
            LinkedIn outreach prefs
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-surface/70 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              {preferences.autoConnectEnabled || preferences.autoDMEnabled ? "On" : "Off"}
            </span>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-12 gap-6">
        {/* Left Section - Automations & Templates */}
        <section className="col-span-12 space-y-4 lg:col-span-7">
          {/* Active Automations */}
          <AutomationSection
            isActive={Boolean(preferences.enabled)}
            features={automationFeatures}
            onToggleFeature={handleToggleAutomation}
            matchThreshold={typeof preferences.matchThreshold === "number" ? preferences.matchThreshold : null}
          />

          {/* Message Templates */}
          <div className="relative rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-5 shadow-elegant">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Templates</p>
                <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">Message templates</h2>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-surface/70 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                Coming soon
              </span>
            </div>
            <div className="space-y-2">
              {[
                { title: "Recruiter intro DM", type: "Auto-DM · Auto-connect", chars: "320" },
                { title: "Hiring manager cold email", type: "Cold email", chars: "540" },
                { title: "Follow-up after silence", type: "Auto follow-up", chars: "240" },
              ].map(template => (
                <div key={template.title} className="flex items-center gap-3 rounded-xl border border-border/40 bg-surface/40 p-3 opacity-60">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide h-4 w-4 text-pro shrink-0" aria-hidden="true">
                    {getIconSvg("bot")}
                  </svg>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{template.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{template.type} · {template.chars} chars</p>
                  </div>
                  <button type="button" disabled className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium shrink-0 cursor-not-allowed">Edit</button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Right Section - Activity Stream */}
        <aside className="col-span-12 lg:col-span-5">
          <div className="relative rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-5 shadow-elegant">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Live</p>
                <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">Activity stream</h2>
              </div>
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true">
                <circle cx="12" cy="12" r="10"></circle>
                <circle cx="12" cy="12" r="6"></circle>
                <circle cx="12" cy="12" r="2"></circle>
              </svg>
            </div>
            <div className="space-y-2">
              {activityStream.length ? (
                activityStream.map((activity) => (
                  <div key={activity.key} className="flex items-center gap-3 rounded-xl border border-border/40 bg-surface/40 p-3">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-pro text-pro-foreground">
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide h-4 w-4" aria-hidden="true">
                        {getIconSvg(activity.icon)}
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{activity.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{activity.subtitle}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[11px] text-muted-foreground">{activity.time}</span>
                      {activity.matchScore !== undefined && (
                        <div className="relative grid shrink-0 place-items-center rounded-full font-semibold tabular-nums h-10 w-10 text-[10px] text-white" style={{ background: `conic-gradient(var(--gradient-pro) ${activity.matchScore * 3.6}deg, oklch(0.93 0.01 250) 0deg)` }}>
                          <div className="grid h-[calc(100%-6px)] w-[calc(100%-6px)] place-items-center rounded-full bg-card">
                            {activity.matchScore}%
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p className="p-3 text-sm text-muted-foreground">
                  {runsQuery.isLoading
                    ? "Loading activity…"
                    : "No auto-apply activity yet. Enable auto-apply above to get started."}
                </p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
