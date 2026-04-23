import mongoose from "mongoose";

const bankAccountSchema = new mongoose.Schema({
  name: { type: String, required: true },
  accountNumber: { type: String, required: true },
  bankName: { type: String, required: true },
  balance: { type: Number, default: 0 },
  currency: { type: String, default: "INR" },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

export default mongoose.model("BankAccount", bankAccountSchema);
