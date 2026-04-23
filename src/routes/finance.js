import { Router } from "express";
import Account from "../models/Account.js";
import Invoice from "../models/Invoice.js";
import JournalEntry from "../models/JournalEntry.js";
import BankAccount from "../models/BankAccount.js";
import BankTransaction from "../models/BankTransaction.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

// ── Accounts ─────────────
router.get("/accounts", async (req, res) => { try { const filter = req.query.type ? { type: req.query.type } : {}; res.json(await Account.find(filter)); } catch (err) { res.status(500).json({ error: err.message }); } });
router.post("/accounts", authenticate, async (req, res) => { try { const existing = await Account.findOne({ code: req.body.code }); if (existing) return res.status(409).json({ error: "Account code exists" }); res.status(201).json(await Account.create({ ...req.body, balance: 0, isActive: true })); } catch (err) { res.status(500).json({ error: err.message }); } });
router.put("/accounts/:id", authenticate, async (req, res) => { try { res.json(await Account.findByIdAndUpdate(req.params.id, req.body, { new: true })); } catch (err) { res.status(500).json({ error: err.message }); } });

// ── Invoices ─────────────
router.get("/invoices", async (req, res) => { try { let filter = {}; if (req.query.type) filter.type = req.query.type; let invoices = await Invoice.find(filter).sort({ _id: -1 }).limit(200); if (req.query.status) invoices = invoices.filter(i => i.status === req.query.status); res.json(invoices); } catch (err) { res.status(500).json({ error: err.message }); } });
router.get("/invoices/:id", async (req, res) => { try { res.json(await Invoice.findById(req.params.id)); } catch (err) { res.status(500).json({ error: err.message }); } });
router.post("/invoices", authenticate, async (req, res) => { try { const lastInvoice = await Invoice.findOne({ invoiceNumber: { $regex: /^(INV|BILL)-/ } }).sort({ invoiceNumber: -1 }).limit(1); let nextNum = 1; if (lastInvoice && lastInvoice.invoiceNumber) { const match = lastInvoice.invoiceNumber.match(/^(INV|BILL)-(\d+)/); if (match) nextNum = parseInt(match[2]) + 1; } const prefix = req.body.type === "sales" ? "INV" : "BILL"; const invoiceNumber = `${prefix}-${String(nextNum).padStart(5, "0")}`; res.status(201).json(await Invoice.create({ ...req.body, invoiceNumber, status: "draft" })); } catch (err) { res.status(500).json({ error: err.message }); } });
router.put("/invoices/:id/status", authenticate, async (req, res) => { try { await Invoice.findByIdAndUpdate(req.params.id, { status: req.body.status }); res.json({ success: true }); } catch (err) { res.status(500).json({ error: err.message }); } });

