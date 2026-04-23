import mongoose from "mongoose";

const accountSchema = new mongoose.Schema({
  code: { type: String, unique: true, required: true },
  name: { type: String, required: true },
  type: { type: String, required: true }, // asset, liability, equity, income, expense
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: "Account" },
  balance: { type: Number, default: 0 },
  currency: String,
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

accountSchema.index({ code: 1 });
accountSchema.index({ type: 1 });

export default mongoose.model("Account", accountSchema);
