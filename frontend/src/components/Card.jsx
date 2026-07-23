/**
 * Card Component - Consistent card wrapper with elevation options
 * Variants: default, elevated, minimal
 */

export function Card({
  children,
  variant = "default",
  className = "",
  onClick = null,
  ...props
}) {
  const variantClasses = {
    default: "bg-white shadow-md rounded-lg border border-gray-200",
    elevated: "bg-white shadow-lg rounded-lg border border-gray-200",
    minimal: "bg-white rounded-lg border border-gray-100",
  };

  const clickableClasses = onClick
    ? "cursor-pointer transition-all hover:shadow-lg hover:translate-y-[-2px]"
    : "";

  return (
    <div
      className={`
        ${variantClasses[variant]} ${clickableClasses} ${className}
      `.trim()}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * CardHeader - Top section of card with title/actions
 */
export function CardHeader({
  title,
  subtitle = null,
  action = null,
  className = "",
}) {
  return (
    <div className={`px-6 py-4 border-b border-gray-100 ${className}`.trim()}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          {title && <h3 className="text-lg font-semibold text-gray-900">{title}</h3>}
          {subtitle && (
            <p className="mt-1 text-sm text-gray-600">{subtitle}</p>
          )}
        </div>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>
    </div>
  );
}

/**
 * CardBody - Main content section
 */
export function CardBody({ children, className = "" }) {
  return <div className={`px-6 py-4 ${className}`.trim()}>{children}</div>;
}

/**
 * CardFooter - Bottom section with actions
 */
export function CardFooter({ children, className = "", divided = true }) {
  const borderClass = divided ? "border-t border-gray-100" : "";
  return (
    <div className={`px-6 py-4 ${borderClass} flex items-center justify-between gap-3 ${className}`.trim()}>
      {children}
    </div>
  );
}

/**
 * Compound Card - Use as Card.Header, Card.Body, Card.Footer
 */
Card.Header = CardHeader;
Card.Body = CardBody;
Card.Footer = CardFooter;
