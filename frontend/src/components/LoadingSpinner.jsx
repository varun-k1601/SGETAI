/**
 * Loading Spinner Component
 * Sizes: sm (16px), md (24px), lg (32px), xl (48px)
 * Colors: primary, success, warning, danger
 */

export function LoadingSpinner({
  size = "md",
  color = "primary",
  className = "",
}) {
  const sizeClasses = {
    sm: "w-4 h-4",
    md: "w-6 h-6",
    lg: "w-8 h-8",
    xl: "w-12 h-12",
  };

  const colorClasses = {
    primary: "border-blue-200 border-t-blue-600",
    success: "border-green-200 border-t-green-600",
    warning: "border-yellow-200 border-t-yellow-600",
    danger: "border-red-200 border-t-red-600",
  };

  return (
    <div
      className={`
        inline-block rounded-full border-2 animate-spin
        ${sizeClasses[size]} ${colorClasses[color]} ${className}
      `.trim()}
      role="status"
      aria-label="Loading"
    />
  );
}

/**
 * Skeleton Loading Component
 * Use to show loading state for content
 */
export function Skeleton({ width = "w-full", height = "h-4", className = "" }) {
  return (
    <div
      className={`
        rounded animate-pulse bg-gray-200
        ${width} ${height} ${className}
      `.trim()}
    />
  );
}

/**
 * Card Skeleton - Shows loading state for a card
 */
export function CardSkeleton({ lines = 3, className = "" }) {
  return (
    <div className={`space-y-3 p-6 ${className}`.trim()}>
      <Skeleton height="h-6" width="w-3/4" />
      {Array.from({ length: lines - 1 }).map((_, i) => (
        <Skeleton key={i} height="h-4" width={i === lines - 2 ? "w-5/6" : "w-full"} />
      ))}
    </div>
  );
}
