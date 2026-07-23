export function TopMatchCard({ match }) {
  const {
    id,
    title = "Unknown Job",
    company = "Unknown Company",
    matchPercentage = 0
  } = match;

  const matchColor = matchPercentage >= 75 ? "success" : matchPercentage >= 50 ? "warning" : "error";

  return (
    <div className="top-match-card">
      <div className={`match-percentage match-percentage--${matchColor}`}>
        <span className="match-value">{matchPercentage}%</span>
      </div>
      <div className="match-details">
        <h4 className="match-title">{title}</h4>
        <p className="match-company">{company}</p>
      </div>
    </div>
  );
}
