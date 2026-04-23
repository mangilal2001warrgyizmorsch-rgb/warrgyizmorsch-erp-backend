import mongoose from "mongoose";

const employeeSchema = new mongoose.Schema({
  employeeId: { type: String, unique: true, required: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: true},
  department: { type: String, required: true },
  designation: { type: String, required: true },
  managerId: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
joiningDate: { type: Date, required: true },
  status: { type: String, default: "active" }, // active, inactive, on_leave
  salary: Number,
  address: String,
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

employeeSchema.index({ department: 1 });
employeeSchema.index({ status: 1 });
// employeeSchema.index({ employeeId: 1 });

export default mongoose.model("Employee", employeeSchema);
