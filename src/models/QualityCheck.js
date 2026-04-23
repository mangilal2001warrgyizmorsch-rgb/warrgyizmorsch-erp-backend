import mongoose from "mongoose";

const qualityCheckSchema = new mongoose.Schema({
  type: { type: String, required: true }, // incoming, in_process, final
  referenceId: { type: String, required: true },
  referenceType: { type: String, required: true }, // purchase, manufacturing
  productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  productName: { type: String, required: true },
  quantity: { type: Number, required: true },
  checkDate: { type: String, required: true },
  parameters: [{
    name: String,
    expected: String,
    actual: String,
    passed: Boolean,
  }],
  result: { type: String, required: true }, // pass, fail, conditional
  failReason: String,
  inspectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  notes: String,
}, { timestamps: true });

qualityCheckSchema.index({ type: 1 });
qualityCheckSchema.index({ result: 1 });
qualityCheckSchema.index({ productId: 1 });

export default mongoose.model("QualityCheck", qualityCheckSchema);
