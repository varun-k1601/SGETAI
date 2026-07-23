const mongoose = require("mongoose");
const { mediaSchema } = require("./subschemas");

const postSchema = new mongoose.Schema(
  {
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true
    },
    authorModel: {
      type: String,
      enum: ["JobSeeker", "Organization"],
      required: true
    },
    content: { type: String, required: true, trim: true },
    postType: {
      type: String,
      enum: ["UserPost", "CompanyUpdate", "HiringPost", "Promotion", "Announcement"],
      default: "UserPost",
      index: true
    },
    media: { type: [mediaSchema], default: [] },
    likesCount: { type: Number, default: 0 },
    commentsCount: { type: Number, default: 0 }
  },
  { timestamps: true }
);

postSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Post", postSchema);
