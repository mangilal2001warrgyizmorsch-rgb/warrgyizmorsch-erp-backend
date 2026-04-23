import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, department } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });

    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ error: "Email already registered" });

    const hashed = await bcrypt.hash(password, 10);
    // First user gets admin role
    const userCount = await User.countDocuments();
    const role = userCount === 0 ? "admin" : "readonly";

    const user = await User.create({ name, email, password: hashed, role, department, isActive: true });
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || "7d" });

    res.status(201).json({ token, user: { _id: user._id, name: user.name, email: user.email, role: user.role, department: user.department, isActive: user.isActive } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    if (!user.isActive) return res.status(403).json({ error: "Account deactivated" });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || "7d" });

    res.json({ token, user: { _id: user._id, name: user.name, email: user.email, role: user.role, department: user.department, isActive: user.isActive } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me
router.get("/me", authenticate, async (req, res) => {
  const user = req.user;
  res.json({ _id: user._id, name: user.name, email: user.email, role: user.role, department: user.department, isActive: user.isActive, avatar: user.avatar });
});

export default router;
