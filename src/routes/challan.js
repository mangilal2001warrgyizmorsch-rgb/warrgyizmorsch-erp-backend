import { Router } from "express";
import Challan from "../models/Challan.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

// GET all challans (History API with pagination, search, and filters)
router.get("/", authenticate, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      search, 
      startDate, 
      endDate, 
      status 
    } = req.query;

    const query = {};

    // Search by challan_no, party, or firm
    if (search) {
      query.$or = [
        { challan_no: { $regex: search, $options: "i" } },
        { party: { $regex: search, $options: "i" } },
        { firm: { $regex: search, $options: "i" } }
      ];
    }

    // Filter by date range (using the main date field)
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    // Filter by status
    if (status) {
      query.status = status;
    }

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const [challans, total] = await Promise.all([
      Challan.find(query).sort({ _id: -1 }).skip(skip).limit(limitNum),
      Challan.countDocuments(query)
    ]);

    res.json({
      data: challans,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single challan by id
router.get("/:id", authenticate, async (req, res) => {
  try {
    const challan = await Challan.findById(req.params.id);
    if (!challan) return res.status(404).json({ error: "Not found" });
    res.json(challan);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST multiple challans (save data of all challans)
router.post("/batch", authenticate, async (req, res) => {
  try {
    const { challans } = req.body;
    if (!challans || !Array.isArray(challans)) {
      return res.status(400).json({ error: "Invalid data format. Expected an array of challans." });
    }

    const savedChallans = await Challan.insertMany(challans);
    res.status(201).json({ success: true, count: savedChallans.length, data: savedChallans });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST single challan
router.post("/", authenticate, async (req, res) => {
  try {
    const newChallan = await Challan.create(req.body);
    res.status(201).json(newChallan);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update single challan
router.put("/:id", authenticate, async (req, res) => {
  try {
    const updatedChallan = await Challan.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updatedChallan) return res.status(404).json({ error: "Not found" });
    res.json(updatedChallan);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE single challan
router.delete("/:id", authenticate, async (req, res) => {
  try {
    const deletedChallan = await Challan.findByIdAndDelete(req.params.id);
    if (!deletedChallan) return res.status(404).json({ error: "Not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
