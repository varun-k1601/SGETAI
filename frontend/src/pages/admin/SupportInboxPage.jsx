import { useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../services/api";
import { AutoDismissFeedback } from "../../components/AutoDismissFeedback";
import { AdminConsolePage, formatNumber, getInitials } from "./adminConsoleKit";

// PLACEHOLDER — nothing on this platform generates a support brief, and this task does not call an
// LLM. `confidence` is null so the chip renders "SAMPLE BRIEF" rather than a fabricated
// percentage, and the two stat rows below are fed from the REAL metrics payload, never from here.
// TODO: replace with a generated brief once a support-insights source exists.
const SUPPORT_BRIEF = {
  confidence: null,
  headline: "Response speed is what turns a ticket into a retained account.",
  body:
    "The queue is small enough to answer personally. Every hour a request sits unanswered is an " +
    "hour the requester spends deciding whether this platform is worth their time — so clearing " +
    "the oldest unassigned thread first buys more goodwill than closing three easy ones.",
  disclaimer: "Guidance, not a directive",
};

const TABS = [
  { id: "chat", label: "Live chats" },
  { id: "ticket", label: "Tickets" },
];

const STATUS_TONE = {
  Open: "adm-pill--warn",
  Pending: "adm-pill--info",
  Resolved: "adm-pill--pos",
  Closed: "",
};

const PRIORITY_TONE = {
  Urgent: "adm-pill--neg",
  High: "adm-pill--warn",
  Normal: "adm-pill--info",
  Low: "",
};

function formatRelativeTime(value) {
  const parsed = new Date(value);

  if (!value || Number.isNaN(parsed.getTime())) {
    return "—";
  }

  const diffMinutes = Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 60000));

  if (diffMinutes < 1) return "now";
  if (diffMinutes < 60) return `${diffMinutes}m`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;

  const diffDays = Math.floor(diffHours / 24);
  return diffDays < 30 ? `${diffDays}d` : `${Math.floor(diffDays / 30)}mo`;
}

// Renders a measured duration, or says plainly that nothing was measured. Never falls back to 0.
function formatMinutes(minutes) {
  if (minutes === null || minutes === undefined) {
    return "—";
  }

  if (minutes < 60) {
    return `${Math.round(minutes)}m`;
  }

  const hours = minutes / 60;
  return hours < 24 ? `${Math.round(hours * 10) / 10}h` : `${Math.round(hours / 24)}d`;
}

function DeltaPill({ changePercent, invertColour = false, comparisonLabel }) {
  if (changePercent === null || changePercent === undefined) {
    return (
      <span className="adm-delta adm-delta--flat" title={`No ${comparisonLabel} to compare against`}>
        NO BASELINE
      </span>
    );
  }

  // For response time, DOWN is good — the tone is inverted so a faster week reads as green.
  const isGood = invertColour ? changePercent < 0 : changePercent > 0;
  const tone =
    changePercent === 0 ? "adm-delta--flat" : isGood ? "adm-delta--up" : "adm-delta--down";
  const arrow = changePercent > 0 ? "▲" : changePercent < 0 ? "▼" : "•";

  return (
    <span className={`adm-delta ${tone}`} title={`vs ${comparisonLabel}`}>
      {arrow} {changePercent > 0 ? "+" : ""}
      {changePercent}%
    </span>
  );
}

function KpiCard({ label, value, helper, delta, unavailable }) {
  return (
    <article className="adm-card adm-kpi">
      <div className="adm-kpi__top">
        <p className="adm-eyebrow">{label}</p>
        {delta || null}
      </div>
      <div className={`adm-kpi__value adm-num${unavailable ? " adm-kpi__value--muted" : ""}`}>
        {value}
      </div>
      <div className="adm-kpi__bottom">
        <p className="adm-kpi__helper">{helper}</p>
      </div>
    </article>
  );
}

