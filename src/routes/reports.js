import { Router } from "express";
import SalesOrder from "../models/SalesOrder.js";
import PurchaseOrder from "../models/PurchaseOrder.js";
import ManufacturingOrder from "../models/ManufacturingOrder.js";
import Invoice from "../models/Invoice.js";
import Lead from "../models/Lead.js";
import Employee from "../models/Employee.js";
import Customer from "../models/Customer.js";
import Vendor from "../models/Vendor.js";
import Attendance from "../models/Attendance.js";
import LeaveRequest from "../models/LeaveRequest.js";
import PerformanceReview from "../models/PerformanceReview.js";
import StockLevel from "../models/StockLevel.js";
import StockMovement from "../models/StockMovement.js";
import Product from "../models/Product.js";
import QualityCheck from "../models/QualityCheck.js";
import DowntimeEvent from "../models/DowntimeEvent.js";
import JournalEntry from "../models/JournalEntry.js";

const router = Router();

const getPeriodDays = (period) => period === "7d" ? 7 : period === "30d" ? 30 : period === "90d" ? 90 : 365;
const getCutoff = (days) => new Date(Date.now() - days * 86400000).toISOString().split("T")[0];

router.get("/sales", async (req, res) => {
  try {
    const orders = await SalesOrder.find();
    const customers = await Customer.find();
    const customerMap = new Map(customers.map(c => [c._id.toString(), c.name]));
    const days = getPeriodDays(req.query.period || "30d");
    const cutoff = getCutoff(days);
    const filtered = orders.filter(o => o.date >= cutoff);
    const confirmed = filtered.filter(o => o.status !== "cancelled");
    const totalRevenue = confirmed.reduce((s, o) => s + o.total, 0);
    const byDay = {}, byStatus = {}, byCustomer = {};
    confirmed.forEach(o => { 
      byDay[o.date] = (byDay[o.date] || 0) + o.total; 
      const custName = o.customerId ? customerMap.get(o.customerId.toString()) || "Unknown" : "Unknown";
      byCustomer[custName] = (byCustomer[custName] || 0) + o.total;
    });
    filtered.forEach(o => { byStatus[o.status] = (byStatus[o.status] || 0) + 1; });
    res.json({ totalOrders: filtered.length, confirmedOrders: confirmed.length, totalRevenue, avgOrderValue: confirmed.length ? totalRevenue / confirmed.length : 0, byDay: Object.entries(byDay).sort().map(([date, value]) => ({ date, value })), byStatus: Object.entries(byStatus).map(([status, count]) => ({ status, count })), topCustomers: Object.entries(byCustomer).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, value]) => ({ name, value })) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/purchase", async (req, res) => {
  try {
    const orders = await PurchaseOrder.find();
    const vendors = await Vendor.find();
    const vendorMap = new Map(vendors.map(v => [v._id.toString(), v.name]));
    const days = getPeriodDays(req.query.period || "30d");
    const cutoff = getCutoff(days);
    const filtered = orders.filter(o => o.date >= cutoff && o.status !== "cancelled");
    const totalSpend = filtered.reduce((s, o) => s + o.total, 0);
    const byStatus = {}, byDay = {}, byVendor = {};
    filtered.forEach(o => {
      byDay[o.date] = (byDay[o.date] || 0) + o.total;
      const vendName = o.vendorId ? vendorMap.get(o.vendorId.toString()) || "Unknown" : "Unknown";
      byVendor[vendName] = (byVendor[vendName] || 0) + o.total;
    });
    orders.filter(o => o.date >= cutoff).forEach(o => { byStatus[o.status] = (byStatus[o.status] || 0) + 1; });
    res.json({ totalOrders: filtered.length, totalSpend, avgOrderValue: filtered.length ? totalSpend / filtered.length : 0, topVendors: Object.entries(byVendor).sort((a,b) => b[1] - a[1]).slice(0, 5).map(([name, value]) => ({ name, value })), byStatus: Object.entries(byStatus).map(([status, count]) => ({ status, count })), byDay: Object.entries(byDay).sort().map(([date, value]) => ({ date, value })) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/inventory", async (req, res) => {
  try {
    const stocks = await StockLevel.find();
    const products = await Product.find();
    const movements = await StockMovement.find();
    const productMap = new Map(products.map(p => [p._id.toString(), p]));
    let totalValue = 0;
    const byCategory = {}, lowStockItems = [];
    const stockByProduct = {};
    for (const s of stocks) { const pid = s.productId.toString(); stockByProduct[pid] = (stockByProduct[pid] || 0) + s.quantity; }
    for (const [pid, qty] of Object.entries(stockByProduct)) {
      const prod = productMap.get(pid);
      if (!prod) continue;
      totalValue += qty * prod.costPrice;
      byCategory[prod.category] = (byCategory[prod.category] || 0) + qty * prod.costPrice;
      if (prod.reorderPoint && qty <= prod.reorderPoint) lowStockItems.push({ name: prod.name, qty, reorder: prod.reorderPoint });
    }
    const cutoff = getCutoff(30);
    const recentMovements = movements.filter(m => m.date >= cutoff);
    res.json({ totalProducts: products.filter(p => p.isActive).length, totalStockValue: totalValue, lowStockCount: lowStockItems.length, lowStockItems: lowStockItems.slice(0, 10), byCategory: Object.entries(byCategory).map(([category, value]) => ({ category, value })), inbound30d: recentMovements.filter(m => m.type === "in").reduce((s, m) => s + m.quantity, 0), outbound30d: recentMovements.filter(m => m.type === "out").reduce((s, m) => s + m.quantity, 0) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/manufacturing", async (req, res) => {
  try {
    const mos = await ManufacturingOrder.find();
    const products = await Product.find();
    const productMap = new Map(products.map(p => [p._id.toString(), p.name]));
    const days = getPeriodDays(req.query.period || "30d");
    const cutoff = getCutoff(days);
    const filtered = mos.filter(m => m.scheduledStart >= cutoff);
    const byStatus = {};
    filtered.forEach(m => { byStatus[m.status] = (byStatus[m.status] || 0) + 1; });
    const completed = filtered.filter(m => m.status === "completed");
    const totalProduced = completed.reduce((s, m) => s + (m.producedQuantity || 0), 0);
    const totalScrap = completed.reduce((s, m) => s + (m.scrapQuantity || 0), 0);
    const downtimes = await DowntimeEvent.find();
    const byProduct = {};
    completed.forEach((m) => {
      const prodName = m.productId ? productMap.get(m.productId.toString()) || "Unknown" : "Unknown";
      byProduct[prodName] = (byProduct[prodName] || 0) + (m.producedQuantity || 0);
    });
    res.json({ total: filtered.length, byStatus: Object.entries(byStatus).map(([status, count]) => ({ status, count })), totalProduced, totalScrap, efficiency: (totalProduced + totalScrap) > 0 ? Math.round((totalProduced / (totalProduced + totalScrap)) * 1000) / 10 : 0, totalDowntimeMinutes: downtimes.filter(d => d.startTime >= cutoff).reduce((s, d) => s + (d.durationMinutes || 0), 0), topProducts: Object.entries(byProduct).sort((a,b) => b[1] - a[1]).slice(0, 5).map(([name, qty]) => ({ name, qty })) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/hr", async (req, res) => {
  try {
    const employees = await Employee.find();
    const attendance = await Attendance.find();
    const leaves = await LeaveRequest.find();
    const reviews = await PerformanceReview.find();
    const active = employees.filter(e => e.status === "active");
    const byDept = {};
    active.forEach(e => { byDept[e.department] = (byDept[e.department] || 0) + 1; });
    const cutoff = getCutoff(30);
    const recentAtt = attendance.filter(a => a.date >= cutoff);
    const presentDays = recentAtt.filter(a => a.status === "present").length;
    res.json({ totalEmployees: employees.length, activeEmployees: active.length, byDepartment: Object.entries(byDept).map(([department, count]) => ({ department, count })), presentDays, absentDays: recentAtt.filter(a => a.status === "absent").length, attendanceRate: recentAtt.length > 0 ? Math.round((presentDays / recentAtt.length) * 1000) / 10 : 0, pendingLeaves: leaves.filter(l => l.status === "pending").length, avgPerformanceScore: reviews.length > 0 ? Math.round((reviews.reduce((s, r) => s + r.overallScore, 0) / reviews.length) * 10) / 10 : 0, totalMonthlyPayroll: active.reduce((s, e) => s + (e.salary || 0), 0) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/finance", async (req, res) => {
  try {
    const invoices = await Invoice.find();
    const entries = await JournalEntry.find();
    const days = getPeriodDays(req.query.period || "30d");
    const cutoff = getCutoff(days);
    const salesInv = invoices.filter(i => i.type === "sales" && i.date >= cutoff);
    const purchInv = invoices.filter(i => i.type === "purchase" && i.date >= cutoff);
    const revenue = salesInv.filter(i => i.status === "paid").reduce((s, i) => s + i.total, 0);
    const spend = purchInv.filter(i => i.status === "paid").reduce((s, i) => s + i.total, 0);
    
    // Revenue by month
    const byMonth = {};
    salesInv.filter(i => i.status === "paid").forEach(i => {
      const month = i.date.substring(0, 7);
      byMonth[month] = (byMonth[month] || 0) + i.total;
    });

    res.json({ revenue, spend, grossProfit: revenue - spend, outstanding: salesInv.filter(i => ["sent", "overdue"].includes(i.status)).reduce((s, i) => s + i.total, 0), overdueCount: salesInv.filter(i => i.status === "overdue").length, taxCollected: salesInv.reduce((s, i) => s + i.taxAmount, 0), taxPaid: purchInv.reduce((s, i) => s + i.taxAmount, 0), netTaxLiability: salesInv.reduce((s, i) => s + i.taxAmount, 0) - purchInv.reduce((s, i) => s + i.taxAmount, 0), totalJournalEntries: entries.filter(e => e.status === "posted" && e.date >= cutoff).length, byMonth: Object.entries(byMonth).sort().map(([month, value]) => ({ month, value })) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/crm", async (req, res) => {
  try {
    const leads = await Lead.find();
    const days = getPeriodDays(req.query.period || "30d");
    const recentLeads = leads.filter(l => l.createdAt > new Date(Date.now() - days * 86400000));
    const byStatus = {}, bySource = {};
    leads.forEach(l => { byStatus[l.status] = (byStatus[l.status] || 0) + 1; });
    recentLeads.forEach(l => { bySource[l.source] = (bySource[l.source] || 0) + 1; });
    const converted = leads.filter(l => l.status === "converted");
    res.json({ totalLeads: leads.length, newLeads: recentLeads.length, convertedLeads: converted.length, conversionRate: leads.length > 0 ? Math.round((converted.length / leads.length) * 1000) / 10 : 0, pipelineValue: leads.filter(l => !["converted", "lost"].includes(l.status)).reduce((s, l) => s + (l.value || 0), 0), byStatus: Object.entries(byStatus).map(([status, count]) => ({ status, count })), bySource: Object.entries(bySource).map(([source, count]) => ({ source, count })) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/quality", async (req, res) => {
  try {
    const checks = await QualityCheck.find();
    const days = getPeriodDays(req.query.period || "30d");
    const cutoff = getCutoff(days);
    const filtered = checks.filter(c => c.checkDate >= cutoff);
    const passed = filtered.filter(c => c.result === "pass").length;
    const failed = filtered.filter(c => c.result === "fail").length;
    const byType = {};
    filtered.forEach(c => { byType[c.type] = (byType[c.type] || 0) + 1; });
    const failReasons = {};
    filtered.filter(c => c.result === "fail" && c.failReason).forEach(c => {
      failReasons[c.failReason] = (failReasons[c.failReason] || 0) + 1;
    });
    res.json({ total: filtered.length, passed, failed, passRate: filtered.length > 0 ? Math.round((passed / filtered.length) * 1000) / 10 : 0, byType: Object.entries(byType).map(([type, count]) => ({ type, count })), topFailReasons: Object.entries(failReasons).sort((a,b) => b[1]-a[1]).slice(0, 5).map(([reason, count]) => ({ reason, count })) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/exec-dashboard", async (req, res) => {
  try {
    const [salesOrders, invoices, mos, leads, employees, stocks, products] = await Promise.all([SalesOrder.find(), Invoice.find(), ManufacturingOrder.find(), Lead.find(), Employee.find(), StockLevel.find(), Product.find()]);
    const m30 = getCutoff(30);
    const revenueMtd = invoices.filter(i => i.type === "sales" && i.status === "paid" && i.date >= m30).reduce((s, i) => s + i.total, 0);
    const spendMtd = invoices.filter(i => i.type === "purchase" && i.status === "paid" && i.date >= m30).reduce((s, i) => s + i.total, 0);
    const productMap = new Map(products.map(p => [p._id.toString(), p]));
    const stockByProduct = {};
    stocks.forEach(s => { const pid = s.productId.toString(); stockByProduct[pid] = (stockByProduct[pid] || 0) + s.quantity; });
    const lowStockCount = Object.entries(stockByProduct).filter(([pid, qty]) => { const p = productMap.get(pid); return p?.reorderPoint && qty <= p.reorderPoint; }).length;
    res.json({ revenueMtd, spendMtd, grossProfitMtd: revenueMtd - spendMtd, openSalesOrders: salesOrders.filter(o => ["confirmed", "in_production"].includes(o.status)).length, activeMOs: mos.filter(m => m.status === "in_progress").length, lowStockCount, openLeads: leads.filter(l => !["converted", "lost"].includes(l.status)).length, activeEmployees: employees.filter(e => e.status === "active").length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
