/**
 * AutomationFeatureCard Component
 * Enhanced with design tokens and improved styling
 */

function getFeatureIcon(name) {
  const icons = {
    "auto-apply": "🎯",
    "auto-connect": "🤖",
    "auto-dm": "💬",
    autoApply: "🎯",
    autoConnect: "🤖",
    autoDm: "💬",
  };
  return icons[name] || "⚙️";
}

function getFeatureDescription(name) {
  const descriptions = {
    "auto-apply": "Automatically apply to jobs matching your criteria",
    "auto-connect": "Send personalized connection requests to recruiters",
    "auto-dm": "Send warm introductions to new connections",
    autoApply: "Automatically apply to jobs matching your criteria",
    autoConnect: "Send personalized connection requests to recruiters",
    autoDm: "Send warm introductions to new connections",
  };
  return descriptions[name] || "Automation feature";
}

export function AutomationFeatureCard({ feature, onToggle, onConfigure }) {
  const { id, name, enabled = false, config = {} } = feature;

  const icon = getFeatureIcon(name);
  const description = getFeatureDescription(name);

  const handleToggle = () => {
    onToggle?.(id, !enabled);
  };

  const handleConfigure = () => {
    onConfigure?.(id);
  };

  return (
    <div
      className={`
        bg-white rounded-lg border shadow-sm transition-all
        ${enabled ? "border-green-200 bg-green-50" : "border-gray-100"}
        hover:shadow-md p-6
      `}
    >
      <div className="flex items-start justify-between gap-4">
        {/* Left side: Icon + Info */}
        <div className="flex items-start gap-4 flex-1 min-w-0">
          <div
            className={`
              shrink-0 w-12 h-12 rounded-lg flex items-center justify-center text-xl
              ${enabled ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}
            `}
          >
            {icon}
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-gray-900">{name}</h3>
            <p className="mt-1 text-sm text-gray-600 leading-relaxed">
              {description}
            </p>
          </div>
        </div>

        {/* Right side: Toggle Switch */}
        <button
          onClick={handleToggle}
          className={`
            relative inline-flex items-center h-7 w-12 rounded-full
            transition-colors focus-visible:outline-none focus-visible:ring-2
            focus-visible:ring-blue-500 focus-visible:ring-offset-2 shrink-0
            ${enabled ? "bg-green-500" : "bg-gray-300"}
          `}
          aria-label={`Toggle ${name}`}
          aria-pressed={enabled}
        >
          <span
            className={`
              inline-block h-6 w-6 transform rounded-full bg-white shadow-md
              transition-transform
              ${enabled ? "translate-x-5" : "translate-x-1"}
            `}
          />
        </button>
      </div>

      {/* Status Badge */}
      {enabled && (
        <div className="mt-4 flex items-center gap-2 text-sm text-green-700 bg-green-100 px-3 py-2 rounded-md">
          <span className="inline-block w-2 h-2 rounded-full bg-green-700" />
          <span>Active</span>
        </div>
      )}

      {/* Configuration Section */}
      {enabled && Object.keys(config).length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">Configuration</h4>
          <div className="space-y-2 mb-4">
            {Object.entries(config).map(([key, value]) => (
              <div
                key={key}
                className="flex items-center justify-between text-sm bg-gray-50 px-3 py-2 rounded"
              >
                <span className="text-gray-600 font-medium">{key}:</span>
                <span className="text-gray-900 truncate">
                  {typeof value === "number" ? value : String(value).substring(0, 50)}
                </span>
              </div>
            ))}
          </div>
          <button
            className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
            onClick={handleConfigure}
          >
            Edit Configuration →
          </button>
        </div>
      )}

      {/* No Config Placeholder */}
      {enabled && Object.keys(config).length === 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200 text-center">
          <p className="text-sm text-gray-600 mb-3">No configuration yet</p>
          <button
            className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
            onClick={handleConfigure}
          >
            Configure Now →
          </button>
        </div>
      )}
    </div>
  );
}
