const mongoose = require("mongoose");
const { isCorporateEmailDomain } = require("../utils/domainCheck");

const representativeDetailsSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    role: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true }
  },
  { _id: false }
);

const organizationSchema = new mongoose.Schema(
  {
    companyName: { type: String, required: true, trim: true },
    username: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
      minlength: 3
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      validate: {
        validator: isCorporateEmailDomain,
        message: "Organization email must use a corporate domain."
      }
    },
    passwordHash: {
      type: String,
      select: false
    },
    phone: { type: String, trim: true },
    logo: { type: mongoose.Schema.Types.Mixed },
    industry: { type: String, trim: true },
    companySize: { type: String, trim: true },
    websiteUrl: { type: String, trim: true },
    linkedinPage: { type: String, trim: true },
    description: { type: String, trim: true },
    taxId: { type: String, trim: true },
    registrationNumber: { type: String, trim: true },
    headquartersLocation: { type: String, trim: true },
    foundedYear: Number,
    verificationStatus: {
      type: String,
      enum: ["Pending", "Verified", "Rejected", "OnHold"],
      default: "Pending"
    },
    domainMatched: { type: Boolean, default: false },
    representativeDetails: representativeDetailsSchema,
    autoRejectOnTrustScore: { type: Boolean, default: false },
    trustScoreThreshold: { type: Number, default: 50 }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Organization", organizationSchema);
