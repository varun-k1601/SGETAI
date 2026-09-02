import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getHomePathForRole } from "../utils/roleHome";

export function ProtectedRoute() {
  const { isAuthenticated, isBootstrapping } = useAuth();
  const location = useLocation();

  if (isBootstrapping) {
    return <section className="loading-state">Loading your workspace...</section>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}

// Guards a route group to a specific set of roles — used for routes meant for exactly one role
// (or a narrow allowlist), unlike ProtectedRoute above which only checks that *someone* is
// logged in. A mismatched role is sent to their own home rather than /login (they're still a
// valid logged-in user, just on the wrong route), reusing getHomePathForRole so this never drifts
// from the same role->home mapping used by the post-login redirect elsewhere in the app.
export function RoleRoute({ allowedRoles }) {
  const { isAuthenticated, isBootstrapping, session } = useAuth();
  const location = useLocation();

  if (isBootstrapping) {
    return <section className="loading-state">Loading your workspace...</section>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!allowedRoles.includes(session?.role)) {
    const home = getHomePathForRole(session?.role);

    /* LOOP GUARD. getHomePathForRole falls through to "/home" for any role it does not recognise,
       including undefined — and "/home" is itself inside a RoleRoute allowlist. A session with a
       missing or unexpected role would therefore be denied at /home, redirected to /home, denied
       again, and so on until the browser gave up: a blank page, not a redirect to safety.

       Redirecting somewhere is only ever right when the destination differs from where we already
       are. When it does not, render a plain explanation instead — the user is authenticated but
       their session has no role we can route, and the honest response is to say so and let them
       sign in again, not to spin. */
    if (location.pathname === home) {
      return (
        <section className="loading-state">
          Your session does not have a role we can route. Please <a href="/login">sign in again</a>.
        </section>
      );
    }

    return <Navigate to={home} replace />;
  }

  return <Outlet />;
}

export function ProRoute() {
  const { isAuthenticated, isBootstrapping, session } = useAuth();
  const location = useLocation();

  if (isBootstrapping) {
    return <section className="loading-state">Loading your workspace...</section>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (session?.role === "seeker" && !session?.isPro) {
    return <Navigate to="/upgrade" replace />;
  }

  return <Outlet />;
}
