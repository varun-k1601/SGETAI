import { useState } from "react";

/**
 * AutomationSection Component - Pixel-perfect match
 * "Pro AI is on duty" section with toggle switches
 */

// Tailwind's "semantic" color utilities (bg-card, border-border, bg-success, etc.) generate zero
// CSS anywhere in this app — index.css only has `@import "tailwindcss";` with no `@theme`/`@config`
// wiring tailwind.config.js's color map into Tailwind v4's engine, so every one of these classes is
// a silent no-op (confirmed via computed-style inspection: backgroundColor comes back fully
// transparent). Fixing that wiring app-wide is a larger, separate change; here, card/badge/divider
// colors use inline styles referencing the same real CSS custom properties (var(--surface),
// var(--border), var(--color-success), etc. — all defined in styles.css `:root`) that those classes
// were always meant to resolve to.

// Same Lucide-style stroke icon convention as AutomationsPage.jsx's getIconSvg (viewBox 0 0 24 24,
// stroke=currentColor, strokeWidth=2, round caps/joins) — kept local since the two pages don't share
// an icon module, but the path data is the same so icons stay visually identical across both pages.
const FEATURE_ICON_PATHS = {
  briefcase: (
    <>
      <path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
      <rect width="20" height="14" x="2" y="6" rx="2"></rect>
    </>
  ),
  linkedin: (
    <>
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path>
      <rect width="4" height="12" x="2" y="9"></rect>
      <circle cx="4" cy="4" r="2"></circle>
    </>
  ),
  "message-square": (
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
  ),
  mail: (
    <>
      <path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7"></path>
      <rect x="2" y="4" width="20" height="16" rx="2"></rect>
    </>
  ),
  refresh: (
    <>
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
      <path d="M21 3v5h-5"></path>
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
      <path d="M8 16H3v5"></path>
    </>
  ),
  shield: (
    <>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"></path>
      <path d="m9 12 2 2 4-4"></path>
    </>
  ),
};

function FeatureIconBadge({ icon, enabled }) {
  const paths = FEATURE_ICON_PATHS[icon];

  if (!paths) {
    return null;
  }

  return (
    <div
      className="grid h-11 w-11 shrink-0 place-items-center rounded-full"
      style={{
        background: enabled ? "var(--hero-gradient)" : "var(--surface-muted)",
        color: enabled ? "#ffffff" : "var(--text-muted)",
        transition: "background 200ms ease-in-out, color 200ms ease-in-out",
      }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
        aria-hidden="true"
      >
        {paths}
      </svg>
    </div>
  );
}

// This app's global `button { background, border-radius, transition, box-shadow, transform }`
// rule in styles.css (and its :hover/:active/:disabled variants) lives outside Tailwind's cascade
// layers, so it silently wins over any Tailwind utility class applied directly to a <button>
// element — regardless of the utility's specificity, pseudo-class, or syntax (confirmed by direct
// inspection: identical classes render correctly on a plain <div> but not on a <button>, and this
// holds for :focus and :active states too since layer priority applies per-property across the
// whole ruleset, not per-selector). Inline styles plus small bits of local state (focus/press) are
// the only reliable way to control the toggle's visuals here, so those are used instead of
// className for anything that would otherwise collide with that global rule.
function FeatureToggle({ feature, onToggleFeature }) {
  const [isFocused, setIsFocused] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  const trackBackground = feature.disabled
    ? "#d1d5db"
    : feature.enabled
      ? "var(--hero-gradient)" // this app's actual purple→blue→cyan brand gradient (same token HeroBanner.jsx uses)
      : "var(--surface-muted)";
  const knobBackground = feature.disabled ? "#f3f4f6" : "#ffffff";
  // Track is 48px wide (w-12) with padding reset to 0 below, knob is 20px wide, with a 4px inset
  // on each side: off = 4px from the left edge, on = 48 - 20 - 4 = 24px from the left edge (i.e.
  // flush against the right edge with the same 4px inset).
  const knobTranslateX = feature.enabled ? "24px" : "4px";

  const shadowLayers = [];
  if (isFocused && !feature.disabled) {
    shadowLayers.push("0 0 0 3px color-mix(in srgb, var(--brand) 55%, transparent)");
  }
  if (feature.enabled && !feature.disabled) {
    shadowLayers.push("0 1px 4px rgba(59, 130, 246, 0.35)"); // matches the brand gradient's blue stop
  }
  const trackBoxShadow = shadowLayers.length ? shadowLayers.join(", ") : "none";

  function clearPress() {
    setIsPressed(false);
  }

  return (
    <button
      onClick={() => !feature.disabled && onToggleFeature?.(feature.id, !feature.enabled)}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      onMouseDown={() => !feature.disabled && setIsPressed(true)}
      onMouseUp={clearPress}
      onMouseLeave={clearPress}
      onTouchStart={() => !feature.disabled && setIsPressed(true)}
      onTouchEnd={clearPress}
      disabled={feature.disabled}
      className={`relative inline-flex shrink-0 items-center w-12 h-7 ${feature.disabled ? "cursor-not-allowed" : ""}`}
      style={{
        // The global `button` rule (styles.css) sets padding: 0.9rem 1.15rem and a 1px border,
        // which otherwise swamps the knob's translateX offsets below (the knob's flex layout
        // starting position would already sit ~18px inset before any transform is applied) —
        // reset both so this component's own box-model math is the only thing in effect.
        padding: 0,
        border: "none",
        borderRadius: "9999px",
        background: trackBackground,
        boxShadow: trackBoxShadow,
        outline: "none",
        transform: isPressed ? "scale(0.95)" : "scale(1)",
        transition: "background 200ms ease-in-out, box-shadow 200ms ease-in-out, transform 150ms ease-in-out",
      }}
      aria-label={`Toggle ${feature.name}`}
      aria-pressed={feature.enabled}
    >
      {/* Knob - lifted circle that slides */}
      <span
        style={{
          display: "inline-block",
          height: "20px",
          width: "20px",
          borderRadius: "9999px",
          background: knobBackground,
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.25), 0 1px 2px rgba(0, 0, 0, 0.15)",
          transform: `translateX(${knobTranslateX})`,
          transition: "transform 200ms ease-in-out, background 200ms ease-in-out",
        }}
      />
    </button>
  );
}

