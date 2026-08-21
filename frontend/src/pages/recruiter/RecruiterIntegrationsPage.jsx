import { useId, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../services/api";
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
   NONE of the six connectors below is backed by anything. There is no OAuth client, no provider
   SDK, no sync job, no token storage, no webhook receiver, no model and no route for any of them
   anywhere in backend/src:

     Greenhouse (ATS)        no integration of any kind
     Lever (ATS)             no integration of any kind
     Workday (HRIS)          no integration of any kind
     BambooHR (HRIS)         no integration of any kind
     Google Calendar         authController's oauthProviders has a `google` entry, but it is
                             SIGN-IN ONLY — no calendar scope is requested, no refresh token is
                             stored, and nothing reads or writes a calendar
     Slack (Comms)           no app, no webhook, no bot token; notificationService writes only to
                             the in-app Notification collection

   A "Connected" badge is not a label, it is a claim about system state: a recruiter who sees it
   believes their pipeline is syncing and stops checking it manually. So every card renders
   PERMANENTLY in the not-connected state, no card shows a connected badge, no count of connected
   integrations is computed or displayed, and each card carries a visible "Not yet available"
   status line plus a title attribute naming the reason — never colour alone. This mirrors the
   doctrine already written into RecruiterBackgroundCheckPage.jsx for its four unbacked steps.

   THE ACTION IS REAL, NOT INERT. Rather than an aria-disabled button that does nothing, "Request
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

export function RecruiterIntegrationsPage() {
  const { session } = useAuth();
  const uid = useId();
  const [feedback, setFeedback] = useState(null);
  // Which connectors this session has already sent an interest note for. Purely a double-submit
  // guard so one recruiter cannot open six support tickets for the same provider by clicking
  // twice — NOT a connection state, and never rendered as one.
  const [requestedIds, setRequestedIds] = useState(() => new Set());

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
          None of these connectors is live yet — nothing on this page is syncing, and no data
          leaves SGETAI. You can register interest in a provider and we'll get in touch when its
          connector ships.
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
