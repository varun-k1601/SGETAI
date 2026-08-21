import { useEffect, useId, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../services/api";
import { AutoDismissFeedback } from "../../components/AutoDismissFeedback";

/* ===============================================================================================
   Recruiter messages (/recruiter/messages) — organization accounts only.
   ===============================================================================================
   RESTYLE. Every endpoint and interval this page already used is carried forward untouched:
     GET  /chat/sessions              refetchInterval 10000
     GET  /chat/:sessionId/messages   refetchInterval 5000
     POST /chat/:sessionId/messages   sendMessageMutation
     POST /chat/initiate              initiateMutation
     GET  /search/seekers             candidate directory for starting a conversation
   There is no socket client in this app and none was added — the two polls ARE the transport.

   ------------------------------------------------------------------------------------------------
   FIXED-HEIGHT SHELL, no viewport-unit guessing
   ------------------------------------------------------------------------------------------------
   .main-panel is already a stretched flex child of .page-shell (min-height: 100vh), so it has a
   definite height at every breakpoint — including below 768px, where .page-shell turns into a
   column and the sidebar becomes a top bar of unknowable height. The stylesheet therefore turns
   .main-panel itself into a flex column *only while this page is mounted*, via
   `.main-panel:has(> .recruiter-messages)`, and this root takes `flex: 1; min-height: 0`.
   That gives a shell that is exactly the space actually available, with no calc() against a header
   height that CSS cannot see, and no impact on any other page.

   The two panes then scroll independently (`overflow-y: auto` + `min-height: 0`) and the composer
   is a non-shrinking flex row pinned after the scroller.

   ------------------------------------------------------------------------------------------------
   MATCH CONTEXT: real, and it now says what it is a match FOR
   ------------------------------------------------------------------------------------------------
   otherParticipant.atsScore was already computed server-side in chatController.decorateSessions
   from the candidate's MOST RECENT Application to one of this org's jobs. This restyle added
   `matchJobTitle` off that same application row (same sort, same first-wins), so the score and the
   role can never disagree. A candidate with no application to this org — recruiter-initiated
   outreach — is absent from that map entirely, so the sub-line degrades to the candidate's own
   tagline, and never to "0% match". A real atsScore of 0 still renders as 0%, because that is a
   real score.

   ------------------------------------------------------------------------------------------------
   UNREAD DOTS: deliberately NOT rendered
   ------------------------------------------------------------------------------------------------
   ChatMessage.readBy exists but is only ever written at creation, with the SENDER's own id
   (chatController.sendMessage and recruiterIntroductionWorker are the only two writers). Nothing
   anywhere adds a reader: getSessionMessages does not mark anything read, and there is no
   mark-read endpoint. So a dot derived from readBy would light up on every thread that has ever
   received an inbound message and would never clear, for anyone, ever. That is worse than no dot,
   and faking it from lastMessageAt would be inventing a signal. Omitted, and reported.
   =============================================================================================== */

function getInitials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  const initials = `${parts[0]?.[0] || ""}${parts[1]?.[0] || ""}`;
  return initials.toUpperCase() || "?";
}

function formatBubbleTime(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  return parsed.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function isSameDay(left, right) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

// "Today" / "Yesterday" / a real date. The year is only shown when it is not the current one.
function dayLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (isSameDay(date, today)) return "Today";
  if (isSameDay(date, yesterday)) return "Yesterday";

  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    ...(date.getFullYear() === today.getFullYear() ? {} : { year: "numeric" }),
  });
}

function IconSearch(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function IconSend(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" />
      <path d="m21.854 2.147-10.94 10.939" />
    </svg>
  );
}

function IconArrowLeft(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </svg>
  );
}

function IconInbox(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" />
    </svg>
  );
}

function IconAlertCircle(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </svg>
  );
}

