import mongoose from "mongoose";

const purchaseOrderSchema = new mongoose.Schema({
  poNumber: { type: String, unique: true, required: true },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true },
  rfqId: { type: mongoose.Schema.Types.ObjectId, ref: "RFQ" },
  date: { type: String, required: true },
  deliveryDate: String,
  items: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    productName: String,
    sku: String,
    quantity: Number,
    receivedQuantity: { type: Number, default: 0 },
    unitPrice: Number,
    taxRate: Number,
    amount: Number,
  }],
  subtotal: { type: Number, required: true },
  taxAmount: { type: Number, required: true },
  total: { type: Number, required: true },
  status: { type: String, default: "draft" }, // draft, approved, sent, partial, received, cancelled
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  notes: String,
}, { timestamps: true });

purchaseOrderSchema.index({ vendorId: 1 });
purchaseOrderSchema.index({ status: 1 });
purchaseOrderSchema.index({ date: 1 });

export default mongoose.model("PurchaseOrder", purchaseOrderSchema);
