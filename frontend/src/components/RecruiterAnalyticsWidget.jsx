export function RecruiterAnalyticsWidget({ analytics = {} }) {
  const {
    totalJobViews = 0,
    totalApplications = 0,
    applicationRate = 0,
    averageMatchQuality = 0,
    hireRate = 0
  } = analytics;

  return (
    <div className="recruiter-analytics-widget">
      <h2 className="widget-title">Analytics Overview</h2>

      <div className="analytics-grid">
        <div className="analytics-card">
          <div className="analytics-icon">👁️</div>
          <div className="analytics-content">
            <div className="analytics-label">Total Job Views</div>
            <div className="analytics-value">{totalJobViews.toLocaleString()}</div>
          </div>
        </div>

        <div className="analytics-card">
          <div className="analytics-icon">📝</div>
          <div className="analytics-content">
            <div className="analytics-label">Total Applications</div>
            <div className="analytics-value">{totalApplications}</div>
          </div>
        </div>

        <div className="analytics-card">
          <div className="analytics-icon">📊</div>
          <div className="analytics-content">
            <div className="analytics-label">Application Rate</div>
            <div className="analytics-value">{applicationRate}%</div>
          </div>
        </div>

        <div className="analytics-card">
          <div className="analytics-icon">⭐</div>
          <div className="analytics-content">
            <div className="analytics-label">Avg Match Quality</div>
            <div className="analytics-value">{averageMatchQuality}%</div>
          </div>
        </div>

        <div className="analytics-card">
          <div className="analytics-icon">🎯</div>
          <div className="analytics-content">
            <div className="analytics-label">Hire Rate</div>
            <div className="analytics-value">{hireRate}%</div>
          </div>
        </div>
      </div>
    </div>
  );
}
