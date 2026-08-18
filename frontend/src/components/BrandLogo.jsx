// `subtitle` is opt-in and defaults to nothing, so the seeker and recruiter lockups render byte
// for byte as they did before — only the admin console passes it.
export function BrandLogo({ isPro = false, subtitle = "" }) {
  return (
    <div className="brand-lockup" aria-label="sgetai">
      <svg
        className="brand-logo-mark"
        viewBox="0 0 36 36"
        role="img"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <linearGradient id="brandLogoGradient" x1="8" y1="4" x2="28" y2="32">
            <stop stopColor="#4B8DFF" />
            <stop offset="1" stopColor="#1758E8" />
          </linearGradient>
        </defs>
        <rect x="3" y="3" width="30" height="30" rx="10" fill="url(#brandLogoGradient)" />
        <g
          transform="translate(6.5,6.5)"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M11 4.6a2.6 2.6 0 1 0-5.2.1 3.5 3.5 0 0 0-2.2 5 3.5 3.5 0 0 0 .5 5.8A3.5 3.5 0 1 0 11 16.6Z" />
          <path d="M11 4.6a2.6 2.6 0 1 1 5.2.1 3.5 3.5 0 0 1 2.2 5 3.5 3.5 0 0 1-.5 5.8 3.5 3.5 0 1 1-6.9-.9Z" />
          <path d="M13.6 11.6a4 4 0 0 1-2.6-3.5 4 4 0 0 1-2.6 3.5" />
        </g>
      </svg>
      {/* Without a subtitle the markup stays exactly what it was — the extra wrapper only appears
          for callers that ask for one, so no existing lockup gains a layout box it did not have. */}
      {subtitle ? (
        <span className="brand-lockup__stack">
          <h1 className="brand-title brand-title--compact">sgetai</h1>
          <span className="brand-subtitle">{subtitle}</span>
        </span>
      ) : (
        <h1 className="brand-title brand-title--compact">sgetai</h1>
      )}
      {isPro && <span className="brand-pro-badge">Pro</span>}
    </div>
  );
}
