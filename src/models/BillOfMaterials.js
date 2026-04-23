import mongoose from "mongoose";

const bomSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  version: { type: String, required: true },
  components: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    productName: String,
    quantity: Number,
    unitOfMeasure: String,
  }],
  operations: [{
    name: String,
    workCenterId: { type: mongoose.Schema.Types.ObjectId, ref: "WorkCenter" },
    duration: Number,
    sequence: Number,
  }],
  yieldQuantity: { type: Number, required: true },
  isActive: { type: Boolean, default: true },
  notes: String,
}, { timestamps: true });

bomSchema.index({ productId: 1 });

export default mongoose.model("BillOfMaterials", bomSchema);
