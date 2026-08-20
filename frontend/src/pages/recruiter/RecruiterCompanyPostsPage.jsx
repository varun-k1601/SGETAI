import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { apiRequest, apiFormRequest } from "../../services/api";
import { AutoDismissFeedback } from "../../components/AutoDismissFeedback";
import { PostCard, ORGANIZATION_POST_TYPE_LABELS } from "../../components/feedPostKit";

/* ===============================================================================================
   Recruiter company posts (/recruiter/company-posts) — organization accounts only.
   ===============================================================================================
   Restyled onto the shared --ph- and --rc- token system used by the other recruiter pages. REUSES
   the existing --rc-accent / --rc-gradient / --rc-hero-soft tokens — no second recruiter palette
   declared here.

   FEED SCOPE FIX: this page used to call GET /posts/feed, the same unfiltered, no-author-scoped
   query ProSeekerDashboard uses for the global social feed — so "Company posts" showed every post
   on the platform, seekers included. It now calls the new GET /posts/mine (postController.js,
   routes/posts.js), which filters server-side on { authorId: req.user.id, authorModel }. For an
   organization account req.user.id IS the Organization document's own _id — there is no separate
   per-teammate identity — so every team member signed into the same organization sees the same
   company feed here, not just the posts they personally authored. Filtering was NOT done
   client-side on the fetched page: /posts/feed is paginated, so trimming after the fact would have
   quietly dropped the organization's older posts off the end and under-counted the total.

   CATEGORIES: Post.postType is a real enum (organizationPostTypes in postController.js) —
   CompanyUpdate / HiringPost / Promotion / Announcement. There is no "Culture" or "Product" type
   anywhere in the schema, so this page offers exactly those four, human-labelled via the shared
   ORGANIZATION_POST_TYPE_LABELS map in feedPostKit.jsx (also used to render the pill on each
   post card, so a post's category reads the same word in the composer and in the feed).

   "PROMOTE": there is no boosting/sponsorship/paid-reach feature anywhere in this codebase. The
   only real lever available is Post.postType: "Promotion", which is exactly the fourth chip in
   the type selector below — there is no separate "Promote" button that could imply amplification
   that does not exist.

   PostCard: rendered here with variant="recruiter" (see components/feedPostKit.jsx). The seeker
   feed (ProSeekerDashboard/NormalSeekerDashboard) renders the SAME component with the default
   variant, byte-for-byte the markup/classes it always had — only this recruiter surface reads the
   new .company-posts-scoped classes.

   The root .company-posts is a TRANSPARENT LAYOUT CONTAINER — no background, no padding of its
   own. .main-panel already pads and scrolls this region; painting a second background here is the
   exact bug that made .pro-home render as one giant card in dark mode.
   =============================================================================================== */

const POST_TYPE_OPTIONS = Object.entries(ORGANIZATION_POST_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function IconImage(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
  );
}

