import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

/* ===============================================================================================
   Where Google drops the recruiter after the consent screen.
   ===============================================================================================
   The backend handled the exchange (GET /api/recruiter/calendar/callback) and then redirected
   here with nothing but a status and either an account name or a human-readable message. There is
   no token, no authorization code and no account id in this URL, on purpose: a browser history
   entry, a referer header and a shoulder are all things a URL survives into.

   This page therefore renders a result, it does not produce one. Mirrors /pro/linkedin/callback,
   which does the same job for the seeker-side LinkedIn connect flow.
   =============================================================================================== */
export function RecruiterCalendarCallbackPage() {
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const status = searchParams.get("status");
  const account = searchParams.get("account");
  const message = searchParams.get("message");
  const isSuccess = status === "success";

  // The integrations page may already be cached from before the round trip to Google, holding a
  // "Not connected" that is now false. Drop it so returning re-reads the real state.
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ["recruiter", "calendar", "status"] });
  }, [queryClient]);

  return (
    <section className="recruiter-integrations">
      <article className="ri-card ri-callback">
        <p className="ri-eyebrow">Google Calendar</p>
        <h1 className="ri-callback__title">
          {isSuccess ? "Calendar connected" : "Calendar not connected"}
        </h1>

        <p className="ri-callback__body">
          {isSuccess
            ? account
              ? `SGETAI can now create interview events on ${account}. Interviews you schedule will appear on that calendar and invite the candidate from that address.`
              : "SGETAI can now create interview events on your Google Calendar."
            : message ||
              "The connection did not complete, so nothing was saved and no calendar access was granted."}
        </p>

        {isSuccess ? (
          // Said here rather than only in the doctrine comment: this is the moment a recruiter
          // forms a belief about what they just authorised.
          <p className="ri-callback__note">
            This connection is yours alone — teammates on this organization connect their own Google
            accounts. You can disconnect it at any time from Integrations.
          </p>
        ) : null}

        <div className="ri-card__action">
          <Link className="ri-request" to="/recruiter/integrations">
            Back to Integrations
          </Link>
        </div>
      </article>
    </section>
  );
}
