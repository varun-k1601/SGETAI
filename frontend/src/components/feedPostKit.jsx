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
