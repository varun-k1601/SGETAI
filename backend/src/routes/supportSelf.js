const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const {
  listMyTickets,
  getMyTicket,
  replyToMyTicket,
  getMyResponseTime
} = require("../controllers/supportSelfController");

const router = express.Router();

// WHY THIS IS ITS OWN FILE, mounted at /api/support/me, rather than three routes added above the
// gate in routes/support.js.
//
// support.js gates its entire surface with a router.use(requireRole([...])) at the top. That
// pattern is correct but positional: it protects only what is registered BELOW it, so a later edit
// that moves a route — a merge, a reorder, someone grouping the ticket routes together — silently
// changes who can reach it. Adding user routes above that gate would make the file's security
// depend on line order in a file that now has two audiences. Splitting them means neither file can
// be broken that way: everything in support.js is admin-only, everything here is requester-only,
// and there is no arrangement of lines within either file that produces the wrong answer.
//
// requireAuth ONLY — no requireRole. Both seekers and organizations raise tickets (POST
// /api/feedback accepts either), so a role allowlist here would lock out half the requesters.
// Authorization is per-row instead: every handler scopes its query to the requester derived from
// the verified session, and resolveRequesterScope rejects any role that cannot own a ticket.
router.use(requireAuth);

// Registered ABOVE /tickets/:id so a future rename can never let ":id" swallow it. It returns an
// aggregate only — see the controller for why this one is safe outside the requester scope.
router.get("/response-time", getMyResponseTime);

router.get("/tickets", listMyTickets);
router.get("/tickets/:id", getMyTicket);
router.post("/tickets/:id/messages", replyToMyTicket);

module.exports = router;
