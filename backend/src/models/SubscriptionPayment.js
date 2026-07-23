const mongoose = require("mongoose");

const subscriptionPaymentSchema = new mongoose.Schema(
  {
    seekerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobSeeker",
      index: true
    },
    accountRole: {
      type: String,
      enum: ["seeker"],
      required: true,
      index: true
    },
    plan: {
      type: String,
      enum: ["monthly", "yearly"],
      required: true
    },
    planCategory: {
      type: String,
      enum: ["applicant_pro"],
      required: true
    },
    amount: {
      type: Number,
      required: true
    },
    currency: {
      type: String,
      default: "INR"
    },
    provider: {
      type: String,
      enum: ["mock", "razorpay"],
      default: "mock"
    },
    providerSessionId: {
      type: String,
      required: true,
      unique: true
    },
    providerPaymentId: {
      type: String,
      trim: true
    },
    providerSignature: {
      type: String,
      trim: true,
      select: false
    },
    status: {
      type: String,
      enum: ["Created", "Paid", "Failed"],
      default: "Created"
    },
    paidAt: Date,
    expiresAt: Date,
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  { timestamps: true }
);

subscriptionPaymentSchema.pre("validate", function ensureAccountOwner(next) {
  if (this.accountRole === "seeker" && !this.seekerId) {
    return next(new Error("seekerId is required for seeker subscription payments."));
  }

  return next();
});

module.exports = mongoose.model("SubscriptionPayment", subscriptionPaymentSchema);
