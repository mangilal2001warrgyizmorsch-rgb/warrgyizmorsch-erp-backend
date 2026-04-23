import { Router } from "express";
import SalesOrder from "../models/SalesOrder.js";
import PurchaseOrder from "../models/PurchaseOrder.js";
import ManufacturingOrder from "../models/ManufacturingOrder.js";
import Lead from "../models/Lead.js";
import Employee from "../models/Employee.js";
import Invoice from "../models/Invoice.js";

const router = Router();

// GET /api/dashboard/stats
router.get("/stats", async (req, res) => {
  try {
    const [salesOrders, purchaseOrders, manufacturingOrders, leads, employees, invoices] = await Promise.all([
      SalesOrder.find(), PurchaseOrder.find(), ManufacturingOrder.find(), Lead.find(), Employee.find(), Invoice.find(),
    ]);

    const activeSales = salesOrders.filter(o => o.status !== "cancelled");
    const totalRevenue = activeSales.reduce((s, o) => s + o.total, 0);
    const pendingOrders = salesOrders.filter(o => o.status === "confirmed" || o.status === "in_production").length;
    const activeManufacturing = manufacturingOrders.filter(o => o.status === "in_progress").length;
    const pendingPO = purchaseOrders.filter(o => o.status === "draft" || o.status === "approved").length;
    const newLeads = leads.filter(l => l.status === "new").length;
    const activeEmployees = employees.filter(e => e.status === "active").length;
    const unpaidInvoices = invoices.filter(i => i.type === "sales" && (i.status === "sent" || i.status === "overdue"));
    const receivables = unpaidInvoices.reduce((s, i) => s + i.total, 0);

    const recentSales = activeSales.slice(-30).reduce((acc, o) => {
      const month = o.date.slice(0, 7);
      const existing = acc.find(a => a.month === month);
      if (existing) existing.revenue += o.total;
      else acc.push({ month, revenue: o.total, orders: 1 });
      return acc;
    }, []);

    const ordersByStatus = [
      { status: "Draft", count: salesOrders.filter(o => o.status === "draft").length },
      { status: "Confirmed", count: salesOrders.filter(o => o.status === "confirmed").length },
      { status: "In Production", count: salesOrders.filter(o => o.status === "in_production").length },
      { status: "Delivered", count: salesOrders.filter(o => o.status === "delivered").length },
    ];

    const moByStatus = [
      { status: "Draft", count: manufacturingOrders.filter(o => o.status === "draft").length },
      { status: "Confirmed", count: manufacturingOrders.filter(o => o.status === "confirmed").length },
      { status: "In Progress", count: manufacturingOrders.filter(o => o.status === "in_progress").length },
      { status: "Completed", count: manufacturingOrders.filter(o => o.status === "completed").length },
    ];

    res.json({ totalRevenue, pendingOrders, activeManufacturing, pendingPO, newLeads, activeEmployees, receivables, totalLeads: leads.length, recentSales, ordersByStatus, moByStatus });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/dashboard/activity
router.get("/activity", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const [salesOrders, manufacturingOrders, leads] = await Promise.all([
      SalesOrder.find().sort({ _id: -1 }).limit(limit),
      ManufacturingOrder.find().sort({ _id: -1 }).limit(limit),
      Lead.find().sort({ _id: -1 }).limit(limit),
    ]);

    const activities = [
      ...salesOrders.map(o => ({ type: "sales_order", id: o._id, title: `Sales Order ${o.orderNumber}`, status: o.status, date: o.date, amount: o.total })),
      ...manufacturingOrders.map(o => ({ type: "manufacturing_order", id: o._id, title: `MO ${o.moNumber}`, status: o.status, date: o.scheduledStart, product: o.productName })),
      ...leads.map(l => ({ type: "lead", id: l._id, title: l.name, status: l.status, date: l.createdAt?.toISOString() || "", company: l.company })),
    ];

    res.json(activities.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
