import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cron from "node-cron";
import { connectDB } from "./config/db.js";

// Route imports
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import dashboardRoutes from "./routes/dashboard.js";
import hrRoutes from "./routes/hr.js";
import salesRoutes from "./routes/sales.js";
import purchaseRoutes from "./routes/purchase.js";
import inventoryRoutes from "./routes/inventory.js";
import manufacturingRoutes from "./routes/manufacturing.js";
import financeRoutes from "./routes/finance.js";
import crmRoutes from "./routes/crm.js";
import qualityRoutes from "./routes/quality.js";
import deliveryRoutes from "./routes/delivery.js";
import shopfloorRoutes from "./routes/shopfloor.js";
import automationsRoutes from "./routes/automations.js";
import reportsRoutes from "./routes/reports.js";
import operationsRoutes from "./routes/operations.js";
import integrationsRoutes from "./routes/integrations.js";
import { runDailyChecks } from "./cron/dailyChecks.js";
import { syncAllIndiaMartLeads } from "./services/indiamart.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/hr", hrRoutes);
app.use("/api/sales", salesRoutes);
app.use("/api/purchase", purchaseRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/manufacturing", manufacturingRoutes);
app.use("/api/finance", financeRoutes);
app.use("/api/crm", crmRoutes);
app.use("/api/quality", qualityRoutes);
app.use("/api/delivery", deliveryRoutes);
app.use("/api/shopfloor", shopfloorRoutes);
app.use("/api/automations", automationsRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/operations", operationsRoutes);
app.use("/api/integrations", integrationsRoutes);

// Health check
app.get("/api/health", (req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.statusCode || 500).json({
    error: err.message || "Internal Server Error",
    code: err.code || "INTERNAL_ERROR",
  });
});

// Daily cron at 6:00 AM UTC
cron.schedule("0 6 * * *", () => {
  console.log("Running daily automation checks...");
  runDailyChecks().catch(console.error);
});

// IndiaMART lead sync every 10 minutes
cron.schedule("*/10 * * * *", () => {
  console.log("Fetching IndiaMART leads...");
  syncAllIndiaMartLeads().catch(console.error);
});

// Start
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Backend server running on http://localhost:${PORT}`);
  });
});
