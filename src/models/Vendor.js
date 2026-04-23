import mongoose from "mongoose";

const vendorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: String,
  phone: String,
  gstin: String,
  pan: String,
  address: String,
  city: String,
  state: String,
  rating: { type: Number, default: 3 },
  paymentTerms: String,
  leadTime: Number,
  isActive: { type: Boolean, default: true },

}, { timestamps: true });

vendorSchema.index({ name: 1 });

export default mongoose.model("Vendor", vendorSchema);