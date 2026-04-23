import mongoose from "mongoose";

const stockMovementSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  warehouseId: { type: mongoose.Schema.Types.ObjectId, ref: "Warehouse", required: true },
  type: { type: String, required: true }, // in, out, transfer, adjustment, scrap
  quantity: { type: Number, required: true },
  reference: String,
  referenceType: String, // sale, purchase, manufacturing, transfer
  date: { type: String, required: true },
  notes: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });

stockMovementSchema.index({ productId: 1 });
stockMovementSchema.index({ date: 1 });
stockMovementSchema.index({ type: 1 });

export default mongoose.model("StockMovement", stockMovementSchema);
