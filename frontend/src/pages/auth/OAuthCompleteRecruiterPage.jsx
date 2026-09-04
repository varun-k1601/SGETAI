import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BrandLogo } from "../../components/BrandLogo";
import { ThemeToggle } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../services/api";
import { AutoDismissFeedback } from "../../components/AutoDismissFeedback";
import { getHomePathForRole } from "../../utils/roleHome";

const initialForm = {
  companyName: "",
  websiteUrl: "",
  industry: "",
  companySize: "",
  phone: "",
  headquartersLocation: "",
};

export function OAuthCompleteRecruiterPage() {
  const navigate = useNavigate();
  const { completeLogin } = useAuth();
  const token = useMemo(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    return params.get("token") || "";
  }, []);
  const [form, setForm] = useState(initialForm);
  const [status, setStatus] = useState({
    type: token ? "" : "error",
    message: token ? "" : "Recruiter signup session is missing. Please start signup again.",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    try {
      setIsSubmitting(true);
      setStatus({ type: "", message: "" });

      const response = await apiRequest("/auth/oauth/organization/complete", {
        method: "POST",
        body: {
          token,
          ...form,
        },
      });

      if (response.accessToken) {
        const nextSession = await completeLogin(response);
        navigate(getHomePathForRole(nextSession.role, nextSession.isPro), { replace: true });
        return;
      }

      setStatus({
        type: "success",
        message: response.message || "Recruiter account created.",
      });
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
          <p className="eyebrow">Recruiter signup</p>
          <h1>Complete company profile</h1>
          <p>We verified your social account. Add company details to create the recruiter workspace.</p>
        </div>

        <AutoDismissFeedback
          feedback={status}
          onClear={() => setStatus({ type: "", message: "" })}
        />

        <form className="auth-form signup-form" onSubmit={handleSubmit}>
          <label className="form-field">
            <span>Company name</span>
            <input
              type="text"
              value={form.companyName}
              onChange={(event) => updateField("companyName", event.target.value)}
              placeholder="Company name"
              required
              disabled={!token}
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
              disabled={!token}
            />
          </label>

          <label className="form-field">
            <span>Industry</span>
            <input
              type="text"
              value={form.industry}
              onChange={(event) => updateField("industry", event.target.value)}
              placeholder="Information Technology"
              disabled={!token}
            />
          </label>

          <div className="form-grid">
            <label className="form-field">
              <span>Company size</span>
              <input
                type="text"
                value={form.companySize}
                onChange={(event) => updateField("companySize", event.target.value)}
                placeholder="51-200"
                disabled={!token}
              />
            </label>

            <label className="form-field">
              <span>Phone</span>
              <input
                type="text"
                value={form.phone}
                onChange={(event) => updateField("phone", event.target.value)}
                placeholder="Phone number"
                disabled={!token}
              />
            </label>
          </div>

          <label className="form-field">
            <span>Headquarters location</span>
            <input
              type="text"
              value={form.headquartersLocation}
              onChange={(event) => updateField("headquartersLocation", event.target.value)}
              placeholder="Hyderabad, India"
              disabled={!token}
            />
          </label>

          <button type="submit" disabled={isSubmitting || !token}>
            {isSubmitting ? "Creating recruiter account..." : "Create recruiter account"}
          </button>
        </form>

        <p className="auth-footer">
          Wrong account type? <Link to="/register">Back to signup</Link>
        </p>
      </div>
    </section>
  );
}
