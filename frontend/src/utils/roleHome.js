export function getHomePathForRole(role) {
  if (role === "SuperAdmin" || role === "Moderator") return "/dashboard/overview";
  if (role === "organization") return "/recruiter/overview";
  return "/home";
}
