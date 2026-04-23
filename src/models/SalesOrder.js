import mongoose from "mongoose";

const salesOrderSchema = new mongoose.Schema({
  orderNumber: { type: String, unique: true, required: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true },
  date: { type: String, required: true },
  deliveryDate: String,
  items: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    productName: String,
    sku: String,
    quantity: Number,
    unitPrice: Number,
    discount: Number,
    taxRate: Number,
    amount: Number,
  }],
  subtotal: { type: Number, required: true },
  taxAmount: { type: Number, required: true },
  discount: { type: Number, default: 0 },
  total: { type: Number, required: true },
  status: { type: String, default: "draft" }, // draft, confirmed, in_production, delivered, cancelled
  notes: String,
  manufacturingOrderId: { type: mongoose.Schema.Types.ObjectId, ref: "ManufacturingOrder" },
  invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice" },
}, { timestamps: true });

salesOrderSchema.index({ customerId: 1 });
salesOrderSchema.index({ status: 1 });
salesOrderSchema.index({ date: 1 });

export default mongoose.model("SalesOrder", salesOrderSchema);
