import mongoose from "mongoose";

const deliveryOrderSchema = new mongoose.Schema({
  doNumber: { type: String, unique: true, required: true },
  salesOrderId: { type: mongoose.Schema.Types.ObjectId, ref: "SalesOrder", required: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true },
  items: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    productName: String,
    quantity: Number,
    barcode: String,
  }],
  status: { type: String, default: "draft" }, // draft, picking, packed, dispatched, delivered
  dispatchDate: String,
  deliveryDate: String,
  trackingNumber: String,
  carrier: String,
  notes: String,
}, { timestamps: true });

deliveryOrderSchema.index({ salesOrderId: 1 });
deliveryOrderSchema.index({ status: 1 });

export default mongoose.model("DeliveryOrder", deliveryOrderSchema);
