function getStatusBadgeColor(status) {
  const colors = {
    new: "info",
    reviewing: "warning",
    interviewed: "primary",
    offered: "brand",
    rejected: "error",
    accepted: "success"
  };
  return colors[status] || "default";
}

function getStatusLabel(status) {
  const labels = {
    new: "New",
    reviewing: "In Review",
    interviewed: "Interviewed",
    offered: "Offer Sent",
    rejected: "Rejected",
    accepted: "Accepted"
  };
  return labels[status] || "Unknown";
}

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

export function CandidateCard({ candidate, onReview, onContact }) {
  const {
    id,
    name = "Unknown Candidate",
    appliedFor = "Unknown Position",
    appliedAt = new Date(),
    status = "new",
    matchScore = 0,
    resumeUrl = ""
  } = candidate;

  const statusColor = getStatusBadgeColor(status);
  const statusLabel = getStatusLabel(status);
  const relativeTime = getRelativeTime(appliedAt);

  const handleReview = () => {
    onReview?.(id);
  };

  const handleContact = () => {
    onContact?.(id);
  };

  const getInitials = (fullName) => {
    return fullName
      .split(" ")
      .map(n => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);
  };

  return (
    <div className="candidate-card">
      <div className="candidate-header">
        <div className="candidate-avatar">
          <span className="avatar-text">{getInitials(name)}</span>
        </div>
        <div className="candidate-info">
          <h4 className="candidate-name">{name}</h4>
          <p className="candidate-position">{appliedFor}</p>
        </div>
        <div className={`candidate-status candidate-status--${statusColor}`}>
          {statusLabel}
        </div>
      </div>

      <div className="candidate-meta">
        <div className="meta-item">
          <span className="meta-label">Match Score:</span>
          <span className={`meta-value score-${matchScore >= 75 ? "high" : matchScore >= 50 ? "medium" : "low"}`}>
            {matchScore}%
          </span>
        </div>
        <div className="meta-item">
          <span className="meta-label">Applied:</span>
          <span className="meta-value">{relativeTime}</span>
        </div>
      </div>

      <div className="candidate-actions">
        <button className="outline-button outline-button--sm" onClick={handleReview}>
          Review Application
        </button>
        <button className="button button--sm" onClick={handleContact}>
          Contact
        </button>
      </div>
    </div>
  );
}
