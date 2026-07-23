/**
 * ActivityFeedCard Component - Simplified version
 * Matches actual SgetAI design with minimal styling
 */
 
function getActivityIcon(type) {
  const icons = {
    application: "📝",
    connection: "🤝",
    follow_up: "💬",
    profile_update: "👤",
    skipped: "⏭️",
  };
  return icons[type] || "•";
}

function getActivityTypeLabel(type) {
  const labels = {
    application: "Application Sent",
    connection: "Connection Request",
    follow_up: "Follow-up Sent",
    profile_update: "Profile Updated",
    skipped: "Opportunity Skipped",
  };
  return labels[type] || type;
}

function getRelativeTime(timestamp) {
  const now = new Date();
  const date = new Date(timestamp);
  const seconds = Math.floor((now - date) / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;

  return date.toLocaleDateString();
}

export function ActivityFeedCard({ activity }) {
  const { type, timestamp, metadata, status } = activity;
  const icon = getActivityIcon(type);
  const typeLabel = getActivityTypeLabel(type);
  const relativeTime = getRelativeTime(timestamp);

  let description = "";
  if (metadata?.jobTitle) {
    description = `Applied to ${metadata.jobTitle}`;
    if (metadata.companyName) {
      description += ` at ${metadata.companyName}`;
    }
  } else if (metadata?.personName) {
    description = `Connected with ${metadata.personName}`;
  } else if (metadata?.reason) {
    description = metadata.reason;
  } else {
    description = typeLabel;
  }

  const statusIcon = {
    success: "✓",
    pending: "⏳",
    failed: "✕",
  }[status] || "";

  const statusTextColor = {
    success: "text-green-600",
    pending: "text-yellow-600",
    failed: "text-red-600",
  }[status] || "text-gray-600";

  return (
    <div className="bg-white rounded-md p-3 mb-2 border border-gray-100 hover:shadow-md transition-shadow duration-150">
      <div className="flex items-start gap-3">
        {/* Icon - emoji */}
        <span className="text-lg shrink-0 leading-none">{icon}</span>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-gray-900 leading-tight">
            {description}
          </h3>

          {/* Metadata row - company, match %, time */}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-600">
            {metadata?.companyName && <span>{metadata.companyName}</span>}
            {metadata?.score !== undefined && (
              <span className="inline-flex items-center bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                {metadata.score}% match
              </span>
            )}
            <span className="text-gray-500">{relativeTime}</span>
          </div>
        </div>

        {/* Status icon - right side */}
        {statusIcon && (
          <span className={`shrink-0 text-sm font-bold ${statusTextColor}`}>
            {statusIcon}
          </span>
        )}
      </div>
    </div>
  );
}
