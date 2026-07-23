import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { BrandLogo } from "../../components/BrandLogo";
import { useAuth } from "../../context/AuthContext";
import { ThemeToggle } from "../../context/ThemeContext";
import { apiRequest } from "../../services/api";
import { API_BASE_URL } from "../../config/env";
import { AutoDismissFeedback } from "../../components/AutoDismissFeedback";
import { getHomePathForRole } from "../../utils/roleHome";

export function LoginPage() {
  const { completeLogin } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState({ type: "", message: "" });
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isAdminLogin, setIsAdminLogin] = useState(false);

  useEffect(() => {
    const oauthError = searchParams.get("oauthError");

    if (oauthError) {
      setStatus({ type: "error", message: oauthError });
    }
  }, [searchParams]);

  async function handleLogin(event) {
    event.preventDefault();

    try {
      setIsLoggingIn(true);
      setStatus({ type: "", message: "" });

      const response = await apiRequest(isAdminLogin ? "/auth/admin/login" : "/auth/login", {
        method: "POST",
        body: isAdminLogin
          ? {
              email: identifier,
              password,
            }
          : {
              identifier,
              password,
            },
      });

      const nextSession = await completeLogin(response);
      navigate(getHomePathForRole(nextSession.role));
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    } finally {
      setIsLoggingIn(false);
    }
  }

  function handleSocialSignIn(provider) {
    window.location.href = `${API_BASE_URL}/auth/oauth/${provider.toLowerCase()}`;
  }

  return (
    <section className="auth-page auth-page--cinematic">
      <main className="auth-experience">
        <section className="auth-form-panel">
          <section className="signup-card signin-card auth-glass-card">
            <div className="signin-card__topbar">
              <BrandLogo />
              <ThemeToggle />
            </div>
            <div className="signup-card__brand signin-card__brand-copy">
              <h1>Sign in</h1>
              <p>Access your applicant or recruiter workspace.</p>
            </div>

            <div className="social-auth">
              <button type="button" className="social-auth__button" onClick={() => handleSocialSignIn("Google")}>
                <span className="google-mark" aria-hidden="true">G</span>
                <span>Continue with Google</span>
              </button>
              <button type="button" className="social-auth__button" onClick={() => handleSocialSignIn("Microsoft")}>
                <span className="microsoft-mark" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
                <span>Sign in with Microsoft</span>
              </button>
            </div>

            <div className="auth-divider">
              <span>or sign in with username</span>
            </div>

            <AutoDismissFeedback
              feedback={status}
              onClear={() => setStatus({ type: "", message: "" })}
            />

            <form className="auth-form signup-form" onSubmit={handleLogin}>
              <label className="toggle-line auth-admin-toggle">
                <input
                  type="checkbox"
                  checked={isAdminLogin}
                  onChange={(event) => setIsAdminLogin(event.target.checked)}
                />
                <span>Sign in as admin</span>
              </label>

              <label className="form-field">
                <span>{isAdminLogin ? "Admin e-mail address" : "Username or e-mail address"}</span>
                <input
                  type={isAdminLogin ? "email" : "text"}
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  placeholder={isAdminLogin ? "Admin e-mail address" : "Username or e-mail address"}
                  autoComplete="username"
                  required
                />
              </label>

              <label className="form-field">
                <span>Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Password"
                  autoComplete="current-password"
                  required
                />
              </label>

              <button type="submit" disabled={isLoggingIn || !identifier.trim() || !password.trim()}>
                {isLoggingIn ? "Signing in..." : "Sign In"}
              </button>
            </form>

            <p className="auth-footer">
              New to SGETAI? <Link to="/register">Create an account</Link>
            </p>
          </section>
        </section>
      </main>
    </section>
  );
}