// ── Journal Entries ─────────────
router.get("/journal-entries", async (req, res) => { try { const filter = req.query.status ? { status: req.query.status } : {}; res.json(await JournalEntry.find(filter).sort({ _id: -1 }).limit(100)); } catch (err) { res.status(500).json({ error: err.message }); } });
router.post("/journal-entries", authenticate, async (req, res) => {
  try {
    const totalDebit = req.body.lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = req.body.lines.reduce((s, l) => s + l.credit, 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) return res.status(400).json({ error: "Entry not balanced" });
    const lastJE = await JournalEntry.findOne({ entryNumber: { $regex: /^JE-/ } }).sort({ entryNumber: -1 }).limit(1);
    let nextNum = 1;
    if (lastJE && lastJE.entryNumber) {
      const match = lastJE.entryNumber.match(/^JE-(\d+)/);
      if (match) nextNum = parseInt(match[1]) + 1;
    }
    const entryNumber = `JE-${String(nextNum).padStart(5, "0")}`;
    const entry = await JournalEntry.create({ ...req.body, entryNumber, status: "posted", createdBy: req.user._id });
    for (const line of req.body.lines) {
      const account = await Account.findById(line.accountId);
      if (account) { account.balance += (line.debit - line.credit); await account.save(); }
    }
    res.status(201).json(entry);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Bank ─────────────
router.get("/bank-accounts", async (req, res) => { try { res.json(await BankAccount.find()); } catch (err) { res.status(500).json({ error: err.message }); } });
router.post("/bank-accounts", authenticate, async (req, res) => { try { res.status(201).json(await BankAccount.create({ ...req.body, isActive: true })); } catch (err) { res.status(500).json({ error: err.message }); } });
router.get("/bank-transactions", async (req, res) => { try { const filter = req.query.bankAccountId ? { bankAccountId: req.query.bankAccountId } : {}; res.json(await BankTransaction.find(filter).sort({ _id: -1 }).limit(100)); } catch (err) { res.status(500).json({ error: err.message }); } });
router.post("/bank-transactions", authenticate, async (req, res) => {
  try {
    const account = await BankAccount.findById(req.body.bankAccountId);
    if (!account) return res.status(404).json({ error: "Account not found" });
    const newBalance = req.body.type === "credit" ? account.balance + req.body.amount : account.balance - req.body.amount;
    account.balance = newBalance; await account.save();
    res.status(201).json(await BankTransaction.create({ ...req.body, isReconciled: false }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Financial Summary ─────────────
router.get("/summary", async (req, res) => {
  try {
    const invoices = await Invoice.find();
    const salesInv = invoices.filter(i => i.type === "sales");
    const purchInv = invoices.filter(i => i.type === "purchase");
    const totalRevenue = salesInv.filter(i => i.status === "paid").reduce((s, i) => s + i.total, 0);
    const totalExpenses = purchInv.filter(i => i.status === "paid").reduce((s, i) => s + i.total, 0);
    const receivables = salesInv.filter(i => ["sent", "overdue"].includes(i.status)).reduce((s, i) => s + i.total, 0);
    const payables = purchInv.filter(i => ["sent", "overdue"].includes(i.status)).reduce((s, i) => s + i.total, 0);
    const now = new Date();
    const monthlyData = Array.from({ length: 6 }, (_, idx) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - idx), 1);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const monthLabel = d.toLocaleString("default", { month: "short" });
      return { month: monthLabel, revenue: salesInv.filter(i => i.date.startsWith(monthKey) && i.status === "paid").reduce((s, i) => s + i.total, 0), expenses: purchInv.filter(i => i.date.startsWith(monthKey) && i.status === "paid").reduce((s, i) => s + i.total, 0) };
    });
    res.json({ totalRevenue, totalExpenses, netProfit: totalRevenue - totalExpenses, receivables, payables, overdueCount: salesInv.filter(i => i.status === "overdue").length, monthlyData, gstCollected: salesInv.filter(i => i.status === "paid").reduce((s, i) => s + i.taxAmount, 0), gstPaid: purchInv.filter(i => i.status === "paid").reduce((s, i) => s + i.taxAmount, 0), gstPayable: salesInv.filter(i => i.status === "paid").reduce((s, i) => s + i.taxAmount, 0) - purchInv.filter(i => i.status === "paid").reduce((s, i) => s + i.taxAmount, 0) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/trial-balance", async (req, res) => { try { const accounts = await Account.find(); res.json(accounts.map(a => ({ _id: a._id, code: a.code, name: a.name, type: a.type, debit: a.balance > 0 ? a.balance : 0, credit: a.balance < 0 ? Math.abs(a.balance) : 0, balance: a.balance }))); } catch (err) { res.status(500).json({ error: err.message }); } });

router.get("/profit-loss", async (req, res) => {
  try {
    const invoices = await Invoice.find();
    const from = req.query.fromDate || "";
    const to = req.query.toDate || "9999-99-99";
    const sales = invoices.filter(i => i.type === "sales" && i.status === "paid" && i.date >= from && i.date <= to).reduce((s, i) => s + i.subtotal, 0);
    const expenses = invoices.filter(i => i.type === "purchase" && i.status === "paid" && i.date >= from && i.date <= to).reduce((s, i) => s + i.subtotal, 0);
    res.json({ revenue: sales, costOfGoods: expenses * 0.7, grossProfit: sales - expenses * 0.7, operatingExpenses: expenses * 0.3, netProfit: sales - expenses });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
