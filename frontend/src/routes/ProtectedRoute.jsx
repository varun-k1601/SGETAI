import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

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
