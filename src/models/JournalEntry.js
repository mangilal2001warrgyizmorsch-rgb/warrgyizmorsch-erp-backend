import mongoose from "mongoose";

const journalEntrySchema = new mongoose.Schema({
  entryNumber: { type: String, unique: true, required: true },
  date: { type: String, required: true },
  description: { type: String, required: true },
  lines: [{
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    debit: { type: Number, default: 0 },
    credit: { type: Number, default: 0 },
    description: String,
  }],
  status: { type: String, default: "draft" }, // draft, posted, cancelled
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  reference: String,
}, { timestamps: true });

journalEntrySchema.index({ date: 1 });
journalEntrySchema.index({ status: 1 });

export default mongoose.model("JournalEntry", journalEntrySchema);
