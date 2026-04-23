import mongoose from "mongoose";

const workCenterSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, required: true },
  capacity: { type: Number, required: true },
  costPerHour: Number,
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

export default mongoose.model("WorkCenter", workCenterSchema);
