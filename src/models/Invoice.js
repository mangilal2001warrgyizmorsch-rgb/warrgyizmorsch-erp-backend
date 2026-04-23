import mongoose from "mongoose";

const invoiceSchema = new mongoose.Schema({
  invoiceNumber: { type: String, unique: true, required: true },
  type: { type: String, required: true }, // sales, purchase
  partyId: { type: String, required: true },
  partyName: { type: String, required: true },
  partyGST: String,
  date: { type: String, required: true },
  dueDate: { type: String, required: true },
  items: [{
    description: String,
    quantity: Number,
    unitPrice: Number,
    taxRate: Number,
    amount: Number,
  }],
  subtotal: { type: Number, required: true },
  taxAmount: { type: Number, required: true },
  total: { type: Number, required: true },
  status: { type: String, default: "draft" }, // draft, sent, paid, overdue, cancelled
  salesOrderId: { type: mongoose.Schema.Types.ObjectId, ref: "SalesOrder" },
  purchaseOrderId: { type: mongoose.Schema.Types.ObjectId, ref: "PurchaseOrder" },
  notes: String,
}, { timestamps: true });

invoiceSchema.index({ type: 1 });
invoiceSchema.index({ status: 1 });
invoiceSchema.index({ date: 1 });

export default mongoose.model("Invoice", invoiceSchema);
