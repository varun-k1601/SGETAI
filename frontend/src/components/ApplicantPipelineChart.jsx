export function ApplicantPipelineChart({ pipeline = {} }) {
  const {
    totalApplications = 0,
    inReview = 0,
    interviewed = 0,
    offerSent = 0,
    rejected = 0,
    accepted = 0
  } = pipeline;
 
  const stages = [
    { label: "Applications", value: totalApplications, color: "var(--primary)" },
    { label: "In Review", value: inReview, color: "var(--info)" },
    { label: "Interviewed", value: interviewed, color: "var(--warning)" },
    { label: "Offers", value: offerSent, color: "var(--brand)" },
    { label: "Accepted", value: accepted, color: "var(--success)" }
  ];

  const maxValue = Math.max(...stages.map(s => s.value)) || 1;

  return (
    <div className="applicant-pipeline-chart">
      <h3 className="pipeline-title">Applicant Pipeline</h3>

      <div className="pipeline-funnel">
        {stages.map((stage, idx) => {
          const width = stage.value > 0 ? (stage.value / maxValue) * 100 : 0;
          return (
            <div key={idx} className="pipeline-stage">
              <div className="stage-label">{stage.label}</div>
              <div className="stage-bar-container">
                <div
                  className="stage-bar"
                  style={{
                    width: `${width}%`,
                    backgroundColor: stage.color
                  }}
                />
              </div>
              <div className="stage-value">{stage.value}</div>
            </div>
          );
        })}
      </div>

      <div className="pipeline-summary">
        <div className="summary-item">
          <span className="summary-label">Conversion Rate:</span>
          <span className="summary-value">
            {totalApplications > 0 ? ((accepted / totalApplications) * 100).toFixed(1) : 0}%
          </span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Success Rate:</span>
          <span className="summary-value">
            {totalApplications > 0 ? ((interviewed / totalApplications) * 100).toFixed(1) : 0}%
          </span>
        </div>
      </div>
    </div>
  );
}
