import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../services/api";
import { API_BASE_URL } from "../../config/env";
import { AutoDismissFeedback } from "../../components/AutoDismissFeedback";

/* ===============================================================================================
   Recruiter integrations (/recruiter/integrations) — organization accounts only.
   ===============================================================================================
   PORTED. The previous version of this file was raw pasted mockup Tailwind that shared no class
   name with any other recruiter surface, and most of its utilities resolved to nothing:
   from-recruiter/15, bg-recruiter/25, bg-gradient-recruiter, shadow-recruiter,
   text-recruiter-foreground, via-primary/10, bg-primary/20, shadow-elegant and bg-linear-to-br
   are all undefined in tailwind.config.js. The "teal gradient Connect button" was in fact
   styles.css's global unlayered `button { }` rule winning on specificity — the page was not
   styled, it was coincidentally readable. Everything below is now semantic class names against
   the .recruiter-integrations block in styles.css, on the shared --ph- / --rc- tokens.

   ------------------------------------------------------------------------------------------------
   STATE HONESTY — the rule that governs this whole file
   ------------------------------------------------------------------------------------------------
   The previous version opened with:

       useState(new Set(["greenhouse", "workday", "google-calendar"]))

   ...which rendered a green "✓ Connected" badge on three providers before anything had happened.

   A "Connected" badge is not a label, it is a claim about system state: a recruiter who sees it
   believes their pipeline is syncing and stops checking it manually. The rule that follows is not
   "never show Connected" — it is "never show Connected unless it is true right now".

   ONE OF THE SIX IS NOW REAL. Google Calendar is backed end to end: per-member OAuth against the
   recruiter's own Google account (OrganizationMember.googleCalendarConnection), the
   calendar.events scope, refresh-token renewal, an Interview model, and create/update/cancel of
   the actual Google event — see backend/src/services/googleCalendarService.js and
   routes/recruiterCalendar.js.

   The other five are unchanged and still backed by nothing. No OAuth client, no provider SDK, no
   sync job, no token storage, no webhook receiver, no model and no route anywhere in backend/src:

     Greenhouse (ATS)        no integration of any kind
     Lever (ATS)             no integration of any kind
     Workday (HRIS)          no integration of any kind
     BambooHR (HRIS)         no integration of any kind
     Slack (Comms)           no app, no webhook, no bot token; notificationService writes only to
                             the in-app Notification collection

   So those five keep the permanent treatment exactly as before: no connected badge, no count of
   connected integrations, a visible "Not yet available" status line and a title attribute naming
   the reason — never colour alone. Same as RecruiterBackgroundCheckPage.jsx's four unbacked steps.

   WHAT THE GOOGLE CALENDAR CARD IS ALLOWED TO CLAIM. Its badge is rendered from
   GET /recruiter/calendar/status and from nothing else. "Connected" there means a live refresh
   token exists for THIS SIGNED-IN MEMBER and Google has not rejected it — not that the feature
   shipped, and not that somebody at this company once connected. Three consequences, stated
   because each looks like a bug otherwise:

     - The state is PER MEMBER. Two recruiters at one organization legitimately see different
       states on this same page, because a calendar grant belongs to a person, not a company.
     - A grant revoked from the recruiter's own Google security page reports Not connected on the
       next load. The app is never told; the next token refresh fails and the connection is marked
       revoked at that moment.
     - With no Google credentials in the environment the card falls back to the same not-yet-
       available treatment as the other five, rather than offering a Connect button that cannot
       work.

   THE ACTION IS REAL, NOT INERT — for the other five too. Rather than an aria-disabled button that does nothing, "Request
   access" posts to the EXISTING POST /feedback endpoint (feedbackController.submitFeedback),
   which writes a Feedback row and projects it into a SupportTicket on the admin desk. So the
   click is an honest "notify me about this connector" that a human actually receives. It does not
   connect anything, and the card's status line does not change after a successful request — only
   the button's own label does, because "Request sent" is a true statement about the request and
   nothing else.

   Success is intentionally NOT persisted across a reload: nothing on the server records that this
   org asked about this specific provider in a queryable way, so restoring a "Request sent" label
   from local memory alone would be the same class of lie as the hardcoded Set above.

   ------------------------------------------------------------------------------------------------
   The root .recruiter-integrations is a TRANSPARENT LAYOUT CONTAINER — no background, no padding,
   no border, no radius, no width or flex sizing of its own. .main-panel already pads and scrolls
   this region. The old root was `<main className="flex-1 px-6 py-6 lg:px-8 lg:py-8">`, whose own
   padding stacked on top of .main-panel's and pushed the right-hand grid column past the viewport
   edge — the Lever and BambooHR Connect buttons were literally unreachable. Painting a second
   background on a page root is the bug that made .pro-home render as one giant card in dark mode.
   =============================================================================================== */

