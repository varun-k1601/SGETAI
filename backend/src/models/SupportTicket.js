const mongoose = require("mongoose");

// SCHEMA DECISION — why a dedicated support model instead of reusing ChatSession/ChatMessage.
//
// An admin literally cannot be represented in the existing chat schema. ChatSession.participants
// and ChatMessage.senderRole are both enum ["seeker", "organization"], and participants carries a
// validator requiring exactly two of them. Two options were on the table:
//
//   A) This model, plus SupportMessage. Chosen.
//   B) Widen the chat enums to include "admin". Rejected, and not narrowly: the enum is the
//      smallest part of it. participantKey is built by string concatenation of `role:id` in THREE
//      places that would all have to agree (chatController.buildParticipantKey,
//      workers/recruiterIntroductionWorker.buildParticipantKey, and autoApplyWorker, which
//      exports the helper the introduction worker uses). chatController.assertCanStartChat gates
//      every new thread on a Follow/Application/accepted-Connection relationship that simply does
//      not exist between an admin and a user, so it would need an admin-shaped bypass branch.
//      decorateSessions resolves the other participant through JobSeeker/Organization lookups and
//      would populate an admin to null, which then flows into buildUserDisplay and out to both
//      the seeker chat UI and RecruiterMessagesPage. A support desk has no business putting
//      candidate<->recruiter messaging — the product's actual core loop — at risk.
//
// TRADEOFF ACCEPTED: support conversations live in their own collection, so they do NOT appear in
// a user's normal chat inbox, and a user cannot reply to a support thread from the chat UI they
// already know. That is a real cost, paid deliberately: the alternative is destabilising a
// messaging system that three roles and two background workers depend on. The `channel` field
// below keeps the door open — a "chat" ticket is modelled identically to a "ticket" one, so if a
// user-facing support thread UI is built later it reads from here without another migration.
const supportTicketSchema = new mongoose.Schema(
  {
    // Polymorphic requester, mirroring the userId + userModel pair Feedback already uses rather
    // than inventing a third convention. Both user types can raise a ticket; admins cannot be
    // requesters, which is why this is not a three-way enum.
    // Indexed once, below, via schema.index() — declaring `index: true` here as well would
    // register the same key twice and make Mongoose warn about a duplicate definition.
    requesterId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    requesterModel: {
      type: String,
      enum: ["JobSeeker", "Organization"],
      required: true
    },
    // The two inbox tabs are one model, not two systems. "chat" is a live back-and-forth,
    // "ticket" is an asynchronous request — they differ in expectation, not in structure, so
    // splitting them into separate collections would duplicate every query and metric below.
    channel: {
      type: String,
      enum: ["chat", "ticket"],
      default: "ticket",
      required: true
    },
    subject: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200
    },
    status: {
      type: String,
      enum: ["Open", "Pending", "Resolved", "Closed"],
      default: "Open"
    },
    priority: {
      type: String,
      enum: ["Low", "Normal", "High", "Urgent"],
      default: "Normal"
    },
    // Nullable on purpose — "unassigned" is a real state the inbox displays and filters on, not a
    // missing value to be defaulted away.
    assigneeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null
    },
    // Set once, by the first admin-authored message. Never overwritten, because the first-response
    // metric is meaningless if a later reply can move it.
    firstResponseAt: Date,
    resolvedAt: Date,
    lastMessageAt: Date,
    // A count rather than a flag: the list pane renders it as a badge, and "3 waiting" is more
    // actionable than "has unread". Reset to 0 when an admin opens the thread.
    unreadForAdmin: {
      type: Number,
      default: 0,
      min: 0
    },
    // The mirror of unreadForAdmin, for the requester's side of the thread. A boolean rather than
    // a count: the user's own conversation list shows a dot ("support replied"), not a tally, and
    // "2 replies waiting" is not more actionable to them than "there is something new".
    //
    // No backfill is needed. Every existing ticket simply has the field absent, which reads as
    // falsy — exactly the state we want for a thread the user has never been shown. Writing a
    // migration to stamp `false` onto historical rows would touch every document to change nothing.
    unreadForRequester: {
      type: Boolean,
      default: false
    },
    // Copied onto the row at creation from the platform-wide default (see
    // getSupportPolicy in platformSettingsService) so that changing the policy later does not
    // silently rewrite the SLA that historical tickets were actually judged against.
    slaTargetMinutes: {
      type: Number,
      min: 1
    },
    // Set only by the backfill script, so a migrated row can be traced back to the Feedback
    // document it came from — and so re-running the migration is idempotent.
    sourceFeedbackId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Feedback",
      default: null
    }
  },
  { timestamps: true }
);

// Backs the default inbox query: filter by status, newest activity first.
supportTicketSchema.index({ status: 1, lastMessageAt: -1 });
// Backs the per-owner queue and the distinct-assignee metric.
supportTicketSchema.index({ assigneeId: 1, status: 1 });
supportTicketSchema.index({ requesterId: 1 });
// Backs the channel tabs, which are the first filter applied on every list request.
supportTicketSchema.index({ channel: 1, lastMessageAt: -1 });
// Makes the Feedback backfill idempotent — a second run collides instead of duplicating. Sparse
// because every natively-created ticket has this unset, and a plain unique index would treat all
// of those nulls as duplicates of each other.
supportTicketSchema.index({ sourceFeedbackId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("SupportTicket", supportTicketSchema);
