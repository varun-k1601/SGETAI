// Shared between the admin support desk and the requester-facing self-service endpoints, so the
// two sides can never disagree about how support identifies itself or how a message is previewed.

// The requester-facing name for whoever is on the desk. Deliberately not the admin's email or its
// local-part: the user is talking to support, not to a named individual, and an admin's address is
// internal. (supportController.getAdminName is the admin-facing counterpart and is unchanged.)
const SUPPORT_DISPLAY_NAME = "SGETAI Support";

// A one-line preview of a message body, for a notification headline or a list row. Collapses
// newlines so a multi-paragraph reply does not render as a wall of text in the bell menu.
function previewLine(body, max = 120) {
  const flat = String(body || "").replace(/\s+/g, " ").trim();

  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

module.exports = {
  SUPPORT_DISPLAY_NAME,
  previewLine
};
