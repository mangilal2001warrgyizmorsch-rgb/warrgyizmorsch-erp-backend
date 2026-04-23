import mongoose from "mongoose";

const workOrderSchema = new mongoose.Schema({
  moId: { type: mongoose.Schema.Types.ObjectId, ref: "ManufacturingOrder", required: true },
  workCenterId: { type: mongoose.Schema.Types.ObjectId, ref: "WorkCenter", required: true },
  operationName: { type: String, required: true },
  sequence: { type: Number, required: true },
  plannedDuration: { type: Number, required: true },
  actualDuration: Number,
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
  status: { type: String, default: "pending" }, // pending, in_progress, completed, cancelled
  startedAt: String,
  completedAt: String,
  notes: String,
}, { timestamps: true });

workOrderSchema.index({ moId: 1 });
workOrderSchema.index({ workCenterId: 1 });
workOrderSchema.index({ status: 1 });

export default mongoose.model("WorkOrder", workOrderSchema);
