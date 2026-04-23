import FollowUpTask from "../models/FollowUpTask.js";
import StockLevel from "../models/StockLevel.js";
import Product from "../models/Product.js";
import AutomationRule from "../models/AutomationRule.js";
import AutomationLog from "../models/AutomationLog.js";
import Notification from "../models/Notification.js";
import User from "../models/User.js";

export async function runDailyChecks() {
  const today = new Date().toISOString().slice(0, 10);

  // 1. Check overdue follow-ups
  const overdue = await FollowUpTask.find({ status: "pending", dueDate: { $lt: today } });
  for (const f of overdue) {
    f.status = "overdue";
    await f.save();
  }

  // 2. Check low stock
  const stockLevels = await StockLevel.find();
  const products = await Product.find();
  const productMap = new Map(products.map(p => [p._id.toString(), p]));
  let lowStockCount = 0;
  for (const sl of stockLevels) {
    const product = productMap.get(sl.productId.toString());
    if (!product) continue;
    const minStock = product.reorderPoint || 10;
    if (sl.quantity <= minStock) lowStockCount++;
  }

  // 3. Log
  const rules = await AutomationRule.find({ isActive: true });
  if (rules.length > 0) {
    await AutomationLog.create({
      ruleId: rules[0]._id,
      ruleName: "Daily System Check",
      status: "success",
      details: `Daily checks: ${overdue.length} overdue follow-ups, ${lowStockCount} low stock items`,
      triggeredAt: new Date().toISOString(),
    });
  }

  console.log(`Daily checks complete: ${overdue.length} overdue follow-ups, ${lowStockCount} low stock items`);
}
