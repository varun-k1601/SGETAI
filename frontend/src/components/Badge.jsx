/**
 * Badge Component
 * Variants: default, success, warning, danger, info
 * Sizes: sm, md, lg
 */

export function Badge({
  children,
  variant = "default",
  size = "md",
  className = "",
  onRemove = null,
}) {
  const sizeClasses = {
    sm: "px-2 py-1 text-xs",
    md: "px-3 py-1.5 text-sm",
    lg: "px-4 py-2 text-base",
  };

  const variantClasses = {
    default: "bg-gray-100 text-gray-700",
    success: "bg-green-100 text-green-700",
    warning: "bg-yellow-100 text-yellow-700",
    danger: "bg-red-100 text-red-700",
    info: "bg-blue-100 text-blue-700",
  };

  return (
    <span
      className={`
        inline-flex items-center gap-1.5 rounded-full font-medium
        ${sizeClasses[size]} ${variantClasses[variant]} ${className}
      `.trim()}
    >
      {children}
      {onRemove && (
        <button
          onClick={onRemove}
          className="ml-1 hover:opacity-70 transition-opacity"
          aria-label="Remove"
        >
          ✕
        </button>
      )}
    </span>
  );
}

/**
 * Status Badge - Shows status indicators
 */
export function StatusBadge({ status, label }) {
  const statusColors = {
    success: "bg-green-100 text-green-700",
    pending: "bg-yellow-100 text-yellow-700",
    failed: "bg-red-100 text-red-700",
    info: "bg-blue-100 text-blue-700",
  };

  const statusIcons = {
    success: "✓",
    pending: "⏳",
    failed: "✕",
    info: "ℹ",
  };

  return (
    <span
      className={`
        inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium
        ${statusColors[status] || statusColors.info}
      `.trim()}
    >
      <span>{statusIcons[status]}</span>
      {label}
    </span>
  );
}

/**
 * Pill Badge - Simple pill-shaped badge
 */
export function PillBadge({ children, variant = "default", className = "" }) {
  const variantClasses = {
    default: "bg-blue-100 text-blue-700",
    success: "bg-green-100 text-green-700",
    warning: "bg-yellow-100 text-yellow-700",
    danger: "bg-red-100 text-red-700",
  };

  return (
    <span
      className={`
        inline-block px-3 py-1 rounded-full text-xs font-semibold
        ${variantClasses[variant]} ${className}
      `.trim()}
    >
      {children}
    </span>
  );
}
