import { Router } from "express";
import Lead from "../models/Lead.js";
import LeadActivity from "../models/LeadActivity.js";
import FollowUpTask from "../models/FollowUpTask.js";
import Customer from "../models/Customer.js";
import User from "../models/User.js";
import Integration from "../models/Integration.js";
import { authenticate } from "../middleware/auth.js";
import { syncIndiaMartLeadsForUser } from "../services/indiamart.js";
import twilio from "twilio";
import nodemailer from "nodemailer";
import { upload } from "../middleware/upload.js";
import { parseCSV } from "../utils/csvReader.js";
import { parseExcel } from "../utils/excelReader.js";

const router = Router();

// ── Leads ─────────────
router.get("/leads", async (req, res) => { try { let filter = {}; if (req.query.status) filter.status = req.query.status; let leads = await Lead.find(filter).sort({ _id: -1 }).limit(200); if (req.query.source) leads = leads.filter(l => l.source === req.query.source); res.json(leads); } catch (err) { res.status(500).json({ error: err.message }); } });
router.get("/leads/:id", async (req, res) => { try { res.json(await Lead.findById(req.params.id)); } catch (err) { res.status(500).json({ error: err.message }); } });
router.post("/leads", authenticate, async (req, res) => { try { res.status(201).json(await Lead.create({ ...req.body, status: "new", assignedTo: req.user?._id, lastActivity: new Date().toISOString() })); } catch (err) { res.status(500).json({ error: err.message }); } });
router.put("/leads/:id", authenticate, async (req, res) => { try { res.json(await Lead.findByIdAndUpdate(req.params.id, { ...req.body, lastActivity: new Date().toISOString() }, { new: true })); } catch (err) { res.status(500).json({ error: err.message }); } });
router.delete("/leads/:id", authenticate, async (req, res) => { try { await Lead.findByIdAndDelete(req.params.id); res.json({ success: true }); } catch (err) { res.status(500).json({ error: err.message }); } });

