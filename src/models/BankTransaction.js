import mongoose from "mongoose";

const bankTransactionSchema = new mongoose.Schema({
  bankAccountId: { type: mongoose.Schema.Types.ObjectId, ref: "BankAccount", required: true },
  date: { type: String, required: true },
  description: { type: String, required: true },
  amount: { type: Number, required: true },
  type: { type: String, required: true }, // credit, debit
  isReconciled: { type: Boolean, default: false },
  journalEntryId: { type: mongoose.Schema.Types.ObjectId, ref: "JournalEntry" },
}, { timestamps: true });

bankTransactionSchema.index({ bankAccountId: 1 });
bankTransactionSchema.index({ date: 1 });

export default mongoose.model("BankTransaction", bankTransactionSchema);
