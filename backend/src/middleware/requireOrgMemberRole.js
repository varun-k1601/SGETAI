const ApiError = require("../utils/ApiError");
const OrganizationMember = require("../models/OrganizationMember");

// Gates team-management/verification-adjacent endpoints by the acting member's own role
// (Owner/Admin/Recruiter) — a separate dimension from requireRole's top-level req.user.role check
// ("organization" vs "seeker" vs admin roles). Any Active member of any role can still create/
// edit/publish jobs (that only ever checked req.user.role === "organization", unchanged); this
// middleware is only for the narrower set of actions the task scopes to Owner/Admin.
function requireOrgMemberRole(allowedRoles = []) {
  return async function orgMemberRoleMiddleware(req, res, next) {
    try {
      if (!req.user || req.user.role !== "organization") {
        throw new ApiError(403, "You do not have permission to access this resource.");
      }

      if (!req.user.memberId) {
        // A JWT issued before team accounts existed (or before this org's Owner member was
        // provisioned) carries no memberId — ask them to sign in again rather than silently
        // guessing at their permissions.
        throw new ApiError(401, "Please sign in again to refresh your account permissions.");
      }

      const member = await OrganizationMember.findById(req.user.memberId);

      if (!member || member.status !== "Active" || !allowedRoles.includes(member.role)) {
        throw new ApiError(403, "You do not have permission to access this resource.");
      }

      req.orgMember = member;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = requireOrgMemberRole;