export function RecruiterMessagesPage() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const uid = useId();
  const [selectedThreadId, setSelectedThreadId] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [feedback, setFeedback] = useState({ type: "", message: "" });
  // Below the two-panel breakpoint only one pane is visible; this flips to the thread on selection
  // and back on the thread's own back control. Above it, both render regardless (CSS decides).
  const [mobileThreadOpen, setMobileThreadOpen] = useState(false);

  // Debounce the directory search network calls (300ms) — the existing-thread filter below stays
  // instant since it's just a client-side array filter, no request involved. Mirrors the identical
  // fix already applied to ChatPage.jsx.
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearchQuery(searchQuery.trim()), 300);
    return () => clearTimeout(handle);
  }, [searchQuery]);

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

  const threads = sessions.map((item) => {
    const display = item.otherParticipant?.display || {};
    const atsScore = item.otherParticipant?.atsScore;

    return {
      id: item._id,
      initials: getInitials(display.name),
      name: display.name || "Conversation",
      // Same subtitle chatController.js's buildUserDisplay already computes server-side for the
      // seeker-facing chat page (tagline/currentStatus) — reused as-is, not re-derived here.
      title: display.subtitle || "",
      // Real values or null. Never coerced to 0 — see the match-context note in the file header.
      atsScore: typeof atsScore === "number" ? atsScore : null,
      matchJobTitle: item.otherParticipant?.matchJobTitle || null,
      lastMessage: item.lastMessage || "Start the conversation.",
    };
  });

  const selectedSession = sessions.find((item) => item._id === selectedThreadId) || null;
  const activeSessionId = selectedSession?._id || "";

  // Auto-select the first conversation once, on initial load, purely as a convenience — but only
  // once. Without the ref guard, this would re-fire every time selectedThreadId is "" (including
  // right after "Close chat" deliberately clears it) and immediately re-select the same session,
  // making "Close chat" a no-op whenever there's only one conversation. Mirrors ChatPage.jsx's
  // identical fix.
  const hasAutoSelectedRef = useRef(false);
  useEffect(() => {
    if (!hasAutoSelectedRef.current && !selectedThreadId && sessions.length) {
      hasAutoSelectedRef.current = true;
      setSelectedThreadId(sessions[0]._id);
    }
  }, [sessions, selectedThreadId]);

  const messagesQuery = useQuery({
    queryKey: ["chat", activeSessionId, "messages"],
    queryFn: () =>
      apiRequest(`/chat/${activeSessionId}/messages`, {
        token: session.accessToken,
      }),
    enabled: Boolean(session?.accessToken && activeSessionId),
    refetchInterval: 5000,
  });

  const selectedThread = selectedSession
    ? {
        ...threads.find((thread) => thread.id === selectedSession._id),
        messages: (messagesQuery.data?.messages || []).map((message) => ({
          id: message._id,
          sender: String(message.senderId) === String(session.userId) ? "recruiter" : "candidate",
          text: message.content,
          time: formatBubbleTime(message.createdAt),
          createdAt: message.createdAt,
          // Server-stamped on ChatMessage.metadata by the recruiter-introduction worker. Shown so
          // an inbound introduction is never mistaken for a message the candidate hand-wrote —
          // the recruiter deserves to know what was automated before they reply to it.
          autoSent: Boolean(message.metadata?.autoSent),
          introJobTitle: message.metadata?.jobTitle || "",
        })),
      }
    : null;

  /* ---- Auto-scroll ---------------------------------------------------------------------------
     Follows the newest message on load, on conversation switch and on arrival — but only while the
     recruiter is already near the bottom. If they have scrolled up to read history, an incoming
     poll must not yank the viewport away from what they are reading. */
  const scrollRef = useRef(null);
  const isNearBottomRef = useRef(true);
  const previousSessionRef = useRef("");
  const messageCount = selectedThread?.messages?.length ?? 0;

  function handleScroll(event) {
    const element = event.currentTarget;
    isNearBottomRef.current =
      element.scrollHeight - element.scrollTop - element.clientHeight < 120;
  }

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const switchedConversation = previousSessionRef.current !== activeSessionId;
    previousSessionRef.current = activeSessionId;

    if (switchedConversation) {
      // A different conversation always opens at its newest message.
      element.scrollTop = element.scrollHeight;
      isNearBottomRef.current = true;
      return;
    }

    if (isNearBottomRef.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [messageCount, activeSessionId]);

  const filteredThreads = threads.filter(
    (thread) =>
      thread.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      thread.lastMessage.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const isDirectorySearchActive = debouncedSearchQuery.length >= 2;

  // Mirrors ChatPage.jsx's identical fix (same endpoint, same query-param shape, same "merge
  // find-someone with start-a-chat" approach). Organization search is intentionally NOT included
  // here: GET /search/organizations is seeker-only server-side (searchOrganizations in
  // jobSearchController.js), and even if it weren't, assertCanStartChat unconditionally rejects
  // organization-to-organization chat — surfacing org results would only ever produce a
  // guaranteed 403 on click, exactly why ChatPage.jsx's own fix skips this for org viewers too.
  // GET /search/seekers was previously seeker-only as well; that role gate was loosened
  // specifically to support this recruiter search (see jobSearchController.js's searchSeekers).
  const seekerDirectoryQuery = useQuery({
    queryKey: ["chat", "directory", "seekers", debouncedSearchQuery],
    queryFn: () =>
      apiRequest(`/search/seekers?q=${encodeURIComponent(debouncedSearchQuery)}&limit=6`, {
        token: session.accessToken,
      }),
    enabled: Boolean(session?.accessToken && isDirectorySearchActive),
    retry: false,
  });

  const seekerDirectoryResults = seekerDirectoryQuery.data?.seekers || [];
  const isSearchingDirectory = isDirectorySearchActive && seekerDirectoryQuery.isLoading;

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
      setSelectedThreadId(response.session?._id || "");
      setMobileThreadOpen(true);
      setSearchQuery("");
      invalidateChat();
    },
    onError: (error) => setFeedback({ type: "error", message: error.message }),
  });

  function handleStartChatWithSeeker(seeker) {
    setFeedback({ type: "", message: "" });
    initiateMutation.mutate({ recipientRole: "seeker", recipientIdentifier: seeker._id });
  }

  const sendMessageMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/chat/${activeSessionId}/messages`, {
        method: "POST",
        token: session.accessToken,
        body: {
          content: newMessage,
        },
      }),
    onSuccess: () => {
      setNewMessage("");
      // A message the recruiter just sent should always pull the view down.
      isNearBottomRef.current = true;
      queryClient.invalidateQueries({ queryKey: ["chat"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const handleSendMessage = () => {
    if (newMessage.trim() && selectedThread && !sendMessageMutation.isPending) {
      sendMessageMutation.mutate();
    }
  };

  // "Close chat" only deselects the conversation and returns to the inbox empty state — it must
  // NOT call DELETE /chat/:sessionId (that permanently wipes the session and all its messages,
  // which is a real destructive action, not what this button should do). The session and its
  // history stay untouched in the database and remain selectable from the sidebar afterward.
  // Mirrors ChatPage.jsx's identical handleCloseChat.
  function handleCloseChat() {
    hasAutoSelectedRef.current = true;
    setSelectedThreadId("");
    setNewMessage("");
    setMobileThreadOpen(false);
    setFeedback({ type: "", message: "" });
  }

  function selectThread(threadId) {
    setSelectedThreadId(threadId);
    setMobileThreadOpen(true);
  }

  // "Sr. Frontend Engineer · 96% match" when both are known, degrading cleanly when they are not.
  function buildContextLine(thread) {
    if (!thread) return "";
    const parts = [];
    if (thread.matchJobTitle) parts.push(thread.matchJobTitle);
    if (thread.atsScore !== null) parts.push(`${thread.atsScore}% match`);
    if (parts.length) return parts.join(" · ");
    // No application to this org at all (recruiter-initiated outreach) — fall back to who they are.
    return thread.title || "";
  }

  const searchId = `${uid}-search`;
  const composerId = `${uid}-composer`;

  return (
    <section className="recruiter-messages">
      {/* ---- 1. Hero — deliberately compact; the thread pane needs the height more. ---------- */}
      <header className="rm-hero">
        <p className="rm-eyebrow">Inbox</p>
        <h1 className="rm-hero__title">Messages</h1>
        <p className="rm-hero__sub">Direct conversations with candidates.</p>
      </header>

      <AutoDismissFeedback feedback={feedback} onClear={() => setFeedback({ type: "", message: "" })} />

      {/* ---- 2. One card, two panes ---------------------------------------------------------- */}
      <div className={`rm-shell${mobileThreadOpen ? " rm-shell--thread" : ""}`}>
        {/* ---- LEFT: thread list ---------------------------------------------------------- */}
        <div className="rm-list">
          <div className="rm-search">
            <label className="rm-sr-only" htmlFor={searchId}>
              Search conversations, or find a candidate to message
            </label>
            <span className="rm-search__control">
              <IconSearch className="rm-icon rm-icon--sm rm-search__icon" />
              <input
                id={searchId}
                type="search"
                className="rm-search__input"
                placeholder="Search threads…"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </span>
          </div>

          <div className="rm-list__scroll">
            {/* Typing 2+ characters also searches the candidate directory, so the same box both
                filters existing threads and starts new ones. */}
            {isDirectorySearchActive ? (
              <>
                <p className="rm-list__label">Start a new conversation</p>
                {isSearchingDirectory ? <p className="rm-list__note">Searching…</p> : null}
                {seekerDirectoryResults.map((seeker) => {
                  const name =
                    `${seeker.firstName || ""} ${seeker.lastName || ""}`.trim() ||
                    seeker.username ||
                    "Applicant";
                  return (
                    <button
                      key={`seeker-${seeker._id}`}
                      type="button"
                      className="rm-thread"
                      disabled={initiateMutation.isPending}
                      onClick={() => handleStartChatWithSeeker(seeker)}
                    >
                      <span className="rm-thread__accent" aria-hidden="true" />
                      <span className="rm-avatar" aria-hidden="true">
                        {getInitials(name)}
                      </span>
                      <span className="rm-thread__body">
                        <span className="rm-thread__name">{name}</span>
                        <span className="rm-thread__preview">
                          {seeker.tagline || seeker.currentStatus || "Job seeker"}
                        </span>
                      </span>
                    </button>
                  );
                })}
                {!isSearchingDirectory && !seekerDirectoryResults.length ? (
                  <p className="rm-list__note">No matching people found for “{debouncedSearchQuery}”.</p>
                ) : null}
                <p className="rm-list__label">Conversations</p>
              </>
            ) : null}

            {sessionsQuery.isLoading ? (
              <p className="rm-list__note">Loading conversations…</p>
            ) : sessionsQuery.isError ? (
              <p className="rm-list__note rm-list__note--error">
                <IconAlertCircle className="rm-icon rm-icon--sm" />
                {sessionsQuery.error?.message || "Could not load your conversations."}
              </p>
            ) : null}

            {filteredThreads.length ? (
              <nav className="rm-threads" role="listbox" aria-label="Conversations">
                {filteredThreads.map((thread) => {
                  const selected = thread.id === selectedThreadId;
                  return (
                    <button
                      key={thread.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={`rm-thread${selected ? " rm-thread--selected" : ""}`}
                      onClick={() => selectThread(thread.id)}
                    >
                      <span className="rm-thread__accent" aria-hidden="true" />
                      <span className="rm-avatar" aria-hidden="true">
                        {thread.initials}
                      </span>
                      <span className="rm-thread__body">
                        <span className="rm-thread__name">{thread.name}</span>
                        <span className="rm-thread__preview">{thread.lastMessage}</span>
                      </span>
                    </button>
                  );
                })}
              </nav>
            ) : null}

            {!sessionsQuery.isLoading && !sessionsQuery.isError && threads.length && !filteredThreads.length ? (
              <p className="rm-list__note">No conversations match “{searchQuery}”.</p>
            ) : null}

            {!sessionsQuery.isLoading && !sessionsQuery.isError && !threads.length && !isDirectorySearchActive ? (
              <p className="rm-list__note">No conversations yet. Search above to start one.</p>
            ) : null}
          </div>
        </div>

        {/* ---- RIGHT: thread ------------------------------------------------------------- */}
        <div className="rm-thread-pane">
          {selectedThread ? (
            <>
              <header className="rm-thread-head">
                <button
                  type="button"
                  className="rm-back"
                  onClick={() => setMobileThreadOpen(false)}
                  aria-label="Back to conversations"
                >
                  <IconArrowLeft className="rm-icon rm-icon--sm" />
                </button>
                <span className="rm-avatar rm-avatar--sm" aria-hidden="true">
                  {selectedThread.initials}
                </span>
                <div className="rm-thread-head__body">
                  <p className="rm-thread-head__name">{selectedThread.name}</p>
                  {buildContextLine(selectedThread) ? (
                    <p className="rm-thread-head__meta">{buildContextLine(selectedThread)}</p>
                  ) : null}
                </div>
                <button type="button" className="rm-btn" onClick={handleCloseChat}>
                  Close chat
                </button>
              </header>

              <div
                className="rm-messages"
                ref={scrollRef}
                onScroll={handleScroll}
                role="log"
                aria-live="polite"
                aria-label={`Conversation with ${selectedThread.name}`}
              >
                {messagesQuery.isLoading ? (
                  <p className="rm-list__note">Loading messages…</p>
                ) : messagesQuery.isError ? (
                  <p className="rm-list__note rm-list__note--error">
                    <IconAlertCircle className="rm-icon rm-icon--sm" />
                    {messagesQuery.error?.message || "Could not load this conversation."}
                  </p>
                ) : selectedThread.messages.length ? (
                  selectedThread.messages.map((message, index) => {
                    const previous = selectedThread.messages[index - 1];
                    const showDay =
                      !previous ||
                      !isSameDay(new Date(previous.createdAt), new Date(message.createdAt));
                    // Consecutive messages from the same person on the same day tuck up close.
                    const grouped = Boolean(previous) && !showDay && previous.sender === message.sender;
                    const outbound = message.sender === "recruiter";

                    return (
                      <div key={message.id}>
                        {showDay ? (
                          <p className="rm-day">
                            <span>{dayLabel(message.createdAt)}</span>
                          </p>
                        ) : null}
                        <div
                          className={`rm-row rm-row--${outbound ? "out" : "in"}${
                            grouped ? " rm-row--grouped" : ""
                          }`}
                        >
                          <div className={`rm-bubble rm-bubble--${outbound ? "out" : "in"}`}>
                            {/* Real words, never an icon or a tint on its own — a recruiter about
                                to reply needs to know this was automation, not the person. */}
                            {message.autoSent ? (
                              <p className="rm-ai">
                                AI intro · auto-sent
                                {message.introJobTitle ? ` · ${message.introJobTitle}` : ""}
                              </p>
                            ) : null}
                            <p className="rm-bubble__text">{message.text}</p>
                            <p className="rm-bubble__time">{message.time}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="rm-empty">
                    <IconInbox className="rm-icon rm-icon--lg" />
                    <p className="rm-empty__title">No messages yet</p>
                    <p>Say hello — your first message starts the conversation.</p>
                  </div>
                )}
              </div>

              <form
                className="rm-composer"
                onSubmit={(event) => {
                  event.preventDefault();
                  handleSendMessage();
                }}
              >
                <label className="rm-sr-only" htmlFor={composerId}>
                  Write a message to {selectedThread.name}
                </label>
                <input
                  id={composerId}
                  className="rm-composer__input"
                  placeholder="Write a message…"
                  value={newMessage}
                  onChange={(event) => setNewMessage(event.target.value)}
                />
                <button
                  type="submit"
                  className="rm-send"
                  disabled={sendMessageMutation.isPending || !newMessage.trim()}
                  aria-label="Send message"
                >
                  <IconSend className="rm-icon rm-icon--sm" />
                </button>
              </form>
            </>
          ) : (
            <div className="rm-empty rm-empty--pane">
              <IconInbox className="rm-icon rm-icon--lg" />
              <p className="rm-empty__title">
                {sessionsQuery.isLoading ? "Loading conversations…" : "No conversation selected"}
              </p>
              <p>
                {sessionsQuery.isLoading
                  ? "Fetching your inbox."
                  : threads.length
                    ? "Pick a conversation on the left to read and reply."
                    : "Search for a candidate on the left to start your first conversation."}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
