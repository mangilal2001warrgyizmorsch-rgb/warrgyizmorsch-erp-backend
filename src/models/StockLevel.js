import mongoose from "mongoose";

const stockLevelSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  warehouseId: { type: mongoose.Schema.Types.ObjectId, ref: "Warehouse", required: true },
  quantity: { type: Number, default: 0 },
  reservedQuantity: { type: Number, default: 0 },
  batchNumber: String,
  expiryDate: String,
}, { timestamps: true });

stockLevelSchema.index({ productId: 1 });
stockLevelSchema.index({ warehouseId: 1 });
stockLevelSchema.index({ productId: 1, warehouseId: 1 }, { unique: true });

export default mongoose.model("StockLevel", stockLevelSchema);
