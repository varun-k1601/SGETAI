import { useState } from "react";

export function RecruiterMessagesPage() {
  const [selectedThreadId, setSelectedThreadId] = useState("ar");
  const [newMessage, setNewMessage] = useState("");

  const threads = [
    {
      id: "ar",
      initials: "AR",
      name: "Alex Rivera",
      status: "online",
      title: "Sr. Frontend",
      match: "96%",
      lastMessage: "Yes, Thursday at 2pm works!",
      messages: [
        {
          id: 1,
          sender: "recruiter",
          text: "Hi Alex — your profile is a strong match for our Sr. Frontend role. Open to a 20m intro chat?",
          time: "10:02",
        },
        {
          id: 2,
          sender: "candidate",
          text: "Hey! Thanks for reaching out. Yes, happy to chat.",
          time: "10:14",
        },
        {
          id: 3,
          sender: "recruiter",
          text: "Great — does Thursday at 2pm PT work?",
          time: "10:16",
        },
        {
          id: 4,
          sender: "candidate",
          text: "Yes, Thursday at 2pm works!",
          time: "10:22",
        },
      ],
    },
    {
      id: "jt",
      initials: "JT",
      name: "Jamie Tanaka",
      status: "offline",
      title: "Full-Stack Engineer",
      match: "92%",
      lastMessage: "Sending portfolio shortly.",
      messages: [
        {
          id: 1,
          sender: "recruiter",
          text: "Hi Jamie, interested in discussing the full-stack role?",
          time: "09:45",
        },
        {
          id: 2,
          sender: "candidate",
          text: "Sounds great! Sending portfolio shortly.",
          time: "09:52",
        },
      ],
    },
    {
      id: "sp",
      initials: "SP",
      name: "Sasha Patel",
      status: "online",
      title: "Staff Engineer",
      match: "89%",
      lastMessage: "Open to chatting about the role.",
      messages: [
        {
          id: 1,
          sender: "recruiter",
          text: "Sasha, we'd love to chat about the Staff Engineer position.",
          time: "11:00",
        },
        {
          id: 2,
          sender: "candidate",
          text: "Open to chatting about the role. What are the details?",
          time: "11:15",
        },
      ],
    },
    {
      id: "ob",
      initials: "OB",
      name: "Olivia Brooks",
      status: "offline",
      title: "Senior Engineer",
      match: "84%",
      lastMessage: "Currently in interview loop elsewhere.",
      messages: [
        {
          id: 1,
          sender: "recruiter",
          text: "Hi Olivia, interested in exploring the Senior Engineer role?",
          time: "08:30",
        },
        {
          id: 2,
          sender: "candidate",
          text: "Currently in interview loop elsewhere, but happy to hear more.",
          time: "08:45",
        },
      ],
    },
  ];

  const [searchQuery, setSearchQuery] = useState("");
  const selectedThread = threads.find((t) => t.id === selectedThreadId);

  const filteredThreads = threads.filter(
    (thread) =>
      thread.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      thread.lastMessage.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSendMessage = () => {
    if (newMessage.trim() && selectedThread) {
      // Handle message sending here
      setNewMessage("");
    }
  };

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
            </div>
          </aside>

          {/* Chat Section */}
          <section className="col-span-12 flex flex-col md:col-span-8">
            {selectedThread ? (
              <>
                {/* Chat Header */}
                <div className="border-b border-border/60 p-4">
                  <p className="font-display text-base font-semibold">{selectedThread.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedThread.title} · {selectedThread.match} match
                  </p>
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
