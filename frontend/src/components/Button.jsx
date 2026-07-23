/**
 * Unified Button Component
 * Variants: primary, secondary, danger
 * Sizes: sm, md, lg
 * States: default, hover, active, disabled, loading
 */

export function Button({
  children,
  variant = "primary",
  size = "md",
  disabled = false,
  loading = false,
  className = "",
  onClick,
  type = "button",
  ...props
}) {
  const sizeClasses = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base",
  };

  const variantClasses = {
    primary: "button button--primary",
    secondary: "outline-button",
    danger: "outline-button outline-button--danger",
  };

  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className={`${variantClasses[variant]} ${sizeClasses[size]} ${className}`.trim()}
      {...props}
    >
      {loading ? (
        <>
          <span className="loading-spinner-inline" />
          {children}
        </>
      ) : (
        children
      )}
    </button>
  );
}

/**
 * Icon Button - For action buttons with icons
 */
export function IconButton({
  icon,
  label,
  variant = "secondary",
  size = "md",
  disabled = false,
  onClick,
  className = "",
  ...props
}) {
  const sizeClasses = {
    sm: "w-8 h-8",
    md: "w-10 h-10",
    lg: "w-12 h-12",
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`flex items-center justify-center rounded-md transition-all var(--transition-base) ${sizeClasses[size]} ${className}`.trim()}
      {...props}
    >
      {icon}
    </button>
  );
}
