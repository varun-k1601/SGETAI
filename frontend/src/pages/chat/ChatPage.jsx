import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../services/api";
import { AutoDismissFeedback } from "../../components/AutoDismissFeedback";

// Roughly 4-5 lines of text before the composer switches to internal scrolling — mirrors the
// same auto-grow pill pattern used by AIGeneratorPage.jsx's chat input.
const CHAT_INPUT_MAX_HEIGHT_PX = 120;

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

function formatBubbleTime(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function SendIcon() {
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
      className="chat-send-icon"
      aria-hidden="true"
    >
      <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"></path>
      <path d="m21.854 2.147-10.94 10.939"></path>
    </svg>
  );
}

function ChatAvatar({ display, size = "md" }) {
  const initial = (display?.name || "U").trim().charAt(0).toUpperCase() || "U";

  return (
    <div className={size === "sm" ? "chat-avatar chat-avatar--sm" : "chat-avatar"}>
      {display?.avatar ? <img src={display.avatar} alt={display.name || "Participant"} /> : <span>{initial}</span>}
    </div>
  );
}

function SessionCard({ session, selected, onSelect }) {
  const display = session.otherParticipant?.display || {};

  return (
    <button
      type="button"
      className={selected ? "chat-session-card selected" : "chat-session-card"}
      onClick={() => onSelect(session)}
    >
      <ChatAvatar display={display} />
      <div className="chat-session-card__body">
        <strong>{display.name || "Conversation"}</strong>
        <p>{session.lastMessage || "Start the conversation."}</p>
      </div>
    </button>
  );
}

function DirectoryResultCard({ name, subtitle, onSelect, disabled }) {
  return (
    <button
      type="button"
      className="chat-session-card"
      disabled={disabled}
      onClick={onSelect}
    >
      <div className="chat-avatar chat-avatar--sm">
        <span>{(name || "U").trim().charAt(0).toUpperCase() || "U"}</span>
      </div>
      <div className="chat-session-card__body">
        <strong>{name}</strong>
        <p>{subtitle}</p>
      </div>
    </button>
  );
}

function MessageBubble({ message, mine }) {
  return (
    <article className={mine ? "message-bubble mine" : "message-bubble theirs"}>
      <p>{message.content}</p>
      <span>{formatBubbleTime(message.createdAt)}</span>
    </article>
  );
}