// The reason shown on every card, in words. Kept as one constant so no card can drift into a
// softer wording that implies the connector is merely queued rather than absent.
const UNAVAILABLE_REASON = "Not yet available — no connector has been built for this provider";

const INTEGRATION_CATEGORIES = [
  {
    key: "ats",
    label: "ATS",
    connectors: [
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
  },
  {
    key: "hris",
    label: "HRIS",
    connectors: [
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
  },
  {
    key: "calendar",
    label: "Calendar",
    connectors: [
      {
        id: "google-calendar",
        name: "Google Calendar",
        emoji: "📅",
        description: "Schedule interviews directly from candidate profiles.",
        // The one connector with a backend behind it. Everything this card renders comes from
        // GET /recruiter/calendar/status; the flag only says "render the real card, not the
        // permanent not-available one".
        isLive: true,
      },
    ],
  },
  {
    key: "comms",
    label: "Comms",
    connectors: [
      {
        id: "slack",
        name: "Slack",
        emoji: "💬",
        description: "Get hiring alerts and approve candidates from Slack.",
      },
    ],
  },
];

function IconPlug(props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M12 22v-5" />
      <path d="M15 8V2" />
      <path d="M17 8a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1z" />
      <path d="M9 8V2" />
    </svg>
  );
}

function IconInfo(props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

/* The Google Calendar card. Same .ri-card structure, same tile/body/action slots and the same
   .ri-card__state status line as the other five — the only additions are a state line that can
   read "Connected", and an action that can say Connect or Disconnect.

   Four states, and each is a true statement:
     not configured   no Google credentials on this server. Falls back to the same wording the
                      other five carry permanently, because from a recruiter's seat it is the same
                      fact: there is nothing here to connect to.
     loading          says so rather than guessing at not-connected and flipping a moment later.
     not connected    a Connect button that starts the OAuth flow.
     connected        the badge, plus WHICH Google account it is bound to. A recruiter with a
                      personal and a work Google account needs to know which one the invites will
                      come from before they schedule anything. */
function GoogleCalendarCard({
  connector,
  status,
  isLoading,
  onConnect,
  onDisconnect,
  isDisconnecting,
}) {
  const configured = Boolean(status?.configured);
  const connected = Boolean(status?.connected);
  // A grant that exists but cannot write events. Rare, but it is what a member who approves
  // sign-in and declines calendar access produces, and "Connected" would be a lie for it.
  const canSchedule = Boolean(status?.canSchedule);

  const stateLine = isLoading
    ? "Checking connection…"
    : !configured
      ? "Not connected · not yet available"
      : connected && canSchedule
        ? `Connected · ${status.googleEmail || "Google account"}`
        : connected
          ? "Connected, but calendar permission was declined"
          : "Not connected";

  const stateTitle = !configured
    ? UNAVAILABLE_REASON
    : connected
      ? `Interviews you schedule are created on ${status.googleEmail || "this Google account"}. This connection is yours alone — teammates connect their own.`
      : "Connect your Google account to schedule interviews from a candidate's application.";

  return (
    <li className="ri-card" key={connector.id}>
      <span className="ri-card__tile" aria-hidden="true">
        {connector.emoji}
      </span>

      <div className="ri-card__body">
        <p className="ri-card__name">
          {connector.name}
          {connected && canSchedule ? (
            <span className="ri-card__badge">Connected</span>
          ) : null}
        </p>
        <p className="ri-card__desc">{connector.description}</p>
        <p
          className={`ri-card__state${connected && canSchedule ? " ri-card__state--live" : ""}`}
          title={stateTitle}
        >
          {stateLine}
        </p>
      </div>

      <div className="ri-card__action">
        {!configured ? (
          // Deliberately NOT a Connect button that would fail: with no credentials there is
          // nothing to connect to, so this degrades to the same honest affordance as the rest.
          <button type="button" className="ri-request" disabled title={UNAVAILABLE_REASON}>
            Not available
          </button>
        ) : connected ? (
          <button
            type="button"
            className="ri-request"
            onClick={onDisconnect}
            disabled={isDisconnecting}
            title="Removes this app's access to your Google Calendar. Interviews already scheduled stay on your calendar."
          >
            {isDisconnecting ? "Disconnecting…" : "Disconnect"}
          </button>
        ) : (
          <button
            type="button"
            className="ri-request"
            onClick={onConnect}
            disabled={isLoading}
            title="Opens Google's consent screen. SGETAI asks only to create and manage the events it makes — it cannot read the rest of your calendar."
          >
            Connect
          </button>
        )}
      </div>
    </li>
  );
}

export function RecruiterIntegrationsPage() {
  const { session } = useAuth();
  const uid = useId();
  const [feedback, setFeedback] = useState(null);
  // Which connectors this session has already sent an interest note for. Purely a double-submit
  // guard so one recruiter cannot open six support tickets for the same provider by clicking
  // twice — NOT a connection state, and never rendered as one.
  const [requestedIds, setRequestedIds] = useState(() => new Set());
  const queryClient = useQueryClient();

  const requestAccessMutation = useMutation({
    mutationFn: (connector) =>
      apiRequest("/feedback", {
        method: "POST",
        token: session.accessToken,
        body: {
          type: "integration_interest",
          message:
            `Integration access request: ${connector.name} (${connector.categoryLabel}).\n` +
            "Requested from the recruiter Integrations page. No connector exists for this " +
            "provider yet; please notify this organization when one ships.",
        },
      }),
    onSuccess: (_data, connector) => {
      setRequestedIds((current) => new Set(current).add(connector.id));
      setFeedback({
        type: "success",
        message: `Thanks — we've noted your interest in ${connector.name}. Nothing is connected yet.`,
      });
    },
    onError: (error) => {
      setFeedback({ type: "error", message: error.message });
    },
  });

  const pendingConnectorId = requestAccessMutation.isPending
    ? requestAccessMutation.variables?.id
    : null;

  /* THE ONLY SOURCE OF THE GOOGLE CALENDAR CARD'S STATE. Nothing about this card is derived from
     "the feature exists" — it is whatever the server says about THIS member's grant right now.
     Re-fetched on window focus so returning from the Google consent tab, or from revoking access
     in Google's own settings, updates the badge without a manual reload. */
  const calendarQuery = useQuery({
    queryKey: ["recruiter", "calendar", "status"],
    queryFn: () => apiRequest("/recruiter/calendar/status", { token: session.accessToken }),
    enabled: Boolean(session?.accessToken),
    refetchOnWindowFocus: true,
  });
  const calendar = calendarQuery.data || null;

  const disconnectCalendarMutation = useMutation({
    mutationFn: () =>
      apiRequest("/recruiter/calendar/disconnect", {
        method: "POST",
        token: session.accessToken,
      }),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ["recruiter", "calendar", "status"] });
      setFeedback({
        type: "success",
        message: response.message || "Google Calendar disconnected.",
      });
    },
    onError: (error) => setFeedback({ type: "error", message: error.message }),
  });

  /* A REAL top-level navigation, not fetch. The next stop is Google's own consent screen, which
     cannot be rendered inside an XHR — same reason and same shape as the LinkedIn connect flow.
     The session token rides as a query param because a top-level navigation carries no
     Authorization header; the server verifies it exactly as requireAuth would. Nothing comes BACK
     in a URL except a status and a message. */
  function connectGoogleCalendar() {
    window.location.href = `${API_BASE_URL}/recruiter/calendar/connect?token=${encodeURIComponent(
      session.accessToken
    )}`;
  }

  return (
    <section className="recruiter-integrations">
      {/* ---- 1. Hero -------------------------------------------------------------------------
          Uses the shared --rc-hero-soft wash (teal → pale blue, dark ink) that every other
          recruiter surface's hero reads. NOT .hero-card.recruiter: that class is the older BLUE
          wash used by the public OrganizationPage, and its dark override flattens it to plain
          --surface-soft with no accent at all. */}
      <header className="ri-hero">
        <p className="ri-eyebrow">Connectors</p>
        <h1 className="ri-hero__title">Integrations</h1>
        <p className="ri-hero__sub">
          Sync candidates and pipeline status with your existing ATS, HRIS, calendar and comms
          stack.
        </p>
      </header>

      {/* ---- 2. The honest state of this page ------------------------------------------------ */}
      <p className="ri-notice">
        <IconInfo className="ri-icon ri-notice__icon" />
        <span>
          Google Calendar is live — connect your own Google account to schedule interviews from a
          candidate's application. The rest are not built yet: nothing else on this page is
          syncing, and no data leaves SGETAI. Register interest in one and we'll get in touch when
          its connector ships.
        </span>
      </p>

      <AutoDismissFeedback
        feedback={feedback}
        onClear={() => setFeedback(null)}
        duration={5000}
      />

      {/* ---- 3. Category sections ------------------------------------------------------------- */}
      {INTEGRATION_CATEGORIES.map((category) => {
        const headingId = `${uid}-${category.key}`;

        return (
          <section className="ri-group" key={category.key} aria-labelledby={headingId}>
            <h2 className="ri-group__title" id={headingId}>
              {category.label}
            </h2>

            <ul className="ri-grid" role="list">
              {category.connectors.map((connector) => {
                const alreadyRequested = requestedIds.has(connector.id);
                const isPending = pendingConnectorId === connector.id;

                /* THE ONE REAL CARD. Everything else in this list renders the permanent
                   not-available treatment below, untouched. */
                if (connector.isLive) {
                  return (
                    <GoogleCalendarCard
                      key={connector.id}
                      connector={connector}
                      status={calendar}
                      isLoading={calendarQuery.isLoading}
                      onConnect={connectGoogleCalendar}
                      onDisconnect={() => disconnectCalendarMutation.mutate()}
                      isDisconnecting={disconnectCalendarMutation.isPending}
                    />
                  );
                }

                return (
                  <li className="ri-card" key={connector.id}>
                    <span className="ri-card__tile" aria-hidden="true">
                      {connector.emoji}
                    </span>

                    <div className="ri-card__body">
                      <p className="ri-card__name">{connector.name}</p>
                      <p className="ri-card__desc">{connector.description}</p>
                      {/* The connector's real state, always in words. There is no connected
                          variant of this line — it is the same on every card, every render. */}
                      <p className="ri-card__state" title={UNAVAILABLE_REASON}>
                        Not connected · not yet available
                      </p>
                    </div>

                    <div className="ri-card__action">
                      <button
                        type="button"
                        className="ri-request"
                        onClick={() =>
                          requestAccessMutation.mutate({
                            ...connector,
                            categoryLabel: category.label,
                          })
                        }
                        disabled={alreadyRequested || requestAccessMutation.isPending}
                        title={
                          alreadyRequested
                            ? `We've noted your interest in ${connector.name}. This does not connect anything.`
                            : `${connector.name}: ${UNAVAILABLE_REASON}. Sends the SGETAI team a note asking to be told when it ships — it does not connect anything.`
                        }
                      >
                        {alreadyRequested
                          ? "Request sent"
                          : isPending
                            ? "Sending…"
                            : "Request access"}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {/* ---- 4. Developer access -------------------------------------------------------------
          Labelled PLANNED, and the sample call is explicitly marked as not live. This backend has
          no public REST surface and no API-key issuance, so POST https://api.sgetai.com/v1/candidates
          would 404 — printing it as though a developer could call it today would be the same lie
          as a "Connected" badge. */}
      <section className="ri-card ri-api" aria-labelledby={`${uid}-api`}>
        <div className="ri-api__head">
          <div>
            <p className="ri-eyebrow">API</p>
            <h2 className="ri-api__title" id={`${uid}-api`}>
              Developer access
            </h2>
          </div>
          <span className="ri-badge">Planned</span>
        </div>

        <p className="ri-api__copy">
          A public REST API for custom integrations is planned. It is not available yet — there is
          no public endpoint and no API-key issuance, so the shape below is an illustration of the
          intended call, not a live URL.
        </p>

        <div className="ri-code" role="group" aria-label="Planned API request, illustrative only">
          <IconPlug className="ri-icon ri-code__icon" />
          {/* Only this span scrolls. The icon and the "Not live" tag sit outside it so the tag can
              never be scrolled out of view or painted over by a long URL. */}
          <span className="ri-code__scroll">
            <code>POST https://api.sgetai.com/v1/candidates</code>
          </span>
          <span className="ri-code__tag">Not live</span>
        </div>
      </section>
    </section>
  );
}
