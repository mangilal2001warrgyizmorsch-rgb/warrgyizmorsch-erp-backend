import mongoose from "mongoose";

const automationLogSchema = new mongoose.Schema({
  ruleId: { type: mongoose.Schema.Types.ObjectId, ref: "AutomationRule", required: true },
  ruleName: { type: String, required: true },
  status: { type: String, required: true }, // success, failed, skipped
  details: String,
  triggeredAt: { type: String, required: true },
}, { timestamps: true });

automationLogSchema.index({ ruleId: 1 });
automationLogSchema.index({ triggeredAt: 1 });

export default mongoose.model("AutomationLog", automationLogSchema);
