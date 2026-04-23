import mongoose from "mongoose";

const warehouseSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, required: true },
  address: String,
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

export default mongoose.model("Warehouse", warehouseSchema);
