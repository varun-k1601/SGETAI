import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { apiRequest, apiFormRequest } from "../../services/api";
import { AutoDismissFeedback } from "../../components/AutoDismissFeedback";
import { HeroBanner } from "../../components/HeroBanner";
import { AutomationSection } from "../../components/AutomationSection";
import { getMediaUrl } from "../../components/CompanyLogo";

function getInitials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  const initials = `${parts[0]?.[0] || ""}${parts[1]?.[0] || ""}`;
  return initials.toUpperCase() || "?";
}

// Post content has no dedicated tags field — these pills are parsed straight out of the real
// text the author typed (e.g. "...open to #backend roles"), not a fabricated taxonomy.
function extractHashtags(content) {
  const matches = String(content || "").match(/#[a-zA-Z0-9_]+/g) || [];
  return [...new Set(matches)];
}

const ORGANIZATION_POST_TYPE_LABELS = {
  CompanyUpdate: "Company Update",
  HiringPost: "Hiring Post",
  Promotion: "Promotion",
  Announcement: "Announcement",
};

// This app's global `button { background, border-radius, padding, border, box-shadow, color,
// transform, transition }` rule in styles.css is unlayered, so it silently wins over any Tailwind
// utility class applied directly to a <button> (see AutomationSection.jsx's FeatureToggle for the
// original diagnosis). Every ghost/flat button below needs these specific properties reset inline;
// layout classes (flex, gap, flex-1, text size, etc.) are unaffected and stay as Tailwind classes.
export const ghostButtonStyle = {
  border: "none",
  background: "transparent",
  boxShadow: "none",
  color: "inherit",
  fontWeight: 500,
  transform: "none",
  transition: "none",
};

export const pillTriggerStyle = {
  ...ghostButtonStyle,
  borderRadius: "9999px",
  padding: "0.625rem 1rem",
  border: "1px solid var(--border)",
  background: "var(--surface-muted)",
  textAlign: "left",
};

export const actionButtonStyle = {
  ...ghostButtonStyle,
  borderRadius: "0.5rem",
  padding: "0.5rem 0.75rem",
};

const dismissIconButtonStyle = {
  border: "1px solid var(--border)",
  borderRadius: "9999px",
  background: "var(--surface)",
  boxShadow: "none",
  color: "var(--text-muted)",
  fontWeight: 500,
  padding: "0.3rem",
  transform: "none",
  transition: "none",
};

function formatRelativeTime(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return "just now";
  }

  const diffSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));

  if (diffSeconds < 60) {
    return "just now";
  }

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) {
    return "yesterday";
  }

  return `${diffDays}d ago`;
}

function isWithinDays(dateValue, days) {
  const time = new Date(dateValue).getTime();
  if (Number.isNaN(time)) {
    return false;
  }
  return Date.now() - time <= days * 24 * 60 * 60 * 1000;
}

function humanizeSkipReason(reason) {
  if (!reason) {
    return "skipped";
  }
  if (reason === "below_threshold") {
    return "below threshold";
  }
  return String(reason).replace(/_/g, " ");
}

function PostMedia({ media }) {
  const [hasFailed, setHasFailed] = useState(false);
  const mediaUrl = getMediaUrl(media);

  if (!mediaUrl || hasFailed) {
    return null;
  }

  if (media.fileType === "image") {
    return (
      <img
        src={mediaUrl}
        alt="Post attachment"
        className="max-h-96 w-full rounded-xl object-cover"
        onError={() => setHasFailed(true)}
      />
    );
  }

  if (media.fileType === "video") {
    return (
      <video src={mediaUrl} controls className="max-h-96 w-full rounded-xl" onError={() => setHasFailed(true)} />
    );
  }

  return (
    <a href={mediaUrl} target="_blank" rel="noreferrer" className="text-sm font-medium text-primary underline">
      Open attachment
    </a>
  );
}

