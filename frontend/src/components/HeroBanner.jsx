/**
 * HeroBanner Component - Pixel-perfect match to actual design
 * Purple-to-cyan gradient, metrics grid, white text
 */

export function HeroBanner({
  status = "✨ AI is working for you",
  headline,
  subheadline = null,
  metrics = [],
  className = "",
}) {
  return (
    <div
      className={`
        bg-gradient-to-br from-purple-500 via-blue-500 to-cyan-400
        text-white rounded-3xl p-8 mb-6
        shadow-md
        ${className}
      `.trim()}
      style={{
        background: "linear-gradient(135deg, #7c3aed 0%, #3b82f6 50%, #06b6d4 100%)",
      }}
    >
      {/* Status Badge */}
      {status && (
        <p className="text-xs font-medium mb-3 opacity-90 tracking-normal">
          {status}
        </p>
      )}

      {/* Headline */}
      <h1 className="font-display text-2xl md:text-4xl font-bold mb-2 leading-tight">
        {headline}
      </h1>

      {/* Subheadline */}
      {subheadline && (
        <p className="text-sm text-white/90 mb-6 max-w-2xl font-normal">
          {subheadline}
        </p>
      )}

      {/* Metrics Grid - 4 columns */}
      {metrics && metrics.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-6 border-t border-white/20">
          {metrics.map((metric, idx) => (
            <div
              key={idx}
              className="flex flex-col items-center text-center rounded-2xl bg-white/10 px-3 py-4"
            >
              {/* Icon */}
              {metric.icon && (
                <span className="text-4xl mb-2 leading-none">
                  {metric.icon}
                </span>
              )}
              {/* Large value */}
              <div className="text-3xl font-bold mb-1 leading-tight">
                {metric.value}
              </div>
              {/* Label - uppercase small */}
              <div className="text-xs font-semibold uppercase tracking-wider opacity-90 leading-tight">
                {metric.label}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
