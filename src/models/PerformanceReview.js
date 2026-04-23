import mongoose from "mongoose";

const performanceReviewSchema = new mongoose.Schema({
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true },
  reviewerId: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true },
  period: { type: String, required: true },
  kpiScores: [{
    kpi: String,
    score: Number,
    target: Number,
  }],
  overallScore: { type: Number, required: true },
  comments: String,
  reviewDate: { type: String, required: true },
}, { timestamps: true });

performanceReviewSchema.index({ employeeId: 1 });

export default mongoose.model("PerformanceReview", performanceReviewSchema);
