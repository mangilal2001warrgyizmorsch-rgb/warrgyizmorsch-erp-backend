import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

export async function connectDB() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error("❌ MONGODB_URI environment variable is not set!");
    console.error("   Set it in your Render dashboard under Environment → Environment Variables.");
    console.error("   Example: mongodb+srv://user:pass@cluster.mongodb.net/hrm_erp");
    // Allow logs to flush before exiting
    await new Promise((r) => setTimeout(r, 500));
    process.exit(1);
  }

  try {
    const masked = uri.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:****@");
    console.log("⏳ Connecting to MongoDB:", masked);
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    console.log("✅ MongoDB connected successfully");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
    // Allow logs to flush before exiting
    await new Promise((r) => setTimeout(r, 500));
    process.exit(1);
  }
}
