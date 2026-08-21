// `subtitle` is opt-in and defaults to nothing — only the admin console passes it.
//
// The lockup stacks whenever there is a SECOND LINE to show, which is either a subtitle (admin)
// or the Pro badge (Pro seeker). The reference puts the Pro badge on its own line beneath the
// wordmark, and .brand-lockup__stack — the column wrapper the console variant already used — is
// the mechanism for that, so it is reused rather than duplicated.
//
// When neither is present the output is exactly what it was: the mark and a bare <h1>. That is
// the case for every auth-page caller (login, register, team invite, both OAuth callbacks and the
// LinkedIn callback), none of which pass a subtitle and none of which are Pro, so none of them
// gain a wrapper element they did not have before.
//
// `variant="recruiter"` is the THIRD stacking case, added for the recruiter rail. It reuses the
// same .brand-lockup__stack mechanism as the other two — it does not fork the component — and
// changes exactly two things beyond that:
//   1. the badge line becomes a "Recruiter" pill, the --rc-accent sibling of .brand-pro-badge;
//   2. the gradient SVG glyph is replaced by a real avatar circle, because the reference shows the
//      ORGANIZATION here rather than the product mark. `avatarUrl` is the org's uploaded logo
//      (AppShell already signs and blob-fetches it); `avatarInitial` is the fallback shown only
//      when no logo exists or the fetch failed, so a letter is never painted over a real logo.
// Every other caller is untouched: variant defaults to "default" and both avatar props default to
// empty, so the branch below is unreachable for them.
export function BrandLogo({
  isPro = false,
  subtitle = "",
  variant = "default",
  avatarUrl = "",
  avatarInitial = "",
}) {
  const isRecruiter = variant === "recruiter";
  const isStacked = Boolean(subtitle) || isPro || isRecruiter;

  return (
    <div className="brand-lockup" aria-label="sgetai">
      {isRecruiter ? (
        // Decorative: the lockup's name is the wordmark beside it, and the org's name is already
        // rendered in the header's profile menu. An <img> here would otherwise announce twice.
        <span className="brand-avatar" aria-hidden="true">
          {avatarUrl ? (
            <img className="brand-avatar__img" src={avatarUrl} alt="" />
          ) : (
            <span className="brand-avatar__initial">{avatarInitial}</span>
          )}
        </span>
      ) : (
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
      )}
      {isStacked ? (
        <span className="brand-lockup__stack">
          <h1 className="brand-title brand-title--compact">sgetai</h1>
          {subtitle ? <span className="brand-subtitle">{subtitle}</span> : null}
          {isPro ? <span className="brand-pro-badge">Pro</span> : null}
          {/* Real text, not decoration — it is the one thing on the rail that says which product
              surface this is, so it must be readable by assistive tech. */}
          {isRecruiter ? <span className="brand-role-badge">Recruiter</span> : null}
        </span>
      ) : (
        <h1 className="brand-title brand-title--compact">sgetai</h1>
      )}
    </div>
  );
}
