import mongoose from "mongoose";

const shopfloorLogSchema = new mongoose.Schema({
  moId: { type: mongoose.Schema.Types.ObjectId, ref: "ManufacturingOrder", required: true },
  workOrderId: { type: mongoose.Schema.Types.ObjectId, ref: "WorkOrder" },
  workCenterId: { type: mongoose.Schema.Types.ObjectId, ref: "WorkCenter" },
  type: { type: String, required: true }, // production, scrap, downtime, issue, shift_start, shift_end
  quantity: Number,
  description: { type: String, required: true },
  operatorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  timestamp: { type: String, required: true },
}, { timestamps: true });

shopfloorLogSchema.index({ moId: 1 });
shopfloorLogSchema.index({ type: 1 });
shopfloorLogSchema.index({ timestamp: 1 });

export default mongoose.model("ShopfloorLog", shopfloorLogSchema);
