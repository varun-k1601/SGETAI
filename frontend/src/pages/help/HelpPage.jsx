import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../services/api";
import { AutoDismissFeedback } from "../../components/AutoDismissFeedback";

// STYLING APPROACH — scoped global CSS (`.help-page ...` in styles.css) on the shared --ph-*
// palette, the same system as .pro-home, .ai-gen, .jobs-page, .job-detail, .applied-page,
// .automations-page, .chat-page and .notif-page. Tailwind's semantic colour utilities generate no
// CSS in this app, and the unlayered global `button { ... }` rule outranks any Tailwind utility.

// ---------------------------------------------------------------------------------------------
// Your conversations
//
// This page was once write-only: the form POSTs /feedback, shows a toast, and the user never hears
// back in-product no matter how many times support replies. The desk's replies live on
// SupportTicket/SupportMessage and are read here through /api/support/me, which scopes every query
// to the authenticated requester. No sockets — the rest of this app polls, and so does this.
//
// The reference design has no slot for this section. It is kept regardless: removing it would
// re-open the exact bug it was built to fix.
// ---------------------------------------------------------------------------------------------

// Feedback.type is a free-form String defaulting to "user_feedback", and the controller already
// does `type: req.body.type || "user_feedback"` — so these chips need NO backend change. The value
// is sent verbatim as `type` on the existing POST /api/feedback.
const FEEDBACK_CATEGORIES = [
  { id: "bug", label: "Bug" },
  { id: "idea", label: "Idea" },
  { id: "praise", label: "Praise" },
  { id: "other", label: "Other" },
];

const DEFAULT_CATEGORY = "other";

const FAQS = [
  {
    id: "match-scoring",
    question: "How does match scoring work?",
    answer:
      "Your profile is scored against the job description across skills, seniority and tooling. The platform sets a single match threshold for every Pro member — auto-apply only acts on jobs above it, and you can see the current value on the Automations page.",
  },
  {
    id: "linkedin-auto-connect",
    question: "Does LinkedIn allow auto-connect?",
    // The honest answer. LinkedIn's public API exposes no endpoint for sending connection requests
    // on a member's behalf, so no amount of scopes or partner approval makes this possible. This
    // app's auto-connect is in-platform only.
    answer:
      "No. LinkedIn's public API provides no way for a third-party app to send connection requests on your behalf, and no approval or extra permission changes that. Auto-connect in SGETAI is in-platform only: it creates a connection with the recruiter who posted the job here, and sends the intro through SGETAI chat. Your LinkedIn account is never used.",
  },
  {
    id: "stealth",
    question: "Can I hide my profile from recruiters?",
    answer: "Yes — turn on Stealth mode under Settings → Privacy.",
  },
  {
    id: "pro-vs-normal",
    question: "How is Pro different from Normal?",
    answer:
      "Pro adds the automation layer: auto-apply, auto-introduce to recruiters, auto-DM intros and the safety guardrails that decide when they should not run.",
  },
  {
    id: "support-replies",
    question: "Where do support replies show up?",
    answer:
      "In “Your conversations” at the bottom of this page. Anything you send with the feedback form opens a ticket, and every reply from the team appears in that thread — you will also get a notification.",
  },
];

const ICON_PATHS = {
  message: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  inbox: (
    <>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </>
  ),
  book: (
    <>
      <path d="M12 7v14" />
      <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
    </>
  ),
  chevron: <path d="m6 9 6 6 6-6" />,
  send: (
    <>
      <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" />
      <path d="m21.854 2.147-10.94 10.939" />
    </>
  ),
};

function Icon({ name, className = "hp-icon" }) {
  const paths = ICON_PATHS[name];

  if (!paths) {
    return null;
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {paths}
    </svg>
  );
}

function formatWhen(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const sameYear = date.getFullYear() === new Date().getFullYear();

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
    hour: "numeric",
    minute: "2-digit",
  });
}