// ── Stats ─────────────
router.get("/stats", async (req, res) => {
  try {
    const leads = await Lead.find().sort({ _id: -1 }).limit(500);
    const followUps = await FollowUpTask.find({ status: "pending" }).limit(100);
    res.json({ total: leads.length, converted: leads.filter(l => l.status === "converted").length, totalValue: leads.reduce((s, l) => s + (l.value || 0), 0), indiamart: leads.filter(l => l.source === "indiaMart").length, pendingFollowUps: followUps.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Activities ─────────────
router.get("/leads/:leadId/activities", async (req, res) => { try { res.json(await LeadActivity.find({ leadId: req.params.leadId }).sort({ _id: -1 }).limit(50)); } catch (err) { res.status(500).json({ error: err.message }); } });
router.post("/leads/:leadId/activities", authenticate, async (req, res) => {
  try {
    const activity = await LeadActivity.create({ ...req.body, leadId: req.params.leadId, createdBy: req.user?._id, createdAt: new Date().toISOString() });
    await Lead.findByIdAndUpdate(req.params.leadId, { lastActivity: new Date().toISOString() });
    if (req.body.nextFollowUp) {
      await FollowUpTask.create({ leadId: req.params.leadId, title: `Follow up after ${req.body.type}`, dueDate: req.body.nextFollowUp, priority: "medium", status: "pending", assignedTo: req.user?._id, createdAt: new Date().toISOString() });
    }
    res.status(201).json(activity);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Follow-ups ─────────────
router.get("/follow-ups", async (req, res) => { try { const filter = {}; if (req.query.status) filter.status = req.query.status; if (req.query.leadId) filter.leadId = req.query.leadId; res.json(await FollowUpTask.find(filter).sort({ dueDate: 1 }).limit(100)); } catch (err) { res.status(500).json({ error: err.message }); } });
router.put("/follow-ups/:id", authenticate, async (req, res) => { try { res.json(await FollowUpTask.findByIdAndUpdate(req.params.id, req.body, { new: true })); } catch (err) { res.status(500).json({ error: err.message }); } });

// ── IndiaMART Integration ─────────────

// Connect IndiaMART API Key
router.post("/indiamart/connect", authenticate, async (req, res) => {
  try {
    const { apiKey } = req.body;

    if (!apiKey || apiKey.trim().length === 0) {
      return res.status(400).json({ error: "API Key is required" });
    }

    await User.findByIdAndUpdate(req.user._id, {
      "indiamart.apiKey": apiKey.trim(),
      "indiamart.isActive": true,
    });

    res.json({ success: true, message: "IndiaMART connected successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Disconnect IndiaMART
router.post("/indiamart/disconnect", authenticate, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, {
      $unset: { indiamart: 1 }
    });

    res.json({ success: true, message: "IndiaMART disconnected" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get IndiaMART settings
router.get("/indiamart/settings", authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("indiamart");
    const indiamartLeads = await Lead.countDocuments({ source: "indiaMart" });

    res.json({
      isConnected: !!(user?.indiamart?.apiKey),
      lastFetchedAt: user?.indiamart?.lastFetchedAt,
      totalLeads: indiamartLeads,
      isActive: user?.indiamart?.isActive || false
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manual sync IndiaMART leads
router.post("/indiamart/sync", authenticate, async (req, res) => {
  try {
    const result = await syncIndiaMartLeadsForUser(req.user._id);

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    res.json({
      success: true,
      imported: result.imported,
      skipped: result.skipped,
      totalProcessed: result.totalProcessed,
      message: `Synced ${result.imported} new leads, skipped ${result.skipped} duplicates`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Legacy IndiaMART Sync (for backward compatibility) ─────────────
router.post("/indiamart-sync", authenticate, async (req, res) => {
  try {
    const { apiKey, leads: manualLeads } = req.body;
    let leadsToProcess = manualLeads || [];

    // If an API key is provided, fetch real-time leads from IndiaMART
    if (apiKey && apiKey !== "DEMO") {
      const formatIMDate = (d) => {
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const pad = (n) => n.toString().padStart(2, '0');
        return `${pad(d.getDate())}-${months[d.getMonth()]}-${d.getFullYear()}${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      };
      
      const endTime = new Date();
      const startTime = new Date(Date.now() - 48 * 60 * 60 * 1000); // Fetch last 48 hours
      const url = `https://utils.indiamart.com/query?type=lead&glusr_crm_key=${apiKey}&start_time=${formatIMDate(startTime)}&end_time=${formatIMDate(endTime)}`;
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.STATUS === "SUCCESS" && Array.isArray(data.RESPONSE)) {
        leadsToProcess = data.RESPONSE.map(l => ({
          externalId: l.QUERY_ID,
          name: l.SENDER_NAME,
          company: l.SENDER_COMPANY,
          email: l.SENDER_EMAIL,
          phone: l.SENDER_MOBILE,
          productInterest: l.SUBJECT,
          notes: l.QUERY_MESSAGE,
          tags: [l.CITY, l.STATE].filter(Boolean)
        }));
      } else if (data.CODE === 402) {
        return res.status(400).json({ error: "Invalid IndiaMART Key" });
      }
    }

    let imported = 0, skipped = 0;
    for (const lead of leadsToProcess) {
      if (!lead.externalId) continue;
      const existing = await Lead.findOne({ externalId: lead.externalId });
      if (existing) { skipped++; continue; }
      
      await Lead.create({ 
        ...lead, 
        source: "indiaMart", 
        status: "new", 
        lastActivity: new Date().toISOString() 
      });
      imported++;
    }
    
    res.json({ imported, skipped, totalProcessed: leadsToProcess.length });
  } catch (err) { 
    console.error("IndiaMART Sync Error:", err);
    res.status(500).json({ error: err.message }); 
  }
});

// ── Messaging ─────────────
router.post("/send-message", authenticate, async (req, res) => {
  try {
    const { type, to, message, subject, leadId } = req.body;
    console.log(`[Messaging] Request to send ${type} to ${to}`);

    let deliveryStatus = "failed";
    let externalId = null;

    if (type === "whatsapp" || type === "sms") {
      // Find Twilio integration
      const integrationKey = type === "whatsapp" ? "whatsapp_twilio" : "sms_twilio";
      const integration = await Integration.findOne({ key: integrationKey, enabled: true });

      if (!integration) {
        return res.status(400).json({ error: `${type.toUpperCase()} integration (Twilio) is not enabled or configured.` });
      }

      const sid = integration.credentials.get("TWILIO_ACCOUNT_SID")?.trim();
      const token = integration.credentials.get("TWILIO_AUTH_TOKEN")?.trim();
      let from = integration.credentials.get(type === "whatsapp" ? "TWILIO_WHATSAPP_FROM" : "TWILIO_SMS_FROM")?.trim();

      if (!sid || !token || !from) {
        return res.status(400).json({ error: `Twilio credentials missing for ${type}. Please check Integrations.` });
      }

      // Sanitize and Prefix 'from'
      // For WhatsApp, we need to handle the 'whatsapp:' prefix correctly.
      const isWhatsApp = type === "whatsapp";
      
      // 1. Extract the numeric part (including +)
      let numericFrom = from.replace(/whatsapp:/i, "").replace(/[^0-9+]/g, "");
      // 2. Add + if missing for E.164
      if (!numericFrom.startsWith("+")) numericFrom = `+${numericFrom}`;
      
      // 3. Final 'from' format
      const cleanFrom = isWhatsApp ? `whatsapp:${numericFrom}` : numericFrom;
      
      // 1. Extract the numeric part of 'to'
      let numericTo = to.replace(/whatsapp:/i, "").replace(/[^0-9+]/g, "");
      // 2. Add + if missing
      if (!numericTo.startsWith("+")) numericTo = `+${numericTo}`;
      
      // 3. Final 'to' format
      const cleanTo = isWhatsApp ? `whatsapp:${numericTo}` : numericTo;
      
      const client = twilio(sid, token);
      
      console.log(`[Twilio Debug] Type: ${type}`);
      console.log(`[Twilio Debug] From: ${cleanFrom}`);
      console.log(`[Twilio Debug] To: ${cleanTo}`);

      const payload = {
        body: message,
        from: cleanFrom,
        to: cleanTo,
      };

      const result = await client.messages.create(payload);
      externalId = result.sid;
      deliveryStatus = "sent";

    } else if (type === "email") {
      // Try SendGrid first, then Mailgun/SMTP
      let integration = await Integration.findOne({ key: "email_sendgrid", enabled: true });
      let transporter;
      let fromEmail;

      if (integration) {
        const apiKey = integration.credentials.get("SENDGRID_API_KEY")?.trim();
        fromEmail = integration.credentials.get("EMAIL_FROM")?.trim();
        
        if (!apiKey || !fromEmail) {
          return res.status(400).json({ error: "SendGrid credentials missing. Please check Integrations setup." });
        }

        transporter = nodemailer.createTransport({
          host: "smtp.sendgrid.net",
          port: 587,
          auth: { user: "apikey", pass: apiKey }
        });
      } else {
        integration = await Integration.findOne({ key: "email_mailgun", enabled: true });
        if (!integration) {
          return res.status(400).json({ error: "No enabled email integration found. Please go to 'Integrations' and toggle 'Enabled' on SendGrid or Mailgun/SMTP." });
        }

        const host = integration.credentials.get("SMTP_API_URL")?.trim();
        const user = integration.credentials.get("SMTP_API_KEY")?.trim();
        fromEmail = integration.credentials.get("EMAIL_FROM")?.trim();
        
        if (!host || !user || !fromEmail) {
          return res.status(400).json({ error: "Email/SMTP credentials missing. Please check Integrations setup." });
        }

        // Setup transporter based on host
        transporter = nodemailer.createTransport({
          host: host.includes("http") ? "smtp.mailgun.org" : host,
          port: 587,
          auth: { user: user, pass: user }
        });
      }

      const mailOptions = {
        from: fromEmail,
        to: to,
        subject: subject || `Message from CRM`,
        text: message,
      };

      const info = await transporter.sendMail(mailOptions);
      externalId = info.messageId;
      deliveryStatus = "sent";
    }

    // Log this as a real activity
    await LeadActivity.create({ 
      leadId: leadId, 
      type: type,
      description: `[Live] Sent ${type}: ${message.substring(0, 100)}${message.length > 100 ? "..." : ""}`,
      outcome: deliveryStatus,
      createdBy: req.user?._id,
      createdAt: new Date().toISOString()
    });

    res.json({ 
      success: true, 
      message: `${type.charAt(0).toUpperCase() + type.slice(1)} delivered successfully`,
      messageId: externalId
    });

  } catch (err) { 
    console.error(`[Messaging Error] ${err.message}`);
    res.status(500).json({ error: `Delivery failed: ${err.message}` }); 
  }
});

// ── Imports ────────────────
router.post("/leads/import", authenticate, upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "No file uploaded" });

    let data = [];
    if (file.mimetype.includes("csv") || file.originalname.endsWith(".csv")) {
      data = await parseCSV(file.buffer);
    } else {
      data = parseExcel(file.buffer);
    }

    if (!Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ error: "File is empty or invalid" });
    }

    // Map & Validate
    const formatted = data.map((row) => {
      // Flexible header matching (case-insensitive)
      const findVal = (keys) => {
        const foundKey = Object.keys(row).find(k => keys.includes(k.toLowerCase().trim()));
        return foundKey ? row[foundKey] : undefined;
      };

      const name = findVal(["name", "full name", "lead name", "customer"]);
      if (!name) throw new Error("Missing 'Name' column in one or more rows");

      return {
        name: name,
        company: findVal(["company", "organization", "firm"]),
        email: findVal(["email", "e-mail", "email address"]),
        phone: findVal(["phone", "mobile", "contact", "phone number"]),
        value: Number(findVal(["value", "amount", "deal value"])) || 0,
        source: findVal(["source", "lead source"]) || "import",
        status: "new",
        assignedTo: req.user?._id,
        lastActivity: new Date().toISOString()
      };
    });

    const result = await Lead.insertMany(formatted);
    res.json({ success: true, count: result.length, message: `Successfully imported ${result.length} leads` });
  } catch (err) {
    console.error("Import Error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
