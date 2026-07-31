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
    return <Navigate to={getHomePathForRole(session?.role)} replace />;
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
