import { useEffect } from "react";
import { getMediaUrl } from "./CompanyLogo";

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.3" />
    </svg>
  );
}

function formatDate(value) {
  if (!value) {
    return "Just now";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Recently";
  }

  return parsed.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ImageLightbox({ post, imageUrl, onClose }) {
  useEffect(() => {
    function handleEsc(event) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  return (
    <div className="image-lightbox-overlay" onClick={onClose}>
      <div className="image-lightbox-detail-container" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="image-lightbox-close"
          onClick={onClose}
          aria-label="Close"
        >
          <CloseIcon />
        </button>

        <div className="image-lightbox-left">
          <img src={imageUrl} alt="Post media" className="image-lightbox-image" />
        </div>

        <div className="image-lightbox-right">
          <div className="image-lightbox-post-header">
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
            <span>{formatDate(post.createdAt)}</span>
          </div>

          <div className="image-lightbox-post-content">
            <p>{post.content}</p>
          </div>

          <div className="image-lightbox-stats">
            <span>❤️ {post.likesCount || 0} likes</span>
            <span>💬 {post.commentsCount || 0} comments</span>
          </div>

          {post.recentComments?.length ? (
            <div className="image-lightbox-comments">
              <h4>Recent comments</h4>
              {post.recentComments.map((comment) => (
                <article key={comment._id} className="image-lightbox-comment">
                  <strong>{comment.userName || (comment.userModel === "Organization" ? "Recruiter" : "Applicant")}</strong>
                  <p>{comment.content}</p>
                </article>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
