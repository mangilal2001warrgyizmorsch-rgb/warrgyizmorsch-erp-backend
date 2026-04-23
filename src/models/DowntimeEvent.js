import mongoose from "mongoose";

const downtimeEventSchema = new mongoose.Schema({
  workCenterId: { type: mongoose.Schema.Types.ObjectId, ref: "WorkCenter", required: true },
  reason: { type: String, required: true },
  startTime: { type: String, required: true },
  endTime: String,
  durationMinutes: Number,
  reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  isResolved: { type: Boolean, default: false },
}, { timestamps: true });

downtimeEventSchema.index({ workCenterId: 1 });
downtimeEventSchema.index({ isResolved: 1 });

export default mongoose.model("DowntimeEvent", downtimeEventSchema);
