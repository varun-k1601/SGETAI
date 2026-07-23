/**
 * DashboardHero Component
 * Main hero banner for dashboard pages
 * Displays status, headline, metrics, and CTAs
 */

export function DashboardHero({
  status = null,
  headline,
  subheadline = null,
  metrics = [],
  actions = null,
  variant = "default",
  className = "",
}) {
  const variantStyles = {
    default: "bg-gradient-to-r from-blue-500 to-blue-600",
    success: "bg-gradient-to-r from-green-500 to-emerald-600",
    purple: "bg-gradient-to-r from-purple-500 to-indigo-600",
    cyan: "bg-gradient-to-r from-cyan-500 to-blue-600",
  };

  return (
    <div
      className={`
        ${variantStyles[variant]} text-white rounded-lg p-8 mb-8 shadow-lg
        ${className}
      `.trim()}
    >
      {/* Status Badge */}
      {status && (
        <div className="flex items-center gap-2 mb-3 text-sm font-medium opacity-90">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-white/40" />
          {status}
        </div>
      )}

      {/* Headline */}
      <h1 className="text-3xl md:text-4xl font-bold mb-2 leading-tight">
        {headline}
      </h1>

      {/* Subheadline */}
      {subheadline && (
        <p className="text-lg text-white/90 mb-6 max-w-2xl leading-relaxed">
          {subheadline}
        </p>
      )}

      {/* Metrics Grid */}
      {metrics.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6 pt-6 border-t border-white/20">
          {metrics.map((metric, idx) => (
            <div key={idx} className="flex flex-col">
              <div className="text-3xl md:text-4xl font-bold mb-1">
                {metric.value}
              </div>
              <div className="text-sm text-white/80 font-medium uppercase tracking-wider">
                {metric.label}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
    </div>
  );
}

/**
 * DashboardCard - Standard dashboard card with header and content
 */
export function DashboardCard({
  title,
  subtitle = null,
  actions = null,
  children,
  className = "",
}) {
  return (
    <div className={`bg-white rounded-lg border border-gray-100 shadow-sm ${className}`.trim()}>
      {/* Header */}
      {(title || subtitle || actions) && (
        <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {title && (
              <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            )}
            {subtitle && (
              <p className="mt-1 text-sm text-gray-600">{subtitle}</p>
            )}
          </div>
          {actions && <div className="shrink-0">{actions}</div>}
        </div>
      )}

      {/* Content */}
      <div className="px-6 py-4">{children}</div>
    </div>
  );
}

/**
 * StatBar - Horizontal stats display
 */
export function StatBar({ items = [] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {items.map((item, idx) => (
        <div key={idx} className="bg-white rounded-lg p-4 border border-gray-100">
          <div className="text-2xl font-bold text-gray-900 mb-1">
            {item.value}
          </div>
          <div className="text-xs text-gray-600 font-medium uppercase tracking-wide">
            {item.label}
          </div>
        </div>
      ))}
    </div>
  );
}
