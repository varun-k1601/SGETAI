function getRelativeTime(timestamp) {
  const now = new Date();
  const date = new Date(timestamp);
  const seconds = Math.floor((now - date) / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return date.toLocaleDateString();
}

export function SocialPostCard({ post }) {
  const {
    id,
    author = { name: "Unknown", role: "User", initials: "U" },
    content = "",
    timestamp = new Date(),
    hashtags = [],
    engagement = { likes: 0, comments: 0, shares: 0 }
  } = post;

  const relativeTime = getRelativeTime(timestamp);

  return (
    <div className="social-post-card">
      <div className="post-header">
        <div className="author-avatar">
          <span className="avatar-text">{author.initials}</span>
        </div>
        <div className="author-info">
          <div className="author-name">{author.name}</div>
          <div className="author-role">{author.role}</div>
        </div>
        <div className="post-time">{relativeTime}</div>
      </div>

      <div className="post-content">
        {content}
      </div>

      {hashtags.length > 0 && (
        <div className="post-hashtags">
          {hashtags.map((tag, idx) => (
            <span key={idx} className="hashtag">#{tag}</span>
          ))}
        </div>
      )}

      <div className="post-engagement">
        <div className="engagement-stat">
          <span className="engagement-icon">❤️</span>
          <span className="engagement-count">{engagement.likes}</span>
        </div>
        <div className="engagement-stat">
          <span className="engagement-icon">💬</span>
          <span className="engagement-count">{engagement.comments}</span>
        </div>
        <div className="engagement-stat">
          <span className="engagement-icon">↗️</span>
          <span className="engagement-count">{engagement.shares}</span>
        </div>
      </div>
    </div>
  );
}
