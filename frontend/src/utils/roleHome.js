export function getHomePathForRole(role) {
  if (role === "SuperAdmin" || role === "Moderator") return "/dashboard/admin";
  if (role === "organization") return "/recruiter/overview";
  return "/home";
}
