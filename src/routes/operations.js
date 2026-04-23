import { Router } from "express";
import Notification from "../models/Notification.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

router.get("/notifications", authenticate, async (req, res) => {
  try {
    res.json(await Notification.find({ userId: req.user._id }).sort({ _id: -1 }).limit(20));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put("/notifications/:id/read", authenticate, async (req, res) => {
  try { await Notification.findByIdAndUpdate(req.params.id, { isRead: true }); res.json({ success: true }); } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
