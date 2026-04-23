import { Router } from "express";
import WorkCenter from "../models/WorkCenter.js";
import BillOfMaterials from "../models/BillOfMaterials.js";
import ManufacturingOrder from "../models/ManufacturingOrder.js";
import WorkOrder from "../models/WorkOrder.js";
import StockLevel from "../models/StockLevel.js";
import StockMovement from "../models/StockMovement.js";
import User from "../models/User.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();


// ─────────────────────────────────────────────
// WORK CENTERS (Convex → list, create, update)
// ─────────────────────────────────────────────

router.get("/work-centers", async (req, res) => {
  try {
    const data = await WorkCenter.find();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/work-centers", authenticate, async (req, res) => {
  try {
    const wc = await WorkCenter.create({
      ...req.body,
      isActive: true,
    });
    res.status(201).json(wc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/work-centers/:id", authenticate, async (req, res) => {
  try {
    const wc = await WorkCenter.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    res.json(wc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─────────────────────────────────────────────
// BILL OF MATERIALS (Convex → list, get, create)
// ─────────────────────────────────────────────

router.get("/boms", async (req, res) => {
  try {
    const boms = await BillOfMaterials.find().populate("productId");
    res.json(boms.map(b => ({
      ...b.toObject(),
      product: b.productId,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/boms/:id", async (req, res) => {
  try {
    const bom = await BillOfMaterials.findById(req.params.id)
      .populate("productId");

    if (!bom) return res.status(404).json({ error: "Not found" });

    res.json({
      ...bom.toObject(),
      product: bom.productId,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/boms/product/:productId", async (req, res) => {
  try {
    const bom = await BillOfMaterials.findOne({
      productId: req.params.productId,
      isActive: true,
    });

    res.json(bom);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/boms", authenticate, async (req, res) => {
  try {
    // deactivate old BOMs
    await BillOfMaterials.updateMany(
      { productId: req.body.productId },
      { isActive: false }
    );

    const bom = await BillOfMaterials.create({
      ...req.body,
      isActive: true,
    });

    res.status(201).json(bom);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─────────────────────────────────────────────
// MANUFACTURING ORDERS (Convex → list, get, create, update)
// ─────────────────────────────────────────────

router.get("/orders", async (req, res) => {
  try {
    const filter = req.query.status ? { status: req.query.status } : {};

    const orders = await ManufacturingOrder.find(filter)
      .populate("productId")
      .sort({ _id: -1 })
      .limit(100);

    const result = await Promise.all(
      orders.map(async (o) => {
        const workOrders = await WorkOrder.find({ moId: o._id });

        return {
          ...o.toObject(),
          product: o.productId,
          workOrderCount: workOrders.length,
          completedWOCount: workOrders.filter(
            (w) => w.status === "completed"
          ).length,
        };
      })
    );

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/orders/:id", async (req, res) => {
  try {
    const mo = await ManufacturingOrder.findById(req.params.id)
      .populate("productId");

    if (!mo) return res.status(404).json({ error: "Not found" });

    const workOrders = await WorkOrder.find({ moId: mo._id })
      .populate("workCenterId");

    const bom = mo.bomId
      ? await BillOfMaterials.findById(mo.bomId)
      : null;

    res.json({
      ...mo.toObject(),
      product: mo.productId,
      workOrders: workOrders.map(wo => ({
        ...wo.toObject(),
        workCenter: wo.workCenterId,
      })),
      bom,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/orders", authenticate, async (req, res) => {
  try {
    // Find the highest existing MO number to avoid duplicates
    const lastMO = await ManufacturingOrder.findOne({ moNumber: { $regex: /^MO-/ } }).sort({ moNumber: -1 }).limit(1);
    let nextNum = 1;
    if (lastMO && lastMO.moNumber) {
      const match = lastMO.moNumber.match(/MO-(\d+)/);
      if (match) nextNum = parseInt(match[1]) + 1;
    }
    const moNumber = `MO-${String(nextNum).padStart(5, "0")}`;

    const mo = await ManufacturingOrder.create({
      ...req.body,
      moNumber,
      status: "draft",
      producedQuantity: 0,
      scrapQuantity: 0,
    });

    // create work orders from BOM
    if (req.body.bomId) {
      const bom = await BillOfMaterials.findById(req.body.bomId);

      if (bom) {
        for (const op of bom.operations) {
          if (op.workCenterId) {
            await WorkOrder.create({
              moId: mo._id,
              workCenterId: op.workCenterId,
              operationName: op.name,
              sequence: op.sequence,
              plannedDuration: op.duration,
              status: "pending",
            });
          }
        }
      }
    }

    res.status(201).json(mo);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─────────────────────────────────────────────
// UPDATE MO STATUS (MOST IMPORTANT LOGIC)
// ─────────────────────────────────────────────

router.put("/orders/:id/status", authenticate, async (req, res) => {
  try {
    const mo = await ManufacturingOrder.findById(req.params.id);
    if (!mo) return res.status(404).json({ error: "Not found" });

    const updates = { status: req.body.status };

    if (req.body.status === "in_progress") {
      updates.actualStart = new Date().toISOString();
    }

    if (req.body.status === "completed") {
      updates.actualEnd = new Date().toISOString();

      const produced = req.body.producedQuantity ?? mo.quantity;
      const scrap = req.body.scrapQuantity ?? 0;

      updates.producedQuantity = produced;
      updates.scrapQuantity = scrap;

      // consume materials
      if (mo.bomId) {
        const bom = await BillOfMaterials.findById(mo.bomId);

        if (bom) {
          for (const comp of bom.components) {
            const stdQty =
              (comp.quantity / bom.yieldQuantity) * mo.quantity;

            const actual = req.body.actualConsumption?.find(
              (a) => a.productId === comp.productId.toString()
            );

            const consumeQty = actual?.quantity ?? stdQty;

            const stock = await StockLevel.findOne({
              productId: comp.productId,
              warehouseId: mo.warehouseId,
            });

            if (stock) {
              stock.quantity = Math.max(
                0,
                stock.quantity - consumeQty
              );
              await stock.save();
            }
          }
        }
      }

      // add finished goods
      const existing = await StockLevel.findOne({
        productId: mo.productId,
        warehouseId: mo.warehouseId,
      });

      if (existing) {
        existing.quantity += produced;
        await existing.save();
      } else {
        await StockLevel.create({
          productId: mo.productId,
          warehouseId: mo.warehouseId,
          quantity: produced,
          reservedQuantity: 0,
        });
      }

      // stock movement
      await StockMovement.create({
        productId: mo.productId,
        warehouseId: mo.warehouseId,
        type: "in",
        quantity: produced,
        reference: mo.moNumber,
        referenceType: "manufacturing",
        date: new Date().toISOString(),
        notes: `Production from ${mo.moNumber}`,
        createdBy: req.user?._id,
      });
    }

    await ManufacturingOrder.findByIdAndUpdate(req.params.id, updates);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─────────────────────────────────────────────
// WORK ORDERS
// ─────────────────────────────────────────────

router.get("/work-orders", async (req, res) => {
  try {
    const filter = {};
    if (req.query.moId) filter.moId = req.query.moId;
    if (req.query.status) filter.status = req.query.status;

    const orders = await WorkOrder.find(filter)
      .populate("workCenterId")
      .populate("moId");

    res.json(
      orders.map((wo) => ({
        ...wo.toObject(),
        workCenter: wo.workCenterId,
        mo: wo.moId,
      }))
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─────────────────────────────────────────────
// STATS
// ─────────────────────────────────────────────

router.get("/stats", async (req, res) => {
  try {
    const allMOs = await ManufacturingOrder.find();
    const allWOs = await WorkOrder.find();

    const completed = allMOs.filter(m => m.status === "completed");

    const totalProduced = completed.reduce(
      (s, m) => s + (m.producedQuantity || 0),
      0
    );

    const totalPlanned = completed.reduce(
      (s, m) => s + m.quantity,
      0
    );

    res.json({
      draft: allMOs.filter(m => m.status === "draft").length,
      confirmed: allMOs.filter(m => m.status === "confirmed").length,
      inProgress: allMOs.filter(m => m.status === "in_progress").length,
      completed: completed.length,
      cancelled: allMOs.filter(m => m.status === "cancelled").length,
      totalProduced,
      efficiency:
        totalPlanned > 0
          ? Math.round((totalProduced / totalPlanned) * 100)
          : 0,
      pendingWOs: allWOs.filter(w => w.status === "pending").length,
      inProgressWOs: allWOs.filter(
        w => w.status === "in_progress"
      ).length,
      totalMOs: allMOs.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─────────────────────────────────────────────
// MATERIAL REQUIREMENTS
// ─────────────────────────────────────────────

router.get("/orders/:moId/materials", async (req, res) => {
  try {
    const mo = await ManufacturingOrder.findById(req.params.moId);

    if (!mo || !mo.bomId) return res.json([]);

    const bom = await BillOfMaterials.findById(mo.bomId);

    if (!bom) return res.json([]);

    const result = await Promise.all(
      bom.components.map(async (comp) => {
        const required =
          (comp.quantity / bom.yieldQuantity) * mo.quantity;

        const stock = await StockLevel.findOne({
          productId: comp.productId,
          warehouseId: mo.warehouseId,
        });

        const available = stock?.quantity ?? 0;

        return {
          componentId: comp.productId,
          componentName: comp.productName,
          required,
          unitOfMeasure: comp.unitOfMeasure,
          available,
          shortage: Math.max(0, required - available),
          sufficient: available >= required,
        };
      })
    );

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


export default router;