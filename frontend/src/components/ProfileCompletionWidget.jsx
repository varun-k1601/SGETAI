export function ProfileCompletionWidget({ percentage = 0, profileViews = 0, viewsTrend = 0 }) {
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference * (1 - percentage / 100);

  return (
    <div className="profile-completion-widget">
      <div className="profile-completion-circle">
        <svg viewBox="0 0 120 120" className="progress-svg">
          <circle
            cx="60"
            cy="60"
            r="45"
            className="progress-bg"
          />
          <circle
            cx="60"
            cy="60"
            r="45"
            className="progress-bar"
            style={{
              strokeDashoffset,
              strokeDasharray: circumference
            }}
          />
        </svg>
        <div className="progress-text">
          <span className="progress-value">{percentage}%</span>
          <span className="progress-label">Complete</span>
        </div>
      </div>

      <div className="profile-stats">
        <div className="stat-item">
          <div className="stat-value">{profileViews}</div>
          <div className="stat-label">Profile Views</div>
        </div>
        <div className="stat-item">
          <div className={`stat-trend ${viewsTrend >= 0 ? "positive" : "negative"}`}>
            {viewsTrend >= 0 ? "↑" : "↓"} {Math.abs(viewsTrend)}%
          </div>
          <div className="stat-label">Trend</div>
        </div>
      </div>
    </div>
  );
}
