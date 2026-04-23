import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name: { type: String },
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  role: { type: String, default: "readonly" }, // admin, sales, production, finance, hr, purchase, warehouse, readonly
  department: { type: String },
  avatar: { type: String },
  isActive: { type: Boolean, default: true },
  indiamart: {
    apiKey: { type: String },
    lastFetchedAt: { type: Date },
    isActive: { type: Boolean, default: false }
  },
}, { timestamps: true });

export default mongoose.model("User", userSchema);
