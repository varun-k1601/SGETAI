import { useState } from "react";
import { getMediaUrl } from "../CompanyLogo";

function formatDate(value) {
  if (!value) return "Just now";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Recently";
  return parsed.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getPostTypeLabel(post) {
  const organizationPostTypes = [
    { value: "CompanyUpdate", label: "Company Update" },
    { value: "HiringPost", label: "Hiring Post" },
    { value: "Promotion", label: "Promotion" },
    { value: "Announcement", label: "Announcement" },
  ];

  if (post.authorModel !== "Organization") {
    return "User Post";
  }
  return organizationPostTypes.find((item) => item.value === post.postType)?.label || "Company Update";
}

function getPostTypeClass(post) {
  return `post-type-badge post-type-badge--${String(post.postType || "UserPost").toLowerCase()}`;
}

function MediaPreview({ media, post, onImageClick }) {
  const [hasFailed, setHasFailed] = useState(false);
  const mediaUrl = getMediaUrl(media);

  if (!mediaUrl || hasFailed) {
    return (
      <div className="post-media-fallback">
        <strong>Media unavailable</strong>
        <span>The uploaded file URL could not be opened.</span>
        {media?.filePath ? <small>{media.filePath}</small> : null}
      </div>
    );
  }

  if (media.fileType === "image") {
    return (
      <img
        src={mediaUrl}
        alt="Post media"
        onError={() => setHasFailed(true)}
        onClick={() => onImageClick?.({ post, imageUrl: mediaUrl })}
        style={{ cursor: "pointer" }}
      />
    );
  }

  if (media.fileType === "video") {
    return <video src={mediaUrl} controls onError={() => setHasFailed(true)} />;
  }

  return (
    <a className="detail-link" href={mediaUrl} target="_blank" rel="noreferrer">
      Open document
    </a>
  );
}

function PostCard({
  post,
  session,
  commentValue,
  onCommentChange,
  onLike,
  onComment,
  onDelete,
  isMutating,
  onImageClick,
}) {
  const isOwner = String(post.authorId) === String(session?.userId);

  return (
    <article className="post-card">
      <div className="post-card__header">
        <div className="post-author">
          <div className="post-author__avatar">
            {(() => {
              const avatarUrl = getMediaUrl(post.author?.avatar);
              return avatarUrl ? (
                <img src={avatarUrl} alt={post.author.name || "Author"} />
              ) : (
                <span>{(post.author?.name || "U").charAt(0).toUpperCase()}</span>
              );
            })()}
          </div>
          <div>
            <strong>{post.author?.name || "Platform user"}</strong>
            <p>{post.author?.subtitle || post.authorModel}</p>
          </div>
        </div>
        <div className="post-card__meta">
          <span className={getPostTypeClass(post)}>{getPostTypeLabel(post)}</span>
          <span>{formatDate(post.createdAt)}</span>
        </div>
      </div>

      <p className="post-content">{post.content}</p>

      {post.media?.length ? (
        <div className="post-media-grid">
          {post.media.map((media) => (
            <MediaPreview key={media.filePath || media.url} media={media} post={post} onImageClick={onImageClick} />
          ))}
        </div>
      ) : null}

      <div className="post-card__actions">
        <button
          type="button"
          className={post.likedByMe ? "filter-chip active" : "filter-chip"}
          onClick={() => onLike(post)}
          disabled={isMutating}
        >
          {post.likedByMe ? "Liked" : "Like"} · {post.likesCount || 0}
        </button>
        <span className="pill">{post.commentsCount || 0} comments</span>
        {isOwner ? (
          <button
            type="button"
            className="outline-button"
            onClick={() => onDelete(post)}
            disabled={isMutating}
          >
            Delete
          </button>
        ) : null}
      </div>

      {post.recentComments?.length ? (
        <div className="comment-stack">
          {post.recentComments.map((comment) => (
            <article key={comment._id} className="comment-row">
              <strong>{comment.userName || (comment.userModel === "Organization" ? "Recruiter" : "Applicant")}</strong>
              <p>{comment.content}</p>
            </article>
          ))}
        </div>
      ) : null}

      <form
        className="comment-form"
        onSubmit={(event) => {
          event.preventDefault();
          onComment(post);
        }}
      >
        <input
          type="text"
          value={commentValue || ""}
          onChange={(event) => onCommentChange(post._id, event.target.value)}
          placeholder="Write a comment..."
        />
        <button type="submit" disabled={isMutating || !String(commentValue || "").trim()}>
          Comment
        </button>
      </form>
    </article>
  );
}

export function FeedSection({
  posts = [],
  session,
  comments = {},
  isMutating = false,
  isLoading = false,
  isError = false,
  onCommentChange,
  onLike,
  onComment,
  onDelete,
  onImageClick,
}) {
  if (isLoading) {
    return (
      <article className="info-card">
        <p>Loading feed...</p>
      </article>
    );
  }

  if (isError) {
    return (
      <article className="info-card">
        <p>We could not load posts right now.</p>
      </article>
    );
  }

  if (!posts.length) {
    return (
      <article className="empty-state-card">
        <h4>No posts yet</h4>
        <p>Posts from applicants and recruiters will appear here.</p>
      </article>
    );
  }

  return (
    <div className="space-y-3">
      {posts.map((post) => (
        <PostCard
          key={post._id}
          post={post}
          session={session}
          commentValue={comments[post._id]}
          isMutating={isMutating}
          onCommentChange={(postId, value) =>
            onCommentChange?.(postId, value)
          }
          onLike={(item) => onLike?.(item._id)}
          onComment={(item) => onComment?.(item._id)}
          onDelete={(item) => onDelete?.(item)}
          onImageClick={onImageClick}
        />
      ))}
    </div>
  );
}
