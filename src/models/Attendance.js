import mongoose from "mongoose";

const attendanceSchema = new mongoose.Schema({
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true },
  date: { type: String, required: true },
  checkIn: String,
  checkOut: String,
  status: { type: String, required: true }, // present, absent, half_day, leave
  notes: String,
}, { timestamps: true });

attendanceSchema.index({ employeeId: 1 });
attendanceSchema.index({ date: 1 });
attendanceSchema.index({ employeeId: 1, date: 1 }, { unique: true });

export default mongoose.model("Attendance", attendanceSchema);
