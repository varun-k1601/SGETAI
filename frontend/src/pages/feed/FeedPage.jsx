import { useAuth } from "../../context/AuthContext";
import { NormalSeekerDashboard } from "../dashboard/NormalSeekerDashboard";
import { ProSeekerDashboard } from "../dashboard/ProSeekerDashboard";

export function FeedPage() {
  const { session } = useAuth();

  if (session?.role === "seeker" && session?.isPro) {
    return <ProSeekerDashboard />;
  }

  return <NormalSeekerDashboard />;
}
