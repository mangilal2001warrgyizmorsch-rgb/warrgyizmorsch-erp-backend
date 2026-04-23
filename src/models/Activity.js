import mongoose from "mongoose";

const activitySchema = new mongoose.Schema({
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: "Lead" },
  customerId: String,
  type: { type: String, required: true }, // call, email, meeting, note
  subject: { type: String, required: true },
  description: String,
  dueDate: String,
  completedAt: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });

activitySchema.index({ leadId: 1 });

export default mongoose.model("Activity", activitySchema);
