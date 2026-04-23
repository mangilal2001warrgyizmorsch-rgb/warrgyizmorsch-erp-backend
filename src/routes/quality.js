import { Router } from "express";
import QualityCheck from "../models/QualityCheck.js";
import InspectionTemplate from "../models/InspectionTemplate.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

router.get("/checks", async (req, res) => {
  try {
    const filter = {};
    if (req.query.type) filter.type = req.query.type;
    if (req.query.result) filter.result = req.query.result;
    if (req.query.productId) filter.productId = req.query.productId;
    const checks = await QualityCheck.find(filter).populate("inspectedBy").sort({ _id: -1 }).limit(100);
    res.json(checks.map(c => ({ ...c.toObject(), inspectorName: c.inspectedBy?.name || "Unknown", passedParams: c.parameters.filter(p => p.passed).length, totalParams: c.parameters.length })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/checks/:id", async (req, res) => {
  try {
    const check = await QualityCheck.findById(req.params.id).populate("inspectedBy").populate("productId");
    res.json(check ? { ...check.toObject(), inspector: check.inspectedBy, product: check.productId } : null);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/checks", authenticate, async (req, res) => {
  try { res.status(201).json(await QualityCheck.create({ ...req.body, inspectedBy: req.user._id })); } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put("/checks/:id", authenticate, async (req, res) => {
  try { res.json(await QualityCheck.findByIdAndUpdate(req.params.id, req.body, { new: true })); } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/stats", async (req, res) => {
  try {
    const checks = await QualityCheck.find().sort({ _id: -1 }).limit(500);
    const total = checks.length, passed = checks.filter(c => c.result === "pass").length, failed = checks.filter(c => c.result === "fail").length, conditional = checks.filter(c => c.result === "conditional").length;
    const productFailMap = {};
    for (const c of checks.filter(c => c.result === "fail")) {
      if (!productFailMap[c.productId]) productFailMap[c.productId] = { name: c.productName, fails: 0 };
      productFailMap[c.productId].fails++;
    }
    res.json({ total, passed, failed, conditional, passRate: total > 0 ? Math.round((passed / total) * 100) : 0, incoming: checks.filter(c => c.type === "incoming").length, inProcess: checks.filter(c => c.type === "in_process").length, final: checks.filter(c => c.type === "final").length, recentFails: checks.filter(c => c.result === "fail").slice(0, 5), topFailProducts: Object.values(productFailMap).sort((a, b) => b.fails - a.fails).slice(0, 5) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/templates", async (req, res) => { try { res.json(await InspectionTemplate.find()); } catch (err) { res.status(500).json({ error: err.message }); } });
router.post("/templates", authenticate, async (req, res) => { try { res.status(201).json(await InspectionTemplate.create({ ...req.body, isActive: true })); } catch (err) { res.status(500).json({ error: err.message }); } });

export default router;
