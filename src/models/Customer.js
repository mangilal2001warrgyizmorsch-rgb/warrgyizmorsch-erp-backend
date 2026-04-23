import mongoose from "mongoose";

const customerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: String,
  phone: String,
  gstin: String,
  pan: String,
  address: String,
  city: String,
  state: String,
  country: String,
  creditLimit: Number,
  paymentTerms: String,
  segment: String,
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

customerSchema.index({ name: 1 });

export default mongoose.model("Customer", customerSchema);
