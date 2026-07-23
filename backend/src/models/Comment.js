const mongoose = require("mongoose");

const commentSchema = new mongoose.Schema(
  {
    postId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      required: true,
      index: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    userModel: {
      type: String,
      enum: ["JobSeeker", "Organization"],
      required: true
    },
    content: { type: String, required: true, trim: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Comment", commentSchema);