export function AutomationSection({
  isActive = true,
  features = [],
  onToggleFeature = null,
  matchThreshold = null,
  className = "",
}) {
  return (
    <div
      className={`rounded-2xl backdrop-blur-xl p-5 mb-6 ${className}`.trim()}
      style={{
        border: "1px solid var(--border)",
        background: "var(--surface)",
        opacity: 0.98,
        boxShadow: "0 18px 44px rgba(88, 109, 151, 0.08)",
      }}
    >
      {/* Section Header */}
      <div className="pb-4 mb-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
          Automation engine
        </p>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-foreground">
            Pro AI is on duty
          </h2>
          {/* Active Badge - soft pill with pulsing dot, matching this app's understated badge style */}
          {isActive && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
              style={{
                background: "color-mix(in srgb, var(--color-success) 15%, transparent)",
                color: "var(--color-success)",
              }}
            >
              <span
                className="h-2 w-2 rounded-full animate-pulse"
                style={{ background: "var(--color-success)" }}
              />
              Active
            </span>
          )}
        </div>
      </div>

      {/* Features Grid - Vertical Stack */}
      <div className="space-y-2">
        {features && features.length > 0 ? (
          features.map((feature) => (
            // Wraps the row in its own container-query context so the action (button or toggle)
            // can stack below the text instead of staying pinned to the right and squeezing it —
            // this needs to react to the row's own rendered width (e.g. a narrow sidebar column),
            // not the viewport width, so a container query is used instead of a `sm:` viewport variant.
            <div key={feature.id} className="@container">
              <div
                className={
                  feature.action
                    ? "flex flex-col @sm:flex-row @sm:items-center @sm:justify-between gap-3 p-3 rounded-xl transition-colors duration-150"
                    : "flex items-center justify-between gap-3 p-3 rounded-xl transition-colors duration-150"
                }
                style={{ background: "var(--surface-muted)" }}
              >
                {/* Left: Icon + Content */}
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  {/* Icon - circular badge, colored by live enabled state */}
                  {feature.icon && (
                    <FeatureIconBadge icon={feature.icon} enabled={Boolean(feature.enabled)} />
                  )}
                  {/* Text content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-foreground leading-tight">
                        {feature.name}
                      </h3>
                      {feature.badge && (
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                          style={{
                            border: "1px solid var(--border)",
                            background: "var(--surface)",
                            color: "var(--text-muted)",
                          }}
                        >
                          {feature.badge}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                      {feature.description}
                    </p>
                    {feature.note && (
                      <p className="mt-1 text-[11px] text-muted-foreground">{feature.note}</p>
                    )}
                  </div>
                </div>

                {/* Right: custom action (e.g. a "Connect" button) takes priority over the toggle */}
                {feature.action ? (
                  feature.action
                ) : (
                  <FeatureToggle feature={feature} onToggleFeature={onToggleFeature} />
                )}
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            No automation features available
          </p>
        )}
      </div>

      {/* Match threshold — platform-wide policy, shown for transparency; not a per-seeker
          setting, so it's a static read-only indicator rather than a draggable control. */}
      {typeof matchThreshold === "number" && (
        <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Match threshold
            </p>
            <span className="text-sm font-semibold text-foreground">{matchThreshold}%+</span>
          </div>
          <div
            className="relative h-2 rounded-full"
            style={{ background: "var(--surface-muted)" }}
            role="img"
            aria-label={`Match threshold set to ${matchThreshold}%`}
          >
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${matchThreshold}%`, background: "var(--hero-gradient)" }}
            />
            <div
              className="absolute top-1/2 h-4 w-4 rounded-full"
              style={{
                left: `calc(${matchThreshold}% - 8px)`,
                transform: "translateY(-50%)",
                background: "#ffffff",
                border: "2px solid var(--brand)",
                boxShadow: "0 1px 3px rgba(0, 0, 0, 0.25)",
              }}
            />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            AI only auto-applies when profile-to-JD match is ≥ {matchThreshold}%. Set by platform
            policy, not adjustable per seeker.
          </p>
        </div>
      )}
    </div>
  );
}
