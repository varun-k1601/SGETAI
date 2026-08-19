import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../services/api";
import { AutoDismissFeedback } from "../../components/AutoDismissFeedback";

// STYLING APPROACH — scoped global CSS (`.chat-page ...` in styles.css) on the shared --ph-*
// palette, the same system as .pro-home, .ai-gen, .jobs-page, .job-detail, .applied-page and
// .automations-page. Tailwind's semantic colour utilities generate no CSS in this app, and the
// unlayered global `button { ... }` rule outranks any Tailwind utility on a <button>.
//
// The root is a <section>, not a <main>: this renders inside AppShell's <main className=
// "main-panel">, and a second main landmark would leave assistive tech with two "main" regions.

// Roughly 4-5 lines of text before the composer switches to internal scrolling — mirrors the
// same auto-grow pill pattern used by AIGeneratorPage.jsx's chat input.
const CHAT_INPUT_MAX_HEIGHT_PX = 120;

// How close to the bottom still counts as "following the conversation". Above this, the user is
// reading history and a new message must not yank the view down.
const PINNED_TO_BOTTOM_SLACK_PX = 80;

const ICON_PATHS = {
  send: (
    <>
      <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" />
      <path d="m21.854 2.147-10.94 10.939" />
    </>
  ),
  search: (
    <>
      <path d="m21 21-4.34-4.34" />
      <circle cx="11" cy="11" r="8" />
    </>
  ),
  back: (
    <>
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </>
  ),
  sparkle: <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />,
};

function Icon({ name, className = "cp-icon" }) {
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

function startOfDay(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()).getTime();
}

