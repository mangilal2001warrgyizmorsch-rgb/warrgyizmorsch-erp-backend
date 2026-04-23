import mongoose from "mongoose";

const inspectionTemplateSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, required: true }, // incoming, in_process, final
  parameters: [{
    name: String,
    expected: String,
    unit: String,
  }],
  notes: String,
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

export default mongoose.model("InspectionTemplate", inspectionTemplateSchema);
