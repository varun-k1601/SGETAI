import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { apiRequest } from "../../services/api";
import { API_BASE_URL } from "../../config/env";
import { BrandLogo } from "../../components/BrandLogo";
import { ThemeToggle } from "../../context/ThemeContext";
import { AutoDismissFeedback } from "../../components/AutoDismissFeedback";
import { countryCallingCodes } from "../../data/countryCallingCodes";
import { useAuth } from "../../context/AuthContext";
import { getHomePathForRole } from "../../utils/roleHome";

const initialForm = {
  username: "",
  password: "",
  confirmPassword: "",
  email: "",
  firstName: "",
  lastName: "",
  companyName: "",
  websiteUrl: "",
  countryCode: "+91",
  phoneNumber: "",
  currentStatus: "Student",
};

export function RegisterPage() {
  const navigate = useNavigate();
  const { completeLogin } = useAuth();
  const [role, setRole] = useState("seeker");
  const [form, setForm] = useState(initialForm);
  const [status, setStatus] = useState({ type: "", message: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function handleSocialSignup(provider) {
    window.location.href = `${API_BASE_URL}/auth/oauth/${provider.toLowerCase()}?role=${role}`;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const normalizedPhone = form.phoneNumber.trim()
      ? `${form.countryCode} ${form.phoneNumber.trim()}`
      : "";

    const commonBody = {
      username: form.username,
      password: form.password,
      confirmPassword: form.confirmPassword,
      email: form.email,
      phone: normalizedPhone,
    };

    const body =
      role === "organization"
        ? {
            ...commonBody,
            companyName: form.companyName,
            websiteUrl: form.websiteUrl,
          }
        : {
            ...commonBody,
            firstName: form.firstName,
            lastName: form.lastName,
            currentStatus: form.currentStatus,
          };

    try {
      setIsSubmitting(true);
      setStatus({ type: "", message: "" });

      const path =
        role === "organization"
          ? "/auth/register/organization"
          : "/auth/register/seeker";

      const response = await apiRequest(path, {
        method: "POST",
        body,
      });

      if (response.accessToken) {
        const nextSession = await completeLogin(response);
        navigate(getHomePathForRole(nextSession.role));
        return;
      }

      setStatus({
        type: "success",
        message: response.message || "Account created. You can now sign in.",
      });
      setForm(initialForm);
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="auth-page auth-page--cinematic">
      <main className="auth-experience auth-experience--wide">
        <section className="auth-form-panel">
      <div className="signup-card auth-glass-card">
        <div className="signup-card__topbar">
          <BrandLogo />
          <ThemeToggle />
        </div>

        <div className="signup-card__brand">
          <p className="eyebrow">Create account</p>
          <h1>SGETAI</h1>
          <p>Choose your account type and create a secure username/password login.</p>
        </div>

        <div className="role-switcher" aria-label="Account type">
          <button
            type="button"
            className={role === "seeker" ? "active" : ""}
            onClick={() => setRole("seeker")}
          >
            Applicant
          </button>
          <button
            type="button"
            className={role === "organization" ? "active" : ""}
            onClick={() => setRole("organization")}
          >
            Recruiter
          </button>
        </div>

        <div className="social-auth">
          <button type="button" className="social-auth__button" onClick={() => handleSocialSignup("Google")}>
            <span className="google-mark" aria-hidden="true">G</span>
            <span>Continue with Google as {role === "organization" ? "Recruiter" : "Applicant"}</span>
          </button>
          <button type="button" className="social-auth__button" onClick={() => handleSocialSignup("Microsoft")}>
            <span className="microsoft-mark" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </span>
            <span>Continue with Microsoft as {role === "organization" ? "Recruiter" : "Applicant"}</span>
          </button>
        </div>

        <div className="auth-divider">
          <span>or create with username</span>
        </div>

        <form className="auth-form signup-form" onSubmit={handleSubmit}>
          <label className="form-field">
            <span>Username</span>
            <input
              type="text"
              value={form.username}
              onChange={(event) => updateField("username", event.target.value)}
              placeholder="Username"
              autoComplete="username"
              required
            />
          </label>

          <label className="form-field">
            <span>Password</span>
            <input
              type="password"
              value={form.password}
              onChange={(event) => updateField("password", event.target.value)}
              placeholder="Password"
              autoComplete="new-password"
              required
            />
          </label>

          <label className="form-field">
            <span>Confirm password</span>
            <input
              type="password"
              value={form.confirmPassword}
              onChange={(event) => updateField("confirmPassword", event.target.value)}
              placeholder="Confirm password"
              autoComplete="new-password"
              required
            />
          </label>

          <label className="form-field">
            <span>E-mail address</span>
            <input
              type="email"
              value={form.email}
              onChange={(event) => updateField("email", event.target.value)}
              placeholder="E-mail address"
              autoComplete="email"
              required
            />
          </label>

          {role === "organization" ? (
            <>
              <label className="form-field">
                <span>Company name</span>
                <input
                  type="text"
                  value={form.companyName}
                  onChange={(event) => updateField("companyName", event.target.value)}
                  placeholder="Company name"
                  required
                />
              </label>

              <label className="form-field">
                <span>Website URL</span>
                <input
                  type="url"
                  value={form.websiteUrl}
                  onChange={(event) => updateField("websiteUrl", event.target.value)}
                  placeholder="https://company.com"
                  required
                />
              </label>
            </>
          ) : (
            <div className="form-grid">
              <label className="form-field">
                <span>First name</span>
                <input
                  type="text"
                  value={form.firstName}
                  onChange={(event) => updateField("firstName", event.target.value)}
                  placeholder="First name"
                  required
                />
              </label>

              <label className="form-field">
                <span>Last name</span>
                <input
                  type="text"
                  value={form.lastName}
                  onChange={(event) => updateField("lastName", event.target.value)}
                  placeholder="Last name"
                  required
                />
              </label>
            </div>
          )}

          <div className="phone-field-group">
            <label className="form-field phone-field-group__code">
              <span>Country code</span>
              <select
                value={form.countryCode}
                onChange={(event) => updateField("countryCode", event.target.value)}
              >
                {countryCallingCodes.map((country) => (
                  <option key={country.value} value={country.value}>
                    {country.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-field">
              <span>Phone number</span>
              <input
                type="tel"
                value={form.phoneNumber}
                onChange={(event) => updateField("phoneNumber", event.target.value)}
                placeholder="Phone number"
                autoComplete="tel-national"
              />
            </label>
          </div>

          {role === "seeker" ? (
            <label className="form-field">
              <span>Current status</span>
              <select
                value={form.currentStatus}
                onChange={(event) => updateField("currentStatus", event.target.value)}
              >
                <option value="Student">Student</option>
                <option value="Professional">Professional</option>
                <option value="Unemployed">Unemployed</option>
              </select>
            </label>
          ) : null}

          <AutoDismissFeedback
            feedback={status}
            onClear={() => setStatus({ type: "", message: "" })}
          />

          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p className="auth-policy-text">
          By continuing, you agree to <a href="/dashboard">Terms</a> &amp;{" "}
          <a href="/dashboard">Privacy Policy</a>.
        </p>

        <p className="auth-footer">
          Have an account? <Link to="/login">Sign In</Link>
        </p>
      </div>
        </section>
      </main>
    </section>
  );
}