export function PostCard({ post, session, commentValue, onCommentChange, isMutating, onLike, onComment, onDelete, isDeleting }) {
  const [showComments, setShowComments] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const isOrganization = post.authorModel === "Organization";
  const postTypeLabel = isOrganization
    ? ORGANIZATION_POST_TYPE_LABELS[post.postType] || "Company Update"
    : null;
  const avatarUrl = getMediaUrl(post.author?.avatar);
  const hashtags = extractHashtags(post.content);
  // Mirrors the backend's own ownership check in deletePost (authorId === req.user.id) — this only
  // controls whether the option is shown, the real enforcement lives server-side. Not scoped to
  // JobSeeker authors only: this card is shared with RecruiterCompanyPostsPage.jsx, so an
  // organization viewing its own post needs the same delete option.
  const isOwnPost = String(post.authorId) === String(session?.userId);

  return (
    <article className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-xl shadow-elegant hover:shadow-xl transition">
      <div className="flex items-start gap-3 p-5">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={post.author?.name || "Author"}
            className="h-11 w-11 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-linear-to-r from-purple-500 to-blue-500 text-sm font-semibold text-white">
            {getInitials(post.author?.name)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold leading-tight">{post.author?.name || "Platform user"}</h3>
            {isOrganization && (
              <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                {postTypeLabel}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{post.author?.subtitle}</p>
          <p className="text-xs text-muted-foreground">{formatRelativeTime(post.createdAt)}</p>
        </div>
        {isOwnPost && (
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setShowMenu((current) => !current)}
              style={actionButtonStyle}
              className="rounded-full p-1.5 text-muted-foreground"
              aria-label="Post options"
            >
              ⋯
            </button>
            {showMenu && (
              <div
                className="absolute right-0 top-full z-10 mt-1 min-w-36 rounded-lg border border-border/60 bg-card shadow-elegant overflow-hidden"
              >
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => {
                    setShowMenu(false);
                    onDelete(post._id);
                  }}
                  style={{ ...ghostButtonStyle, padding: "0.5rem 0.75rem", width: "100%" }}
                  className="text-left text-sm text-red-500 hover:bg-surface"
                >
                  {isDeleting ? "Deleting…" : "Delete post"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="px-5 pb-4 space-y-3">
        <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{post.content}</p>

        {post.media?.length ? (
          <div className="grid gap-2">
            {post.media.map((media) => (
              <PostMedia key={media.filePath || media.url} media={media} />
            ))}
          </div>
        ) : null}

        {hashtags.length ? (
          <div className="flex flex-wrap gap-1.5">
            {hashtags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-surface/70 px-2.5 py-0.5 text-xs font-medium text-primary"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between border-t border-border/60 px-3 py-2 text-sm text-muted-foreground">
        <button
          type="button"
          onClick={() => onLike(post._id)}
          disabled={isMutating}
          style={{ ...actionButtonStyle, color: post.likedByMe ? "var(--brand)" : "inherit" }}
          className="flex flex-1 items-center justify-center gap-2 text-xs"
        >
          {post.likedByMe ? "❤️" : "🤍"} {post.likesCount || 0}
        </button>
        <button
          type="button"
          onClick={() => setShowComments((current) => !current)}
          style={actionButtonStyle}
          className="flex flex-1 items-center justify-center gap-2 text-xs"
        >
          💬 {post.commentsCount || 0}
        </button>
      </div>

      {showComments && (
        <div className="border-t border-border/60 px-5 py-3 space-y-3">
          {post.recentComments?.length ? (
            <div className="space-y-2">
              {post.recentComments.map((comment) => (
                <div key={comment._id} className="text-sm">
                  <span className="font-semibold">{comment.userName || "User"}</span>{" "}
                  <span className="text-muted-foreground">{comment.content}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No comments yet.</p>
          )}
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              onComment(post._id);
            }}
          >
            <input
              type="text"
              value={commentValue || ""}
              onChange={(event) => onCommentChange(post._id, event.target.value)}
              placeholder="Write a comment..."
              className="flex-1 rounded-full border border-border bg-surface/60 px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            <button type="submit" disabled={isMutating || !String(commentValue || "").trim()}>
              Comment
            </button>
          </form>
        </div>
      )}
    </article>
  );
}

export function ProSeekerDashboard() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState({ type: "", message: "" });
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [postContent, setPostContent] = useState("");
  const [postFiles, setPostFiles] = useState([]);
  const [commentDrafts, setCommentDrafts] = useState({});
  const photoInputRef = useRef(null);
  const videoInputRef = useRef(null);

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

  // Same query keys as AutomationsPage.jsx so both pages share one React Query
  // cache entry for the seeker's real auto-apply preference — toggling it here
  // updates Automations too, instead of tracking a second independent flag.
  const preferencesQuery = useQuery({
    queryKey: ["automations", "preferences"],
    queryFn: () => apiRequest("/pro/auto-apply/preferences", { token: session.accessToken }),
    enabled: Boolean(session?.accessToken),
  });

  const runsQuery = useQuery({
    queryKey: ["automations", "runs"],
    queryFn: () => apiRequest("/pro/auto-apply/runs", { token: session.accessToken }),
    enabled: Boolean(session?.accessToken),
  });

  const applicationsQuery = useQuery({
    queryKey: ["applications", "mine"],
    queryFn: () => apiRequest("/applications/mine", { token: session.accessToken }),
    enabled: Boolean(session?.accessToken),
  });

  const updatePreferencesMutation = useMutation({
    mutationFn: (patch) =>
      apiRequest("/pro/auto-apply/preferences", {
        method: "PUT",
        token: session.accessToken,
        body: patch,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations", "preferences"] });
      queryClient.invalidateQueries({ queryKey: ["automations", "runs"] });
    },
    onError: (error) => {
      setFeedback({ type: "error", message: error.message });
    },
  });

  // Activity rows are computed from AutoApplyRun.results[], not their own documents, so there's
  // nothing to soft-delete server-side — dismissing just records the row's stable key so it gets
  // filtered out of `activityStream` above. The underlying run history is never touched.
  const dismissActivityMutation = useMutation({
    mutationFn: (key) =>
      apiRequest("/pro/agent/activity/dismiss", {
        method: "PATCH",
        token: session.accessToken,
        body: { key },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations", "preferences"] });
    },
    onError: (error) => {
      setFeedback({ type: "error", message: error.message });
    },
  });

  const dismissAllActivityMutation = useMutation({
    mutationFn: (keys) =>
      apiRequest("/pro/agent/activity/dismiss-all", {
        method: "PATCH",
        token: session.accessToken,
        body: { keys },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations", "preferences"] });
    },
    onError: (error) => {
      setFeedback({ type: "error", message: error.message });
    },
  });

  const preferences = preferencesQuery.data?.preferences || {};
  const runs = runsQuery.data?.runs || [];
  const applications = applicationsQuery.data?.applications || [];

  const runsLast7Days = runs.filter((run) => isWithinDays(run.ranAt || run.createdAt, 7));
  const autoAppliesThisWeek = runsLast7Days.reduce((sum, run) => sum + (run.applicationsCreated || 0), 0);
  const jobsScanned = runs.reduce((sum, run) => sum + (run.jobsChecked || 0), 0);
  const matchingJobs = runs.reduce((sum, run) => sum + (run.matchingJobs || 0), 0);
  const applicationsThisWeek = applications.filter((app) => isWithinDays(app.createdAt, 7)).length;
  const interviewsCount = applications.filter((app) => app.status === "Interview").length;

  // Average ATS match across the seeker's own real applications — more representative
  // of actual outcomes than averaging only auto-apply run results, and simpler than
  // reconciling two different score populations.
  const avgMatch = applications.length
    ? Math.round(applications.reduce((sum, app) => sum + (app.atsScore || 0), 0) / applications.length)
    : null;
  const avgMatchDisplay = avgMatch === null ? "—" : `${avgMatch}%`;

  const dismissedActivityKeys = preferencesQuery.data?.dismissedActivityKeys || [];
  const dismissedActivityKeySet = new Set(dismissedActivityKeys);
  const hasAnyRawActivity = runs.some((run) => (run.results || []).length);

  const activityStream = runs
    .flatMap((run) =>
      (run.results || []).map((result) => ({
        ...result,
        ranAt: run.ranAt || run.createdAt,
        // Stable across refetches — unlike an array index, this doesn't shift if `runs` changes
        // order or grows, so a dismissed entry can never silently re-attach to a different result.
        key: `${run._id}-${result.jobId}-${result.status}`,
      }))
    )
    .sort((a, b) => new Date(b.ranAt) - new Date(a.ranAt))
    .filter((result) => !dismissedActivityKeySet.has(result.key))
    .slice(0, 8)
    .map((result) => {
      if (result.status === "applied") {
        return {
          key: result.key,
          icon: "💼",
          title: `Applied to ${result.title}`,
          subtitle: `${result.companyName || "Company"} · ${result.score}% match · tailored resume`,
          time: formatRelativeTime(result.ranAt),
        };
      }

      return {
        key: result.key,
        icon: "🚫",
        title: `Skipped: ${result.title}`,
        subtitle: `${result.companyName || "Company"} · ${
          Number.isFinite(result.score) ? `${result.score}% match · ` : ""
        }${humanizeSkipReason(result.reason)}`,
        time: formatRelativeTime(result.ranAt),
      };
    });

  function handleDismissActivity(key) {
    dismissActivityMutation.mutate(key);
  }

  function handleDismissAllActivity() {
    if (
      !window.confirm(
        "Close all activity entries? Your auto-apply history is still saved — this only clears them from this list."
      )
    ) {
      return;
    }
    dismissAllActivityMutation.mutate(activityStream.map((activity) => activity.key));
  }

  function handleToggleAutomation(featureId, nextEnabled) {
    if (updatePreferencesMutation.isPending) {
      return;
    }

    if (featureId === "autoApply") {
      updatePreferencesMutation.mutate({ enabled: nextEnabled });
    } else if (featureId === "autoConnect") {
      updatePreferencesMutation.mutate({ autoConnectEnabled: nextEnabled });
    } else if (featureId === "autoDM") {
      updatePreferencesMutation.mutate({ autoDMEnabled: nextEnabled });
    }
  }

  const automationFeatures = [
    {
      id: "autoApply",
      icon: "briefcase",
      name: "Auto-apply engine",
      description: "Apply to jobs that meet your benchmark — automatically.",
      enabled: Boolean(preferences.enabled),
    },
    {
      id: "autoConnect",
      icon: "linkedin",
      name: "Auto-connect",
      description: "Connect with recruiters automatically.",
      enabled: Boolean(preferences.autoConnectEnabled),
    },
    {
      id: "autoDM",
      icon: "message-square",
      name: "Auto-DM intros",
      description: "Send a first message after connecting.",
      enabled: Boolean(preferences.autoDMEnabled),
    },
  ];

  return (
    <main className="flex-1 overflow-y-auto px-6 py-6 lg:px-8 lg:py-8 bg-muted/30">
      <AutoDismissFeedback
        feedback={feedback}
        onClear={() => setFeedback({ type: "", message: "" })}
      />

      <HeroBanner
        headline={`${autoAppliesThisWeek} jobs auto-applied this week`}
        subheadline={`avg match ${avgMatchDisplay} · ${interviewsCount} interview${interviewsCount === 1 ? "" : "s"} scheduled`}
        metrics={[
          { icon: "⚡", value: jobsScanned, label: "Jobs scanned" },
          { icon: "🎯", value: avgMatchDisplay, label: "Avg match" },
          { icon: "📊", value: matchingJobs, label: "Matching jobs" },
          { icon: "📅", value: applicationsThisWeek, label: "Applications this wk" },
        ]}
      />

      <div className="grid grid-cols-12 gap-6">
        {/* Main column: post composer + real social feed */}
        <div className="col-span-12 lg:col-span-8 space-y-4">
          {/* Post Creation Widget */}
          <div
            className="rounded-2xl p-4 backdrop-blur-xl"
            style={{
              border: "1px solid var(--border)",
              background: "var(--surface)",
              boxShadow: "0 18px 44px rgba(88, 109, 151, 0.08)",
            }}
          >
            <form
              onSubmit={(event) => {
                event.preventDefault();
                setFeedback({ type: "", message: "" });
                createPostMutation.mutate();
              }}
            >
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-linear-to-r from-purple-500 to-blue-500 text-sm font-semibold text-white">
                  {getInitials(`${session?.profile?.firstName || ""} ${session?.profile?.lastName || ""}`)}
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

          {/* Feed */}
          {feedQuery.isLoading ? (
            <div
              className="rounded-2xl p-8 text-center"
              style={{ border: "1px solid var(--border)", background: "var(--surface)" }}
            >
              <p className="text-muted-foreground">Loading feed…</p>
            </div>
          ) : feedQuery.isError ? (
            <div
              className="rounded-2xl p-8 text-center"
              style={{ border: "1px solid var(--border)", background: "var(--surface)" }}
            >
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
            <div
              className="rounded-2xl p-8 text-center"
              style={{ border: "1px solid var(--border)", background: "var(--surface)" }}
            >
              <p className="text-muted-foreground">No posts yet. Be the first to share an update.</p>
            </div>
          )}
        </div>

        {/* Right sidebar: Automation Engine + AI Activity Stream */}
        <div className="col-span-12 lg:col-span-4 space-y-6">
          <AutomationSection
            isActive={Boolean(preferences.enabled)}
            features={automationFeatures}
            onToggleFeature={handleToggleAutomation}
            matchThreshold={typeof preferences.matchThreshold === "number" ? preferences.matchThreshold : null}
          />

          <div
            className="rounded-2xl p-6"
            style={{
              border: "1px solid var(--border)",
              background: "var(--surface)",
              boxShadow: "0 18px 44px rgba(88, 109, 151, 0.08)",
            }}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="font-display text-lg font-bold text-foreground">AI Activity Stream</h2>
              {activityStream.length ? (
                <button
                  type="button"
                  style={actionButtonStyle}
                  className="text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={dismissAllActivityMutation.isPending}
                  onClick={handleDismissAllActivity}
                >
                  {dismissAllActivityMutation.isPending ? "Closing…" : "Close all"}
                </button>
              ) : null}
            </div>
            <div className="space-y-3">
              {activityStream.length ? (
                activityStream.map((activity, index) => (
                  <div
                    key={activity.key}
                    className="flex items-start gap-4 pb-4"
                    style={index < activityStream.length - 1 ? { borderBottom: "1px solid var(--border)" } : undefined}
                  >
                    <div className="text-2xl">{activity.icon}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground">{activity.title}</p>
                      <p className="text-sm text-muted-foreground">{activity.subtitle}</p>
                      <p className="text-xs text-muted-foreground/70 mt-1">{activity.time}</p>
                    </div>
                    <button
                      type="button"
                      title="Dismiss"
                      aria-label="Dismiss activity entry"
                      style={dismissIconButtonStyle}
                      className="grid h-6 w-6 shrink-0 place-items-center disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={dismissActivityMutation.isPending}
                      onClick={() => handleDismissActivity(activity.key)}
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
                        className="h-3 w-3"
                        aria-hidden="true"
                      >
                        <path d="M18 6 6 18"></path>
                        <path d="m6 6 12 12"></path>
                      </svg>
                    </button>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  {runsQuery.isLoading
                    ? "Loading activity…"
                    : hasAnyRawActivity
                      ? "No activity to show — everything here has been closed."
                      : "No auto-apply activity yet. Enable auto-apply above to get started."}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
