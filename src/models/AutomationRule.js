import mongoose from "mongoose";

const automationRuleSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  isActive: { type: Boolean, default: true },
  trigger: {
    module: { type: String, required: true },
    event: { type: String, required: true },
    conditions: [{
      field: String,
      operator: String, // eq, neq, gt, lt, contains
      value: String,
    }],
  },
  actions: [{
    type: { type: String, required: true }, // notify, update_field, create_task, send_email
    config: { type: Map, of: String },
  }],
  runCount: { type: Number, default: 0 },
  lastRunAt: String,
  createdAt: String,
}, { timestamps: true });

automationRuleSchema.index({ isActive: 1 });

export default mongoose.model("AutomationRule", automationRuleSchema);
