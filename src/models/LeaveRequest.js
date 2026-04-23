import mongoose from "mongoose";

const leaveRequestSchema = new mongoose.Schema({
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true },
  leaveType: { type: String, required: true }, // casual, sick, earned, unpaid
  startDate: { type: String, required: true },
  endDate: { type: String, required: true },
  reason: { type: String, required: true },
  status: { type: String, default: "pending" }, // pending, approved, rejected
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
  appliedAt: { type: String },
}, { timestamps: true });

leaveRequestSchema.index({ employeeId: 1 });
leaveRequestSchema.index({ status: 1 });

export default mongoose.model("LeaveRequest", leaveRequestSchema);
