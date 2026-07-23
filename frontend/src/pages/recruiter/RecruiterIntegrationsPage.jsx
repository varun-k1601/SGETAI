import { useState } from "react";

export function RecruiterIntegrationsPage() {
  const [connectedIntegrations, setConnectedIntegrations] = useState(
    new Set(["greenhouse", "workday", "google-calendar"])
  );

  const integrationCategories = {
    ATS: [
      {
        id: "greenhouse",
        name: "Greenhouse",
        emoji: "🌱",
        description: "Sync candidates and pipeline status with Greenhouse.",
      },
      {
        id: "lever",
        name: "Lever",
        emoji: "🎚️",
        description: "Two-way sync of postings, candidates, and stages.",
      },
    ],
    HRIS: [
      {
        id: "workday",
        name: "Workday",
        emoji: "💼",
        description: "Push hired candidates into Workday and track employees.",
      },
      {
        id: "bamboohr",
        name: "BambooHR",
        emoji: "🎋",
        description: "Onboard hires and sync employee records.",
      },
    ],
    Calendar: [
      {
        id: "google-calendar",
        name: "Google Calendar",
        emoji: "📅",
        description: "Schedule interviews directly from candidate profiles.",
      },
    ],
    Comms: [
      {
        id: "slack",
        name: "Slack",
        emoji: "💬",
        description: "Get hiring alerts and approve candidates from Slack.",
      },
    ],
  };

  const toggleIntegration = (integrationId) => {
    const newConnected = new Set(connectedIntegrations);
    if (newConnected.has(integrationId)) {
      newConnected.delete(integrationId);
    } else {
      newConnected.add(integrationId);
    }
    setConnectedIntegrations(newConnected);
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
                Connectors
              </p>
              <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight lg:text-4xl">
                Integrations
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground lg:text-base">
                Sync candidates and pipeline status with your existing ATS, HRIS, calendar and comms stack.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Integration Sections */}
      <div className="space-y-5">
        {Object.entries(integrationCategories).map(([category, integrations]) => (
          <div key={category}>
            <h3 className="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {category}
            </h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {integrations.map((integration) => {
                const isConnected = connectedIntegrations.has(integration.id);
                return (
                  <div
                    key={integration.id}
                    className="relative rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-5 shadow-elegant"
                  >
                    <div className="flex items-start gap-3">
                      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface text-2xl">
                        {integration.emoji}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-display text-base font-semibold">{integration.name}</p>
                          {isConnected && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/15 px-2.5 py-0.5 text-xs font-medium text-success">
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
                              Connected
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{integration.description}</p>
                      </div>

                      <button
                        onClick={() => toggleIntegration(integration.id)}
                        className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                          isConnected
                            ? "bg-muted text-muted-foreground hover:bg-muted/80"
                            : "bg-gradient-recruiter text-recruiter-foreground shadow-recruiter hover:opacity-95"
                        }`}
                      >
                        {isConnected ? "Disconnect" : "Connect"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Developer Access Section */}
      <div className="relative rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-5 shadow-elegant mt-6">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              API
            </p>
            <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">Developer access</h2>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          Need a custom integration? Connect your internal dashboard via REST API.
        </p>

        <div className="mt-3 flex items-center gap-2 rounded-lg border border-border/40 bg-surface/40 p-3 font-mono text-xs">
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
            <path d="M12 22v-5"></path>
            <path d="M15 8V2"></path>
            <path d="M17 8a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1z"></path>
            <path d="M9 8V2"></path>
          </svg>
          <code className="truncate">POST https://api.sgetai.com/v1/candidates</code>
        </div>
      </div>
    </main>
  );
}
