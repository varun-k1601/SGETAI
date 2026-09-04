import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BrandLogo } from "../../components/BrandLogo";
import { useAuth } from "../../context/AuthContext";
import { getHomePathForRole, isProSeekerSession, seekerPath } from "../../utils/roleHome";

export function OAuthCallbackPage() {
  const navigate = useNavigate();
  const { completeLogin } = useAuth();
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const accessToken = params.get("accessToken");
    const refreshToken = params.get("refreshToken");
    const role = params.get("role");
    const userId = params.get("userId");
    const email = params.get("email");
    const username = params.get("username");
    const isNewOAuthUser = params.get("isNewOAuthUser") === "true";

    if (!accessToken || !refreshToken || !role || !userId) {
      setError("Social sign-in did not return a valid session.");
      return;
    }

    completeLogin({
      accessToken,
      refreshToken,
      role,
      userId,
      email,
      username
    })
      // completeLogin resolves with the HYDRATED session, which is the only place isPro is known
      // here — the OAuth callback params carry a role but no tier. Reading it off the resolved
      // session lets a returning Pro seeker land on /pro/home directly instead of being bounced
      // there by the canonicaliser a moment later.
      .then((nextSession) => {
        const isProSeeker = isProSeekerSession(nextSession);
        navigate(
          isNewOAuthUser && role === "seeker"
            ? seekerPath("/profile", isProSeeker) + "?welcome=oauth"
            : getHomePathForRole(nextSession?.role ?? role, nextSession?.isPro),
          { replace: true }
        );
      })
      .catch((loginError) => {
        setError(loginError.message || "Unable to complete social sign-in.");
      });
  }, [completeLogin, navigate]);

  return (
    <section className="auth-page auth-page--centered">
      <div className="public-auth-shell">
        <header className="public-auth-nav">
          <BrandLogo />
        </header>

        <main className="public-auth-main">
          <section className="signup-card signin-card">
            <div className="signup-card__brand">
              <BrandLogo />
              <h1>{error ? "Sign-in failed" : "Signing you in"}</h1>
              <p>
                {error
                  ? error
                  : "We are connecting your social account to your sgetai workspace."}
              </p>
            </div>

            {error ? (
              <p className="auth-footer">
                <Link to="/login">Back to sign in</Link>
              </p>
            ) : null}
          </section>
        </main>
      </div>
    </section>
  );
}
