import { Router } from "express";
import SalesOrder from "../models/SalesOrder.js";
import Quotation from "../models/Quotation.js";
import Customer from "../models/Customer.js";
import Product from "../models/Product.js";
import { authenticate } from "../middleware/auth.js";
import { upload } from "../middleware/upload.js";
import { parseCSV } from "../utils/csvReader.js";
import { parseExcel } from "../utils/excelReader.js";
import { generateInvoice } from "../services/invoiceService.js";

const router = Router();

// ── Sales Orders ─────────────────
router.get("/orders", async (req, res) => {
  try {
    const filter = req.query.status ? { status: req.query.status } : {};
    const orders = await SalesOrder.find(filter).populate("customerId").sort({ _id: -1 }).limit(200);
    res.json(orders.map(o => ({ ...o.toObject(), customer: o.customerId, customerId: o.customerId?._id })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/orders/:id", async (req, res) => {
  try {
    const order = await SalesOrder.findById(req.params.id).populate("customerId");
    if (!order) return res.status(404).json({ error: "Not found" });
    res.json({ ...order.toObject(), customer: order.customerId });
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
          unitPrice: product.sellingPrice,
          taxRate: product.taxRate,
          amount: item.quantity * product.sellingPrice * (1 + product.taxRate / 100),
          discount: item.discount || 0
        });
      } else {
        snapshottedItems.push(item);
      }
    }

    const lastSO = await SalesOrder.findOne({ orderNumber: { $regex: /^SO-/ } }).sort({ orderNumber: -1 }).limit(1);
    let nextNum = 1;
    if (lastSO && lastSO.orderNumber) {
      const match = lastSO.orderNumber.match(/SO-(\d+)/);
      if (match) nextNum = parseInt(match[1]) + 1;
    }
    const orderNumber = `SO-${String(nextNum).padStart(5, "0")}`;
    const order = await SalesOrder.create({ ...rest, items: snapshottedItems, orderNumber, status: "draft" });
    res.status(201).json(order);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put("/orders/:id", authenticate, async (req, res) => {
  try { res.json(await SalesOrder.findByIdAndUpdate(req.params.id, req.body, { new: true })); } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put("/orders/:id/status", authenticate, async (req, res) => {
  try {
    const order = await SalesOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });

    const Warehouse = (await import("../models/Warehouse.js")).default;
    const StockLevel = (await import("../models/StockLevel.js")).default;
    const StockMovement = (await import("../models/StockMovement.js")).default;

    const oldStatus = order.status;
    const newStatus = req.body.status;
    
    if (oldStatus !== newStatus) {
      // Find a default warehouse ID just in case we need a fallback for new stock levels
      let warehouses = await Warehouse.find().limit(1);
      if (warehouses.length === 0) {
        const defaultWH = await Warehouse.create({ name: "Main Warehouse", code: "WH-001", isActive: true });
        warehouses = [defaultWH];
      }
      const defaultWarehouseId = warehouses[0]._id;

      if (req.user) {
        // Pre-check for confirmed or delivered status: ensure available stock across warehouses
        if ((newStatus === "confirmed" && oldStatus !== "confirmed" && oldStatus !== "delivered") || (newStatus === "delivered" && oldStatus !== "delivered")) {
          for (const item of order.items) {
            if (!item.productId || item.quantity <= 0) continue;

            const allStock = await StockLevel.find({ productId: item.productId });
            const totalQty = allStock.reduce((sum, s) => sum + (s.quantity || 0), 0);
            const product = await Product.findById(item.productId);
            const isConsumableOrRaw = product?.category === "Consumable" || product?.category === "Raw Material";

            if (totalQty < item.quantity) {
              return res.status(400).json({ error: `Insufficient stock for ${item.productName || product?.name || 'Product'}. Required: ${item.quantity}, Available: ${totalQty}` });
            }
          }
        }

        for (const item of order.items) {
          if (!item.productId || item.quantity <= 0) continue;

          const allStock = await StockLevel.find({ productId: item.productId });
          const stockWithQty = allStock.find(s => s.quantity >= item.quantity);
          const stockWithAnyQty = allStock.find(s => s.quantity > 0);
          let stock = stockWithQty || stockWithAnyQty || allStock[0];
          let warehouseId = stock ? stock.warehouseId : defaultWarehouseId;

          if (!stock) {
            stock = await StockLevel.create({ productId: item.productId, warehouseId, quantity: 0, reservedQuantity: 0 });
          }

          if ((newStatus === "delivered" && oldStatus === "confirmed") || (newStatus === "delivered" && oldStatus !== "delivered" && oldStatus !== "confirmed")) {
            if (!stockWithQty) {
              return res.status(400).json({ error: `Insufficient stock in a single warehouse for ${item.productName || 'Product'}. Required: ${item.quantity}` });
            }
          }

          if (newStatus === "confirmed" && oldStatus !== "confirmed" && oldStatus !== "delivered") {
            stock.reservedQuantity += item.quantity;
          } else if ((newStatus === "draft" || newStatus === "cancelled") && oldStatus === "confirmed") {
            stock.reservedQuantity = Math.max(0, stock.reservedQuantity - item.quantity);
          } else if (newStatus === "delivered" && oldStatus === "confirmed") {
            stock.reservedQuantity = Math.max(0, stock.reservedQuantity - item.quantity);
            stock.quantity = Math.max(0, stock.quantity - item.quantity);
            await StockMovement.create({ productId: item.productId, warehouseId, type: "out", quantity: item.quantity, reference: order.orderNumber, referenceType: "sales", date: new Date().toISOString().slice(0, 10), createdBy: req.user._id });
          } else if (newStatus === "delivered" && oldStatus !== "delivered" && oldStatus !== "confirmed") {
            stock.quantity = Math.max(0, stock.quantity - item.quantity);
            await StockMovement.create({ productId: item.productId, warehouseId, type: "out", quantity: item.quantity, reference: order.orderNumber, referenceType: "sales", date: new Date().toISOString().slice(0, 10), createdBy: req.user._id });
          } else if (newStatus === "cancelled" && oldStatus === "delivered") {
            stock.quantity += item.quantity;
            await StockMovement.create({ productId: item.productId, warehouseId, type: "in", quantity: item.quantity, reference: order.orderNumber, referenceType: "sales", notes: "Delivery Reversal", date: new Date().toISOString().slice(0, 10), createdBy: req.user._id });
          }

          await stock.save();
        }
      }
    }
    
    order.status = newStatus;
    await order.save();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete("/orders/:id", authenticate, async (req, res) => {
  try { await SalesOrder.findByIdAndDelete(req.params.id); res.json({ success: true }); } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PDF Invoice ─────────────────
router.get("/orders/:id/pdf", async (req, res) => {
  try {
    const order = await SalesOrder.findById(req.params.id).populate("customerId");
    if (!order) return res.status(404).json({ error: "Order not found" });

    const invoiceData = {
      invoiceNumber: order.orderNumber,
      customerName: order.customerId?.name || "Walk-in Customer",
      date: order.date,
      total: order.total,
      subtotal: order.subtotal,
      taxAmount: order.taxAmount,
      items: order.items || [],
    };

    const pdf = await generateInvoice(invoiceData);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=invoice-${order.orderNumber}.pdf`);
    res.send(pdf);
  } catch (err) {
    console.error("PDF generation failed:", err);
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

    const lastSO = await SalesOrder.findOne({ orderNumber: { $regex: /^SO-/ } }).sort({ orderNumber: -1 }).limit(1);
    let nextNum = 1;
    if (lastSO && lastSO.orderNumber) {
      const match = lastSO.orderNumber.match(/SO-(\d+)/);
      if (match) nextNum = parseInt(match[1]) + 1;
    }

    const formatted = [];
    for (const row of data) {
      const findVal = (keys) => {
        const foundKey = Object.keys(row).find(k => keys.includes(k.toLowerCase().trim()));
        return foundKey ? row[foundKey] : undefined;
      };

      const customerName = findVal(["customer", "client", "customer name"]);
      if (!customerName) continue;

      let customer = await Customer.findOne({ name: new RegExp(`^${customerName}$`, "i") });
      if (!customer) {
        // Create customer if not found
        customer = await Customer.create({ name: customerName, segment: "retail", isActive: true });
      }

      const orderNumber = `SO-${String(nextNum++).padStart(5, "0")}`;
      formatted.push({
        orderNumber,
        customerId: customer._id,
        date: findVal(["date", "order date"]) || new Date().toISOString().slice(0, 10),
        total: Number(findVal(["total", "amount", "order value"])) || 0,
        subtotal: Number(findVal(["subtotal"])) || Number(findVal(["total", "amount", "order value"])) || 0,
        taxAmount: Number(findVal(["tax", "gst"])) || 0,
        status: "draft",
        notes: "Imported via CSV/Excel"
      });
    }

    const result = await SalesOrder.insertMany(formatted);
    res.json({ success: true, count: result.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Stats ─────────────────
router.get("/stats", async (req, res) => {
  try {
    const orders = await SalesOrder.find();
    const total = orders.reduce((s, o) => s + o.total, 0);
    const now = new Date();
    const monthly = Array.from({ length: 6 }, (_, idx) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - idx), 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleString("default", { month: "short" });
      const revenue = orders.filter(o => o.date.startsWith(key) && o.status !== "cancelled").reduce((s, o) => s + o.total, 0);
      const count = orders.filter(o => o.date.startsWith(key)).length;
      return { month: label, revenue, count };
    });
    res.json({ total, confirmed: orders.filter(o => o.status === "confirmed").length, delivered: orders.filter(o => o.status === "delivered").length, draft: orders.filter(o => o.status === "draft").length, inProduction: orders.filter(o => o.status === "in_production").length, monthly, totalOrders: orders.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Quotations ─────────────────
router.get("/quotations", async (req, res) => {
  try {
    const filter = req.query.status ? { status: req.query.status } : {};
    const quotes = await Quotation.find(filter).populate("customerId").sort({ _id: -1 }).limit(200);
    res.json(quotes.map(q => ({ ...q.toObject(), customer: q.customerId, customerId: q.customerId?._id })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/quotations", authenticate, async (req, res) => {
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
          unitPrice: product.sellingPrice,
          taxRate: product.taxRate,
          amount: item.quantity * product.sellingPrice * (1 + product.taxRate / 100),
          discount: item.discount || 0
        });
      } else {
        snapshottedItems.push(item);
      }
    }

    const lastQT = await Quotation.findOne({ quotationNumber: { $regex: /^QT-/ } }).sort({ quotationNumber: -1 }).limit(1);
    let nextNum = 1;
    if (lastQT && lastQT.quotationNumber) {
      const match = lastQT.quotationNumber.match(/QT-(\d+)/);
      if (match) nextNum = parseInt(match[1]) + 1;
    }
    const quotationNumber = `QT-${String(nextNum).padStart(5, "0")}`;
    const quote = await Quotation.create({ ...rest, items: snapshottedItems, quotationNumber, status: "draft" });
    res.status(201).json(quote);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put("/quotations/:id/status", authenticate, async (req, res) => {
  try { await Quotation.findByIdAndUpdate(req.params.id, { status: req.body.status }); res.json({ success: true }); } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/quotations/:id/convert", authenticate, async (req, res) => {
  try {
    const quote = await Quotation.findById(req.params.id);
    if (!quote) return res.status(404).json({ error: "Quotation not found" });
    const lastSO = await SalesOrder.findOne({ orderNumber: { $regex: /^SO-/ } }).sort({ orderNumber: -1 }).limit(1);
    let nextNum = 1;
    if (lastSO && lastSO.orderNumber) {
      const match = lastSO.orderNumber.match(/SO-(\d+)/);
      if (match) nextNum = parseInt(match[1]) + 1;
    }
    const orderNumber = `SO-${String(nextNum).padStart(5, "0")}`;
    const order = await SalesOrder.create({ orderNumber, customerId: quote.customerId, date: new Date().toISOString().slice(0, 10), items: quote.items, subtotal: quote.subtotal, taxAmount: quote.taxAmount, discount: quote.discount, total: quote.total, status: "confirmed", notes: quote.notes });
    await Quotation.findByIdAndUpdate(req.params.id, { status: "accepted" });
    res.status(201).json(order);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Customers ─────────────────
router.get("/customers", async (req, res) => {
  try {
    let customers = await Customer.find().sort({ name: 1 }).limit(500);
    if (req.query.search) {
      const q = req.query.search.toLowerCase();
      customers = customers.filter(c => c.name.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q) || c.phone?.includes(q));
    }
    res.json(customers);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/customers/:id", async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ error: "Not found" });
    const orders = await SalesOrder.find({ customerId: req.params.id }).sort({ _id: -1 }).limit(20);
    const totalSpend = orders.filter(o => o.status !== "cancelled").reduce((s, o) => s + o.total, 0);
    res.json({ ...customer.toObject(), orders, totalSpend });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/customers", authenticate, async (req, res) => {
  try { res.status(201).json(await Customer.create({ ...req.body, isActive: true })); } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put("/customers/:id", authenticate, async (req, res) => {
  try { res.json(await Customer.findByIdAndUpdate(req.params.id, req.body, { new: true })); } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
