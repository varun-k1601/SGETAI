import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { BrandLogo } from "../../components/BrandLogo";

export function LinkedInConnectCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [status] = useState(searchParams.get("status") === "success" ? "success" : "error");
  const displayName = searchParams.get("displayName") || "";
  const message = searchParams.get("message") || "Unable to connect your LinkedIn account.";

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ["pro", "linkedin-status"] });
  }, [queryClient]);

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
              <h1>{status === "success" ? "LinkedIn connected" : "Connection failed"}</h1>
              <p>
                {status === "success"
                  ? `Connected as ${displayName}. This links your LinkedIn identity only — automated connection requests and messaging still aren't available through LinkedIn's public API.`
                  : message}
              </p>
            </div>

            <button
              type="button"
              className="outline-button"
              onClick={() => navigate("/pro/automations", { replace: true })}
            >
              Back to Automations
            </button>
          </section>
        </main>
      </div>
    </section>
  );
}