export function SupportInboxPage() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [channel, setChannel] = useState("ticket");
  const [selectedTicketId, setSelectedTicketId] = useState("");
  const [reply, setReply] = useState("");
  const [feedback, setFeedback] = useState({ type: "", message: "" });
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const threadEndRef = useRef(null);

  // Granular, independent keys: replying invalidates the thread, the list and the metrics without
  // any of them piggybacking on another's cache entry.
  const metricsQuery = useQuery({
    queryKey: ["support", "metrics"],
    queryFn: () => apiRequest("/support/metrics", { token: session.accessToken }),
    enabled: Boolean(session?.accessToken),
    // The frontend has no socket.io-client, so every "live" surface in this app polls (same as
    // ChatPage and RecruiterMessagesPage). The backend does emit support:ticket for whenever a
    // client exists — see feedbackController.
    refetchInterval: 30000,
  });

  const ticketsQuery = useQuery({
    queryKey: ["support", "tickets", channel],
    queryFn: () =>
      apiRequest(`/support/tickets?channel=${channel}&limit=50`, { token: session.accessToken }),
    enabled: Boolean(session?.accessToken),
    placeholderData: keepPreviousData,
    refetchInterval: 30000,
  });

  const assigneesQuery = useQuery({
    queryKey: ["support", "assignees"],
    queryFn: () => apiRequest("/support/assignees", { token: session.accessToken }),
    enabled: Boolean(session?.accessToken),
  });

  const tickets = ticketsQuery.data?.tickets || [];
  const metrics = metricsQuery.data?.metrics || {};
  const assignees = assigneesQuery.data?.assignees || [];

  // Selection is per-tab: switching tabs should not leave a ticket from the other channel open.
  useEffect(() => {
    setSelectedTicketId("");
  }, [channel]);

  const threadQuery = useQuery({
    queryKey: ["support", "ticket", selectedTicketId],
    queryFn: () =>
      apiRequest(`/support/tickets/${selectedTicketId}`, { token: session.accessToken }),
    enabled: Boolean(session?.accessToken && selectedTicketId),
    refetchInterval: selectedTicketId ? 20000 : false,
  });

  const activeTicket = threadQuery.data?.ticket || null;
  const messages = useMemo(() => threadQuery.data?.messages || [], [threadQuery.data]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length, selectedTicketId]);

  function invalidateSupport() {
    queryClient.invalidateQueries({ queryKey: ["support", "ticket", selectedTicketId] });
    queryClient.invalidateQueries({ queryKey: ["support", "tickets"] });
    queryClient.invalidateQueries({ queryKey: ["support", "metrics"] });
  }

  const replyMutation = useMutation({
    mutationFn: (body) =>
      apiRequest(`/support/tickets/${selectedTicketId}/messages`, {
        method: "POST",
        token: session.accessToken,
        body: { body },
      }),
    // Optimistic append so the composer clears instantly; rolled back if the request fails.
    onMutate: async (body) => {
      const key = ["support", "ticket", selectedTicketId];
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData(key);

      queryClient.setQueryData(key, (current) =>
        current
          ? {
              ...current,
              messages: [
                ...(current.messages || []),
                {
                  _id: `optimistic-${Date.now()}`,
                  senderType: "admin",
                  body,
                  createdAt: new Date().toISOString(),
                  optimistic: true,
                },
              ],
            }
          : current
      );

      return { previous, key };
    },
    onError: (error, body, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.key, context.previous);
      }
      setReply(body);
      setFeedback({ type: "error", message: error.message });
    },
    onSuccess: () => setFeedback({ type: "success", message: "Reply sent." }),
    onSettled: invalidateSupport,
  });

  const updateMutation = useMutation({
    mutationFn: (patch) =>
      apiRequest(`/support/tickets/${selectedTicketId}`, {
        method: "PATCH",
        token: session.accessToken,
        body: patch,
      }),
    onSuccess: () => {
      setIsAssignOpen(false);
      setFeedback({ type: "success", message: "Ticket updated." });
      invalidateSupport();
    },
    onError: (error) => setFeedback({ type: "error", message: error.message }),
  });

  const createMutation = useMutation({
    mutationFn: (payload) =>
      apiRequest("/support/tickets", {
        method: "POST",
        token: session.accessToken,
        body: payload,
      }),
    onSuccess: (response) => {
      setIsCreateOpen(false);
      setFeedback({ type: "success", message: "Ticket created." });
      setChannel(response.ticket?.channel || "ticket");
      setSelectedTicketId(response.ticket?._id || "");
      invalidateSupport();
    },
    onError: (error) => setFeedback({ type: "error", message: error.message }),
  });

  function handleSendReply(event) {
    event.preventDefault();
    const body = reply.trim();

    if (!body || replyMutation.isPending) {
      return;
    }

    setReply("");
    replyMutation.mutate(body);
  }

  const firstResponse = metrics.firstResponse || {};
  const slaHealth = metrics.slaHealth || {};
  const openTickets = metrics.openTickets || {};
  const unread = metrics.unread || {};

  return (
    <AdminConsolePage
      eyebrow="User success · Support operations"
      title="Support command centre"
      description="Keep every account moving with context, care, and a clear owner."
      actions={
        <button
          type="button"
          className="adm-btn adm-btn--accent"
          onClick={() => setIsCreateOpen(true)}
        >
          New ticket
        </button>
      }
    >
      <AutoDismissFeedback
        feedback={feedback}
        onClear={() => setFeedback({ type: "", message: "" })}
      />

      {/* ---------- KPIs ---------- */}
      <section className="admin-console__section adm-kpis" aria-label="Support metrics">
        <KpiCard
          label="Open tickets"
          value={formatNumber(openTickets.value)}
          helper={`${formatNumber(openTickets.highPriority)} high or urgent · ${formatNumber(
            openTickets.unassigned
          )} unassigned`}
        />
        <KpiCard
          label="First response"
          value={formatMinutes(firstResponse.medianMinutes)}
          unavailable={firstResponse.medianMinutes === null}
          helper={
            firstResponse.medianMinutes === null
              ? "No first responses in the last 7 days — nothing to measure yet."
              : `Median of ${formatNumber(firstResponse.sampleSize)} responses, last 7 days`
          }
          delta={
            <DeltaPill
              changePercent={firstResponse.changePercent}
              invertColour
              comparisonLabel="the prior 7 days"
            />
          }
        />
        <KpiCard
          label="SLA health"
          value={slaHealth.percent === null ? "—" : `${slaHealth.percent}%`}
          unavailable={slaHealth.percent === null}
          helper={
            slaHealth.percent === null
              ? "No responses in the window to measure against target."
              : `${formatNumber(slaHealth.withinTarget)} of ${formatNumber(
                  slaHealth.sampleSize
                )} inside ${formatMinutes(metrics.slaTargetMinutes)}`
          }
        />
        <KpiCard
          label="Unread threads"
          value={formatNumber(unread.value)}
          helper={`Across ${formatNumber(unread.distinctAssignees)} assigned owner${
            unread.distinctAssignees === 1 ? "" : "s"
          }`}
        />
      </section>

      {/* ---------- Inbox + brief ---------- */}
      <section className="admin-console__section adm-row">
        <article className="adm-card adm-inbox">
          <div className="adm-tabs" role="tablist" aria-label="Support channel">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`support-tab-${tab.id}`}
                aria-selected={channel === tab.id}
                aria-controls="support-tabpanel"
                className={`adm-tab${channel === tab.id ? " adm-tab--active" : ""}`}
                onClick={() => setChannel(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="adm-inbox__split" id="support-tabpanel" role="tabpanel">
            {/* --- list pane --- */}
            <div className="adm-inbox__list">
              {ticketsQuery.isLoading ? <p className="adm-empty">Loading…</p> : null}
              {ticketsQuery.isError ? (
                <p className="feedback-banner error">{ticketsQuery.error.message}</p>
              ) : null}
              {!ticketsQuery.isLoading && !tickets.length ? (
                <p className="adm-empty">
                  No {channel === "chat" ? "live chats" : "tickets"} in this queue.
                </p>
              ) : null}

              {tickets.length ? (
                <ul className="adm-conv" role="listbox" aria-label="Conversations" tabIndex={-1}>
                  {tickets.map((ticket) => {
                    const selected = ticket._id === selectedTicketId;

                    return (
                      <li key={ticket._id} role="none">
                        <button
                          type="button"
                          role="option"
                          aria-selected={selected}
                          className={`adm-conv__row${selected ? " adm-conv__row--active" : ""}`}
                          onClick={() => setSelectedTicketId(ticket._id)}
                        >
                          <span className="adm-avatar" aria-hidden="true">
                            {getInitials(ticket.requester?.name || "?")}
                          </span>
                          <span className="adm-conv__body">
                            <span className="adm-conv__top">
                              <span className="adm-conv__name">
                                {ticket.requester?.name || "Unknown requester"}
                              </span>
                              <span className="adm-conv__time adm-num">
                                {formatRelativeTime(ticket.lastMessageAt || ticket.createdAt)}
                              </span>
                            </span>
                            <span className="adm-conv__subject">{ticket.subject}</span>
                            <span className="adm-conv__preview">
                              {ticket.preview?.body || "No messages yet."}
                            </span>
                          </span>
                          {ticket.unreadForAdmin > 0 ? (
                            <span className="adm-conv__badge">
                              <span className="adm-num">{ticket.unreadForAdmin}</span>
                              <span className="sr-only"> unread messages</span>
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>

            {/* --- thread pane --- */}
            <div className="adm-inbox__thread">
              {!selectedTicketId ? (
                <p className="adm-empty">Select a conversation to read the full thread.</p>
              ) : threadQuery.isLoading ? (
                <p className="adm-empty">Loading thread…</p>
              ) : threadQuery.isError ? (
                <p className="feedback-banner error">{threadQuery.error.message}</p>
              ) : (
                <>
                  <div className="adm-thread__head">
                    <span className="adm-avatar" aria-hidden="true">
                      {getInitials(activeTicket?.requester?.name || "?")}
                    </span>
                    <div className="adm-thread__identity">
                      <span className="adm-conv__name">
                        {activeTicket?.requester?.name || "Unknown requester"}
                      </span>
                      <span className="adm-conv__preview">
                        {activeTicket?.subject} ·{" "}
                        {activeTicket?.assignee ? (
                          <>assigned to {activeTicket.assignee.name}</>
                        ) : (
                          <em>unassigned</em>
                        )}
                      </span>
                    </div>
                    <div className="adm-thread__actions">
                      <span className={`adm-pill ${STATUS_TONE[activeTicket?.status] || ""}`.trim()}>
                        {activeTicket?.status}
                      </span>
                      <span
                        className={`adm-pill ${PRIORITY_TONE[activeTicket?.priority] || ""}`.trim()}
                      >
                        {activeTicket?.priority}
                      </span>
                      <button
                        type="button"
                        className="adm-linkish"
                        onClick={() => setIsAssignOpen((open) => !open)}
                        aria-expanded={isAssignOpen}
                      >
                        Assign ›
                      </button>
                    </div>
                  </div>

                  {isAssignOpen ? (
                    <div className="adm-thread__assign">
                      <label className="sr-only" htmlFor="support-assignee">
                        Assign this ticket to an admin
                      </label>
                      <select
                        id="support-assignee"
                        className="adm-control"
                        value={activeTicket?.assignee?._id || ""}
                        onChange={(event) =>
                          updateMutation.mutate({ assigneeId: event.target.value || null })
                        }
                        disabled={updateMutation.isPending}
                      >
                        <option value="">Unassigned</option>
                        {assignees.map((admin) => (
                          <option key={admin._id} value={admin._id}>
                            {admin.name} · {admin.role}
                          </option>
                        ))}
                      </select>
                      <label className="sr-only" htmlFor="support-status">
                        Change ticket status
                      </label>
                      <select
                        id="support-status"
                        className="adm-control"
                        value={activeTicket?.status || "Open"}
                        onChange={(event) => updateMutation.mutate({ status: event.target.value })}
                        disabled={updateMutation.isPending}
                      >
                        {["Open", "Pending", "Resolved", "Closed"].map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                      <label className="sr-only" htmlFor="support-priority">
                        Change ticket priority
                      </label>
                      <select
                        id="support-priority"
                        className="adm-control"
                        value={activeTicket?.priority || "Normal"}
                        onChange={(event) =>
                          updateMutation.mutate({ priority: event.target.value })
                        }
                        disabled={updateMutation.isPending}
                      >
                        {["Low", "Normal", "High", "Urgent"].map((priority) => (
                          <option key={priority} value={priority}>
                            {priority}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  <div className="adm-thread__scroll">
                    {messages.map((message) => (
                      <div
                        key={message._id}
                        className={`adm-bubble adm-bubble--${
                          message.senderType === "admin" ? "out" : "in"
                        }${message.optimistic ? " adm-bubble--pending" : ""}`}
                      >
                        {message.senderType === "admin" ? (
                          <span className="adm-bubble__label">
                            {session?.username || "Admin"} · SGETAI
                          </span>
                        ) : null}
                        <p className="adm-bubble__body">{message.body}</p>
                        <span className="adm-bubble__time adm-num">
                          {message.optimistic ? "sending…" : formatRelativeTime(message.createdAt)}
                        </span>
                      </div>
                    ))}
                    {!messages.length ? (
                      <p className="adm-empty">This thread has no messages yet.</p>
                    ) : null}
                    <div ref={threadEndRef} />
                  </div>

                  <form className="adm-composer" onSubmit={handleSendReply}>
                    <label className="sr-only" htmlFor="support-reply">
                      Write a reply to this conversation
                    </label>
                    <input
                      id="support-reply"
                      className="adm-search"
                      value={reply}
                      onChange={(event) => setReply(event.target.value)}
                      placeholder="Write a thoughtful reply…"
                    />
                    <button
                      type="submit"
                      className="adm-btn adm-btn--accent"
                      disabled={!reply.trim() || replyMutation.isPending}
                    >
                      {replyMutation.isPending ? "Sending…" : "Send reply"}
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        </article>

        {/* ---------- Support brief ---------- */}
        <article className="adm-card adm-brief">
          <div className="adm-brief__top">
            <span className="adm-brief__mark">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 2l1.8 5.6L19.5 9l-5.7 1.4L12 16l-1.8-5.6L4.5 9l5.7-1.4z" />
                <path d="M18.5 14l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z" />
              </svg>
              Support brief
            </span>
            <span className="adm-brief__chip">
              {SUPPORT_BRIEF.confidence === null
                ? "Sample brief"
                : `${SUPPORT_BRIEF.confidence}% confidence`}
            </span>
          </div>

          <h2 className="adm-brief__headline">{SUPPORT_BRIEF.headline}</h2>
          <p className="adm-brief__body">{SUPPORT_BRIEF.body}</p>

          {/* Both rows are real metrics — only the prose above is placeholder. */}
          <div className="adm-brief__stats">
            <div className="adm-brief__stat">
              <span className="adm-brief__stat-value">
                {formatNumber(openTickets.unassigned)}
              </span>
              <span className="adm-brief__stat-label">
                open threads with no owner assigned
              </span>
            </div>
            <div className="adm-brief__stat">
              <span className="adm-brief__stat-value">
                {formatMinutes(firstResponse.medianMinutes)}
              </span>
              <span className="adm-brief__stat-label">
                {firstResponse.medianMinutes === null
                  ? "no first response recorded in the last 7 days"
                  : "median wait before a human replied, last 7 days"}
              </span>
            </div>
          </div>

          <p className="adm-brief__foot">
            {SUPPORT_BRIEF.disclaimer} · sample copy, no model has run
          </p>
        </article>
      </section>

      {isCreateOpen ? (
        <CreateTicketModal
          onClose={() => setIsCreateOpen(false)}
          onSubmit={(payload) => createMutation.mutate(payload)}
          isPending={createMutation.isPending}
        />
      ) : null}
    </AdminConsolePage>
  );
}

// The requester is identified by id because no user-search endpoint is exposed to admins; pasting
// a known id is honest about that rather than pretending a picker exists.
function CreateTicketModal({ onClose, onSubmit, isPending }) {
  const [form, setForm] = useState({
    requesterModel: "JobSeeker",
    requesterId: "",
    channel: "ticket",
    priority: "Normal",
    subject: "",
    body: "",
  });

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  return (
    <div className="adm-modal" role="dialog" aria-modal="true" aria-labelledby="support-new-title">
      <div className="adm-modal__panel">
        <div className="adm-card__head">
          <div>
            <p className="adm-eyebrow">Support</p>
            <h2 className="adm-card__title" id="support-new-title">
              New ticket
            </h2>
          </div>
          <button type="button" className="adm-linkish" onClick={onClose}>
            Close ✕
          </button>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit(form);
          }}
        >
          <div className="adm-policy__grid">
            <label className="adm-field">
              <span>Requester type</span>
              <select
                className="adm-control"
                value={form.requesterModel}
                onChange={(event) => update("requesterModel", event.target.value)}
              >
                <option value="JobSeeker">Candidate</option>
                <option value="Organization">Organisation</option>
              </select>
            </label>

            <label className="adm-field">
              <span>Requester ID</span>
              <input
                className="adm-search"
                value={form.requesterId}
                onChange={(event) => update("requesterId", event.target.value)}
                placeholder="24-character account id"
                required
              />
              <small>No admin-facing user search exists yet, so the account id is required.</small>
            </label>

            <label className="adm-field">
              <span>Channel</span>
              <select
                className="adm-control"
                value={form.channel}
                onChange={(event) => update("channel", event.target.value)}
              >
                <option value="ticket">Ticket</option>
                <option value="chat">Live chat</option>
              </select>
            </label>

            <label className="adm-field">
              <span>Priority</span>
              <select
                className="adm-control"
                value={form.priority}
                onChange={(event) => update("priority", event.target.value)}
              >
                {["Low", "Normal", "High", "Urgent"].map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="adm-field" style={{ marginBottom: 14 }}>
            <span>Subject</span>
            <input
              className="adm-search"
              value={form.subject}
              onChange={(event) => update("subject", event.target.value)}
              required
            />
          </label>

          <label className="adm-field" style={{ marginBottom: 16 }}>
            <span>First message</span>
            <textarea
              className="adm-search adm-textarea"
              rows={4}
              value={form.body}
              onChange={(event) => update("body", event.target.value)}
              required
            />
          </label>

          <div className="adm-policy__foot">
            <button type="submit" className="adm-btn adm-btn--accent" disabled={isPending}>
              {isPending ? "Creating…" : "Create ticket"}
            </button>
            <button type="button" className="adm-btn" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
