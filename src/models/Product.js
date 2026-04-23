import mongoose from "mongoose";

const productSchema = new mongoose.Schema({
  sku: { type: String, unique: true, required: true },
  name: { type: String, required: true },
  description: String,
  category: { type: String, required: true },
  unitOfMeasure: { type: String, required: true },
  sellingPrice: { type: Number, required: true },
  costPrice: { type: Number, required: true },
  taxRate: { type: Number, required: true },
  isManufactured: { type: Boolean, default: false },
  isPurchased: { type: Boolean, default: false },
  isSold: { type: Boolean, default: false },
  barcode: String,
  reorderPoint: Number,
  imageUrl: String,
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

productSchema.index({ category: 1 });

export default mongoose.model("Product", productSchema);
