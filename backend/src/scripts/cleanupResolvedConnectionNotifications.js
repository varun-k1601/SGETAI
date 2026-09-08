// One-off cleanup for connection_request notifications that outlived the request they were asking
// about. Before the server-side fix (notificationService.resolveConnectionRequestNotification,
// called from respondToConnection and removeConnection), answering a connection request left the
// recipient's notification untouched — so /notifications kept offering Accept and Decline on a
// request that could only answer 400 "already been responded to" or 404 "not found".
//
// WHAT COUNTS AS STALE. A connection_request notification whose metadata.connectionId either:
//   - points at a connection that no longer exists (removeConnection hard-deletes), or
//   - points at a connection whose status is anything other than "Pending", or
//   - is missing entirely, so the notification can never be acted on at all.
//
// WHAT IS DELIBERATELY LEFT ALONE:
//   - connection_request notifications whose connection is still Pending. Those are correct: the
//     buttons work and the recipient genuinely has not answered.
//   - connection_accepted / connection_rejected notifications. Those belong to the REQUESTER, not
//     the recipient, and carry the same connectionId in their own metadata — which is exactly why
//     this script filters on type as well. They are how the requester learns the outcome.
//
// DRY RUN BY DEFAULT. Prints every row it would delete and why, and changes nothing. Pass --apply
// to delete, which first writes the full documents to a JSON backup file and prints its path.
//
// Idempotent — a second run finds nothing to do.
//
// Usage: node src/scripts/cleanupResolvedConnectionNotifications.js            (dry run)
//        node src/scripts/cleanupResolvedConnectionNotifications.js --apply
//        npm run cleanup:connection-notifications
const fs = require("fs");
const os = require("os");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const mongoose = require("mongoose");
const Connection = require("../models/Connection");
const Notification = require("../models/Notification");

const APPLY = process.argv.includes("--apply");
const backupArg = process.argv.find((arg) => arg.startsWith("--backup="));

function backupPath() {
  if (backupArg) {
    return path.resolve(backupArg.slice("--backup=".length));
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(os.tmpdir(), `connection-request-notifications-${stamp}.json`);
}

// metadata is a Mixed field, so nothing casts it. Ids may be stored as an ObjectId or a string.
function toObjectId(value) {
  if (!value) {
    return null;
  }

  return mongoose.Types.ObjectId.isValid(value)
    ? new mongoose.Types.ObjectId(String(value))
    : null;
}

async function cleanupResolvedConnectionNotifications() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected to ${mongoose.connection.name}.`);
  console.log(APPLY ? "Mode: APPLY (rows will be deleted)\n" : "Mode: DRY RUN (nothing is deleted)\n");

  const notifications = await Notification.find({ type: "connection_request" }).sort({
    createdAt: -1
  });

  const stale = [];
  const keep = [];

  for (const notification of notifications) {
    const rawId = notification.metadata?.connectionId;
    const connectionId = toObjectId(rawId);
    const connection = connectionId ? await Connection.findById(connectionId) : null;

    let reason = null;

    if (!rawId) {
      reason = "no connectionId in metadata — cannot ever be acted on";
    } else if (!connection) {
      reason = "connection row no longer exists";
    } else if (connection.status !== "Pending") {
      reason = `connection already ${connection.status}`;
    }

    (reason ? stale : keep).push({ notification, connection, reason });
  }

  console.log(`connection_request notifications found: ${notifications.length}`);
  console.log(`  stale (would be deleted): ${stale.length}`);
  console.log(`  still pending (kept):     ${keep.length}\n`);

  if (stale.length > 0) {
    console.log("TO DELETE:");
    for (const { notification, reason } of stale) {
      console.log(
        `  ${notification._id}  recipient:${notification.recipientId}  ` +
          `isRead:${notification.isRead}  created:${notification.createdAt.toISOString().slice(0, 10)}`
      );
      console.log(`    reason: ${reason}`);
      console.log(`    title:  ${notification.title} — ${notification.message}`);
    }
    console.log("");
  }

  if (keep.length > 0) {
    console.log("KEPT (connection still Pending, buttons are live and correct):");
    for (const { notification } of keep) {
      console.log(
        `  ${notification._id}  recipient:${notification.recipientId}  ` +
          `created:${notification.createdAt.toISOString().slice(0, 10)}`
      );
    }
    console.log("");
  }

  // Reported so the operator can see the requester's outcome notifications are out of scope here,
  // rather than having to take it on trust.
  const outcomeNotifications = await Notification.countDocuments({
    type: { $in: ["connection_accepted", "connection_rejected"] }
  });
  console.log(`Requester outcome notifications (untouched by this script): ${outcomeNotifications}\n`);

  if (!APPLY) {
    console.log("Dry run complete. Nothing was deleted. Re-run with --apply to delete the rows above.");
    await mongoose.disconnect();
    return;
  }

  if (stale.length === 0) {
    console.log("Nothing to delete.");
    await mongoose.disconnect();
    return;
  }

  const file = backupPath();
  fs.writeFileSync(
    file,
    JSON.stringify(stale.map(({ notification, reason }) => ({ reason, notification })), null, 2)
  );
  console.log(`Backup of the full documents written to:\n  ${file}\n`);

  const result = await Notification.deleteMany({
    _id: { $in: stale.map(({ notification }) => notification._id) }
  });

  console.log(`Deleted ${result.deletedCount} notification(s).`);

  const remaining = await Notification.countDocuments({ type: "connection_request" });
  console.log(`connection_request notifications remaining: ${remaining}`);

  await mongoose.disconnect();
}

cleanupResolvedConnectionNotifications().catch((error) => {
  console.error("Cleanup failed:", error);
  process.exit(1);
});
