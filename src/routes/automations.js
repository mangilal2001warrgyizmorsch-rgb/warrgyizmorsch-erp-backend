import { Router } from "express";
import AutomationRule from "../models/AutomationRule.js";
import AutomationLog from "../models/AutomationLog.js";
import Notification from "../models/Notification.js";
import User from "../models/User.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

router.get("/rules", async (req, res) => { try { res.json(await AutomationRule.find().sort({ _id: -1 }).limit(100)); } catch (err) { res.status(500).json({ error: err.message }); } });
router.get("/rules/:id", async (req, res) => { try { res.json(await AutomationRule.findById(req.params.id)); } catch (err) { res.status(500).json({ error: err.message }); } });

router.post("/rules", authenticate, async (req, res) => {
  try { res.status(201).json(await AutomationRule.create({ ...req.body, isActive: true, runCount: 0, createdAt: new Date().toISOString() })); } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put("/rules/:id", authenticate, async (req, res) => { try { res.json(await AutomationRule.findByIdAndUpdate(req.params.id, req.body, { new: true })); } catch (err) { res.status(500).json({ error: err.message }); } });
router.delete("/rules/:id", authenticate, async (req, res) => { try { await AutomationRule.findByIdAndDelete(req.params.id); res.json({ success: true }); } catch (err) { res.status(500).json({ error: err.message }); } });

router.put("/rules/:id/toggle", authenticate, async (req, res) => {
  try { await AutomationRule.findByIdAndUpdate(req.params.id, { isActive: req.body.isActive }); res.json({ success: true }); } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/logs", async (req, res) => {
  try {
    const filter = req.query.ruleId ? { ruleId: req.query.ruleId } : {};
    res.json(await AutomationLog.find(filter).sort({ _id: -1 }).limit(100));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/stats", async (req, res) => {
  try {
    const rules = await AutomationRule.find().sort({ _id: -1 }).limit(200);
    const logs = await AutomationLog.find().sort({ _id: -1 }).limit(200);
    res.json({ totalRules: rules.length, activeRules: rules.filter(r => r.isActive).length, totalRuns: logs.length, successRuns: logs.filter(l => l.status === "success").length, failedRuns: logs.filter(l => l.status === "failed").length, lastRunAt: logs[0]?.triggeredAt });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/rules/:id/trigger", authenticate, async (req, res) => {
  try {
    const rule = await AutomationRule.findById(req.params.id);
    if (!rule) return res.status(404).json({ error: "Rule not found" });
    // Execute actions
    for (const action of rule.actions) {
      if (action.type === "notify") {
        const admins = await User.find().limit(5);
        for (const user of admins) {
          await Notification.create({ userId: user._id, title: action.config?.get("title") || `Automation: ${rule.name}`, message: action.config?.get("message") || `Manual trigger`, type: action.config?.get("notificationType") || "info", isRead: false });
        }
      }
    }
    rule.runCount = (rule.runCount || 0) + 1;
    rule.lastRunAt = new Date().toISOString();
    await rule.save();
    await AutomationLog.create({ ruleId: rule._id, ruleName: rule.name, status: "success", details: `Manual trigger: ${rule.actions.length} action(s)`, triggeredAt: new Date().toISOString() });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
