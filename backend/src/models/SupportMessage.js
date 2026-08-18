const mongoose = require("mongoose");

// One turn in a support thread. Deliberately NOT ChatMessage: see the SCHEMA DECISION comment on
// SupportTicket for why the chat schema cannot represent an admin sender.
const supportMessageSchema = new mongoose.Schema(
  {
    ticketId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SupportTicket",
      required: true,
      index: true
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    // Two values, not three: which side of the desk this came from is the only distinction the
    // thread renders. Whether the user is a JobSeeker or an Organization is already on the
    // ticket's requesterModel, so repeating it here would create a second source of truth that
    // could disagree.
    senderType: {
      type: String,
      enum: ["user", "admin"],
      required: true
    },
    body: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000
    },
    // When the OTHER side read this message. Null on an inbound message means it still counts
    // toward the ticket's unreadForAdmin badge.
    readAt: Date
  },
  { timestamps: true }
);

// The thread view reads strictly in chronological order within one ticket.
supportMessageSchema.index({ ticketId: 1, createdAt: 1 });

module.exports = mongoose.model("SupportMessage", supportMessageSchema);
