import { useState } from "react";

export function RecruiterCompanyPostsPage() {
  const [postText, setPostText] = useState("");

  const posts = [
    {
      id: 1,
      category: "Hiring",
      timeAgo: "2h",
      text: "We're hiring 3 senior backend engineers on the Payments team. Remote-friendly NA + EU. DMs open.",
      likes: 184,
      comments: 22,
    },
    {
      id: 2,
      category: "Culture",
      timeAgo: "1d",
      text: "Behind the scenes at our SF office — onboarding week for our newest cohort 🚀",
      likes: 412,
      comments: 47,
    },
    {
      id: 3,
      category: "Product",
      timeAgo: "3d",
      text: "Product spotlight: we just shipped instant background checks. Our recruiters cut their time-to-hire by 38%.",
      likes: 1240,
      comments: 96,
    },
  ];

  const handlePostSubmit = () => {
    if (postText.trim()) {
      // Handle post submission here
      setPostText("");
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
                Brand
              </p>
              <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight lg:text-4xl">
                Company posts
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground lg:text-base">
                Promote your company, share culture, and amplify open roles to the network.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Compose Section */}
      <div className="relative rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-5 shadow-elegant mb-5">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Compose
            </p>
            <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">Share an update</h2>
          </div>
        </div>

        <textarea
          rows="4"
          placeholder="Announce a role, share culture, or promote your team…"
          value={postText}
          onChange={(e) => setPostText(e.target.value)}
          className="w-full rounded-xl border border-border/60 bg-surface/70 p-3 text-sm outline-none focus:bg-surface transition"
        />

        <div className="mt-3 flex items-center justify-between">
          <div className="flex gap-2 text-xs text-muted-foreground">
            <button className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 hover:bg-surface/80 transition">
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
                className="lucide h-3.5 w-3.5"
                aria-hidden="true"
              >
                <rect width="18" height="18" x="3" y="3" rx="2" ry="2"></rect>
                <circle cx="9" cy="9" r="2"></circle>
                <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"></path>
              </svg>
              Image
            </button>
            <button className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 hover:bg-surface/80 transition">
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
                className="lucide h-3.5 w-3.5"
                aria-hidden="true"
              >
                <path d="M11 6a13 13 0 0 0 8.4-2.8A1 1 0 0 1 21 4v12a1 1 0 0 1-1.6.8A13 13 0 0 0 11 14H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"></path>
                <path d="M6 14a12 12 0 0 0 2.4 7.2 2 2 0 0 0 3.2-2.4A8 8 0 0 1 10 14"></path>
                <path d="M8 6v8"></path>
              </svg>
              Promote
            </button>
          </div>
          <button
            onClick={handlePostSubmit}
            disabled={!postText.trim()}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-recruiter px-4 py-2 text-sm font-semibold text-recruiter-foreground shadow-recruiter hover:opacity-95 disabled:opacity-50 transition"
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
            Post
          </button>
        </div>
      </div>

      {/* Posts Feed */}
      <div className="space-y-3">
        {posts.map((post) => (
          <div
            key={post.id}
            className="relative rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-5 shadow-elegant"
          >
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-surface/70 px-2.5 py-0.5 text-xs font-medium">
                {post.category}
              </span>
              <span>{post.timeAgo}</span>
            </div>

            <p className="mt-2 text-sm">{post.text}</p>

            <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
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
                  className="lucide h-3.5 w-3.5"
                  aria-hidden="true"
                >
                  <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"></path>
                  <path d="M7 10v12"></path>
                </svg>
                {post.likes}
              </span>
              <span className="inline-flex items-center gap-1">
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
                  className="lucide h-3.5 w-3.5"
                  aria-hidden="true"
                >
                  <path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"></path>
                </svg>
                {post.comments}
              </span>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
