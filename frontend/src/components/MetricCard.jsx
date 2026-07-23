/**
 * MetricCard Component
 * Displays a single metric with icon, value, and optional trend
 * Uses design tokens for consistent styling
 */

export function MetricCard({
  label,
  value,
  unit = "",
  trend = null,
  percentage = null,
  icon = null,
  className = "",
  onClick = null,
}) {
  const trendColor = percentage >= 0 ? "positive" : "negative";

  return (
    <div
      className={`
        metric-card
        ${onClick ? "cursor-pointer hover:shadow-lg transition-all" : ""}
        ${className}
      `.trim()}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {icon && <div className="metric-card__icon" aria-hidden="true">{icon}</div>}

      <div className="metric-card__label">{label}</div>

      <div className="metric-card__value">
        {value}
        {unit && <span className="metric-card__unit">{unit}</span>}
      </div>

      {percentage !== null && (
        <div className={`metric-card__trend ${trendColor}`}>
          <span aria-hidden="true">{percentage >= 0 ? "↑" : "↓"}</span>
          {" "}
          {Math.abs(percentage)}%
        </div>
      )}

      {trend && <div className="metric-card__trend">{trend}</div>}
    </div>
  );
}
