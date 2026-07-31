import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { apiRequest, apiFormRequest } from "../../services/api";
import { AutoDismissFeedback } from "../../components/AutoDismissFeedback";
import { PostCard, pillTriggerStyle, actionButtonStyle } from "./ProSeekerDashboard";

function flattenSkillGroups(groups) {
  return (Array.isArray(groups) ? groups : [])
    .flatMap((group) => group.skills || [])
    .map((skill) => String(skill).trim())
    .filter(Boolean);
}

// Mirrors getResumeProfileReadiness (backend/src/services/resumeGenerationService.js) so "Profile
// strength" reflects the same real section counts used to gate tailored-resume generation,
// computed here from session.profile instead of a hardcoded checklist.
function computeProfileStrength(profile) {
  const source = profile || {};
  const educationCount =
    (source.education || []).length +
    ([source.degree, source.major, source.universityName].filter(Boolean).length ? 1 : 0);
  const skillCount = [...flattenSkillGroups(source.skillGroups), ...(source.skills || [])].filter(Boolean).length;
  const projectCount = (source.projects || []).length;
  const hasIntroVideo = Boolean(source.backgroundVideo?.filePath || source.backgroundVideo?.url);

  const sections = [
    { done: educationCount > 0, label: "Add your education details" },
    { done: skillCount > 0, label: "Add your skills" },
    { done: projectCount > 0, label: "Add a project" },
    { done: hasIntroVideo, label: "Upload an intro video" },
  ];
  const completedCount = sections.filter((section) => section.done).length;
  const percent = Math.round((completedCount / sections.length) * 100);
  const missing = sections.filter((section) => !section.done).map((section) => section.label);

  return { percent, missing };
}