function IconX(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
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

let attachmentSeq = 0;
function nextAttachmentId() {
  attachmentSeq += 1;
  return `att-${attachmentSeq}`;
}

export function RecruiterCompanyPostsPage() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState({ type: "", message: "" });
  const [postContent, setPostContent] = useState("");
  const [postType, setPostType] = useState("CompanyUpdate");
  // { id, file, previewUrl } — previewUrl is an object URL for image/* files only, revoked on
  // removal/reset/unmount so this never leaks blob URLs.
  const [attachments, setAttachments] = useState([]);
  const [commentDrafts, setCommentDrafts] = useState({});
  const fileInputRef = useRef(null);

  useEffect(() => {
    return () => {
      attachments.forEach((attachment) => {
        if (attachment.previewUrl) {
          URL.revokeObjectURL(attachment.previewUrl);
        }
      });
    };
    // Cleanup only needs to run against whatever is mounted when the component unmounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetAttachments() {
    attachments.forEach((attachment) => {
      if (attachment.previewUrl) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
    });
    setAttachments([]);
  }

  function addFiles(fileList) {
    const newAttachments = Array.from(fileList || []).map((file) => ({
      id: nextAttachmentId(),
      file,
      previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
    }));
    setAttachments((current) => [...current, ...newAttachments]);
  }

  function removeAttachment(id) {
    setAttachments((current) => {
      const target = current.find((attachment) => attachment.id === id);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return current.filter((attachment) => attachment.id !== id);
    });
  }

  const feedQuery = useQuery({
    queryKey: ["posts", "mine"],
    queryFn: () => apiRequest("/posts/mine?limit=30", { token: session.accessToken }),
    enabled: Boolean(session?.role === "organization" && session?.accessToken),
  });

  const posts = feedQuery.data?.posts || [];
  const totalPosts = feedQuery.data?.pagination?.total ?? posts.length;

  function invalidatePosts() {
    queryClient.invalidateQueries({ queryKey: ["posts", "mine"] });
  }

  const createPostMutation = useMutation({
    mutationFn: () => {
      const formData = new FormData();
      formData.append("content", postContent);
      formData.append("postType", postType);
      attachments.forEach((attachment) => formData.append("files", attachment.file));

      return apiFormRequest("/posts", {
        method: "POST",
        token: session.accessToken,
        formData,
      });
    },
    onSuccess: (response) => {
      setFeedback({ type: "success", message: response.message || "Post published." });
      setPostContent("");
      setPostType("CompanyUpdate");
      resetAttachments();
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      invalidatePosts();
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
    onSuccess: invalidatePosts,
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
      invalidatePosts();
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
      invalidatePosts();
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

  if (session?.role !== "organization") {
    return (
      <section className="company-posts">
        <div className="cop-card cop-state">
          <p className="cop-state__title">Company posts is organization-only</p>
          <p>This page is designed for organization accounts sharing updates with the network.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="company-posts">
      <header className="cop-hero">
        <div className="cop-hero__text">
          <p className="cop-eyebrow">Brand</p>
          <h1 className="cop-hero__title">Company posts</h1>
          <p className="cop-hero__sub">
            Share company updates, hiring news and announcements with everyone on the network.
          </p>
        </div>
        <span className="cop-pill cop-pill--accent cop-hero__count">{plural(totalPosts, "post")}</span>
      </header>

      <AutoDismissFeedback feedback={feedback} onClear={() => setFeedback({ type: "", message: "" })} />

      <form
        className="cop-card cop-compose"
        onSubmit={(event) => {
          event.preventDefault();
          setFeedback({ type: "", message: "" });
          createPostMutation.mutate();
        }}
      >
        <p className="cop-eyebrow">Compose</p>
        <h2 className="cop-compose__title">Share an update</h2>

        <label className="cop-sr-only" htmlFor="company-post-content">
          Post content
        </label>
        <textarea
          id="company-post-content"
          rows={4}
          placeholder="Announce a role, share a company update, or post an announcement…"
          value={postContent}
          onChange={(event) => setPostContent(event.target.value)}
          className="cop-textarea"
          required
        />

        {attachments.length ? (
          <div className="cop-previews">
            {attachments.map((attachment) => (
              <div key={attachment.id} className="cop-preview">
                {attachment.previewUrl ? (
                  <img src={attachment.previewUrl} alt="" className="cop-preview__img" />
                ) : (
                  <div className="cop-preview__file">
                    <IconImage className="cop-icon cop-icon--sm" />
                    <span className="cop-preview__name">{attachment.file.name}</span>
                  </div>
                )}
                <button
                  type="button"
                  className="cop-preview__remove"
                  onClick={() => removeAttachment(attachment.id)}
                  aria-label={`Remove ${attachment.file.name}`}
                >
                  <IconX className="cop-icon cop-icon--sm" />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          hidden
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = "";
          }}
        />

        <div className="cop-footer">
          <div className="cop-footer__left">
            <div className="cop-type-group" role="radiogroup" aria-label="Post type">
              {POST_TYPE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={postType === option.value}
                  className={`cop-type-chip${postType === option.value ? " cop-type-chip--on" : ""}`}
                  onClick={() => setPostType(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="cop-image-btn"
              onClick={() => fileInputRef.current?.click()}
            >
              <IconImage className="cop-icon cop-icon--sm" />
              Image
            </button>
          </div>
          <button
            type="submit"
            disabled={createPostMutation.isPending || !postContent.trim()}
            className="cop-btn cop-btn--primary cop-submit"
          >
            {createPostMutation.isPending ? "Posting…" : "Post"}
          </button>
        </div>
      </form>

      <div className="cop-list">
        {feedQuery.isLoading ? (
          <p className="cop-card cop-state">Loading your company's posts…</p>
        ) : feedQuery.isError ? (
          <p className="cop-card cop-state cop-state--error">
            <IconAlertCircle className="cop-icon" />
            {feedQuery.error?.message || "We could not load your posts right now."}
          </p>
        ) : posts.length ? (
          posts.map((post) => (
            <PostCard
              key={post._id}
              post={post}
              session={session}
              variant="recruiter"
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
          <p className="cop-card cop-state">No posts yet. Share your first update above.</p>
        )}
      </div>
    </section>
  );
}
