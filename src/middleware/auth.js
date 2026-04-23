import jwt from "jsonwebtoken";
import User from "../models/User.js";

export async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided", code: "UNAUTHENTICATED" });
    }
    const token = header.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({ error: "Invalid or inactive user", code: "UNAUTHENTICATED" });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token", code: "UNAUTHENTICATED" });
  }
}

// Optional auth — doesn't fail if no token, but attaches user if present
export async function optionalAuth(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (header && header.startsWith("Bearer ")) {
      const token = header.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.userId);
    }
  } catch (_) {
    // ignore
  }
  next();
}
