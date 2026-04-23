import mongoose from "mongoose";

const quotationSchema = new mongoose.Schema({
  quotationNumber: { type: String, unique: true, required: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true },
  date: { type: String, required: true },
  validUntil: { type: String, required: true },
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
  status: { type: String, default: "draft" }, // draft, sent, accepted, rejected, expired
  notes: String,
}, { timestamps: true });

quotationSchema.index({ customerId: 1 });
quotationSchema.index({ status: 1 });

export default mongoose.model("Quotation", quotationSchema);