export function ChatPage() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [messageText, setMessageText] = useState("");
  const [feedback, setFeedback] = useState({ type: "", message: "" });
  const [threadSearch, setThreadSearch] = useState("");
  const [debouncedThreadSearch, setDebouncedThreadSearch] = useState("");
  const messageInputRef = useRef(null);

  // Debounce the directory search network calls (300ms) — the existing-session filter below stays
  // instant since it's just a client-side array filter, no request involved.
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedThreadSearch(threadSearch.trim()), 300);
    return () => clearTimeout(handle);
  }, [threadSearch]);

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
  const filteredSessions = useMemo(() => {
    const query = threadSearch.trim().toLowerCase();
    if (!query) {
      return sessions;
    }
    return sessions.filter((item) => {
      const display = item.otherParticipant?.display || {};
      return (
        (display.name || "").toLowerCase().includes(query) ||
        (item.lastMessage || "").toLowerCase().includes(query)
      );
    });
  }, [sessions, threadSearch]);

  const isDirectorySearchActive = debouncedThreadSearch.length >= 2;

  // Mirrors ConnectionsPage.jsx's direct search exactly (same endpoints, same query-param shape).
  // Every role can search seekers (an org messaging an applicant, or a seeker messaging another
  // seeker); organization search is skipped for an org user since org-to-org chat is rejected
  // server-side (assertCanStartChat) — no point surfacing results that can only ever 403.
  const seekerDirectoryQuery = useQuery({
    queryKey: ["chat", "directory", "seekers", debouncedThreadSearch],
    queryFn: () =>
      apiRequest(`/search/seekers?q=${encodeURIComponent(debouncedThreadSearch)}&limit=6`, {
        token: session.accessToken,
      }),
    enabled: Boolean(session?.accessToken && isDirectorySearchActive),
  });

  const organizationDirectoryQuery = useQuery({
    queryKey: ["chat", "directory", "organizations", debouncedThreadSearch],
    queryFn: () =>
      apiRequest(`/search/organizations?q=${encodeURIComponent(debouncedThreadSearch)}&limit=6`, {
        token: session.accessToken,
      }),
    enabled: Boolean(session?.accessToken && session?.role !== "organization" && isDirectorySearchActive),
  });

  const seekerDirectoryResults = seekerDirectoryQuery.data?.seekers || [];
  const organizationDirectoryResults = organizationDirectoryQuery.data?.organizations || [];
  const isSearchingDirectory =
    isDirectorySearchActive && (seekerDirectoryQuery.isLoading || organizationDirectoryQuery.isLoading);

  const selectedSession = sessions.find((item) => item._id === selectedSessionId) || null;
  const activeSessionId = selectedSession?._id || "";

  // Auto-select the first conversation once, on initial load, purely as a convenience — but only
  // once. Without the ref guard, this would re-fire every time selectedSessionId is "" (including
  // right after "Close chat" deliberately clears it) and immediately re-select the same session,
  // making "Close chat" a no-op whenever there's only one conversation.
  const hasAutoSelectedRef = useRef(false);
  useEffect(() => {
    if (!hasAutoSelectedRef.current && !selectedSessionId && sessions.length) {
      hasAutoSelectedRef.current = true;
      setSelectedSessionId(sessions[0]._id);
    }
  }, [sessions, selectedSessionId]);

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

  const invalidateChat = () => {
    queryClient.invalidateQueries({ queryKey: ["chat"] });
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };

  const initiateMutation = useMutation({
    mutationFn: ({ recipientRole, recipientIdentifier }) =>
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
      setThreadSearch("");
      invalidateChat();
    },
    onError: (error) => setFeedback({ type: "error", message: error.message }),
  });

  function handleStartChatWithSeeker(seeker) {
    setFeedback({ type: "", message: "" });
    initiateMutation.mutate({ recipientRole: "seeker", recipientIdentifier: seeker._id });
  }

  function handleStartChatWithOrganization(organization) {
    setFeedback({ type: "", message: "" });
    initiateMutation.mutate({ recipientRole: "organization", recipientIdentifier: organization._id });
  }

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
      // Clearing state won't retrigger onChange, so reset the grown height directly.
      if (messageInputRef.current) {
        messageInputRef.current.style.height = "auto";
      }
    },
    onError: (error) => setFeedback({ type: "error", message: error.message }),
  });

  function resizeMessageInput() {
    const textarea = messageInputRef.current;
    if (!textarea) {
      return;
    }
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, CHAT_INPUT_MAX_HEIGHT_PX)}px`;
  }

  function handleMessageInputKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (messageText.trim() && !sendMessageMutation.isPending) {
        setFeedback({ type: "", message: "" });
        sendMessageMutation.mutate();
      }
    }
  }

  // "Close chat" only deselects the conversation and returns to the inbox view — it must NOT call
  // DELETE /chat/:sessionId (that permanently wipes the session and all its messages, which is a
  // real trash/delete action, not what a "Close chat" button should trigger). The session and its
  // history stay untouched in the database and the conversation remains selectable from the
  // sidebar afterward.
  function handleCloseChat() {
    // Guard against the auto-select-first-conversation effect firing again right after this and
    // undoing the close (it only checks "has anything ever been auto-selected", and a manual
    // session click before this point wouldn't have set that guard itself).
    hasAutoSelectedRef.current = true;
    setSelectedSessionId("");
    setMessageText("");
    setFeedback({ type: "", message: "" });
  }

  return (
    <section className="dashboard-stack">
      <AutoDismissFeedback
        feedback={feedback}
        onClear={() => setFeedback({ type: "", message: "" })}
      />

      <section className="chat-layout">
        <aside className="chat-sidebar">
          <div className="chat-sidebar__header">
            <input
              type="search"
              className="chat-search"
              placeholder="Search people or conversations..."
              value={threadSearch}
              onChange={(event) => setThreadSearch(event.target.value)}
            />
          </div>

          <div className="chat-session-list">
            {isDirectorySearchActive ? (
              <>
                <p className="chat-directory-heading">Start a new chat with</p>
                {isSearchingDirectory ? <p>Searching...</p> : null}
                {seekerDirectoryResults.map((seeker) => (
                  <DirectoryResultCard
                    key={`seeker-${seeker._id}`}
                    name={`${seeker.firstName || ""} ${seeker.lastName || ""}`.trim() || seeker.username || "Applicant"}
                    subtitle={seeker.tagline || seeker.currentStatus || "Job seeker"}
                    disabled={initiateMutation.isPending}
                    onSelect={() => handleStartChatWithSeeker(seeker)}
                  />
                ))}
                {organizationDirectoryResults.map((organization) => (
                  <DirectoryResultCard
                    key={`organization-${organization._id}`}
                    name={organization.companyName || organization.username || "Organization"}
                    subtitle={organization.industry || "Organization"}
                    disabled={initiateMutation.isPending}
                    onSelect={() => handleStartChatWithOrganization(organization)}
                  />
                ))}
                {!isSearchingDirectory && !seekerDirectoryResults.length && !organizationDirectoryResults.length ? (
                  <p className="chat-empty-hint">No matching people found for "{debouncedThreadSearch}".</p>
                ) : null}

                <p className="chat-directory-heading">Conversations</p>
              </>
            ) : null}

            {sessionsQuery.isLoading ? <p>Loading conversations...</p> : null}
            {filteredSessions.map((item) => (
              <SessionCard
                key={item._id}
                session={item}
                selected={activeSessionId === item._id}
                onSelect={(nextSession) => setSelectedSessionId(nextSession._id)}
              />
            ))}
            {!sessionsQuery.isLoading && sessions.length && !filteredSessions.length ? (
              <p className="chat-empty-hint">No conversations match "{threadSearch}".</p>
            ) : null}
            {!sessionsQuery.isLoading && !sessions.length && !isDirectorySearchActive ? (
              <div className="empty-state-card">
                <h4>No chats yet</h4>
                <p>Search for a person above to start a conversation.</p>
              </div>
            ) : null}
          </div>
        </aside>

        <article className="chat-panel">
          {selectedSession ? (
            <>
              <div className="chat-panel__header">
                <div className="chat-panel__header-identity">
                  <ChatAvatar display={otherDisplay} size="sm" />
                  <div>
                    <strong>{otherDisplay.name || "Conversation"}</strong>
                    <p>{otherDisplay.subtitle || selectedSession.otherParticipant?.role}</p>
                  </div>
                </div>
                <div className="connection-card__actions">
                  <span className="pill">{selectedSession.otherParticipant?.role}</span>
                  <button
                    type="button"
                    className="outline-button"
                    onClick={handleCloseChat}
                  >
                    Close chat
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
                  ref={messageInputRef}
                  rows={1}
                  value={messageText}
                  onChange={(event) => {
                    setMessageText(event.target.value);
                    resizeMessageInput();
                  }}
                  onKeyDown={handleMessageInputKeyDown}
                  placeholder="Write a message..."
                />
                <button
                  type="submit"
                  className="chat-send-button"
                  disabled={sendMessageMutation.isPending || !messageText.trim()}
                  aria-label="Send message"
                  title="Send"
                >
                  <SendIcon />
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
