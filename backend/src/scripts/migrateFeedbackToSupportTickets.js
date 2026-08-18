// One-time backfill: project every existing Feedback document into a SupportTicket plus its first
// SupportMessage, so the admin support inbox opens with the real history already in it rather
// than an empty desk.
//
// Feedback is NOT deleted or modified. It remains the system of record for POST /api/feedback and
// the seeker-facing HelpPage; the ticket is an additional projection of the same submission.
//
// Idempotent — safe to run repeatedly. Each created ticket records the Feedback _id it came from
// in sourceFeedbackId, which carries a unique sparse index, so a second run skips rows it already
// migrated instead of duplicating them.
//
// Usage: npm run migrate:support-tickets
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const mongoose = require("mongoose");
const Feedback = require("../models/Feedback");
const SupportTicket = require("../models/SupportTicket");
const SupportMessage = require("../models/SupportMessage");
const { DEFAULT_SUPPORT_POLICY } = require("../services/platformSettingsService");

// Mirrors deriveSubject in feedbackController so a backfilled row and a natively-created one read
// identically in the inbox.
function deriveSubject(message) {
  const firstLine = String(message || "").split(/\r?\n/)[0].trim();

  if (firstLine.length <= 80) {
    return firstLine || "Support request";
  }

  const truncated = firstLine.slice(0, 80);
  const lastSpace = truncated.lastIndexOf(" ");

  return `${(lastSpace > 40 ? truncated.slice(0, lastSpace) : truncated).trim()}…`;
}

async function migrateFeedbackToSupportTickets() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB.\n");

  const feedbackEntries = await Feedback.find().sort({ createdAt: 1 }).lean();
  console.log(`Found ${feedbackEntries.length} feedback document(s).\n`);

  // One query instead of one existence check per row.
  const migratedIds = new Set(
    (await SupportTicket.find({ sourceFeedbackId: { $ne: null } })
      .select("sourceFeedbackId")
      .lean()
    ).map((ticket) => ticket.sourceFeedbackId.toString())
  );

  let created = 0;
  let skippedExisting = 0;
  let skippedInvalid = 0;

  for (const feedback of feedbackEntries) {
    if (migratedIds.has(feedback._id.toString())) {
      skippedExisting += 1;
      continue;
    }

    if (!feedback.userId || !feedback.userModel || !String(feedback.message || "").trim()) {
      skippedInvalid += 1;
      console.log(`- Skipped ${feedback._id}: missing requester or empty message.`);
      continue;
    }

    try {
      const ticket = await SupportTicket.create({
        requesterId: feedback.userId,
        requesterModel: feedback.userModel,
        channel: "ticket",
        subject: deriveSubject(feedback.message),
        // Feedback only ever distinguished New from Reviewed, so that is the only signal there is
        // to carry across. Anything finer would be invented.
        status: feedback.status === "Reviewed" ? "Resolved" : "Open",
        priority: "Normal",
        assigneeId: null,
        slaTargetMinutes: DEFAULT_SUPPORT_POLICY.slaTargetMinutes,
        lastMessageAt: feedback.createdAt,
        // A Reviewed row was already dealt with, so it is not waiting on anyone.
        unreadForAdmin: feedback.status === "Reviewed" ? 0 : 1,
        sourceFeedbackId: feedback._id
      });

      // firstResponseAt is deliberately left unset even for Reviewed rows: Feedback never recorded
      // WHEN it was reviewed, and inventing a timestamp would corrupt the median-first-response
      // and SLA metrics with fabricated data. These rows simply do not participate in those two
      // measurements, which is the honest outcome.
      await SupportMessage.create({
        ticketId: ticket._id,
        senderId: feedback.userId,
        senderType: "user",
        body: feedback.message,
        readAt: feedback.status === "Reviewed" ? feedback.updatedAt || feedback.createdAt : null,
        createdAt: feedback.createdAt
      });

      // create() stamps its own timestamps; restore the original so the inbox orders history
      // correctly instead of showing every migrated ticket as brand new.
      await SupportTicket.updateOne(
        { _id: ticket._id },
        { $set: { createdAt: feedback.createdAt, updatedAt: feedback.updatedAt || feedback.createdAt } },
        { timestamps: false }
      );

      created += 1;
      console.log(`✓ Migrated feedback ${feedback._id} -> ticket ${ticket._id}`);
    } catch (error) {
      if (error.code === 11000) {
        // Lost a race with a concurrent run; the unique index did its job.
        skippedExisting += 1;
        continue;
      }
      throw error;
    }
  }

  console.log("\nMigration complete.");
  console.log(`  Tickets created: ${created}`);
  console.log(`  Skipped (already migrated): ${skippedExisting}`);
  console.log(`  Skipped (incomplete feedback): ${skippedInvalid}`);

  await mongoose.disconnect();
}

migrateFeedbackToSupportTickets().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
