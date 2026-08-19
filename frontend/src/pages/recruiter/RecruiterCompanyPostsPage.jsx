import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { apiRequest, apiFormRequest } from "../../services/api";
import { AutoDismissFeedback } from "../../components/AutoDismissFeedback";
import { PostCard, pillTriggerStyle, actionButtonStyle } from "../../components/feedPostKit";

const POST_TYPE_OPTIONS = [
  { value: "CompanyUpdate", label: "Company update" },
  { value: "HiringPost", label: "Hiring post" },
  { value: "Promotion", label: "Promotion" },
  { value: "Announcement", label: "Announcement" },
];

export function RecruiterCompanyPostsPage() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState({ type: "", message: "" });
  const [postContent, setPostContent] = useState("");
  const [postType, setPostType] = useState("CompanyUpdate");
  const [postFiles, setPostFiles] = useState([]);
  const [commentDrafts, setCommentDrafts] = useState({});
  const fileInputRef = useRef(null);

  // Same real /posts/feed integration ProSeekerDashboard.jsx uses — this is one shared feed across
  // seekers and organizations, not a separate recruiter-only stream.
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
      formData.append("postType", postType);
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
      setPostType("CompanyUpdate");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
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

      <AutoDismissFeedback feedback={feedback} onClear={() => setFeedback({ type: "", message: "" })} />

      {/* Compose Section */}
      <div className="relative rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-5 shadow-elegant mb-5">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setFeedback({ type: "", message: "" });
            createPostMutation.mutate();
          }}
        >
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Compose
              </p>
              <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">Share an update</h2>
            </div>
            <select
              value={postType}
              onChange={(event) => setPostType(event.target.value)}
              className="rounded-full border border-border/60 bg-surface/70 px-3 py-1.5 text-xs font-medium outline-none"
            >
              {POST_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <textarea
            rows="4"
            placeholder="Announce a role, share culture, or promote your team…"
            value={postContent}
            onChange={(event) => setPostContent(event.target.value)}
            className="w-full rounded-xl border border-border/60 bg-surface/70 p-3 text-sm outline-none focus:bg-surface transition"
            required
          />

          {postFiles.length ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {postFiles.map((file) => file.name).join(", ")}
            </p>
          ) : null}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            hidden
            onChange={(event) =>
              setPostFiles((current) => [...current, ...Array.from(event.target.files || [])])
            }
          />

          <div className="mt-3 flex items-center justify-between">
            <div className="flex gap-2 text-xs text-muted-foreground">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={pillTriggerStyle}
                className="inline-flex items-center gap-1.5 rounded-full text-xs"
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
                  className="lucide h-3.5 w-3.5"
                  aria-hidden="true"
                >
                  <rect width="18" height="18" x="3" y="3" rx="2" ry="2"></rect>
                  <circle cx="9" cy="9" r="2"></circle>
                  <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"></path>
                </svg>
                Image / video
              </button>
            </div>
            <button
              type="submit"
              disabled={createPostMutation.isPending || !postContent.trim()}
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
              {createPostMutation.isPending ? "Posting…" : "Post"}
            </button>
          </div>
        </form>
      </div>

      {/* Posts Feed — single shared feed across seekers and organizations */}
      <div className="space-y-3">
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
      </div>
    </main>
  );
}
