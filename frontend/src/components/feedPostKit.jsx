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

// Used by BOTH variants now. The seeker feed previously drew a 🤍/❤️ emoji here, which renders at
// a different size and colour on every platform and cannot inherit the button's liked state — the
// stroked/filled SVG can, via `fill`, so the pressed state is visible rather than implied.
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

/* `max-h-96 w-full object-cover` never applied: this app wires FONTS ONLY into Tailwind v4's
   @theme, and these size utilities are generated, but the surrounding colour utilities are not —
   so an attachment rendered at its natural height and dominated the card. The cap and aspect are
   now in .fp-media (styles.css), which also gives it the card's radius.

   An image is wrapped in a link to the full file so clicking it opens the original rather than a
   cover-cropped version; a video keeps its own controls and is not wrapped, since a click there
   means play. */
function PostMedia({ media }) {
  const [hasFailed, setHasFailed] = useState(false);
  const mediaUrl = getMediaUrl(media);

  if (!mediaUrl || hasFailed) {
    return null;
  }

  if (media.fileType === "image") {
    return (
      <a className="fp-media-link" href={mediaUrl} target="_blank" rel="noreferrer" aria-label="Open full image in a new tab">
        <img className="fp-media" src={mediaUrl} alt="Post attachment" loading="lazy" onError={() => setHasFailed(true)} />
      </a>
    );
  }

  if (media.fileType === "video") {
    return <video className="fp-media" src={mediaUrl} controls onError={() => setHasFailed(true)} />;
  }

  return (
    <a className="fp-attachment" href={mediaUrl} target="_blank" rel="noreferrer">
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
  const likeCount = post.likesCount || 0;
  const commentCount = post.commentsCount || 0;
  const likeLabel = `${post.likedByMe ? "Unlike" : "Like"} this post, ${likeCount} likes`;
  const commentLabel = `${showComments ? "Hide" : "Show"} comments, ${commentCount} comments`;
  // "headline · timestamp" on ONE muted line. These used to be two separate paragraphs, which
  // stacked the header into three loose lines and pushed the post content down the card.
  const metaLine = [post.author?.subtitle, formatRelativeTime(post.createdAt)].filter(Boolean).join(" · ");

  return (
    <article className={isRecruiter ? "cop-post" : "fp-post"}>
      <div className={isRecruiter ? "cop-post__head" : "fp-post__head"}>
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            className={isRecruiter ? "cop-avatar cop-avatar--image" : "fp-avatar fp-avatar--image"}
          />
        ) : (
          <div className={isRecruiter ? "cop-avatar" : "fp-avatar"} aria-hidden="true">
            {getInitials(post.author?.name)}
          </div>
        )}
        <div className={isRecruiter ? "min-w-0 flex-1" : "fp-post__ident"}>
          <div className={isRecruiter ? "flex items-center gap-2" : "fp-post__namerow"}>
            <h3 className={isRecruiter ? "cop-post__name" : "fp-post__name"}>{authorName}</h3>
            {isOrganization && (
              <span className={isRecruiter ? "cop-pill cop-pill--accent" : "fp-pill fp-pill--accent"}>
                {postTypeLabel}
              </span>
            )}
          </div>
          <p className={isRecruiter ? "cop-post__meta" : "fp-post__meta"}>{metaLine}</p>
        </div>
        {isOwnPost && (
          <div className={isRecruiter ? "relative shrink-0" : "fp-post__menu"}>
            <button
              type="button"
              onClick={() => setShowMenu((current) => !current)}
              style={actionButtonStyle}
              className={isRecruiter ? "rounded-full p-1.5 text-muted-foreground" : "fp-iconbtn"}
              aria-label={"Options for " + authorName + "\u2019s post"}
              aria-expanded={showMenu}
            >
              <span aria-hidden="true">⋯</span>
            </button>
            {showMenu && (
              <div className={isRecruiter ? "cop-menu" : "fp-menu"}>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => {
                    setShowMenu(false);
                    onDelete(post._id);
                  }}
                  style={{ ...ghostButtonStyle, padding: "0.5rem 0.75rem", width: "100%" }}
                  className={isRecruiter ? "text-left text-sm text-red-500 hover:bg-surface" : "fp-menu__item"}
                  aria-label={isDeleting ? "Deleting post" : "Delete this post"}
                >
                  {isDeleting ? "Deleting…" : "Delete post"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className={isRecruiter ? "cop-post__body" : "fp-post__body"}>
        <p className={isRecruiter ? "cop-post__content" : "fp-post__content"}>{post.content}</p>

        {post.media?.length ? (
          <div className={isRecruiter ? "grid gap-2" : "fp-post__media"}>
            {post.media.map((media) => (
              <PostMedia key={media.filePath || media.url} media={media} />
            ))}
          </div>
        ) : null}

        {hashtags.length ? (
          <div className={isRecruiter ? "flex flex-wrap gap-1.5" : "fp-post__tags"}>
            {hashtags.map((tag) => (
              <span key={tag} className={isRecruiter ? "cop-pill" : "fp-pill"}>
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {/* ACTION ROW. Both controls are real labelled buttons with a word beside the icon and a
          full-height hit area, not a bare glyph with a loose "0" next to it. A zero count is muted
          (.fp-count--zero) so "no likes yet" does not read as a headline figure. */}
      <div className={isRecruiter ? "cop-post__actions" : "fp-post__actions"}>
        <button
          type="button"
          onClick={() => onLike(post._id)}
          disabled={isMutating}
          style={isRecruiter ? undefined : actionButtonStyle}
          className={
            isRecruiter
              ? `cop-action${post.likedByMe ? " cop-action--liked" : ""}`
              : `fp-action${post.likedByMe ? " fp-action--on" : ""}`
          }
          aria-pressed={post.likedByMe}
          aria-label={likeLabel}
        >
          <IconHeart className={isRecruiter ? "cop-icon" : "fp-icon"} fill={post.likedByMe ? "currentColor" : "none"} />
          <span aria-hidden="true">{post.likedByMe ? "Liked" : "Like"}</span>
          <span aria-hidden="true" className={likeCount ? "fp-count" : "fp-count fp-count--zero"}>{likeCount}</span>
        </button>
        <button
          type="button"
          onClick={() => setShowComments((current) => !current)}
          style={isRecruiter ? undefined : actionButtonStyle}
          className={isRecruiter ? "cop-action" : "fp-action"}
          aria-expanded={showComments}
          aria-label={commentLabel}
        >
          <IconMessageCircle className={isRecruiter ? "cop-icon" : "fp-icon"} />
          <span aria-hidden="true">Comment</span>
          <span aria-hidden="true" className={commentCount ? "fp-count" : "fp-count fp-count--zero"}>{commentCount}</span>
        </button>
      </div>

      {showComments && (
        <div className={isRecruiter ? "cop-comments" : "fp-comments"}>
          {post.recentComments?.length ? (
            <div className={isRecruiter ? "space-y-2" : "fp-comments__list"}>
              {post.recentComments.map((comment) => (
                <div key={comment._id} className={isRecruiter ? "cop-comment" : "fp-comment"}>
                  <span className="fp-comment__who">{comment.userName || "User"}</span>{" "}
                  <span className="fp-comment__what">{comment.content}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className={isRecruiter ? "text-xs text-muted-foreground" : "fp-comments__empty"}>No comments yet.</p>
          )}
          <form
            className={isRecruiter ? "flex items-center gap-2" : "fp-comments__form"}
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
              className={isRecruiter ? "cop-comment-input" : "fp-comments__input"}
            />
            <button
              type="submit"
              disabled={isMutating || !String(commentValue || "").trim()}
              className={isRecruiter ? "cop-btn cop-btn--primary" : "fp-comments__submit"}
            >
              Comment
            </button>
          </form>
        </div>
      )}
    </article>
  );
}
