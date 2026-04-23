import { Router } from "express";
import Product from "../models/Product.js";
import Warehouse from "../models/Warehouse.js";
import StockLevel from "../models/StockLevel.js";
import StockMovement from "../models/StockMovement.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

// ── Products ─────────────────
router.get("/products", async (req, res) => {
  try {
    const filter = {};
    if (req.query.category) filter.category = req.query.category;
    let products = await Product.find(filter);
    if (req.query.search) { const q = req.query.search.toLowerCase(); products = products.filter(p => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)); }
    res.json(products);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/products/:id", async (req, res) => { try { res.json(await Product.findById(req.params.id)); } catch (err) { res.status(500).json({ error: err.message }); } });

router.post("/products", authenticate, async (req, res) => {
  try {
    // Find the highest existing SKU number to avoid duplicates
    const lastProduct = await Product.findOne({ sku: { $regex: /^SKU-/ } }).sort({ sku: -1 }).limit(1);
    let nextNum = 1;
    if (lastProduct && lastProduct.sku) {
      const match = lastProduct.sku.match(/SKU-(\d+)/);
      if (match) nextNum = parseInt(match[1]) + 1;
    }
    const sku = `SKU-${String(nextNum).padStart(5, "0")}`;
    res.status(201).json(await Product.create({ ...req.body, sku, isActive: true }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put("/products/:id", authenticate, async (req, res) => {
  try { res.json(await Product.findByIdAndUpdate(req.params.id, req.body, { new: true })); } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Warehouses ─────────────────
router.get("/warehouses", async (req, res) => {
  try {
    const warehouses = await Warehouse.find();
    // Aggregate stock per warehouse
    const stockAgg = await StockLevel.aggregate([
      { $match: { quantity: { $gt: 0 } } },
      { $group: { _id: "$warehouseId", totalUnits: { $sum: "$quantity" }, totalProducts: { $sum: 1 } } },
    ]);
    const stockMap = {};
    for (const s of stockAgg) {
      if (s._id) {
        stockMap[s._id.toString()] = { totalUnits: s.totalUnits, totalProducts: s.totalProducts };
      }
    }
    res.json(warehouses.map(w => {
      const warehouseIdStr = w._id ? w._id.toString() : "";
      const agg = stockMap[warehouseIdStr] || { totalUnits: 0, totalProducts: 0 };
      return { ...w.toObject(), totalProducts: agg.totalProducts, totalUnits: agg.totalUnits };
    }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.post("/warehouses", authenticate, async (req, res) => { try { res.status(201).json(await Warehouse.create({ ...req.body, isActive: true })); } catch (err) { res.status(500).json({ error: err.message }); } });

// ── Stock Levels ─────────────────
router.get("/stock", async (req, res) => {
  try {
    const filter = req.query.warehouseId ? { warehouseId: req.query.warehouseId } : {};
    const levels = await StockLevel.find(filter).populate("productId").populate("warehouseId");
    res.json(levels.map(l => ({ ...l.toObject(), product: l.productId, warehouse: l.warehouseId })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/stock/product/:productId", async (req, res) => {
  try { res.json(await StockLevel.find({ productId: req.params.productId })); } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Adjust Stock ─────────────────
router.post("/adjust", authenticate, async (req, res) => {
  try {
    const { productId, warehouseId, quantity, type, reference, referenceType, notes, batchNumber } = req.body;
    const existing = await StockLevel.findOne({ productId, warehouseId });
    if (existing) {
      const newQty = type === "out" || type === "scrap" ? existing.quantity - quantity : existing.quantity + quantity;
      existing.quantity = Math.max(0, newQty);
      await existing.save();
    } else {
      await StockLevel.create({ productId, warehouseId, quantity: type === "out" || type === "scrap" ? 0 : quantity, reservedQuantity: 0, batchNumber });
    }
    await StockMovement.create({ productId, warehouseId, type, quantity, reference, referenceType, date: new Date().toISOString(), notes, createdBy: req.user._id });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Transfer Stock ─────────────────
router.post("/transfer", authenticate, async (req, res) => {
  try {
    const { productId, fromWarehouseId, toWarehouseId, quantity, notes } = req.body;
    const src = await StockLevel.findOne({ productId, warehouseId: fromWarehouseId });
    if (!src || src.quantity < quantity) return res.status(400).json({ error: "Insufficient stock" });
    src.quantity -= quantity; await src.save();
    const dst = await StockLevel.findOne({ productId, warehouseId: toWarehouseId });
    if (dst) { dst.quantity += quantity; await dst.save(); }
    else await StockLevel.create({ productId, warehouseId: toWarehouseId, quantity, reservedQuantity: 0 });
    const ref = `TRF-${Date.now()}`;
    await StockMovement.create({ productId, warehouseId: fromWarehouseId, type: "transfer", quantity, reference: ref, referenceType: "transfer", date: new Date().toISOString(), notes, createdBy: req.user._id });
    await StockMovement.create({ productId, warehouseId: toWarehouseId, type: "in", quantity, reference: ref, referenceType: "transfer", date: new Date().toISOString(), notes, createdBy: req.user._id });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Stock Movements ─────────────────
router.get("/movements", async (req, res) => {
  try {
    const filter = {};
    if (req.query.productId) filter.productId = req.query.productId;
    let movements = await StockMovement.find(filter).populate("productId").populate("warehouseId").sort({ _id: -1 }).limit(100);
    if (req.query.warehouseId) movements = movements.filter(m => m.warehouseId?._id?.toString() === req.query.warehouseId);
    res.json(movements.map(m => ({ ...m.toObject(), productName: m.productId?.name || "Unknown", warehouseName: m.warehouseId?.name || "Unknown" })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Low Stock Alerts ─────────────────
router.get("/low-stock", async (req, res) => {
  try {
    const products = await Product.find({ isActive: true });
    const stockLevels = await StockLevel.find();
    const alerts = [];
    for (const product of products) {
      if (!product.reorderPoint) continue;
      const totalStock = stockLevels
        .filter(s => s.productId?.toString() === product._id.toString())
        .reduce((sum, s) => sum + (s.quantity || 0), 0);
      if (totalStock <= product.reorderPoint) alerts.push({ product, totalStock, reorderPoint: product.reorderPoint });
    }
    res.json(alerts);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Inventory Stats ─────────────────
router.get("/stats", async (req, res) => {
  try {
    const products = await Product.find();
    const stockLevels = await StockLevel.find();
    const warehouses = await Warehouse.find();
    let totalStockValue = 0, totalUnits = 0, lowStockCount = 0;
    for (const product of products.filter(p => p.isActive)) {
      const qty = stockLevels
        .filter(s => s.productId?.toString() === product._id.toString())
        .reduce((sum, s) => sum + (s.quantity || 0), 0);
      totalStockValue += qty * (product.costPrice || 0);
      totalUnits += qty;
      if (product.reorderPoint && qty <= product.reorderPoint) lowStockCount++;
    }
    res.json({ totalProducts: products.filter(p => p.isActive).length, totalWarehouses: warehouses.filter(w => w.isActive).length, totalStockValue, totalUnits, lowStockCount });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Valuation ─────────────────
router.get("/valuation", async (req, res) => {
  try {
    const products = await Product.find({ isActive: true });
    const stockLevels = await StockLevel.find();
    const result = products.map(p => {
      const qty = stockLevels
        .filter(s => s.productId?.toString() === p._id.toString())
        .reduce((sum, s) => sum + (s.quantity || 0), 0);
      const costPrice     = p.costPrice     || 0;
      const sellingPrice  = p.sellingPrice  || 0;
      return {
        productId: p._id,
        sku: p.sku,
        name: p.name,
        category: p.category || "Uncategorised",
        unitOfMeasure: p.unitOfMeasure,
        quantity: qty,
        costPrice,
        sellingPrice,
        stockValue:  qty * costPrice,
        retailValue: qty * sellingPrice,
        reorderPoint: p.reorderPoint,
        isLow: p.reorderPoint !== undefined && qty <= p.reorderPoint,
      };
    }).sort((a, b) => b.stockValue - a.stockValue);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