function formatDayLabel(value) {
  const day = startOfDay(value);
  if (day === null) {
    return "Earlier";
  }

  const today = startOfDay(Date.now());
  const oneDay = 24 * 60 * 60 * 1000;

  if (day === today) {
    return "Today";
  }
  if (day === today - oneDay) {
    return "Yesterday";
  }

  return new Date(day).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: new Date(day).getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

// Relative timestamp for the conversation list.
function formatListTime(value) {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const day = startOfDay(value);
  const today = startOfDay(Date.now());
  const oneDay = 24 * 60 * 60 * 1000;

  if (day === today) {
    return parsed.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  }
  if (day === today - oneDay) {
    return "Yesterday";
  }

  return parsed.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function formatBubbleTime(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function ChatAvatar({ display, size = "md" }) {
  const initial = (display?.name || "U").trim().charAt(0).toUpperCase() || "U";

  return (
    <span className={`cp-avatar cp-avatar--${size}`} aria-hidden="true">
      {display?.avatar ? <img src={display.avatar} alt="" /> : <span>{initial}</span>}
    </span>
  );
}

function SessionRow({ session, selected, onSelect }) {
  const display = session.otherParticipant?.display || {};
  const name = display.name || "Conversation";

  return (
    <li role="none">
      <button
        type="button"
        role="option"
        aria-selected={selected}
        className={`cp-row${selected ? " cp-row--selected" : ""}`}
        onClick={() => onSelect(session)}
      >
        <ChatAvatar display={display} />
        <span className="cp-row__body">
          <span className="cp-row__top">
            <span className="cp-row__name">{name}</span>
            {session.lastMessageAt && (
              <span className="cp-row__time">{formatListTime(session.lastMessageAt)}</span>
            )}
          </span>
          <span className="cp-row__preview">
            {session.lastMessage || "Start the conversation."}
          </span>
        </span>
      </button>
    </li>
  );
}

function DirectoryRow({ name, subtitle, onSelect, disabled }) {
  return (
    <li>
      <button type="button" className="cp-row" disabled={disabled} onClick={onSelect}>
        <span className="cp-avatar cp-avatar--md" aria-hidden="true">
          <span>{(name || "U").trim().charAt(0).toUpperCase() || "U"}</span>
        </span>
        <span className="cp-row__body">
          <span className="cp-row__name">{name}</span>
          <span className="cp-row__preview">{subtitle}</span>
        </span>
      </button>
    </li>
  );
}

function MessageBubble({ message, mine }) {
  // Stamped server-side by the recruiter-introduction worker (ChatMessage.metadata). Every other
  // message in the app has an empty metadata object, so this never renders for anything a person
  // actually typed — and an introduction sent under this seeker's name always says so, in their
  // own thread, with the exact text that was delivered.
  const isAutoSent = Boolean(message.metadata?.autoSent);
  const introJobTitle = message.metadata?.jobTitle;
  const introRecruiterName = message.metadata?.hrMemberName;

  return (
    <div className={`cp-msg${mine ? " cp-msg--mine" : ""}`}>
      <div className={`cp-bubble${mine ? " cp-bubble--mine" : ""}`}>
        {isAutoSent ? (
          // Real text, never colour or an icon alone: this is what tells a user which messages
          // they did not personally write.
          <span
            className="cp-autotag"
            title="Drafted by AI and sent automatically by your Auto-introduce agent."
          >
            <Icon name="sparkle" className="cp-icon cp-icon--xs" />
            AI intro · auto-sent
            {introRecruiterName ? ` to ${introRecruiterName}` : ""}
            {introJobTitle ? ` · ${introJobTitle}` : ""}
          </span>
        ) : null}
        <p className="cp-bubble__text">{message.content}</p>
      </div>
      <span className="cp-msg__time">{formatBubbleTime(message.createdAt)}</span>
    </div>
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
  const messageListRef = useRef(null);
  // Whether the user is following the conversation. Starts true; set false the moment they scroll
  // up, so polling (every 5s) can never drag them away from the history they are reading.
  const pinnedToBottomRef = useRef(true);

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
  const otherRole = selectedSession?.otherParticipant?.role || "";

  // Consecutive messages from the same sender on the same day become one group: the avatar and
  // name are rendered once for the group, not once per message. Day changes emit a separator.
  const timeline = useMemo(() => {
    const rows = [];
    let currentDay = null;
    let currentGroup = null;

    messages.forEach((message) => {
      const mine = String(message.senderId) === String(session?.userId);
      const day = startOfDay(message.createdAt);

      if (day !== currentDay) {
        currentDay = day;
        currentGroup = null;
        rows.push({ kind: "day", key: `day-${day}-${message._id}`, label: formatDayLabel(message.createdAt) });
      }

      if (!currentGroup || currentGroup.mine !== mine) {
        currentGroup = { kind: "group", key: `group-${message._id}`, mine, items: [] };
        rows.push(currentGroup);
      }

      currentGroup.items.push(message);
    });

    return rows;
  }, [messages, session?.userId]);

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
      // Sending is always an intent to follow the conversation, even if the user had scrolled up.
      pinnedToBottomRef.current = true;
      invalidateChat();
      queryClient.invalidateQueries({ queryKey: ["chat", activeSessionId, "messages"] });
      // Clearing state won't retrigger onChange, so reset the grown height directly.
      if (messageInputRef.current) {
        messageInputRef.current.style.height = "auto";
      }
    },
    onError: (error) => setFeedback({ type: "error", message: error.message }),
  });

  const scrollToNewest = useCallback(() => {
    const list = messageListRef.current;
    if (list) {
      list.scrollTop = list.scrollHeight;
    }
  }, []);

  function handleMessageListScroll() {
    const list = messageListRef.current;
    if (!list) {
      return;
    }
    const distanceFromBottom = list.scrollHeight - list.scrollTop - list.clientHeight;
    pinnedToBottomRef.current = distanceFromBottom <= PINNED_TO_BOTTOM_SLACK_PX;
  }

  // Switching conversation always lands on the newest message.
  useEffect(() => {
    pinnedToBottomRef.current = true;
    scrollToNewest();
  }, [activeSessionId, scrollToNewest]);

  // A new message (own or polled in) only scrolls if the user is still following the bottom.
  const newestMessageId = messages.length ? messages[messages.length - 1]._id : "";
  useEffect(() => {
    if (pinnedToBottomRef.current) {
      scrollToNewest();
    }
  }, [newestMessageId, messages.length, scrollToNewest]);

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

  const showThreadOnNarrow = Boolean(selectedSession);

  return (
    <section className="chat-page" aria-label="Messages">
      <AutoDismissFeedback
        feedback={feedback}
        onClear={() => setFeedback({ type: "", message: "" })}
      />

      <header className="cp-head">
        <p className="cp-eyebrow">Messages</p>
        <h1 className="cp-title">Conversations</h1>
      </header>

      <div className={`cp-shell${showThreadOnNarrow ? " cp-shell--thread" : ""}`}>
        <aside className="cp-list" aria-label="Conversations">
          <div className="cp-list__head">
            <label className="cp-sr-only" htmlFor="cp-search">
              Search people or conversations
            </label>
            <div className="cp-search">
              <Icon name="search" className="cp-icon cp-icon--sm" />
              <input
                id="cp-search"
                type="search"
                placeholder="Search people or conversations…"
                value={threadSearch}
                onChange={(event) => setThreadSearch(event.target.value)}
              />
            </div>
          </div>

          <div className="cp-list__scroll">
            {isDirectorySearchActive ? (
              <>
                <p className="cp-group-label">Start a new chat with</p>
                {isSearchingDirectory ? <p className="cp-hint">Searching…</p> : null}
                <ul className="cp-rows">
                  {seekerDirectoryResults.map((seeker) => (
                    <DirectoryRow
                      key={`seeker-${seeker._id}`}
                      name={`${seeker.firstName || ""} ${seeker.lastName || ""}`.trim() || seeker.username || "Applicant"}
                      subtitle={seeker.tagline || seeker.currentStatus || "Job seeker"}
                      disabled={initiateMutation.isPending}
                      onSelect={() => handleStartChatWithSeeker(seeker)}
                    />
                  ))}
                  {organizationDirectoryResults.map((organization) => (
                    <DirectoryRow
                      key={`organization-${organization._id}`}
                      name={organization.companyName || organization.username || "Organization"}
                      subtitle={organization.industry || "Organization"}
                      disabled={initiateMutation.isPending}
                      onSelect={() => handleStartChatWithOrganization(organization)}
                    />
                  ))}
                </ul>
                {!isSearchingDirectory && !seekerDirectoryResults.length && !organizationDirectoryResults.length ? (
                  <p className="cp-hint">No matching people found for &ldquo;{debouncedThreadSearch}&rdquo;.</p>
                ) : null}

                <p className="cp-group-label">Conversations</p>
              </>
            ) : null}

            {sessionsQuery.isLoading ? <p className="cp-hint">Loading conversations…</p> : null}
            {sessionsQuery.isError ? (
              <p className="cp-hint cp-hint--error">
                {sessionsQuery.error?.message || "Could not load your conversations."}
              </p>
            ) : null}

            {filteredSessions.length > 0 && (
              <ul className="cp-rows" role="listbox" aria-label="Your conversations">
                {filteredSessions.map((item) => (
                  <SessionRow
                    key={item._id}
                    session={item}
                    selected={activeSessionId === item._id}
                    onSelect={(nextSession) => setSelectedSessionId(nextSession._id)}
                  />
                ))}
              </ul>
            )}

            {!sessionsQuery.isLoading && sessions.length && !filteredSessions.length ? (
              <p className="cp-hint">No conversations match &ldquo;{threadSearch}&rdquo;.</p>
            ) : null}
            {!sessionsQuery.isLoading && !sessionsQuery.isError && !sessions.length && !isDirectorySearchActive ? (
              <div className="cp-empty">
                <p className="cp-empty__title">No chats yet</p>
                <p className="cp-empty__body">Search for a person above to start a conversation.</p>
              </div>
            ) : null}
          </div>
        </aside>

        <section className="cp-thread" aria-label="Conversation">
          {selectedSession ? (
            <>
              <div className="cp-thread__head">
                <button
                  type="button"
                  className="cp-back"
                  onClick={handleCloseChat}
                  aria-label="Back to conversations"
                >
                  <Icon name="back" className="cp-icon cp-icon--sm" />
                </button>

                <ChatAvatar display={otherDisplay} size="md" />

                <div className="cp-thread__identity">
                  <p className="cp-thread__name">{otherDisplay.name || "Conversation"}</p>
                  <p className="cp-thread__sub">{otherDisplay.subtitle || otherRole}</p>
                </div>

                <div className="cp-thread__actions">
                  {otherRole && <span className="cp-pill">{otherRole}</span>}
                  <button type="button" className="cp-btn cp-btn--sm" onClick={handleCloseChat}>
                    Close chat
                  </button>
                </div>
              </div>

              <div
                className="cp-messages"
                ref={messageListRef}
                onScroll={handleMessageListScroll}
                role="log"
                aria-live="polite"
                aria-relevant="additions"
                aria-label={`Messages with ${otherDisplay.name || "this contact"}`}
                tabIndex={0}
              >
                {messagesQuery.isLoading ? <p className="cp-hint">Loading messages…</p> : null}
                {messagesQuery.isError ? (
                  <p className="cp-hint cp-hint--error">
                    {messagesQuery.error?.message || "Could not load this conversation."}
                  </p>
                ) : null}

                {timeline.map((row) =>
                  row.kind === "day" ? (
                    <p className="cp-day" key={row.key}>
                      <span>{row.label}</span>
                    </p>
                  ) : (
                    <div className={`cp-group${row.mine ? " cp-group--mine" : ""}`} key={row.key}>
                      {!row.mine && <ChatAvatar display={otherDisplay} size="sm" />}
                      <div className="cp-group__body">
                        {!row.mine && (
                          <p className="cp-group__name">{otherDisplay.name || "Conversation"}</p>
                        )}
                        {row.items.map((message) => (
                          <MessageBubble key={message._id} message={message} mine={row.mine} />
                        ))}
                      </div>
                    </div>
                  )
                )}

                {!messagesQuery.isLoading && !messagesQuery.isError && !messages.length ? (
                  <div className="cp-empty">
                    <p className="cp-empty__title">No messages yet</p>
                    <p className="cp-empty__body">Send the first message to begin this conversation.</p>
                  </div>
                ) : null}
              </div>

              <form
                className="cp-composer"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!messageText.trim()) {
                    return;
                  }
                  setFeedback({ type: "", message: "" });
                  sendMessageMutation.mutate();
                }}
              >
                <label className="cp-sr-only" htmlFor="cp-composer-input">
                  Write a message. Press Enter to send, Shift plus Enter for a new line.
                </label>
                <textarea
                  id="cp-composer-input"
                  ref={messageInputRef}
                  rows={1}
                  value={messageText}
                  onChange={(event) => {
                    setMessageText(event.target.value);
                    resizeMessageInput();
                  }}
                  onKeyDown={handleMessageInputKeyDown}
                  placeholder="Write a message…"
                />
                <button
                  type="submit"
                  className="cp-send"
                  disabled={sendMessageMutation.isPending || !messageText.trim()}
                  aria-label={sendMessageMutation.isPending ? "Sending message" : "Send message"}
                >
                  <Icon name="send" className="cp-icon cp-icon--sm" />
                </button>
              </form>
            </>
          ) : (
            <div className="cp-empty cp-empty--centred">
              <p className="cp-empty__title">Select or start a conversation</p>
              <p className="cp-empty__body">
                Your messages will appear here once a chat session exists.
              </p>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
