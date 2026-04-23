import { Router } from "express";
import DeliveryOrder from "../models/DeliveryOrder.js";
import SalesOrder from "../models/SalesOrder.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

router.get("/orders", async (req, res) => {
  try {
    const filter = req.query.status ? { status: req.query.status } : {};
    const orders = await DeliveryOrder.find(filter).populate("customerId").sort({ _id: -1 }).limit(100);
    res.json(orders.map(o => ({ ...o.toObject(), customer: o.customerId })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/orders/:id", async (req, res) => {
  try {
    const o = await DeliveryOrder.findById(req.params.id).populate("customerId").populate("salesOrderId");
    res.json(o ? { ...o.toObject(), customer: o.customerId, salesOrder: o.salesOrderId } : null);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/stats", async (req, res) => {
  try {
    const all = await DeliveryOrder.find().sort({ _id: -1 }).limit(500);
    res.json({ total: all.length, draft: all.filter(o => o.status === "draft").length, picking: all.filter(o => o.status === "picking").length, packed: all.filter(o => o.status === "packed").length, dispatched: all.filter(o => o.status === "dispatched").length, delivered: all.filter(o => o.status === "delivered").length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/orders", authenticate, async (req, res) => {
  try {
    const lastDO = await DeliveryOrder.findOne({ doNumber: { $regex: /^DO-/ } }).sort({ doNumber: -1 }).limit(1);
    let nextNum = 1;
    if (lastDO && lastDO.doNumber) {
      const match = lastDO.doNumber.match(/^DO-(\d+)/);
      if (match) nextNum = parseInt(match[1]) + 1;
    }
    const doNumber = `DO-${String(nextNum).padStart(5, "0")}`;
    const items = req.body.items.map((item, idx) => ({ ...item, barcode: item.barcode || `WM-${doNumber}-${String(idx + 1).padStart(3, "0")}` }));
    res.status(201).json(await DeliveryOrder.create({ ...req.body, items, doNumber, status: "draft" }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put("/orders/:id/status", authenticate, async (req, res) => {
  try {
    const patch = { ...req.body };
    if (req.body.status === "dispatched") patch.dispatchDate = new Date().toISOString();
    if (req.body.status === "delivered") patch.deliveryDate = new Date().toISOString();
    await DeliveryOrder.findByIdAndUpdate(req.params.id, patch);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put("/orders/:id/barcode", authenticate, async (req, res) => {
  try {
    const order = await DeliveryOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ error: "Not found" });
    const items = [...order.items];
    if (req.body.itemIndex < items.length) items[req.body.itemIndex] = { ...items[req.body.itemIndex].toObject(), barcode: req.body.barcode };
    await DeliveryOrder.findByIdAndUpdate(req.params.id, { items });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/ready-sales-orders", async (req, res) => {
  try {
    const orders = await SalesOrder.find({ status: "confirmed" }).populate("customerId").limit(50);
    res.json(orders.map(o => ({ ...o.toObject(), customer: o.customerId })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
