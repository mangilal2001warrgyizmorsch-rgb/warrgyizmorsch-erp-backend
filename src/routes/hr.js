import { Router } from "express";
import Employee from "../models/Employee.js";
import Attendance from "../models/Attendance.js";
import LeaveRequest from "../models/LeaveRequest.js";
import PerformanceReview from "../models/PerformanceReview.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

// ── Employees ────────────────────────────────────────────
router.get("/employees", async (req, res) => {
  try {
    const filter = {};
    if (req.query.department) filter.department = req.query.department;
    if (req.query.status) filter.status = req.query.status;
    const employees = await Employee.find(filter);
    res.json(employees);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/employees/:id", async (req, res) => {
  try { res.json(await Employee.findById(req.params.id)); } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/employees", authenticate, async (req, res) => {
  try {
    const lastEmp = await Employee.findOne({ employeeId: { $regex: /^EMP-/ } }).sort({ employeeId: -1 }).limit(1);
    let nextNum = 1;
    if (lastEmp && lastEmp.employeeId) {
      const match = lastEmp.employeeId.match(/^EMP-(\d+)/);
      if (match) nextNum = parseInt(match[1]) + 1;
    }
    const employeeId = `EMP-${String(nextNum).padStart(4, "0")}`;
    const employee = await Employee.create({ ...req.body, employeeId, status: "active" });
    res.status(201).json(employee);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put("/employees/:id", authenticate, async (req, res) => {
  try {
    const employee = await Employee.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(employee);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete("/employees/:id", authenticate, async (req, res) => {
  try { await Employee.findByIdAndDelete(req.params.id); res.json({ success: true }); } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Attendance ────────────────────────────────────────────
router.get("/attendance", async (req, res) => {
  try {
    const { date, employeeId } = req.query;
    let records;
    if (date) {
      records = await Attendance.find({ date }).populate("employeeId");
      records = records.map(r => ({ ...r.toObject(), employee: r.employeeId, employeeId: r.employeeId?._id }));
    } else if (employeeId) {
      records = await Attendance.find({ employeeId }).sort({ _id: -1 }).limit(30);
    } else {
      records = await Attendance.find().sort({ _id: -1 }).limit(100);
    }
    res.json(records);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/attendance/summary", async (req, res) => {
  try {
    const { employeeId, month } = req.query;
    const records = await Attendance.find({ employeeId });
    const monthRecords = records.filter(r => r.date.startsWith(month));
    const present = monthRecords.filter(r => r.status === "present").length;
    const absent = monthRecords.filter(r => r.status === "absent").length;
    const halfDay = monthRecords.filter(r => r.status === "half_day").length;
    const onLeave = monthRecords.filter(r => r.status === "leave").length;
    const totalDays = monthRecords.length;
    const hoursWorked = monthRecords.filter(r => r.checkIn && r.checkOut).map(r => {
      const inTime = new Date(`${r.date}T${r.checkIn}`).getTime();
      const outTime = new Date(`${r.date}T${r.checkOut}`).getTime();
      return (outTime - inTime) / 3600000;
    });
    const avgHours = hoursWorked.length > 0 ? hoursWorked.reduce((a, b) => a + b, 0) / hoursWorked.length : 0;
    res.json({ present, absent, halfDay, onLeave, totalDays, avgHours, records: monthRecords });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/attendance", authenticate, async (req, res) => {
  try {
    const { employeeId, date, ...rest } = req.body;
    const existing = await Attendance.findOne({ employeeId, date });
    if (existing) {
      Object.assign(existing, rest, { employeeId, date });
      await existing.save();
      res.json(existing);
    } else {
      const record = await Attendance.create({ employeeId, date, ...rest });
      res.status(201).json(record);
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/attendance/bulk", authenticate, async (req, res) => {
  try {
    const { date, records } = req.body;
    for (const rec of records) {
      const existing = await Attendance.findOne({ employeeId: rec.employeeId, date });
      if (existing) { Object.assign(existing, rec); await existing.save(); }
      else await Attendance.create({ ...rec, date });
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Leave ────────────────────────────────────────────
router.get("/leave", async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.employeeId) filter.employeeId = req.query.employeeId;
    const requests = await LeaveRequest.find(filter).populate("employeeId").sort({ _id: -1 }).limit(100);
    res.json(requests.map(r => ({ ...r.toObject(), employee: r.employeeId, employeeId: r.employeeId?._id })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/leave", authenticate, async (req, res) => {
  try {
    const request = await LeaveRequest.create({ ...req.body, status: "pending", appliedAt: new Date().toISOString() });
    res.status(201).json(request);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put("/leave/:id/status", authenticate, async (req, res) => {
  try {
    await LeaveRequest.findByIdAndUpdate(req.params.id, { status: req.body.status, approvedBy: req.body.approvedBy });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Performance Reviews ────────────────────────────────────────────
router.get("/reviews", async (req, res) => {
  try {
    const filter = req.query.employeeId ? { employeeId: req.query.employeeId } : {};
    const reviews = await PerformanceReview.find(filter).populate("employeeId").populate("reviewerId").sort({ _id: -1 }).limit(50);
    res.json(reviews.map(r => ({ ...r.toObject(), employee: r.employeeId, reviewer: r.reviewerId })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/reviews", authenticate, async (req, res) => {
  try {
    const review = await PerformanceReview.create(req.body);
    res.status(201).json(review);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Payroll ────────────────────────────────────────────
router.get("/payroll", async (req, res) => {
  try {
    const { month } = req.query;
    const employees = await Employee.find({ status: "active" });
    const payroll = await Promise.all(employees.map(async (emp) => {
      if (!emp.salary) return null;
      const attendance = await Attendance.find({ employeeId: emp._id });
      const monthRecords = attendance.filter(a => a.date.startsWith(month));
      const workingDays = 26;
      const perDaySalary = emp.salary / workingDays;
      
      const leaves = await LeaveRequest.find({ employeeId: emp._id, status: "approved" });
      let unpaidLeaveDays = 0;
      let paidLeaveDays = 0;
      leaves.forEach(l => {
        let start = new Date(l.startDate);
        let end = new Date(l.endDate);
        let monthStart = new Date(`${month}-01`);
        let monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
        let overlapStart = start > monthStart ? start : monthStart;
        let overlapEnd = end < monthEnd ? end : monthEnd;
        if (overlapStart <= overlapEnd) {
          const days = Math.round((overlapEnd - overlapStart) / 86400000) + 1;
          if (l.leaveType === "unpaid") unpaidLeaveDays += days;
          else paidLeaveDays += days;
        }
      });
      
      const attendedDays = monthRecords.filter(a => a.status === "present").length + monthRecords.filter(a => a.status === "half_day").length * 0.5;
      const presentDays = Math.min(workingDays, attendedDays + paidLeaveDays);
      const absentDays = monthRecords.filter(a => a.status === "absent").length;
      
      const absentDeduction = (absentDays + unpaidLeaveDays) * perDaySalary;
      const basic = emp.salary * 0.5;
      const hra = emp.salary * 0.2;
      const allowances = emp.salary * 0.3;
      const pf = basic * 0.12;
      const esi = emp.salary <= 21000 ? emp.salary * 0.0075 : 0;
      const tds = emp.salary > 50000 ? emp.salary * 0.1 : 0;
      const grossSalary = Math.max(0, emp.salary - absentDeduction);
      const totalDeductions = pf + esi + tds + absentDeduction;
      const netSalary = Math.max(0, grossSalary - pf - esi - tds);
      
      return { employee: emp, basic, hra, allowances, grossSalary, pf, esi, tds, absentDeduction, totalDeductions, netSalary, presentDays, absentDays, workingDays };
    }));
    res.json(payroll.filter(Boolean));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Stats ────────────────────────────────────────────
router.get("/stats", async (req, res) => {
  try {
    const employees = await Employee.find();
    const today = new Date().toISOString().slice(0, 10);
    const todayAttendance = await Attendance.find({ date: today });
    const pendingLeaves = await LeaveRequest.find({ status: "pending" });
    const deptBreakdown = employees.reduce((acc, e) => { acc[e.department] = (acc[e.department] || 0) + 1; return acc; }, {});
    const activeCount = employees.filter(e => e.status === "active").length;
    res.json({
      totalEmployees: employees.length, activeEmployees: activeCount,
      presentToday: todayAttendance.filter(a => a.status === "present").length,
      absentToday: todayAttendance.filter(a => a.status === "absent").length,
      pendingLeaves: pendingLeaves.length, deptBreakdown,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
