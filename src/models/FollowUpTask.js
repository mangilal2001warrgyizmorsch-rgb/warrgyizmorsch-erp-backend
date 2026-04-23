import mongoose from "mongoose";

const followUpTaskSchema = new mongoose.Schema({
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: "Lead", required: true },
  title: { type: String, required: true },
  dueDate: { type: String, required: true },
  priority: { type: String, default: "medium" }, // low, medium, high
  status: { type: String, default: "pending" }, // pending, done, overdue
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  notes: String,
  createdAt: String,
}, { timestamps: true });

followUpTaskSchema.index({ leadId: 1 });
followUpTaskSchema.index({ status: 1 });
followUpTaskSchema.index({ dueDate: 1 });

export default mongoose.model("FollowUpTask", followUpTaskSchema);
