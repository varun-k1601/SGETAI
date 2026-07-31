import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../services/api";
import { AutoDismissFeedback } from "../../components/AutoDismissFeedback";

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

export function RecruiterMessagesPage() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [selectedThreadId, setSelectedThreadId] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [feedback, setFeedback] = useState({ type: "", message: "" });

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

  // Maps the real session shape onto the exact local field names this file's JSX already expects
  // (thread.id/initials/name/status/title/match/lastMessage) so the JSX itself doesn't change.
  const threads = sessions.map((item) => {
    const display = item.otherParticipant?.display || {};
    const atsScore = item.otherParticipant?.atsScore;

    return {
      id: item._id,
      initials: getInitials(display.name),
      name: display.name || "Conversation",
      // No real-time presence/online-status system exists anywhere in this backend — showing an
      // "online" dot would be a fabricated signal about someone's real availability, so every
      // thread stays in the "offline" (no dot) visual state.
      status: "offline",
      // Same subtitle chatController.js's buildUserDisplay already computes server-side for the
      // seeker-facing chat page (tagline/currentStatus) — reused as-is, not re-derived here.
      title: display.subtitle || "",
      // Real atsScore from this candidate's most recent Application to one of this org's jobs
      // (added server-side in decorateSessions); if no application exists between this org and
      // this candidate, there's nothing real to show, so a neutral placeholder is used instead of
      // fabricating a number.
      match: typeof atsScore === "number" ? `${atsScore}%` : "—",
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
        })),
      }
    : null;

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
    setFeedback({ type: "", message: "" });
  }

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
                Inbox
              </p>
              <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight lg:text-4xl">
                Messages
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground lg:text-base">
                Direct conversations with candidates.
              </p>
            </div>
          </div>
        </div>
      </div>

      <AutoDismissFeedback
        feedback={feedback}
        onClear={() => setFeedback({ type: "", message: "" })}
      />

      {/* Messages Container */}
      <div className="relative rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl shadow-elegant overflow-hidden">
        <div className="grid grid-cols-12 min-h-[60vh]">
          {/* Threads Sidebar */}
          <aside className="col-span-12 border-r border-border/60 md:col-span-4">
            {/* Search */}
            <div className="border-b border-border/60 p-3">
              <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-surface/50 px-3 py-2">
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
                  className="lucide h-4 w-4 text-muted-foreground"
                  aria-hidden="true"
                >
                  <path d="m21 21-4.34-4.34"></path>
                  <circle cx="11" cy="11" r="8"></circle>
                </svg>
                <input
                  placeholder="Search threads…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 bg-transparent text-sm outline-none placeholder-muted-foreground"
                />
              </div>
            </div>

            {/* Thread List */}
            <div className="space-y-2 p-2">
              {isDirectorySearchActive ? (
                <>
                  <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Start a new conversation
                  </p>
                  {isSearchingDirectory ? (
                    <p className="px-2 text-xs text-muted-foreground">Searching…</p>
                  ) : null}
                  {seekerDirectoryResults.map((seeker) => (
                    <button
                      key={`seeker-${seeker._id}`}
                      onClick={() => handleStartChatWithSeeker(seeker)}
                      disabled={initiateMutation.isPending}
                      className="flex w-full items-center gap-3 rounded-lg p-3 text-left transition border border-gray-200 disabled:cursor-not-allowed disabled:opacity-60"
                      style={{ backgroundColor: '#ffffff' }}
                    >
                      <div className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-teal-600 text-xs font-semibold text-white">
                        {getInitials(`${seeker.firstName || ""} ${seeker.lastName || ""}`)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {`${seeker.firstName || ""} ${seeker.lastName || ""}`.trim() || seeker.username || "Applicant"}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {seeker.tagline || seeker.currentStatus || "Job seeker"}
                        </p>
                      </div>
                    </button>
                  ))}
                  {!isSearchingDirectory && !seekerDirectoryResults.length ? (
                    <p className="px-2 text-xs text-muted-foreground">
                      No matching people found for "{debouncedSearchQuery}".
                    </p>
                  ) : null}
                  <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Conversations
                  </p>
                </>
              ) : null}

              {filteredThreads.map((thread) => (
                <button
                  key={thread.id}
                  onClick={() => setSelectedThreadId(thread.id)}
                  className="flex w-full items-center gap-3 rounded-lg p-3 text-left transition border border-gray-200"
                  style={{ backgroundColor: '#ffffff' }}
                >
                  <div className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-teal-600 text-xs font-semibold text-white">
                    {thread.initials}
                    {thread.status === "online" && (
                      <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-teal-400 border border-white"></span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{thread.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{thread.lastMessage}</p>
                  </div>
                </button>
              ))}
              {!sessionsQuery.isLoading && threads.length && !filteredThreads.length ? (
                <p className="px-2 text-xs text-muted-foreground">No conversations match "{searchQuery}".</p>
              ) : null}
              {!sessionsQuery.isLoading && !threads.length && !isDirectorySearchActive ? (
                <p className="px-2 text-xs text-muted-foreground">
                  No conversations yet. Search above to start one.
                </p>
              ) : null}
            </div>
          </aside>

          {/* Chat Section */}
          <section className="col-span-12 flex flex-col md:col-span-8">
            {selectedThread ? (
              <>
                {/* Chat Header */}
                <div className="border-b border-border/60 p-4 flex items-center justify-between">
                  <div>
                    <p className="font-display text-base font-semibold">{selectedThread.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {selectedThread.title} · {selectedThread.match} match
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCloseChat}
                    className="rounded-full border border-border/60 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-surface/70 transition"
                  >
                    Close chat
                  </button>
                </div>

                {/* Messages */}
                <div className="flex-1 space-y-3 overflow-y-auto p-4">
                  {selectedThread.messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.sender === "recruiter" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                          message.sender === "recruiter"
                            ? "rounded-br-md bg-teal-600 text-white"
                            : "rounded-bl-md border border-border/60 bg-surface text-foreground"
                        }`}
                      >
                        <p>{message.text}</p>
                        <p
                          className={`mt-1 text-[10px] ${
                            message.sender === "recruiter"
                              ? "text-white/70"
                              : "text-muted-foreground"
                          }`}
                        >
                          {message.time}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Message Input */}
                <div className="border-t border-border/60 p-3">
                  <div className="flex items-center gap-2 rounded-full border border-border/60 bg-surface/70 pl-4 pr-1">
                    <input
                      placeholder="Write a message…"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      className="flex-1 bg-transparent py-2.5 text-sm outline-none"
                    />
                    <button
                      onClick={handleSendMessage}
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-teal-600 text-white hover:bg-teal-700 transition"
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
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <p>Select a conversation to start messaging</p>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
