import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../services/api";
import { AutoDismissFeedback } from "../../components/AutoDismissFeedback";

// ---------------------------------------------------------------------------------------------
// Your conversations
//
// Until now this page was write-only: the form below POSTs /feedback, shows a toast, and the user
// never hears back in-product no matter how many times support replies. The desk's replies live on
// SupportTicket/SupportMessage and are read here through /api/support/me, which scopes every query
// to the authenticated requester. No sockets — the rest of this app polls, and so does this.
// ---------------------------------------------------------------------------------------------

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

// Two states, reusing the pill vocabulary already on the applications page rather than
// introducing a colour scale this page does not otherwise have.
function StatusPill({ ticket }) {
  const isLive = ticket.status === "Open" || ticket.status === "Pending";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
        isLive
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-border/60 bg-surface/70 text-muted-foreground"
      }`}
    >
      {ticket.statusLabel || ticket.status}
    </span>
  );
}

function SupportConversations() {
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
    <div className="relative mt-6 rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-5 shadow-elegant">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Conversations
          </p>
          <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">
            Your conversations
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Replies from the support team land here.
          </p>
        </div>
        {conversationsQuery.isFetching ? (
          <span className="text-xs text-muted-foreground">Refreshing…</span>
        ) : null}
      </div>

      {conversationsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading your conversations…</p>
      ) : conversationsQuery.isError ? (
        <div className="rounded-xl border border-border/40 bg-surface/40 p-4">
          <p className="text-sm font-medium">We could not load your conversations.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {conversationsQuery.error?.message || "Please try again in a moment."}
          </p>
          <button
            type="button"
            onClick={() => conversationsQuery.refetch()}
            className="mt-3 rounded-full border border-border/60 bg-surface/70 px-3 py-1.5 text-xs font-medium hover:bg-surface"
          >
            Try again
          </button>
        </div>
      ) : tickets.length === 0 ? (
        <div className="rounded-xl border border-border/40 bg-surface/40 p-6 text-center">
          <p className="text-sm font-semibold">No conversations yet</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            Send us a message using the feedback box above and it will appear here, along with
            every reply from the team.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-4">
          {/* Conversation list */}
          <div className="col-span-12 lg:col-span-5">
            <ul className="space-y-2">
              {tickets.map((ticket) => {
                const isSelected = ticket._id === selectedId;

                return (
                  <li key={ticket._id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(ticket._id)}
                      aria-expanded={isSelected}
                      className={`w-full rounded-xl border p-3 text-left transition ${
                        isSelected
                          ? "border-primary/40 bg-primary/5"
                          : "border-border/40 bg-surface/40 hover:bg-surface/70"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-sm font-semibold">{ticket.subject}</p>
                        {ticket.hasUnread ? (
                          <span className="mt-1 flex shrink-0 items-center gap-1">
                            <span className="h-2 w-2 rounded-full bg-primary" aria-hidden="true"></span>
                            {/* The dot is decorative. The meaning is carried in text so it does
                                not rely on colour perception alone. */}
                            <span className="sr-only">Unread reply</span>
                          </span>
                        ) : null}
                      </div>
                      {ticket.preview ? (
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {ticket.preview.senderType === "admin" ? "Support: " : "You: "}
                          {ticket.preview.body}
                        </p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <StatusPill ticket={ticket} />
                        <span className="text-[10px] text-muted-foreground">
                          {formatWhen(ticket.lastMessageAt)}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Thread */}
          <div className="col-span-12 lg:col-span-7">
            {!selectedId ? (
              <div className="flex h-full min-h-45 items-center justify-center rounded-xl border border-border/40 bg-surface/40 p-6">
                <p className="text-center text-xs text-muted-foreground">
                  Select a conversation to read it and reply.
                </p>
              </div>
            ) : threadQuery.isLoading ? (
              <div className="rounded-xl border border-border/40 bg-surface/40 p-6">
                <p className="text-sm text-muted-foreground">Loading conversation…</p>
              </div>
            ) : threadQuery.isError ? (
              <div className="rounded-xl border border-border/40 bg-surface/40 p-6">
                <p className="text-sm font-medium">We could not open this conversation.</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {threadQuery.error?.message || "Please try again in a moment."}
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-border/40 bg-surface/40 p-4">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2 border-b border-border/40 pb-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{thread?.ticket?.subject}</p>
                    <p className="text-xs text-muted-foreground">
                      Started {formatWhen(thread?.ticket?.createdAt)}
                    </p>
                  </div>
                  {thread?.ticket ? <StatusPill ticket={thread.ticket} /> : null}
                </div>

                <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
                  {(thread?.messages || []).map((message) => {
                    const fromSupport = message.senderType === "admin";

                    return (
                      <div
                        key={message._id}
                        className={`flex ${fromSupport ? "justify-start" : "justify-end"}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-xl border p-3 ${
                            fromSupport
                              ? "border-border/60 bg-surface/70"
                              : "border-primary/30 bg-primary/10"
                          }`}
                        >
                          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                            {message.senderName}
                          </p>
                          <p className="mt-1 whitespace-pre-wrap wrap-break-word text-sm">
                            {message.body}
                          </p>
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            {formatWhen(message.createdAt)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <form
                  className="mt-3 space-y-2 border-t border-border/40 pt-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleReply();
                  }}
                >
                  <label className="sr-only" htmlFor="support-reply">
                    Reply to support
                  </label>
                  <textarea
                    id="support-reply"
                    rows="3"
                    placeholder="Write a reply…"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    className="w-full rounded-xl border border-border/60 bg-surface/70 p-3 text-sm outline-none focus:bg-surface transition"
                  />
                  {replyError ? <p className="text-xs text-red-600">{replyError}</p> : null}
                  <button
                    type="submit"
                    disabled={replyMutation.isPending || !replyText.trim()}
                    className="inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-50"
                  >
                    {replyMutation.isPending ? "Sending…" : "Send reply"}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function HelpPage() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [feedbackText, setFeedbackText] = useState("");
  const [feedback, setFeedback] = useState({ type: "", message: "" });

  const feedbackMutation = useMutation({
    mutationFn: (text) =>
      apiRequest("/feedback", {
        method: "POST",
        token: session.accessToken,
        body: { message: text, type: "user_feedback" },
      }),
    onSuccess: (response) => {
      setFeedback({ type: "success", message: response.message || "Feedback sent successfully!" });
      setFeedbackText("");
      // POST /feedback also opens a support ticket, so the new conversation should appear below
      // immediately rather than on the next poll.
      queryClient.invalidateQueries({ queryKey: ["support-conversations", session?.email] });
      setTimeout(() => setFeedback({ type: "", message: "" }), 3000);
    },
    onError: (error) => {
      setFeedback({ type: "error", message: error.message || "Failed to send feedback" });
    },
  });

  const handleFeedbackSubmit = () => {
    if (feedbackText.trim()) {
      feedbackMutation.mutate(feedbackText);
    }
  };

  const faqs = [
    {
      question: "How does match scoring work?",
      answer: "We score your profile against the JD across skills, seniority, and tooling. Anything above 80% is considered strong.",
    },
    {
      question: "Can I hide my profile from recruiters?",
      answer: "Yes — toggle Stealth mode in Settings → Privacy.",
    },
    {
      question: "How is Pro different from Normal?",
      answer: "Pro adds always-on AI: auto-apply, auto-connect, auto-DM with smart safety guardrails.",
    },
  ];

  return (
    <main className="flex-1 px-6 py-6 lg:px-8 lg:py-8">
      <AutoDismissFeedback
        feedback={feedback}
        onClear={() => setFeedback({ type: "", message: "" })}
      />

      {/* Hero Banner */}
      <div className="relative mb-6 overflow-hidden rounded-3xl border border-border/60 bg-linear-to-br p-6 lg:p-8 from-primary/10 via-transparent to-transparent">
        <div className="absolute -right-20 -top-20 h-60 w-60 bg-primary/20 rounded-full blur-3xl"></div>
        <div className="relative">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Support
              </p>
              <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight lg:text-4xl">
                Help &amp; feedback
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground lg:text-base">
                Browse the docs or talk to the team.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Support Options */}
      <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
        {/* Docs & Guides */}
        <div className="relative rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-5 shadow-elegant">
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
            className="lucide h-5 w-5 text-primary"
            aria-hidden="true"
          >
            <path d="M12 7v14"></path>
            <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"></path>
          </svg>
          <p className="mt-2 font-semibold">Docs &amp; guides</p>
          <p className="text-xs text-muted-foreground">Walkthroughs for every feature.</p>
        </div>

        {/* Community */}
        <div className="relative rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-5 shadow-elegant">
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
            className="lucide h-5 w-5 text-primary"
            aria-hidden="true"
          >
            <path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"></path>
          </svg>
          <p className="mt-2 font-semibold">Community</p>
          <p className="text-xs text-muted-foreground">Tips from 12k+ job seekers.</p>
        </div>

        {/* Contact Support */}
        <div className="relative rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-5 shadow-elegant">
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
            className="lucide h-5 w-5 text-primary"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10"></circle>
            <path d="m4.93 4.93 4.24 4.24"></path>
            <path d="m14.83 9.17 4.24-4.24"></path>
            <path d="m14.83 14.83 4.24 4.24"></path>
            <path d="m9.17 14.83-4.24 4.24"></path>
            <circle cx="12" cy="12" r="4"></circle>
          </svg>
          <p className="mt-2 font-semibold">Contact support</p>
          <p className="text-xs text-muted-foreground">Avg reply under 4 hours.</p>
        </div>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-12 gap-6">
        {/* FAQs Section */}
        <div className="relative rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-5 shadow-elegant col-span-12 lg:col-span-7">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                FAQ
              </p>
              <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">Most asked</h2>
            </div>
          </div>

          <div className="space-y-2">
            {faqs.map((faq, index) => (
              <details key={index} className="group rounded-xl border border-border/40 bg-surface/40 p-3">
                <summary className="cursor-pointer text-sm font-semibold">{faq.question}</summary>
                <p className="mt-2 text-sm text-muted-foreground">{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>

        {/* Feedback Section */}
        <div className="relative rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-5 shadow-elegant col-span-12 lg:col-span-5">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Feedback
              </p>
              <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">Tell us what's missing</h2>
            </div>
          </div>

          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              handleFeedbackSubmit();
            }}
          >
            <textarea
              rows="5"
              placeholder="What could be better?"
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              className="w-full rounded-xl border border-border/60 bg-surface/70 p-3 text-sm outline-none focus:bg-surface transition"
            />
            <button
              type="submit"
              disabled={feedbackMutation.isPending || !feedbackText.trim()}
              className="inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-50"
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
              Send feedback
            </button>
          </form>
        </div>
      </div>

      <SupportConversations />
    </main>
  );
}
