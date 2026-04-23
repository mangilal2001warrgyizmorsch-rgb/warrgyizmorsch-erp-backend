import mongoose from "mongoose";

const integrationSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    label: { type: String, required: true },
    enabled: { type: Boolean, default: false },
    configuredBy: { type: String },
    notes: { type: String },
    credentials: { type: Map, of: String },
  },
  {
    timestamps: true,
  }
);

export default mongoose.models.Integration || mongoose.model("Integration", integrationSchema);
