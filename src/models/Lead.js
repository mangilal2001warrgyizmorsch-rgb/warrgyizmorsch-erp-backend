import mongoose from "mongoose";

const leadSchema = new mongoose.Schema({
  name: { type: String, required: true },
  company: String,
  email: String,
  phone: String,
  source: { type: String, required: true }, // indiaMart, direct, referral, website
  status: { type: String, default: "new" }, // new, contacted, qualified, converted, lost
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  value: Number,
  notes: String,
  externalId: String,
  lastActivity: String,
  tags: [String],
}, { timestamps: true });

leadSchema.index({ status: 1 });
leadSchema.index({ source: 1 });
leadSchema.index({ assignedTo: 1 });

export default mongoose.model("Lead", leadSchema);
