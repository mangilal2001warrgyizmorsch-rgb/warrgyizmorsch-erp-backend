import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

export async function connectDB() {
  try {
    const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/hrm_erp";
    await mongoose.connect(uri);
    console.log("✅ MongoDB connected:", uri);
  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  }
}
