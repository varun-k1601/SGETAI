import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BrandLogo } from "../../components/BrandLogo";
import { ThemeToggle } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../services/api";
import { AutoDismissFeedback } from "../../components/AutoDismissFeedback";
import { getHomePathForRole } from "../../utils/roleHome";

export function AcceptTeamInvitePage() {
  const navigate = useNavigate();
  const { completeLogin } = useAuth();
  const token = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("token") || "";
  }, []);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState({
    type: token ? "" : "error",
    message: token ? "" : "This invite link is missing or invalid. Ask the person who invited you to resend it.",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();

    try {
      setIsSubmitting(true);
      setStatus({ type: "", message: "" });

      const response = await apiRequest("/organization/members/complete-invite", {
        method: "POST",
        body: { token, firstName, lastName, password },
      });

      const nextSession = await completeLogin(response);
      navigate(getHomePathForRole(nextSession.role), { replace: true });
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="auth-page auth-page--centered">
      <div className="signup-card">
        <div className="signup-card__topbar">
          <BrandLogo />
          <ThemeToggle />
        </div>

        <div className="signup-card__brand">
          <p className="eyebrow">Team invite</p>
          <h1>Set up your account</h1>
          <p>Add your name and choose a password to join your team's hiring workspace.</p>
        </div>

        <AutoDismissFeedback feedback={status} onClear={() => setStatus({ type: "", message: "" })} />

        <form className="auth-form signup-form" onSubmit={handleSubmit}>
          <div className="form-grid">
            <label className="form-field">
              <span>First name</span>
              <input
                type="text"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                required
                disabled={!token}
              />
            </label>

            <label className="form-field">
              <span>Last name</span>
              <input
                type="text"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                required
                disabled={!token}
              />
            </label>
          </div>

          <label className="form-field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 8 characters"
              required
              disabled={!token}
            />
          </label>

          <button type="submit" disabled={isSubmitting || !token}>
            {isSubmitting ? "Setting up account..." : "Set up account"}
          </button>
        </form>

        <p className="auth-footer">
          Already set up? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </section>
  );
}
