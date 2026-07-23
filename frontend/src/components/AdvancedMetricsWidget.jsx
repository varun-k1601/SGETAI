export function AdvancedMetricsWidget({ metrics = {} }) {
  const {
    recruiterResponseRate = 0,
    averageResponseTime = "N/A",
    scheduledInterviews = 0,
    offersReceived = 0,
    acceptedOffers = 0
  } = metrics;

  return (
    <div className="advanced-metrics-widget">
      <h2 className="widget-title">Advanced Metrics</h2>

      <div className="metrics-grid">
        <div className="metric-box">
          <div className="metric-icon">📊</div>
          <div className="metric-label">Response Rate</div>
          <div className="metric-value">{recruiterResponseRate}%</div>
        </div>

        <div className="metric-box">
          <div className="metric-icon">⏱️</div>
          <div className="metric-label">Avg Response Time</div>
          <div className="metric-value">{averageResponseTime}</div>
        </div>

        <div className="metric-box">
          <div className="metric-icon">📅</div>
          <div className="metric-label">Interviews Scheduled</div>
          <div className="metric-value">{scheduledInterviews}</div>
        </div>

        <div className="metric-box">
          <div className="metric-icon">🎁</div>
          <div className="metric-label">Offers Received</div>
          <div className="metric-value">{offersReceived}</div>
        </div>

        <div className="metric-box">
          <div className="metric-icon">✅</div>
          <div className="metric-label">Accepted Offers</div>
          <div className="metric-value">{acceptedOffers}</div>
        </div>
      </div>
    </div>
  );
}
