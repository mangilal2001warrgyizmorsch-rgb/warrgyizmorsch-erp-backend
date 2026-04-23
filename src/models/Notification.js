import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: { type: String, default: "info" }, // info, warning, error, success
  isRead: { type: Boolean, default: false },
  link: String,
}, { timestamps: true });

notificationSchema.index({ userId: 1 });
notificationSchema.index({ isRead: 1 });

export default mongoose.model("Notification", notificationSchema);
