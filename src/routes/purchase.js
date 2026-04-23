import { Router } from "express";
import Vendor from "../models/Vendor.js";
import RFQ from "../models/RFQ.js";
import PurchaseOrder from "../models/PurchaseOrder.js";
import Product from "../models/Product.js";
import StockLevel from "../models/StockLevel.js";
import StockMovement from "../models/StockMovement.js";
import { authenticate } from "../middleware/auth.js";
import { upload } from "../middleware/upload.js";
import { parseCSV } from "../utils/csvReader.js";
import { parseExcel } from "../utils/excelReader.js";
import { generateInvoice } from "../services/invoiceService.js";

const router = Router();

// ── Vendors ─────────────────
router.get("/vendors", async (req, res) => {
  try {
    let vendors = await Vendor.find().sort({ name: 1 }).limit(500);
    if (req.query.search) { const q = req.query.search.toLowerCase(); vendors = vendors.filter(v => v.name.toLowerCase().includes(q) || v.email?.toLowerCase().includes(q)); }
    res.json(vendors);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/vendors/:id", async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) return res.status(404).json({ error: "Not found" });
    const pos = await PurchaseOrder.find({ vendorId: req.params.id }).sort({ _id: -1 }).limit(20);
    const totalSpend = pos.filter(o => o.status !== "cancelled").reduce((s, o) => s + o.total, 0);
    res.json({ ...vendor.toObject(), recentOrders: pos, totalSpend });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/vendors", authenticate, async (req, res) => {
  try { res.status(201).json(await Vendor.create({ ...req.body, isActive: true, rating: req.body.rating || 3 })); } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put("/vendors/:id", authenticate, async (req, res) => {
  try { res.json(await Vendor.findByIdAndUpdate(req.params.id, req.body, { new: true })); } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── RFQs ─────────────────
router.get("/rfqs", async (req, res) => {
  try {
    const filter = req.query.status ? { status: req.query.status } : {};
    const rfqs = await RFQ.find(filter).populate("vendorId").sort({ _id: -1 }).limit(100);
    res.json(rfqs.map(r => ({ ...r.toObject(), vendor: r.vendorId, vendorId: r.vendorId?._id })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/rfqs", authenticate, async (req, res) => {
  try {
    const lastRFQ = await RFQ.findOne({ rfqNumber: { $regex: /^RFQ-/ } }).sort({ rfqNumber: -1 }).limit(1);
    let nextNum = 1;
    if (lastRFQ && lastRFQ.rfqNumber) {
      const match = lastRFQ.rfqNumber.match(/RFQ-(\d+)/);
      if (match) nextNum = parseInt(match[1]) + 1;
    }
    const rfqNumber = `RFQ-${String(nextNum).padStart(5, "0")}`;
    res.status(201).json(await RFQ.create({ ...req.body, rfqNumber, status: "draft" }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put("/rfqs/:id/status", authenticate, async (req, res) => {
  try { await RFQ.findByIdAndUpdate(req.params.id, { status: req.body.status }); res.json({ success: true }); } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/rfqs/:id/convert", authenticate, async (req, res) => {
  try {
    const rfq = await RFQ.findById(req.params.id);
    if (!rfq) return res.status(404).json({ error: "RFQ not found" });
    const { items, deliveryDate, notes } = req.body;
    const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
    const taxAmount = items.reduce((s, i) => s + i.quantity * i.unitPrice * (i.taxRate / 100), 0);
    const total = subtotal + taxAmount;
    const lastPO = await PurchaseOrder.findOne({ poNumber: { $regex: /^PO-/ } }).sort({ poNumber: -1 }).limit(1);
    let nextNum = 1;
    if (lastPO && lastPO.poNumber) {
      const match = lastPO.poNumber.match(/PO-(\d+)/);
      if (match) nextNum = parseInt(match[1]) + 1;
    }
    const poNumber = `PO-${String(nextNum).padStart(5, "0")}`;
    const po = await PurchaseOrder.create({ poNumber, vendorId: rfq.vendorId, rfqId: rfq._id, date: new Date().toISOString().slice(0, 10), deliveryDate, items: items.map(i => ({ ...i, receivedQuantity: 0 })), subtotal, taxAmount, total, status: "draft", notes });
    await RFQ.findByIdAndUpdate(req.params.id, { status: "converted" });
    res.status(201).json(po);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Purchase Orders ─────────────────
router.get("/orders", async (req, res) => {
  try {
    const filter = req.query.status ? { status: req.query.status } : {};
    const orders = await PurchaseOrder.find(filter).populate("vendorId").sort({ _id: -1 }).limit(200);
    res.json(orders.map(o => ({ ...o.toObject(), vendor: o.vendorId, vendorId: o.vendorId?._id })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/orders/:id", async (req, res) => {
  try {
    const po = await PurchaseOrder.findById(req.params.id).populate("vendorId");
    if (!po) return res.status(404).json({ error: "Not found" });
    res.json({ ...po.toObject(), vendor: po.vendorId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/orders", authenticate, async (req, res) => {
  try {
    const { items, ...rest } = req.body;
    const snapshottedItems = [];

    for (const item of items || []) {
      const product = await Product.findById(item.productId);
      if (product) {
        snapshottedItems.push({
          productId: item.productId,
          productName: product.name,
          sku: product.sku,
          quantity: item.quantity,
          receivedQuantity: 0,
          unitPrice: product.costPrice,
          taxRate: product.taxRate,
          amount: item.quantity * product.costPrice * (1 + product.taxRate / 100)
        });
      } else {
        snapshottedItems.push(item);
      }
    }

    const lastPO = await PurchaseOrder.findOne({ poNumber: { $regex: /^PO-/ } }).sort({ poNumber: -1 }).limit(1);
    let nextNum = 1;
    if (lastPO && lastPO.poNumber) {
      const match = lastPO.poNumber.match(/PO-(\d+)/);
      if (match) nextNum = parseInt(match[1]) + 1;
    }
    const poNumber = `PO-${String(nextNum).padStart(5, "0")}`;
    const po = await PurchaseOrder.create({ ...rest, items: snapshottedItems, poNumber, status: "draft" });
    res.status(201).json(po);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put("/orders/:id/status", authenticate, async (req, res) => {
  try {
    const po = await PurchaseOrder.findById(req.params.id);
    if (!po) return res.status(404).json({ error: "PO not found" });

    const Warehouse = (await import("../models/Warehouse.js")).default;
    const StockLevel = (await import("../models/StockLevel.js")).default;
    const StockMovement = (await import("../models/StockMovement.js")).default;

    const oldStatus = po.status;
    const newStatus = req.body.status;
    const update = { status: newStatus };
    if (newStatus === "approved" && req.user) update.approvedBy = req.user._id;

    if (oldStatus !== newStatus) {
      let warehouses = await Warehouse.find().limit(1);
      if (warehouses.length === 0) {
        const defaultWH = await Warehouse.create({ name: "Main Warehouse", code: "WH-001", isActive: true });
        warehouses = [defaultWH];
      }
      const defaultWarehouseId = warehouses[0]._id;

      if (req.user) {
        // Handle manual mark as 'received'
        if (newStatus === "received" && oldStatus !== "received") {
          const updatedItems = po.items.map(item => ({ 
            ...item.toObject(), 
            receivedQuantity: item.quantity 
          }));
          update.items = updatedItems;

          for (const item of po.items) {
            const currentReceived = item.receivedQuantity || 0;
            const remaining = Math.max(0, item.quantity - currentReceived);
            
            if (remaining <= 0) continue;
            
            // Find if this product exists in any warehouse, prefer the first one found or default
            let stock = await StockLevel.findOne({ productId: item.productId });
            let warehouseId = stock ? stock.warehouseId : defaultWarehouseId;

            if (stock) { 
              stock.quantity += remaining; 
              await stock.save(); 
            } else {
              stock = await StockLevel.create({ productId: item.productId, warehouseId, quantity: remaining, reservedQuantity: 0 });
            }
            
            await StockMovement.create({ 
              productId: item.productId, 
              warehouseId, 
              type: "in", 
              quantity: remaining, 
              reference: po.poNumber, 
              referenceType: "purchase", 
              date: new Date().toISOString().slice(0, 10), 
              createdBy: req.user._id 
            });
          }
        }
        // Handle cancellation of received goods (Reversal)
        else if (newStatus === "cancelled" && oldStatus === "received") {
          for (const item of po.items) {
            if (item.receivedQuantity <= 0) continue;
            
            let stock = await StockLevel.findOne({ productId: item.productId });
            if (stock) { 
              stock.quantity = Math.max(0, stock.quantity - item.receivedQuantity); 
              await stock.save(); 
              await StockMovement.create({ 
                productId: item.productId, 
                warehouseId: stock.warehouseId, 
                type: "out", 
                quantity: item.receivedQuantity, 
                reference: po.poNumber, 
                referenceType: "purchase", 
                notes: "PO Cancellation Reversal", 
                date: new Date().toISOString().slice(0, 10), 
                createdBy: req.user._id 
              });
            }
          }
        }
      }
    }

    await PurchaseOrder.findByIdAndUpdate(req.params.id, update);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PDF Invoice ─────────────────
router.get("/orders/:id/pdf", async (req, res) => {
  try {
    const po = await PurchaseOrder.findById(req.params.id).populate("vendorId");
    if (!po) return res.status(404).json({ error: "Order not found" });

    const invoiceData = {
      invoiceNumber: po.poNumber,
      customerName: po.vendorId?.name || "Generic Vendor", // Labeling as customer for the service
      date: po.date,
      total: po.total,
      subtotal: po.subtotal,
      taxAmount: po.taxAmount,
      items: po.items || [],
    };

    const pdf = await generateInvoice({ ...invoiceData, title: "PURCHASE ORDER" });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=po-${po.poNumber}.pdf`);
    res.send(pdf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Import ─────────────────
router.post("/orders/import", authenticate, upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "No file uploaded" });

    let data = [];
    if (file.mimetype.includes("csv") || file.originalname.endsWith(".csv")) {
      data = await parseCSV(file.buffer);
    } else {
      data = parseExcel(file.buffer);
    }

    const lastPO = await PurchaseOrder.findOne({ poNumber: { $regex: /^PO-/ } }).sort({ poNumber: -1 }).limit(1);
    let nextNum = 1;
    if (lastPO && lastPO.poNumber) {
      const match = lastPO.poNumber.match(/PO-(\d+)/);
      if (match) nextNum = parseInt(match[1]) + 1;
    }

    const formatted = [];
    for (const row of data) {
      const findVal = (keys) => {
        const foundKey = Object.keys(row).find(k => keys.includes(k.toLowerCase().trim()));
        return foundKey ? row[foundKey] : undefined;
      };

      const vendorName = findVal(["vendor", "supplier", "vendor name"]);
      if (!vendorName) continue;

      let vendor = await Vendor.findOne({ name: new RegExp(`^${vendorName}$`, "i") });
      if (!vendor) {
        vendor = await Vendor.create({ name: vendorName, isActive: true, rating: 3 });
      }

      const poNumber = `PO-${String(nextNum++).padStart(5, "0")}`;
      formatted.push({
        poNumber,
        vendorId: vendor._id,
        date: findVal(["date", "order date", "po date"]) || new Date().toISOString().slice(0, 10),
        total: Number(findVal(["total", "amount", "value"])) || 0,
        subtotal: Number(findVal(["subtotal"])) || Number(findVal(["total", "amount"])) || 0,
        taxAmount: Number(findVal(["tax", "gst"])) || 0,
        status: "draft",
        notes: "Imported via CSV/Excel"
      });
    }

    const result = await PurchaseOrder.insertMany(formatted);
    res.json({ success: true, count: result.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/orders/:id/receive", authenticate, async (req, res) => {
  try {
    const po = await PurchaseOrder.findById(req.params.id);
    if (!po) return res.status(404).json({ error: "PO not found" });
    const { receivedItems } = req.body;

    const Warehouse = (await import("../models/Warehouse.js")).default;
    let warehouses = await Warehouse.find().limit(1);
    if (warehouses.length === 0) {
      const defaultWH = await Warehouse.create({ name: "Main Warehouse", code: "WH-001", isActive: true });
      warehouses = [defaultWH];
    }
    const defaultWarehouseId = warehouses[0]._id;

    const updatedItems = po.items.map(item => {
      const recv = receivedItems.find(r => r.productId === item.productId?.toString());
      return { ...item.toObject(), receivedQuantity: (item.receivedQuantity || 0) + (recv?.receivedQuantity || 0) };
    });
    const allReceived = updatedItems.every(i => (i.receivedQuantity || 0) >= i.quantity);
    const anyReceived = updatedItems.some(i => (i.receivedQuantity || 0) > 0);
    await PurchaseOrder.findByIdAndUpdate(req.params.id, { items: updatedItems, status: allReceived ? "received" : anyReceived ? "partial" : po.status });

    for (const recv of receivedItems) {
      if (recv.receivedQuantity <= 0) continue;

      // Find existing stock record for this product across any warehouse
      let stock = await StockLevel.findOne({ productId: recv.productId });
      const warehouseId = stock ? stock.warehouseId : defaultWarehouseId;

      if (stock) {
        stock.quantity += recv.receivedQuantity;
        await stock.save();
      } else {
        await StockLevel.create({ productId: recv.productId, warehouseId, quantity: recv.receivedQuantity, reservedQuantity: 0 });
      }
      await StockMovement.create({ productId: recv.productId, warehouseId, type: "in", quantity: recv.receivedQuantity, reference: po.poNumber, referenceType: "purchase", date: new Date().toISOString().slice(0, 10), createdBy: req.user._id });
    }

    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Stats ─────────────────
router.get("/stats", async (req, res) => {
  try {
    const orders = await PurchaseOrder.find();
    const totalSpend = orders.filter(o => o.status !== "cancelled").reduce((s, o) => s + o.total, 0);
    const vendors = await Vendor.find();
    const now = new Date();
    const monthly = Array.from({ length: 6 }, (_, idx) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - idx), 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleString("default", { month: "short" });
      const spend = orders.filter(o => o.date.startsWith(key) && o.status !== "cancelled").reduce((s, o) => s + o.total, 0);
      return { month: label, spend, count: orders.filter(o => o.date.startsWith(key)).length };
    });
    res.json({ totalSpend, pending: orders.filter(o => ["draft", "approved", "sent"].includes(o.status)).length, received: orders.filter(o => o.status === "received").length, totalOrders: orders.length, totalVendors: vendors.length, monthly });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
