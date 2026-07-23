export function JobPostingCard({ job, onEdit, onClose, onView }) {
  const {
    id,
    title = "Unknown Job",
    company = "Your Company",
    status = "active",
    applicantCount = 0,
    viewCount = 0,
    createdAt = new Date()
  } = job;

  const daysPosted = Math.floor((new Date() - new Date(createdAt)) / (1000 * 60 * 60 * 24));

  const handleEdit = () => {
    onEdit?.(id);
  };

  const handleClose = () => {
    onClose?.(id);
  };

  const handleView = () => {
    onView?.(id);
  };

  const statusLabel = status === "active" ? "Active" : "Closed";
  const statusIcon = status === "active" ? "✓" : "×";

  return (
    <div className="job-posting-card">
      <div className="job-posting-header">
        <div className="job-posting-title-section">
          <h3 className="job-posting-title">{title}</h3>
          <p className="job-posting-company">{company}</p>
        </div>
        <div className={`job-status job-status--${status}`}>
          <span className="status-icon">{statusIcon}</span>
          <span className="status-label">{statusLabel}</span>
        </div>
      </div>

      <div className="job-posting-stats">
        <div className="stat">
          <span className="stat-icon">👥</span>
          <div className="stat-content">
            <div className="stat-value">{applicantCount}</div>
            <div className="stat-label">Applicants</div>
          </div>
        </div>
        <div className="stat">
          <span className="stat-icon">👁️</span>
          <div className="stat-content">
            <div className="stat-value">{viewCount}</div>
            <div className="stat-label">Views</div>
          </div>
        </div>
        <div className="stat">
          <span className="stat-icon">📅</span>
          <div className="stat-content">
            <div className="stat-value">{daysPosted}</div>
            <div className="stat-label">Days Posted</div>
          </div>
        </div>
      </div>

      <div className="job-posting-actions">
        <button className="outline-button outline-button--sm" onClick={handleView}>
          View
        </button>
        <button className="outline-button outline-button--sm" onClick={handleEdit}>
          Edit
        </button>
        {status === "active" && (
          <button className="outline-button outline-button--sm outline-button--danger" onClick={handleClose}>
            Close
          </button>
        )}
      </div>
    </div>
  );
}