export function NormalSeekerDashboard() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState({ type: "", message: "" });
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [postContent, setPostContent] = useState("");
  const [postFiles, setPostFiles] = useState([]);
  const [commentDrafts, setCommentDrafts] = useState({});
  const photoInputRef = useRef(null);
  const videoInputRef = useRef(null);

  const applicationsQuery = useQuery({
    queryKey: ["applications", "dashboard"],
    queryFn: () =>
      apiRequest("/applications?limit=10", {
        token: session.accessToken,
      }),
    enabled: Boolean(session?.accessToken),
  });

  // "/jobs/recommended" is not a real backend route (confirmed: no such path exists anywhere in
  // backend/src/routes) — this query was silently 404ing, which is why Top Matches/job
  // recommendations never rendered real data. The real endpoint, already used by
  // ProSeekerDashboard.jsx/JobsPage.jsx, is /recommendations/jobs.
  const jobsQuery = useQuery({
    queryKey: ["jobs", "recommended"],
    queryFn: () =>
      apiRequest("/recommendations/jobs?limit=10", {
        token: session.accessToken,
      }),
    enabled: Boolean(session?.accessToken),
  });

  // Real pending connection-request count — same endpoint ConnectionsPage.jsx uses — replaces the
  // hardcoded "12 new updates" in the header subtext.
  const pendingConnectionsQuery = useQuery({
    queryKey: ["connections", "pending"],
    queryFn: () => apiRequest("/connections/pending", { token: session.accessToken }),
    enabled: Boolean(session?.accessToken),
  });

  // Real chat session count — same endpoint ChatPage.jsx uses — replaces the hardcoded "DMs 4".
  const chatSessionsQuery = useQuery({
    queryKey: ["chat", "sessions"],
    queryFn: () => apiRequest("/chat/sessions", { token: session.accessToken }),
    enabled: Boolean(session?.accessToken),
  });

  // Same real /posts/feed integration ProSeekerDashboard.jsx uses — Normal and Pro seekers see the
  // identical shared feed, not two disconnected ones.
  const feedQuery = useQuery({
    queryKey: ["posts", "feed"],
    queryFn: () => apiRequest("/posts/feed?limit=30", { token: session.accessToken }),
    enabled: Boolean(session?.accessToken),
  });

  const posts = feedQuery.data?.posts || [];

  const createPostMutation = useMutation({
    mutationFn: () => {
      const formData = new FormData();
      formData.append("content", postContent);
      postFiles.forEach((file) => formData.append("files", file));

      return apiFormRequest("/posts", {
        method: "POST",
        token: session.accessToken,
        formData,
      });
    },
    onSuccess: (response) => {
      setFeedback({ type: "success", message: response.message || "Post published." });
      setPostContent("");
      setPostFiles([]);
      setIsComposerOpen(false);
      if (photoInputRef.current) {
        photoInputRef.current.value = "";
      }
      if (videoInputRef.current) {
        videoInputRef.current.value = "";
      }
      queryClient.invalidateQueries({ queryKey: ["posts", "feed"] });
    },
    onError: (error) => {
      setFeedback({ type: "error", message: error.message });
    },
  });

  const likePostMutation = useMutation({
    mutationFn: (postId) =>
      apiRequest(`/posts/${postId}/like`, {
        method: "POST",
        token: session.accessToken,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts", "feed"] });
    },
    onError: (error) => {
      setFeedback({ type: "error", message: error.message });
    },
  });

  const commentPostMutation = useMutation({
    mutationFn: ({ postId, content }) =>
      apiRequest(`/posts/${postId}/comment`, {
        method: "POST",
        token: session.accessToken,
        body: { content },
      }),
    onSuccess: (_response, variables) => {
      setCommentDrafts((current) => ({ ...current, [variables.postId]: "" }));
      queryClient.invalidateQueries({ queryKey: ["posts", "feed"] });
    },
    onError: (error) => {
      setFeedback({ type: "error", message: error.message });
    },
  });

  const deletePostMutation = useMutation({
    mutationFn: (postId) =>
      apiRequest(`/posts/${postId}`, {
        method: "DELETE",
        token: session.accessToken,
      }),
    onSuccess: () => {
      setFeedback({ type: "success", message: "Post deleted." });
      queryClient.invalidateQueries({ queryKey: ["posts", "feed"] });
    },
    onError: (error) => {
      setFeedback({ type: "error", message: error.message });
    },
  });

  function handleDeletePost(postId) {
    const confirmed = window.confirm("Delete this post? This can't be undone.");
    if (confirmed) {
      deletePostMutation.mutate(postId);
    }
  }

  function handleLikePost(postId) {
    likePostMutation.mutate(postId);
  }

  function handleCommentPost(postId) {
    const content = (commentDrafts[postId] || "").trim();
    if (!content) {
      return;
    }
    commentPostMutation.mutate({ postId, content });
  }

  const firstName = session?.profile?.firstName || "User";
  const lastName = session?.profile?.lastName || "";
  const initials = `${firstName[0] || ""}${lastName[0] || ""}`.toUpperCase();
  const applications = applicationsQuery.data?.applications || [];
  const jobs = jobsQuery.data?.jobs || [];
  const pendingConnectionsCount = pendingConnectionsQuery.data?.connections?.length ?? 0;
  const chatSessionsCount = chatSessionsQuery.data?.sessions?.length ?? 0;
  const bestMatchScore = jobs.length
    ? Math.round(Math.max(...jobs.map((job) => Number(job.matchScore) || 0)))
    : null;
  const profileStrength = computeProfileStrength(session?.profile);

  return (
    <main className="flex-1 px-6 py-6 lg:px-8 lg:py-8">
      <div className="relative mb-6 overflow-hidden rounded-3xl border border-border/60 bg-linear-to-br p-6 lg:p-8 from-primary/10 via-transparent to-transparent">
        <div className="absolute -right-20 -top-20 h-60 w-60 bg-primary/20 rounded-full blur-3xl"></div>
        <div className="relative">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Good morning
              </p>
              <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight lg:text-4xl">
                Welcome back, {firstName}
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground lg:text-base">
                {jobs.length} new jobs match your profile this week.{" "}
                {pendingConnectionsCount
                  ? `You have ${pendingConnectionsCount} pending connection request${pendingConnectionsCount === 1 ? "" : "s"}.`
                  : ""}
              </p>
            </div>
            <a
              href="/upgrade"
              className="inline-flex items-center gap-2 rounded-full bg-linear-to-r from-purple-500 to-blue-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg hover:opacity-95"
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
                className="h-4 w-4"
              >
                <path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"></path>
                <path d="M20 2v4"></path>
                <path d="M22 4h-4"></path>
                <circle cx="4" cy="20" r="2"></circle>
              </svg>
              Upgrade to Pro
            </a>
          </div>
        </div>
      </div>

      <AutoDismissFeedback feedback={feedback} onClear={() => setFeedback({ type: "", message: "" })} />

      <div className="grid grid-cols-12 gap-6">
        {/* Left Sidebar - Profile Card */}
        <aside className="col-span-12 space-y-4 lg:col-span-3">
          <div className="relative rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-5 shadow-elegant">
            <div className="-mx-5 -mt-5 h-16 rounded-t-2xl bg-linear-to-r from-purple-500 to-blue-500"></div>
            <div className="-mt-8 flex flex-col items-center text-center">
              <div className="grid h-16 w-16 place-items-center rounded-full border-4 border-card bg-linear-to-r from-purple-500 to-blue-500 text-lg font-semibold text-white shadow-lg">
                {initials}
              </div>
              <h3 className="mt-3 font-display font-semibold">
                {firstName} {lastName}
              </h3>
              <p className="text-xs text-muted-foreground">
                {session?.profile?.preferredRoles?.[0] || "Job Seeker"}
              </p>
            </div>
            <div className="mt-4 space-y-1 text-xs">
              <div className="flex items-center justify-between border-t border-border/60 py-2 first:border-t-0">
                <span className="text-muted-foreground">Profile analytics</span>
                <span className="inline-flex items-center rounded-full border border-border/60 bg-surface/70 px-2 py-0.5 font-medium text-muted-foreground">
                  Coming soon
                </span>
              </div>
            </div>
          </div>

          {/* Profile Strength — real section counts from session.profile, mirrors the backend's
              getResumeProfileReadiness so this reflects the same "what's missing" logic used to
              gate tailored-resume generation. */}
          <div className="relative rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-5 shadow-elegant">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {profileStrength.percent}% complete
                </p>
                <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">
                  Profile strength
                </h2>
              </div>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-linear-to-r from-purple-500 to-blue-500"
                style={{ width: `${profileStrength.percent}%` }}
              ></div>
            </div>
            {profileStrength.missing.length ? (
              <ul className="mt-4 space-y-2.5 text-sm">
                {profileStrength.missing.map((label) => (
                  <li key={label} className="flex items-center gap-2 text-muted-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary"></span> {label}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">Your profile is complete.</p>
            )}
          </div>
        </aside>

        {/* Center - Feed */}
        <section className="col-span-12 space-y-4 lg:col-span-6">
          {/* Post Creation Widget — same real /posts integration ProSeekerDashboard.jsx uses */}
          <div className="rounded-2xl border border-border/60 bg-card/70 p-4 backdrop-blur-xl shadow-elegant">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                setFeedback({ type: "", message: "" });
                createPostMutation.mutate();
              }}
            >
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-linear-to-r from-purple-500 to-blue-500 text-sm font-semibold text-white">
                  {initials}
                </div>
                {isComposerOpen ? (
                  <textarea
                    autoFocus
                    rows={3}
                    value={postContent}
                    onChange={(event) => setPostContent(event.target.value)}
                    placeholder="Share an update, a job opening, or a win…"
                    className="flex-1 rounded-xl border border-border bg-surface/60 p-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                    required
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsComposerOpen(true)}
                    style={pillTriggerStyle}
                    className="flex-1 text-sm text-muted-foreground"
                  >
                    Share an update, a job opening, or a win…
                  </button>
                )}
              </div>

              {postFiles.length ? (
                <p className="mt-2 pl-13 text-xs text-muted-foreground">
                  {postFiles.map((file) => file.name).join(", ")}
                </p>
              ) : null}

              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(event) => {
                  setPostFiles((current) => [...current, ...Array.from(event.target.files || [])]);
                  setIsComposerOpen(true);
                }}
              />
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                multiple
                hidden
                onChange={(event) => {
                  setPostFiles((current) => [...current, ...Array.from(event.target.files || [])]);
                  setIsComposerOpen(true);
                }}
              />

              <div className="mt-3 flex items-center gap-1 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  style={actionButtonStyle}
                  className="flex flex-1 items-center justify-center gap-1.5 font-medium"
                >
                  📷 Photo
                </button>
                <button
                  type="button"
                  onClick={() => videoInputRef.current?.click()}
                  style={actionButtonStyle}
                  className="flex flex-1 items-center justify-center gap-1.5 font-medium"
                >
                  🎥 Video
                </button>
                {isComposerOpen && (
                  <button
                    type="submit"
                    disabled={createPostMutation.isPending || !postContent.trim()}
                    className="flex-1"
                  >
                    {createPostMutation.isPending ? "Posting…" : "Post"}
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Feed — real posts from every seeker and organization, same shared feed
              ProSeekerDashboard.jsx renders */}
          {feedQuery.isLoading ? (
            <div className="rounded-2xl border border-border/60 bg-card/70 p-8 text-center">
              <p className="text-muted-foreground">Loading feed…</p>
            </div>
          ) : feedQuery.isError ? (
            <div className="rounded-2xl border border-border/60 bg-card/70 p-8 text-center">
              <p className="text-muted-foreground">We could not load posts right now.</p>
            </div>
          ) : posts.length ? (
            posts.map((post) => (
              <PostCard
                key={post._id}
                post={post}
                session={session}
                commentValue={commentDrafts[post._id]}
                onCommentChange={(postId, value) =>
                  setCommentDrafts((current) => ({ ...current, [postId]: value }))
                }
                isMutating={likePostMutation.isPending || commentPostMutation.isPending}
                onLike={handleLikePost}
                onComment={handleCommentPost}
                onDelete={handleDeletePost}
                isDeleting={deletePostMutation.isPending}
              />
            ))
          ) : (
            <div className="rounded-2xl border border-border/60 bg-card/70 p-8 text-center">
              <p className="text-muted-foreground">No posts yet. Be the first to share an update.</p>
            </div>
          )}
        </section>

        {/* Right Sidebar - Activity & Recommendations */}
        <aside className="col-span-12 space-y-4 lg:col-span-3">
          {/* Activity This Week */}
          <div className="relative rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-5 shadow-elegant">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Activity
                </p>
                <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">
                  This week
                </h2>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl border border-border/60 bg-card/70 p-4 backdrop-blur">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  👁️ Views
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <div className="text-sm font-medium text-muted-foreground">Coming soon</div>
                </div>
              </div>
              <div className="rounded-2xl border border-border/60 bg-card/70 p-4 backdrop-blur">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  💼 Apps
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <div className="font-display text-2xl font-semibold">{applications.length}</div>
                  <div className="text-xs font-medium text-green-500">Active</div>
                </div>
              </div>
              <div className="rounded-2xl border border-border/60 bg-card/70 p-4 backdrop-blur">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  💬 DMs
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <div className="font-display text-2xl font-semibold">{chatSessionsCount}</div>
                </div>
              </div>
              <div className="rounded-2xl border border-border/60 bg-card/70 p-4 backdrop-blur">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  📈 Match
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <div className="font-display text-2xl font-semibold">
                    {bestMatchScore === null ? "—" : `${bestMatchScore}%`}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Top Matches — real per-job score from computeCandidateMatch (recommendationController.js),
              the same formula used for ATS/auto-apply scoring elsewhere in the app. */}
          <div className="relative rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-5 shadow-elegant">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  For you
                </p>
                <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">
                  Top matches
                </h2>
              </div>
              <a href="/pro/jobs" className="text-xs font-medium text-primary inline-flex items-center gap-1">
                See all →
              </a>
            </div>
            <div className="space-y-3">
              {jobs.slice(0, 3).map((job, idx) => (
                <div key={job._id || idx} className="flex items-center gap-3 rounded-xl border border-border/60 bg-surface/60 p-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-surface text-base font-bold">
                    {job.organizationId?.companyName?.[0]?.toUpperCase() || "J"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{job.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {job.organizationId?.companyName || "Company"} · {job.location}
                    </p>
                  </div>
                  <div className="relative grid shrink-0 place-items-center rounded-full font-semibold tabular-nums h-10 w-10 text-[10px] bg-linear-to-r from-purple-500/20 to-blue-500/20">
                    <div className="grid h-[calc(100%-6px)] w-[calc(100%-6px)] place-items-center rounded-full bg-card">
                      {Math.round(job.matchScore || 0)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Applications In Progress */}
          <div className="relative rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-5 shadow-elegant">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Applications
                </p>
                <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">
                  In progress
                </h2>
              </div>
            </div>
            <div className="space-y-2">
              {applications.slice(0, 3).map((app, idx) => (
                <div key={app._id || idx} className="flex items-center gap-2 text-sm">
                  <div className="grid h-7 w-7 place-items-center rounded-md bg-surface text-xs font-bold">
                    {app.jobTitle?.[0]?.toUpperCase() || "A"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{app.jobTitle || "Job Application"}</p>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-surface/70 px-2.5 py-0.5 text-xs font-medium capitalize">
                    {app.status || "applied"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
