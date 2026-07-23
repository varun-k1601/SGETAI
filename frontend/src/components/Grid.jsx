/**
 * Grid Components for responsive layouts
 * Handles mobile-first responsive design
 */

/**
 * Responsive Grid - Adapts columns based on screen size
 * Default: 1 column on mobile, 2 on tablet, 3 on desktop
 */
export function ResponsiveGrid({
  children,
  columns = { mobile: 1, tablet: 2, desktop: 3 },
  gap = "gap-6",
  className = "",
}) {
  const gridClass = `
    grid grid-cols-${columns.mobile}
    sm:grid-cols-${columns.tablet}
    lg:grid-cols-${columns.desktop}
    ${gap}
  `;

  return <div className={`${gridClass} ${className}`.trim()}>{children}</div>;
}

/**
 * Stack Layout - Vertical flex layout with consistent spacing
 */
export function Stack({
  children,
  direction = "vertical",
  gap = "gap-4",
  align = "items-stretch",
  justify = "justify-start",
  className = "",
}) {
  const directionClass = direction === "horizontal" ? "flex-row" : "flex-col";

  return (
    <div
      className={`
        flex ${directionClass} ${gap} ${align} ${justify} ${className}
      `.trim()}
    >
      {children}
    </div>
  );
}

/**
 * Row Layout - Horizontal flex layout
 */
export function Row({
  children,
  gap = "gap-4",
  align = "items-center",
  justify = "justify-between",
  className = "",
}) {
  return (
    <div
      className={`flex flex-row ${gap} ${align} ${justify} ${className}`.trim()}
    >
      {children}
    </div>
  );
}

/**
 * Column Layout - Vertical flex layout
 */
export function Column({
  children,
  gap = "gap-3",
  align = "items-start",
  justify = "justify-start",
  className = "",
}) {
  return (
    <div
      className={`flex flex-col ${gap} ${align} ${justify} ${className}`.trim()}
    >
      {children}
    </div>
  );
}

/**
 * Container - Max-width wrapper for content
 */
export function Container({
  children,
  maxWidth = "max-w-7xl",
  className = "",
}) {
  return (
    <div className={`${maxWidth} mx-auto px-4 ${className}`.trim()}>
      {children}
    </div>
  );
}

/**
 * Section - Vertical spacing wrapper
 */
export function Section({
  children,
  spacing = "py-8",
  className = "",
  title = null,
  subtitle = null,
}) {
  return (
    <section className={`${spacing} ${className}`.trim()}>
      {(title || subtitle) && (
        <div className="mb-6">
          {title && <h2 className="text-2xl font-bold text-gray-900">{title}</h2>}
          {subtitle && (
            <p className="mt-2 text-gray-600">{subtitle}</p>
          )}
        </div>
      )}
      {children}
    </section>
  );
}
