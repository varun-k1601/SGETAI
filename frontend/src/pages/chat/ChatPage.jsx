import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../services/api";
import { AutoDismissFeedback } from "../../components/AutoDismissFeedback";

function formatDate(value) {
  if (!value) {
    return "No messages yet";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Recently";
  }

  return parsed.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SessionCard({ session, selected, onSelect }) {
  const display = session.otherParticipant?.display || {};

  return (
    <button
      type="button"
      className={selected ? "chat-session-card selected" : "chat-session-card"}
      onClick={() => onSelect(session)}
    >
      <div className="post-author">
        <div className="post-author__avatar">
          {display.avatar ? (
            <img src={display.avatar} alt={display.name || "Participant"} />
          ) : (
            <span>{(display.name || "U").charAt(0).toUpperCase()}</span>
          )}
        </div>
        <div>
          <strong>{display.name || "Conversation"}</strong>
          <p>{display.subtitle || session.otherParticipant?.role || "Participant"}</p>
        </div>
      </div>
      <p>{session.lastMessage || "Start the conversation."}</p>
      <small>{formatDate(session.lastMessageAt || session.updatedAt)}</small>
    </button>
  );
}

function MessageBubble({ message, mine }) {
  return (
    <article className={mine ? "message-bubble mine" : "message-bubble theirs"}>
      <p>{message.content}</p>
      <span>{formatDate(message.createdAt)}</span>
    </article>
  );
}

export function ChatPage() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [recipientRole, setRecipientRole] = useState("organization");
  const [recipientIdentifier, setRecipientIdentifier] = useState("");
  const [messageText, setMessageText] = useState("");
  const [feedback, setFeedback] = useState({ type: "", message: "" });

  const sessionsQuery = useQuery({
    queryKey: ["chat", "sessions"],
    queryFn: () =>
      apiRequest("/chat/sessions", {
        token: session.accessToken,
      }),
    enabled: Boolean(session?.accessToken),
    refetchInterval: 10000,
  });

  const sessions = sessionsQuery.data?.sessions || [];
  const selectedSession =
    sessions.find((item) => item._id === selectedSessionId) || sessions[0] || null;
  const activeSessionId = selectedSession?._id || "";

  const messagesQuery = useQuery({
    queryKey: ["chat", activeSessionId, "messages"],
    queryFn: () =>
      apiRequest(`/chat/${activeSessionId}/messages`, {
        token: session.accessToken,
      }),
    enabled: Boolean(session?.accessToken && activeSessionId),
    refetchInterval: 5000,
  });

  const messages = messagesQuery.data?.messages || [];
  const otherDisplay = selectedSession?.otherParticipant?.display || {};
  const startRoleOptions = useMemo(() => {
    return session?.role === "organization"
      ? [
          { value: "seeker", label: "Applicant" },
          { value: "organization", label: "Recruiter" },
        ]
      : [
          { value: "organization", label: "Recruiter" },
          { value: "seeker", label: "Applicant" },
        ];
  }, [session?.role]);

  const invalidateChat = () => {
    queryClient.invalidateQueries({ queryKey: ["chat"] });
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };

  const initiateMutation = useMutation({
    mutationFn: () =>
      apiRequest("/chat/initiate", {
        method: "POST",
        token: session.accessToken,
        body: {
          recipientRole,
          recipientIdentifier,
        },
      }),
    onSuccess: (response) => {
      setFeedback({ type: "success", message: response.message || "Chat session ready." });
      setSelectedSessionId(response.session?._id || "");
      setRecipientIdentifier("");
      invalidateChat();
    },
    onError: (error) => setFeedback({ type: "error", message: error.message }),
  });

  const sendMessageMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/chat/${activeSessionId}/messages`, {
        method: "POST",
        token: session.accessToken,
        body: {
          content: messageText,
        },
      }),
    onSuccess: () => {
      setMessageText("");
      invalidateChat();
      queryClient.invalidateQueries({ queryKey: ["chat", activeSessionId, "messages"] });
    },
    onError: (error) => setFeedback({ type: "error", message: error.message }),
  });

  const closeChatMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/chat/${activeSessionId}`, {
        method: "DELETE",
        token: session.accessToken,
      }),
    onSuccess: (response) => {
      setFeedback({ type: "success", message: response.message || "Chat closed." });
      setSelectedSessionId("");
      invalidateChat();
    },
    onError: (error) => setFeedback({ type: "error", message: error.message }),
  });

  return (
    <section className="dashboard-stack">
      <AutoDismissFeedback
        feedback={feedback}
        onClear={() => setFeedback({ type: "", message: "" })}
      />

      <section className="chat-layout">
        <aside className="chat-sidebar">
          <article className="info-card">
            <div className="section-head">
              <div>
                <h3>Start conversation</h3>
                <p>
                  Search by username or email. Applicant chats require an accepted
                  connection; recruiter chats require a follow or application.
                </p>
              </div>
            </div>

            <form
              className="auth-form"
              onSubmit={(event) => {
                event.preventDefault();
                setFeedback({ type: "", message: "" });
                initiateMutation.mutate();
              }}
            >
              <label className="form-field">
                <span>Recipient type</span>
                <select
                  value={recipientRole}
                  onChange={(event) => setRecipientRole(event.target.value)}
                >
                  {startRoleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-field">
                <span>Username or email</span>
                <input
                  type="text"
                  value={recipientIdentifier}
                  onChange={(event) => setRecipientIdentifier(event.target.value)}
                  placeholder="username or email@example.com"
                  required
                />
              </label>

              <button type="submit" disabled={initiateMutation.isPending || !recipientIdentifier.trim()}>
                {initiateMutation.isPending ? "Starting..." : "Start chat"}
              </button>
            </form>
          </article>

          <article className="info-card">
            <div className="section-head">
              <div>
                <h3>Conversations</h3>
                <p>Your recent chat sessions.</p>
              </div>
              <span className="pill">{sessions.length}</span>
            </div>

            <div className="chat-session-list">
              {sessionsQuery.isLoading ? <p>Loading conversations...</p> : null}
              {sessions.map((item) => (
                <SessionCard
                  key={item._id}
                  session={item}
                  selected={activeSessionId === item._id}
                  onSelect={(nextSession) => setSelectedSessionId(nextSession._id)}
                />
              ))}
              {!sessionsQuery.isLoading && !sessions.length ? (
                <div className="empty-state-card">
                  <h4>No chats yet</h4>
                  <p>Start a conversation using a username or email.</p>
                </div>
              ) : null}
            </div>
          </article>
        </aside>

        <article className="chat-panel">
          {selectedSession ? (
            <>
              <div className="chat-panel__header">
                <div className="post-author">
                  <div className="post-author__avatar">
                    {otherDisplay.avatar ? (
                      <img src={otherDisplay.avatar} alt={otherDisplay.name || "Participant"} />
                    ) : (
                      <span>{(otherDisplay.name || "C").charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <div>
                    <strong>{otherDisplay.name || "Conversation"}</strong>
                    <p>{otherDisplay.subtitle || selectedSession.otherParticipant?.role}</p>
                  </div>
                </div>
                <div className="connection-card__actions">
                  <span className="pill">{selectedSession.otherParticipant?.role}</span>
                  <button
                    type="button"
                    className="outline-button danger-button"
                    disabled={closeChatMutation.isPending}
                    onClick={() => closeChatMutation.mutate()}
                  >
                    {closeChatMutation.isPending ? "Closing..." : "Close chat"}
                  </button>
                </div>
              </div>

              <div className="message-list">
                {messagesQuery.isLoading ? <p>Loading messages...</p> : null}
                {messages.map((message) => (
                  <MessageBubble
                    key={message._id}
                    message={message}
                    mine={String(message.senderId) === String(session.userId)}
                  />
                ))}
                {!messagesQuery.isLoading && !messages.length ? (
                  <div className="empty-state-card">
                    <h4>No messages yet</h4>
                    <p>Send the first message to begin this conversation.</p>
                  </div>
                ) : null}
              </div>

              <form
                className="chat-compose"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!messageText.trim()) {
                    return;
                  }
                  setFeedback({ type: "", message: "" });
                  sendMessageMutation.mutate();
                }}
              >
                <textarea
                  rows={3}
                  value={messageText}
                  onChange={(event) => setMessageText(event.target.value)}
                  placeholder="Type your message..."
                />
                <button type="submit" disabled={sendMessageMutation.isPending || !messageText.trim()}>
                  {sendMessageMutation.isPending ? "Sending..." : "Send"}
                </button>
              </form>
            </>
          ) : (
            <div className="empty-state-card">
              <h4>Select or start a conversation</h4>
              <p>Your messages will appear here once a chat session exists.</p>
            </div>
          )}
        </article>
      </section>
    </section>
  );
}
