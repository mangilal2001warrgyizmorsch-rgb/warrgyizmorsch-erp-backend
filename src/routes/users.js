import { Router } from "express";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import { authenticate } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/rbac.js";

const router = Router();

// GET /api/users – list all users (admin)
router.get("/", authenticate, async (req, res) => {
  try {
    const users = await User.find().select("-password").sort({ createdAt: -1 });
    res.json(users);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/users/:id/role – update role (admin)
router.put("/:id/role", authenticate, requireAdmin, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.id, { role: req.body.role });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/users/:id/toggle-active – toggle active (admin)
router.put("/:id/toggle-active", authenticate, requireAdmin, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.id, { isActive: req.body.isActive });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/users/:id/department – update department (admin)
router.put("/:id/department", authenticate, requireAdmin, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.id, { department: req.body.department });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
// GET /api/users/me – get current authenticated user (alias for auth/me)
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    res.json(user);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/users/me – update current authenticated user
router.put('/me', authenticate, async (req, res) => {
  try {
    const updates = { ...req.body };
    delete updates.role;
    delete updates.isActive;
    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true }).select('-password');
    res.json(user);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/users/me/password – change current user password
router.put('/me/password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Current and new passwords required" });
    }

    const user = await User.findById(req.user._id);
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) return res.status(401).json({ error: "Invalid current password" });

    const hashed = await bcrypt.hash(newPassword, 10);
    user.password = hashed;
    await user.save();

    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
