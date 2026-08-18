const mongoose = require("mongoose");

// SCHEMA DECISION — why a dedicated model instead of extending Connection or ChatSession.
//
// Connecting a seeker to one specific HR person has no representation in the current schema:
// Connection declares BOTH `requester` and `recipient` as ref "JobSeeker", and ChatSession
// participants are role "seeker" | "organization" — both org-level. Three options were on the
// table:
//
//   A) Polymorphic Connection.recipient (recipientModel enum). Rejected: every existing
//      seeker-to-seeker call site (connectionController's mutual-connection queries, the
//      Accepted-connection gate in chatController.assertCanStartChat, the network/suggestions
//      lookups) queries Connection without any recipientModel filter and populates `recipient`
//      as a JobSeeker. Introducing OrganizationMember recipients would silently leak HR rows
//      into those result sets and populate them to null — a behavior change to code this feature
//      has no business touching.
//   B) memberId inside ChatSession.participants. Rejected: it solves delivery but not the
//      connection-request half at all, and it changes the meaning of participantKey /
//      isParticipant / decorateSessions, risking duplicate sessions for a pair that already has
//      one.
//   C) This model. Chosen: Connection keeps its exact seeker-to-seeker semantics, ChatSession
//      keeps its exact participant contract, and every concept this feature actually needs —
//      the individual HR target, the request status, dedupe, rate-limit accounting, and the
//      audit trail of what was sent — lives in one place that nothing else reads.
//
// TRADEOFF ACCEPTED: the chat thread the introduction is delivered into stays the org-level
// seeker <-> organization session (the same one ensureRecruiterNetwork already upserts), so any
// active member of that organization can see the message, not only the targeted HR person.
// That is deliberate: org-side messaging is already a shared inbox everywhere in this app
// (RecruiterMessagesPage lists sessions by organizationId), and narrowing it would require
// changing ChatSession's participant contract — exactly what option B was rejected for. The
// individual attribution that ChatSession cannot express is preserved here on `hrMemberId`, and
// that is what every guardrail (dedupe, per-HR caps, HR opt-out) keys off.
const recruiterIntroductionSchema = new mongoose.Schema(
  {
    jobSeekerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobSeeker",
      required: true,
      index: true
    },
    // The individual HR person who posted the job (Job.postedByMemberId) — never the org. When a
    // job has no posting member, no introduction is created at all rather than falling back to
    // the organization, so this is always a real person.
    hrMemberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OrganizationMember",
      required: true,
      index: true
    },
    // Denormalized from the member for org-scoped reads (and so the chat thread this was
    // delivered into can be resolved without a second lookup) — not a substitute for hrMemberId.
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true
    },
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true,
      index: true
    },
    // This IS the connection request to the HR member — the thing Connection cannot model. It
    // deliberately does not reuse Connection's enum names beyond the shared "Pending" start
    // state, because accepting an introduction is not the same act as accepting a peer
    // connection.
    status: {
      type: String,
      enum: ["Pending", "Accepted", "Declined"],
      default: "Pending"
    },
    respondedAt: Date,
    matchScore: Number,
    matchTag: { type: String, trim: true },
    // The specific skills the match reasoning credited — stored because they were fed to the AI
    // as the justification for reaching out, so an audit can check the claim against the draft.
    matchedSkills: { type: [String], default: [] },
    // What the seeker's two channel consents (autoApplyPreferences.autoConnectEnabled /
    // autoDMEnabled) actually authorized for this record. "connection_only" means the seeker
    // consented to being connected but NOT to a message being sent under their name — so `message`
    // is legitimately absent, which is why it can't be unconditionally required below.
    deliveryMode: {
      type: String,
      enum: ["connection_only", "connection_and_message"],
      default: "connection_and_message"
    },
    message: {
      type: String,
      trim: true,
      maxlength: 5000,
      // Required only when a message was actually authorized. Validating on the sibling field
      // rather than dropping `required` outright keeps the original guarantee intact for every
      // connection_and_message record: those can still never be saved with an empty body.
      required: [
        function messageRequiredForMessageMode() {
          return this.deliveryMode === "connection_and_message";
        },
        "message is required when deliveryMode is connection_and_message."
      ]
    },
    // "ai_auto" whenever a drafted message exists; "system_auto" for a connection-only record,
    // where no model was invoked at all. Kept explicit rather than implied so a future
    // manual/assisted path can share the model without ambiguity.
    generatedBy: {
      type: String,
      enum: ["ai_auto", "system_auto"],
      default: "ai_auto"
    },
    chatSessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ChatSession"
    },
    chatMessageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ChatMessage"
    },
    deliveredAt: Date
  },
  { timestamps: true }
);

// The dedupe guarantee: one seeker can only ever be introduced to one HR person for one job
// once. Enforced in the database rather than by a pre-check so concurrent runs of the same job
// (re-publish, admin threshold change) collide on E11000 instead of double-messaging — the
// worker treats that error as a skip.
recruiterIntroductionSchema.index(
  { jobSeekerId: 1, hrMemberId: 1, jobId: 1 },
  { unique: true }
);
// Backs the per-HR-per-job and per-HR-per-day rate limits.
recruiterIntroductionSchema.index({ hrMemberId: 1, createdAt: -1 });
recruiterIntroductionSchema.index({ jobSeekerId: 1, createdAt: -1 });

module.exports = mongoose.model("RecruiterIntroduction", recruiterIntroductionSchema);
