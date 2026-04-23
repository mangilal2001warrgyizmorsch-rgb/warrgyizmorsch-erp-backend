import mongoose from "mongoose";

const challanSchema = new mongoose.Schema({
  challan_no: { type: String, required: true },
  challan_date: { type: Date },
  date: { type: Date },
  firm: { type: String },
  party: { type: String },
  party_address: { type: String },
  gstin_no: { type: String },
  quality: { type: String },
  hsn_code: { type: String },
  item: { type: String },
  taka: { type: String },
  meter: { type: String },
  fas_rate: { type: String },
  amount: { type: String },
  dyed_print: { type: String },
  weaver: { type: String },
  pu_bill_no: { type: String },
  lr_no: { type: String },
  lr_date: { type: Date },
  transpoter: { type: String },
  remark: { type: String },
  weight: { type: String },
  chadhti: { type: String },
  width: { type: String },
  total: { type: String },
  table: [
    {
      tn: { type: Number },
      meter: { type: String }
    }
  ],
  status: { type: String, default: "draft" },
}, { timestamps: true });

export default mongoose.model("Challan", challanSchema);