// Turns the aggregate median into copy. null minutes means no ticket got a first response in the
// window — that is "not measured yet", never "0 minutes".
function formatResponseTime(stat) {
  if (!stat || stat.medianMinutes === null || stat.medianMinutes === undefined) {
    return "Typical reply time isn't measured yet.";
  }

  const minutes = stat.medianMinutes;
  const readable =
    minutes < 60
      ? `${minutes} min`
      : minutes < 60 * 24
        ? `${Math.round(minutes / 60)} hr`
        : `${Math.round(minutes / (60 * 24))} days`;

  return `Median first reply ~${readable}, last ${stat.windowDays} days (${stat.sampleSize} ${
    stat.sampleSize === 1 ? "ticket" : "tickets"
  }).`;
}

// Two states, reusing the pill vocabulary the other Pro surfaces already use.
function StatusPill({ ticket }) {
  const isLive = ticket.status === "Open" || ticket.status === "Pending";

  return (
    <span className={`hp-pill${isLive ? " hp-pill--accent" : ""}`}>
      {ticket.statusLabel || ticket.status}
    </span>
  );
}

function SupportConversations({ sectionRef }) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [replyError, setReplyError] = useState("");

  // Keyed by the account, not just by name. Nothing clears the query cache on logout, so a bare
  // ["support-conversations"] key would let the next account on this browser see the previous
  // one's thread from cache until the refetch landed. Private correspondence is not the place to
  // be relaxed about that.
  const listKey = ["support-conversations", session?.email];
  const threadKey = ["support-conversation", session?.email, selectedId];

  const conversationsQuery = useQuery({
    queryKey: listKey,
    queryFn: () => apiRequest("/support/me/tickets?limit=20", { token: session.accessToken }),
    enabled: Boolean(session?.accessToken),
    refetchInterval: 60000,
  });

  const threadQuery = useQuery({
    queryKey: threadKey,
    queryFn: () => apiRequest(`/support/me/tickets/${selectedId}`, { token: session.accessToken }),
    enabled: Boolean(session?.accessToken && selectedId),
    refetchInterval: 20000,
  });

  const replyMutation = useMutation({
    mutationFn: (body) =>
      apiRequest(`/support/me/tickets/${selectedId}/messages`, {
        method: "POST",
        token: session.accessToken,
        body: { body },
      }),
    onSuccess: () => {
      setReplyText("");
      setReplyError("");
      queryClient.invalidateQueries({ queryKey: threadKey });
      queryClient.invalidateQueries({ queryKey: listKey });
      // A support notification may well be what brought the user here; refreshing the bell keeps
      // its badge honest now that the thread has been read.
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => setReplyError(error.message || "Failed to send reply"),
  });

  const tickets = conversationsQuery.data?.tickets || [];
  const thread = threadQuery.data;

  const handleSelect = (ticketId) => {
    setSelectedId((current) => (current === ticketId ? null : ticketId));
    setReplyText("");
    setReplyError("");
    // Opening a thread is what marks it read server-side, so the list needs a refetch for the dot
    // to clear. Nothing is auto-selected on mount for the same reason: a conversation should only
    // count as read once the user has actually opened it.
    queryClient.invalidateQueries({ queryKey: listKey });
  };

  const handleReply = () => {
    if (replyText.trim() && !replyMutation.isPending) {
      replyMutation.mutate(replyText.trim());
    }
  };

  return (
    <section className="hp-card hp-convos" ref={sectionRef} aria-labelledby="hp-convos-heading">
      <div className="hp-card__head">
        <div>
          <p className="hp-eyebrow">Conversations</p>
          <h2 className="hp-card__title" id="hp-convos-heading">
            Your conversations
          </h2>
          <p className="hp-card__sub">Replies from the support team land here.</p>
        </div>
        {conversationsQuery.isFetching ? <span className="hp-muted">Refreshing…</span> : null}
      </div>

      {conversationsQuery.isLoading ? (
        <p className="hp-empty">Loading your conversations…</p>
      ) : conversationsQuery.isError ? (
        <div className="hp-panel">
          <p className="hp-panel__title">We could not load your conversations.</p>
          <p className="hp-panel__body">
            {conversationsQuery.error?.message || "Please try again in a moment."}
          </p>
          <button type="button" className="hp-btn hp-btn--sm" onClick={() => conversationsQuery.refetch()}>
            Try again
          </button>
        </div>
      ) : tickets.length === 0 ? (
        <div className="hp-panel hp-panel--centred">
          <p className="hp-panel__title">No conversations yet</p>
          <p className="hp-panel__body">
            Send us a message with the feedback form above and it will appear here, along with every
            reply from the team.
          </p>
        </div>
      ) : (
        <div className="hp-convos__split">
          <ul className="hp-tickets" aria-label="Your support tickets">
            {tickets.map((ticket) => {
              const isSelected = ticket._id === selectedId;

              return (
                <li key={ticket._id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(ticket._id)}
                    aria-expanded={isSelected}
                    className={`hp-ticket${isSelected ? " hp-ticket--selected" : ""}`}
                  >
                    <span className="hp-ticket__top">
                      <span className="hp-ticket__subject">{ticket.subject}</span>
                      {ticket.hasUnread ? (
                        <span className="hp-ticket__unread">
                          <span className="hp-dot" aria-hidden="true" />
                          {/* The dot is decorative. The meaning is carried in text so it does not
                              rely on colour perception alone. */}
                          <span className="hp-sr-only">Unread reply</span>
                        </span>
                      ) : null}
                    </span>
                    {ticket.preview ? (
                      <span className="hp-ticket__preview">
                        {ticket.preview.senderType === "admin" ? "Support: " : "You: "}
                        {ticket.preview.body}
                      </span>
                    ) : null}
                    <span className="hp-ticket__foot">
                      <StatusPill ticket={ticket} />
                      <span className="hp-muted">{formatWhen(ticket.lastMessageAt)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="hp-thread">
            {!selectedId ? (
              <div className="hp-panel hp-panel--centred hp-panel--fill">
                <p className="hp-panel__body">Select a conversation to read it and reply.</p>
              </div>
            ) : threadQuery.isLoading ? (
              <div className="hp-panel">
                <p className="hp-panel__body">Loading conversation…</p>
              </div>
            ) : threadQuery.isError ? (
              <div className="hp-panel">
                <p className="hp-panel__title">We could not open this conversation.</p>
                <p className="hp-panel__body">
                  {threadQuery.error?.message || "Please try again in a moment."}
                </p>
              </div>
            ) : (
              <div className="hp-panel">
                <div className="hp-thread__head">
                  <div className="hp-thread__identity">
                    <p className="hp-panel__title">{thread?.ticket?.subject}</p>
                    <p className="hp-muted">Started {formatWhen(thread?.ticket?.createdAt)}</p>
                  </div>
                  {thread?.ticket ? <StatusPill ticket={thread.ticket} /> : null}
                </div>

                <div className="hp-messages">
                  {(thread?.messages || []).map((message) => {
                    const fromSupport = message.senderType === "admin";

                    return (
                      <div
                        key={message._id}
                        className={`hp-msg${fromSupport ? "" : " hp-msg--mine"}`}
                      >
                        <div className={`hp-bubble${fromSupport ? "" : " hp-bubble--mine"}`}>
                          <p className="hp-bubble__sender">{message.senderName}</p>
                          <p className="hp-bubble__body">{message.body}</p>
                          <p className="hp-bubble__time">{formatWhen(message.createdAt)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <form
                  className="hp-reply"
                  onSubmit={(event) => {
                    event.preventDefault();
                    handleReply();
                  }}
                >
                  <label className="hp-sr-only" htmlFor="support-reply">
                    Reply to support
                  </label>
                  <textarea
                    id="support-reply"
                    rows="3"
                    placeholder="Write a reply…"
                    value={replyText}
                    onChange={(event) => setReplyText(event.target.value)}
                    className="hp-textarea"
                  />
                  {replyError ? (
                    <p className="hp-error" role="alert">
                      {replyError}
                    </p>
                  ) : null}
                  <button
                    type="submit"
                    className="hp-btn hp-btn--primary hp-btn--sm"
                    disabled={replyMutation.isPending || !replyText.trim()}
                  >
                    {replyMutation.isPending ? "Sending…" : "Send reply"}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export function HelpPage() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [feedbackText, setFeedbackText] = useState("");
  const [category, setCategory] = useState(DEFAULT_CATEGORY);
  const [feedback, setFeedback] = useState({ type: "", message: "" });
  const [openFaq, setOpenFaq] = useState(FAQS[0].id);
  const feedbackRef = useRef(null);
  const conversationsRef = useRef(null);

  // Aggregate only — a median and its sample size, from GET /api/support/me/response-time. The
  // admin desk's /api/support/metrics stays admin-gated; this endpoint exists so the card below
  // can print a measured number instead of a hardcoded promise.
  const responseTimeQuery = useQuery({
    queryKey: ["support-response-time"],
    queryFn: () => apiRequest("/support/me/response-time", { token: session.accessToken }),
    enabled: Boolean(session?.accessToken),
    staleTime: 5 * 60 * 1000,
  });

  const feedbackMutation = useMutation({
    mutationFn: ({ text, type }) =>
      apiRequest("/feedback", {
        method: "POST",
        token: session.accessToken,
        // Same endpoint and same shape as before — only `type` now carries the selected chip
        // instead of a constant. POST /feedback still creates the Feedback row AND the
        // SupportTicket AND its first SupportMessage, which is how this reaches the admin inbox.
        body: { message: text, type },
      }),
    onSuccess: (response) => {
      setFeedback({ type: "success", message: response.message || "Feedback sent successfully!" });
      setFeedbackText("");
      setCategory(DEFAULT_CATEGORY);
      // POST /feedback also opens a support ticket, so the new conversation should appear below
      // immediately rather than on the next poll.
      queryClient.invalidateQueries({ queryKey: ["support-conversations", session?.email] });
      setTimeout(() => setFeedback({ type: "", message: "" }), 3000);
    },
    onError: (error) => {
      setFeedback({ type: "error", message: error.message || "Failed to send feedback" });
    },
  });

  const canSubmit = Boolean(feedbackText.trim()) && Boolean(category) && !feedbackMutation.isPending;

  const handleFeedbackSubmit = () => {
    if (!canSubmit) {
      return;
    }
    feedbackMutation.mutate({ text: feedbackText.trim(), type: category || DEFAULT_CATEGORY });
  };

  function focusFeedback() {
    feedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    feedbackRef.current?.focus({ preventScroll: true });
  }

  function scrollToConversations() {
    conversationsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <main className="help-page">
      <AutoDismissFeedback
        feedback={feedback}
        onClear={() => setFeedback({ type: "", message: "" })}
      />

      <header className="hp-hero">
        <p className="hp-eyebrow">Support</p>
        <h1 className="hp-hero__title">How can we help?</h1>
        <p className="hp-hero__sub">
          Read the most-asked questions, send the team a message, or pick up a conversation you have
          already started. Everything here reaches the same support desk.
        </p>
      </header>

      <div className="hp-channels">
        {/* Accurate name: there is no live chat for support. The mechanism is an async ticket
            thread (SupportTicket / SupportMessage), and this opens the form that starts one. */}
        <button type="button" className="hp-card hp-channel" onClick={focusFeedback}>
          <span className="hp-tile" aria-hidden="true">
            <Icon name="message" className="hp-icon hp-icon--sm" />
          </span>
          <span className="hp-channel__title">Message support</span>
          <span className="hp-channel__sub">
            {responseTimeQuery.isLoading
              ? "Checking typical reply time…"
              : formatResponseTime(responseTimeQuery.data?.responseTime)}
          </span>
        </button>

        <button type="button" className="hp-card hp-channel" onClick={scrollToConversations}>
          <span className="hp-tile" aria-hidden="true">
            <Icon name="inbox" className="hp-icon hp-icon--sm" />
          </span>
          <span className="hp-channel__title">Your conversations</span>
          <span className="hp-channel__sub">
            Read every reply from the team and continue a thread.
          </span>
        </button>

        {/* No docs system, no article model, no content — so no count and no destination. Rendered
            visibly disabled rather than as a link that goes nowhere. */}
        <div className="hp-card hp-channel hp-channel--disabled" aria-disabled="true">
          <span className="hp-tile hp-tile--muted" aria-hidden="true">
            <Icon name="book" className="hp-icon hp-icon--sm" />
          </span>
          <span className="hp-channel__title">
            Docs &amp; guides
            <span className="hp-pill">Not available</span>
          </span>
          <span className="hp-channel__sub">
            There is no documentation site yet. Ask here and the answer comes from a person.
          </span>
        </div>
      </div>

      <div className="hp-split">
        <section className="hp-card" aria-labelledby="hp-faq-heading">
          <div className="hp-card__head">
            <div>
              <p className="hp-eyebrow">FAQ</p>
              <h2 className="hp-card__title" id="hp-faq-heading">
                Most asked
              </h2>
            </div>
          </div>

          <div className="hp-faqs">
            {FAQS.map((faq) => {
              const isOpen = openFaq === faq.id;

              return (
                <div key={faq.id} className={`hp-faq${isOpen ? " hp-faq--open" : ""}`}>
                  <h3 className="hp-faq__heading">
                    <button
                      type="button"
                      className="hp-faq__trigger"
                      id={`hp-faq-trigger-${faq.id}`}
                      aria-expanded={isOpen}
                      aria-controls={`hp-faq-panel-${faq.id}`}
                      onClick={() => setOpenFaq(isOpen ? null : faq.id)}
                    >
                      <span>{faq.question}</span>
                      <Icon name="chevron" className="hp-icon hp-icon--sm hp-faq__chevron" />
                    </button>
                  </h3>
                  <div
                    className="hp-faq__panel"
                    id={`hp-faq-panel-${faq.id}`}
                    role="region"
                    aria-labelledby={`hp-faq-trigger-${faq.id}`}
                    hidden={!isOpen}
                  >
                    <p className="hp-faq__answer">{faq.answer}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="hp-card" aria-labelledby="hp-feedback-heading">
          <div className="hp-card__head">
            <div>
              <p className="hp-eyebrow">Feedback</p>
              <h2 className="hp-card__title" id="hp-feedback-heading">
                Tell us anything
              </h2>
            </div>
          </div>

          <form
            className="hp-form"
            onSubmit={(event) => {
              event.preventDefault();
              handleFeedbackSubmit();
            }}
          >
            {/* A single-select radio group, not loose buttons: only one category can apply, and
                arrow keys move between them for free. */}
            <fieldset className="hp-fieldset">
              <legend className="hp-legend">What kind of message is this?</legend>
              <div className="hp-chips">
                {FEEDBACK_CATEGORIES.map((option) => (
                  <label
                    key={option.id}
                    className={`hp-chip${category === option.id ? " hp-chip--active" : ""}`}
                  >
                    <input
                      type="radio"
                      name="feedback-category"
                      value={option.id}
                      checked={category === option.id}
                      onChange={() => setCategory(option.id)}
                      className="hp-sr-only"
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="hp-label" htmlFor="hp-feedback-message">
              Your message
            </label>
            <textarea
              id="hp-feedback-message"
              ref={feedbackRef}
              rows="6"
              placeholder="What could be better?"
              value={feedbackText}
              onChange={(event) => setFeedbackText(event.target.value)}
              className="hp-textarea"
            />

            <button
              type="submit"
              className="hp-btn hp-btn--primary"
              disabled={!canSubmit}
              aria-busy={feedbackMutation.isPending}
            >
              <Icon name="send" className="hp-icon hp-icon--sm" />
              {feedbackMutation.isPending ? "Sending…" : "Send feedback"}
            </button>

            {/* No SLA. Nothing in this system enforces a response deadline, so the footnote says
                what actually happens instead of promising a turnaround. */}
            <p className="hp-footnote">
              This opens a support ticket. The reply appears in “Your conversations” below and you
              will get a notification when it arrives.
            </p>
          </form>
        </section>
      </div>

      <SupportConversations sectionRef={conversationsRef} />
    </main>
  );
}
