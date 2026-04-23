import mongoose from "mongoose";

const leadActivitySchema = new mongoose.Schema({
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: "Lead", required: true },
  type: { type: String, required: true }, // call, email, meeting, note, follow_up, whatsapp
  description: { type: String, required: true },
  outcome: String,
  nextFollowUp: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  createdAt: { type: String },
}, { timestamps: true });

leadActivitySchema.index({ leadId: 1 });

export default mongoose.model("LeadActivity", leadActivitySchema);
