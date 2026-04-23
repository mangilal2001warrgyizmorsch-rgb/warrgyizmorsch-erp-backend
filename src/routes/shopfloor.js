import { Router } from "express";
import ManufacturingOrder from "../models/ManufacturingOrder.js";
import WorkOrder from "../models/WorkOrder.js";
import WorkCenter from "../models/WorkCenter.js";
import ShopfloorLog from "../models/ShopfloorLog.js";
import DowntimeEvent from "../models/DowntimeEvent.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

router.get("/live", async (req, res) => {
  try {
    const activeMOs = await ManufacturingOrder.find({ status: "in_progress" }).populate("productId");
    const confirmedMOs = await ManufacturingOrder.find({ status: "confirmed" }).populate("productId");
    const allMOs = [...activeMOs, ...confirmedMOs];
    const today = new Date().toISOString().slice(0, 10);
    const result = await Promise.all(allMOs.map(async mo => {
      const workOrders = await WorkOrder.find({ moId: mo._id });
      const completedWOs = workOrders.filter(wo => wo.status === "completed").length;
      const progressPct = workOrders.length > 0 ? Math.round((completedWOs / workOrders.length) * 100) : 0;
      const todayLogs = await ShopfloorLog.find({ moId: mo._id, type: "production" });
      const todayProduced = todayLogs.filter(l => l.timestamp.startsWith(today)).reduce((sum, l) => sum + (l.quantity || 0), 0);
      return { ...mo.toObject(), product: mo.productId, workOrders, completedWOs, progressPct, todayProduced };
    }));
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/work-centers", async (req, res) => {
  try {
    const workCenters = await WorkCenter.find();
    const result = await Promise.all(workCenters.map(async wc => {
      const activeWOs = await WorkOrder.find({ workCenterId: wc._id, status: "in_progress" }).populate("moId");
      const pendingWOs = await WorkOrder.find({ workCenterId: wc._id, status: "pending" });
      const openDowntime = await DowntimeEvent.find({ workCenterId: wc._id, isResolved: false });
      return { ...wc.toObject(), activeWOs: activeWOs.map(wo => ({ ...wo.toObject(), mo: wo.moId })), pendingCount: pendingWOs.length, hasDowntime: openDowntime.length > 0, downtimeEvents: openDowntime };
    }));
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/logs", async (req, res) => {
  try {
    const filter = req.query.moId ? { moId: req.query.moId } : {};
    const n = parseInt(req.query.limit) || 50;
    const logs = await ShopfloorLog.find(filter).populate("operatorId").populate("moId").populate("workCenterId").sort({ _id: -1 }).limit(n);
    res.json(logs.map(l => ({ ...l.toObject(), operatorName: l.operatorId?.name || "Unknown", moNumber: l.moId?.moNumber || "—", workCenterName: l.workCenterId?.name })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/log", authenticate, async (req, res) => {
  try {
    await ShopfloorLog.create({ ...req.body, operatorId: req.user._id, timestamp: new Date().toISOString() });
    if (req.body.type === "production" && req.body.quantity) {
      const mo = await ManufacturingOrder.findById(req.body.moId);
      if (mo) { mo.producedQuantity = (mo.producedQuantity || 0) + req.body.quantity; await mo.save(); }
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/downtime", authenticate, async (req, res) => {
  try { res.status(201).json(await DowntimeEvent.create({ ...req.body, startTime: new Date().toISOString(), reportedBy: req.user._id, isResolved: false })); } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put("/downtime/:id/resolve", authenticate, async (req, res) => {
  try {
    const event = await DowntimeEvent.findById(req.params.id);
    if (!event) return res.status(404).json({ error: "Not found" });
    const endTime = new Date().toISOString();
    const durationMinutes = Math.round((Date.parse(endTime) - Date.parse(event.startTime)) / 60000);
    await DowntimeEvent.findByIdAndUpdate(req.params.id, { endTime, durationMinutes, isResolved: true });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/downtime", async (req, res) => {
  try {
    const filter = req.query.resolved !== undefined ? { isResolved: req.query.resolved === "true" } : {};
    const events = await DowntimeEvent.find(filter).populate("workCenterId").populate("reportedBy").sort({ _id: -1 }).limit(50);
    res.json(events.map(e => ({ ...e.toObject(), workCenterName: e.workCenterId?.name || "Unknown", reporterName: e.reportedBy?.name || "Unknown" })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/shift-summary", async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const todayLogs = await ShopfloorLog.find({ timestamp: { $regex: `^${today}` } });
    const todayDowntime = await DowntimeEvent.find({ startTime: { $regex: `^${today}` } });
    res.json({ totalProduced: todayLogs.filter(l => l.type === "production").reduce((s, l) => s + (l.quantity || 0), 0), totalScrap: todayLogs.filter(l => l.type === "scrap").reduce((s, l) => s + (l.quantity || 0), 0), issuesReported: todayLogs.filter(l => l.type === "issue").length, logCount: todayLogs.length, totalDowntimeMinutes: todayDowntime.reduce((s, d) => s + (d.durationMinutes || 0), 0), openDowntime: todayDowntime.filter(d => !d.isResolved).length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
