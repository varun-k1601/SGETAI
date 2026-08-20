import { useState } from "react";
import { getMediaUrl } from "./CompanyLogo";

// The shared social-feed post card and the button style objects it needs.
//
// EXTRACTED from pages/dashboard/ProSeekerDashboard.jsx, which three pages were importing from:
// NormalSeekerDashboard.jsx, RecruiterCompanyPostsPage.jsx, and the Pro dashboard itself. A page
// component is the wrong home for something two other pages depend on — the Pro dashboard's own
// chrome has since moved to scoped CSS (.pro-home in styles.css), and leaving PostCard inside it
// would have forced either a second styling approach into that file or a restyle of a card that
// renders on pages which never asked for one.
//
// Everything below is a VERBATIM move: same markup, same Tailwind classes, same inline styles, so
// the recruiter and non-Pro feeds render exactly as they did before. The inline style objects are
// not a stylistic choice — see the comment on ghostButtonStyle.

function getInitialsFromName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  const initials = `${parts[0]?.[0] || ""}${parts[1]?.[0] || ""}`;
  return initials.toUpperCase() || "?";
}

export const getInitials = getInitialsFromName;

// Post content has no dedicated tags field — these pills are parsed straight out of the real
// text the author typed (e.g. "...open to #backend roles"), not a fabricated taxonomy.
export function extractHashtags(content) {
  const matches = String(content || "").match(/#[a-zA-Z0-9_]+/g) || [];
  return [...new Set(matches)];
}

// Human labels for the real Post.postType enum (organizationPostTypes in postController.js).
// Shared by every surface that renders an organization-authored post, so a post's category reads
// the same word everywhere it appears.
export const ORGANIZATION_POST_TYPE_LABELS = {
  CompanyUpdate: "Update",
  HiringPost: "Hiring",
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

// Visually hidden but screen-reader-visible — no shared, unscoped .sr-only utility exists in this
// app (every page defines its own page-scoped copy in styles.css), so this component uses an
// inline style instead of depending on whichever page happens to mount it.
export const visuallyHiddenStyle = {
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: 0,
  margin: "-1px",
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
};

export function formatRelativeTime(dateValue) {
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

// Recruiter-variant icons — only rendered when variant === "recruiter", so the seeker feed's
// emoji hearts/speech-bubble are untouched.
function IconHeart(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
    </svg>
  );
}

function IconMessageCircle(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
    </svg>
  );
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

// variant: "default" (seeker feed, ProSeekerDashboard/NormalSeekerDashboard — Tailwind classes,
// unchanged) or "recruiter" (RecruiterCompanyPostsPage — reads the .company-posts-scoped --ph-*/
// --rc-* token classes defined in styles.css). Same markup, same mutation wiring either way; only
// classNames/icons swap, so this is a pure presentational fork, not two different components.
export function PostCard({ post, session, commentValue, onCommentChange, isMutating, onLike, onComment, onDelete, isDeleting, variant = "default" }) {
  const [showComments, setShowComments] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const isRecruiter = variant === "recruiter";
  const isOrganization = post.authorModel === "Organization";
  const postTypeLabel = isOrganization
    ? ORGANIZATION_POST_TYPE_LABELS[post.postType] || "Update"
    : null;
  const avatarUrl = getMediaUrl(post.author?.avatar);
  const hashtags = extractHashtags(post.content);
  // Mirrors the backend's own ownership check in deletePost (authorId === req.user.id) — this only
  // controls whether the option is shown, the real enforcement lives server-side. Not scoped to
  // JobSeeker authors only: this card is shared with RecruiterCompanyPostsPage.jsx, so an
  // organization viewing its own post needs the same delete option.
  const isOwnPost = String(post.authorId) === String(session?.userId);
  const authorName = post.author?.name || "Platform user";
  const likeLabel = `${post.likedByMe ? "Unlike" : "Like"} this post, ${post.likesCount || 0} likes`;
  const commentLabel = `${post.commentsCount || 0} comments`;

  return (
    <article
      className={
        isRecruiter
          ? "cop-post"
          : "rounded-2xl border border-border/60 bg-card/80 backdrop-blur-xl shadow-elegant hover:shadow-xl transition"
      }
    >
      <div className={isRecruiter ? "cop-post__head" : "flex items-start gap-3 p-5"}>
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={authorName}
            className={isRecruiter ? "cop-avatar cop-avatar--image" : "h-11 w-11 shrink-0 rounded-full object-cover"}
          />
        ) : (
          <div
            className={
              isRecruiter
                ? "cop-avatar"
                : "grid h-11 w-11 shrink-0 place-items-center rounded-full bg-linear-to-r from-purple-500 to-blue-500 text-sm font-semibold text-white"
            }
          >
            {getInitials(post.author?.name)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className={isRecruiter ? "cop-post__name" : "font-semibold leading-tight"}>{authorName}</h3>
            {isOrganization && (
              <span
                className={
                  isRecruiter
                    ? "cop-pill cop-pill--accent"
                    : "inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary"
                }
              >
                {postTypeLabel}
              </span>
            )}
          </div>
          <p className={isRecruiter ? "cop-post__meta" : "text-xs text-muted-foreground"}>{post.author?.subtitle}</p>
          <p className={isRecruiter ? "cop-post__meta" : "text-xs text-muted-foreground"}>
            {formatRelativeTime(post.createdAt)}
          </p>
        </div>
        {isOwnPost && (
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setShowMenu((current) => !current)}
              style={actionButtonStyle}
              className="rounded-full p-1.5 text-muted-foreground"
              aria-label={`Options for ${authorName}'s post`}
            >
              ⋯
            </button>
            {showMenu && (
              <div
                className={
                  isRecruiter
                    ? "cop-menu"
                    : "absolute right-0 top-full z-10 mt-1 min-w-36 rounded-lg border border-border/60 bg-card shadow-elegant overflow-hidden"
                }
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
                  aria-label={isDeleting ? "Deleting post…" : `Delete this post`}
                >
                  {isDeleting ? "Deleting…" : "Delete post"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className={isRecruiter ? "cop-post__body" : "px-5 pb-4 space-y-3"}>
        <p className={isRecruiter ? "cop-post__content" : "text-[15px] leading-relaxed whitespace-pre-wrap"}>
          {post.content}
        </p>

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
                className={
                  isRecruiter
                    ? "cop-pill"
                    : "inline-flex items-center gap-1 rounded-full border border-border/60 bg-surface/70 px-2.5 py-0.5 text-xs font-medium text-primary"
                }
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className={isRecruiter ? "cop-post__actions" : "flex items-center justify-between border-t border-border/60 px-3 py-2 text-sm text-muted-foreground"}>
        <button
          type="button"
          onClick={() => onLike(post._id)}
          disabled={isMutating}
          style={
            isRecruiter
              ? undefined
              : { ...actionButtonStyle, color: post.likedByMe ? "var(--brand)" : "inherit" }
          }
          className={
            isRecruiter
              ? `cop-action${post.likedByMe ? " cop-action--liked" : ""}`
              : "flex flex-1 items-center justify-center gap-2 text-xs"
          }
          aria-pressed={post.likedByMe}
          aria-label={likeLabel}
        >
          {isRecruiter ? (
            <IconHeart className="cop-icon" fill={post.likedByMe ? "currentColor" : "none"} />
          ) : (
            <span aria-hidden="true">{post.likedByMe ? "❤️" : "🤍"}</span>
          )}
          <span aria-hidden="true">{post.likesCount || 0}</span>
        </button>
        <button
          type="button"
          onClick={() => setShowComments((current) => !current)}
          style={isRecruiter ? undefined : actionButtonStyle}
          className={isRecruiter ? "cop-action" : "flex flex-1 items-center justify-center gap-2 text-xs"}
          aria-expanded={showComments}
          aria-label={commentLabel}
        >
          {isRecruiter ? <IconMessageCircle className="cop-icon" /> : <span aria-hidden="true">💬</span>}
          <span aria-hidden="true">{post.commentsCount || 0}</span>
        </button>
      </div>

      {showComments && (
        <div className={isRecruiter ? "cop-comments" : "border-t border-border/60 px-5 py-3 space-y-3"}>
          {post.recentComments?.length ? (
            <div className="space-y-2">
              {post.recentComments.map((comment) => (
                <div key={comment._id} className={isRecruiter ? "cop-comment" : "text-sm"}>
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
            {/* No shared, unscoped .sr-only utility exists in this app — every page defines its own
                page-scoped copy, and this component renders under several different page roots. An
                inline visually-hidden style works regardless of which page mounts it. */}
            <label style={visuallyHiddenStyle} htmlFor={`comment-${post._id}`}>
              Write a comment
            </label>
            <input
              id={`comment-${post._id}`}
              type="text"
              value={commentValue || ""}
              onChange={(event) => onCommentChange(post._id, event.target.value)}
              placeholder="Write a comment..."
              className={
                isRecruiter
                  ? "cop-comment-input"
                  : "flex-1 rounded-full border border-border bg-surface/60 px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              }
            />
            <button
              type="submit"
              disabled={isMutating || !String(commentValue || "").trim()}
              className={isRecruiter ? "cop-btn cop-btn--primary" : undefined}
            >
              Comment
            </button>
          </form>
        </div>
      )}
    </article>
  );
}
