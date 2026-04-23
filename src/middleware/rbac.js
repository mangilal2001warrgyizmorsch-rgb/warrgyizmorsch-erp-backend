// ERP roles
export const ALL_ROLES = ["admin", "sales", "purchase", "inventory", "manufacturing", "hr", "finance", "quality", "readonly"];

export const ROLE_MODULE_ACCESS = {
  admin: ["*"],
  sales: ["/", "/crm", "/sales", "/delivery"],
  purchase: ["/", "/purchase", "/inventory"],
  inventory: ["/", "/inventory", "/delivery"],
  manufacturing: ["/", "/manufacturing", "/shopfloor", "/quality", "/inventory"],
  hr: ["/", "/hr"],
  finance: ["/", "/finance"],
  quality: ["/", "/quality", "/manufacturing"],
  readonly: ["*"],
};

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated", code: "UNAUTHENTICATED" });
    }
    const role = req.user.role || "readonly";
    if (!allowedRoles.includes(role) && role !== "admin") {
      return res.status(403).json({ error: "Insufficient permissions", code: "FORBIDDEN" });
    }
    next();
  };
}

export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required", code: "FORBIDDEN" });
  }
  next();
}
