import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";

// Final Robust Path Selection
const LOGO_PATH_PNG = "/Users/mac/Desktop/HRM/frontend/public/assets/images/warr-logo.png";
const LOGO_PATH_WEBP = "/Users/mac/Desktop/HRM/frontend/public/assets/images/warr-logo.webp";

/**
 * Generates a high-quality PDF invoice.
 * @param {Object} invoice Data for the invoice
 * @returns {Promise<Buffer>}
 */
export const generateInvoice = (invoice) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4", bufferPages: true });
    const buffers = [];

    doc.on("data", buffers.push.bind(buffers));
    doc.on("end", () => {
      const pdf = Buffer.concat(buffers);
      resolve(pdf);
    });
    doc.on("error", (err) => {
      console.error("[PDF Engine Error]:", err);
      reject(err);
    });

    const accentColor = "#00141e";
    const secondaryColor = "#444444";

    // --- Branded Logo Section (PNG Fallback for maximum reliability) ---
    try {
      let logoToUse = null;
      if (fs.existsSync(LOGO_PATH_PNG)) {
        logoToUse = LOGO_PATH_PNG;
      } else if (fs.existsSync(LOGO_PATH_WEBP)) {
        logoToUse = LOGO_PATH_WEBP;
      }

      if (logoToUse) {
        doc.image(logoToUse, 50, 45, { width: 120 });
      } else {
        throw new Error("No logo file found in assets directory.");
      }
    } catch (e) {
      console.error("[PDF ERROR] Logo System Failure:", e.message);
      // Branded Text Fallback
      doc.fontSize(24).fillColor(accentColor).font("Helvetica-Bold").text("WARRGYIZ MORSCH", 50, 45);
    }

    doc
      .fillColor(accentColor)
      .fontSize(22)
      .font("Helvetica-Bold")
      .text(invoice.isPO ? "PURCHASE ORDER" : "TAX INVOICE", 50, 50, { align: "right" });

    doc
      .fillColor(secondaryColor)
      .fontSize(8)
      .font("Helvetica")
      .text("Warrgyiz Morsch ERP Solution", 50, 100)
      .text("Industrial Hub, Block 42", 50, 110)
      .text("Maharashtra, India - 400001", 50, 120)
      .text("Email: accounts@warrgyizmorsch.com", 50, 130)
      .text("GSTIN: 27AABCM1234F1Z1", 50, 140);

    // --- Header Section ---
    const detailTop = 180;
    doc
      .fontSize(9)
      .fillColor(accentColor)
      .font("Helvetica-Bold")
      .text(invoice.isPO ? "VENDOR DETAILS:" : "BILL TO:", 50, detailTop)
      .fillColor("#000")
      .fontSize(11)
      .text(invoice.customerName || invoice.vendorName || "Walk-in Customer", 50, detailTop + 15)
      .fontSize(9)
      .fillColor(secondaryColor)
      .text(invoice.address || "Main Street, Business District", 50, detailTop + 30, { width: 220 })
      .text(invoice.city || "Mumbai, India", 50, detailTop + 42);

    const rightGridX = 380;
    doc
      .fontSize(9)
      .fillColor(accentColor)
      .font("Helvetica-Bold")
      .text(invoice.isPO ? "PO INFORMATION:" : "INVOICE INFORMATION:", rightGridX, detailTop)
      .font("Helvetica")
      .fillColor(secondaryColor)
      .text(invoice.isPO ? "PO No:" : "Invoice No:", rightGridX, detailTop + 15)
      .text("Date:", rightGridX, detailTop + 30)
      .text("Due Date:", rightGridX, detailTop + 45)
      .fillColor("#000")
      .text(invoice.invoiceNumber || invoice.poNumber, 480, detailTop + 15, { align: "right", width: 65 })
      .text(invoice.date || new Date().toLocaleDateString(), 480, detailTop + 30, { align: "right", width: 65 })
      .text(invoice.dueDate || "Due on Receipt", 480, detailTop + 45, { align: "right", width: 65 });

    // --- Table Section ---
    const tableTop = 270;
    doc.rect(50, tableTop, 495, 20).fill(accentColor);

    doc
      .fillColor("#fff")
      .fontSize(9)
      .font("Helvetica-Bold")
      .text("Particulars / Description", 60, tableTop + 6)
      .text("Qty", 320, tableTop + 6)
      .text("Rate", 370, tableTop + 6, { width: 70, align: "right" })
      .text("Tax", 440, tableTop + 6, { width: 40, align: "right" })
      .text("Amount", 480, tableTop + 6, { width: 60, align: "right" });

    let currentY = tableTop + 20;
    (invoice.items || []).forEach((item, index) => {
      const rowHeight = 25;
      if (index % 2 === 1) doc.rect(50, currentY, 495, rowHeight).fill("#fcfcfc");

      doc
        .fillColor("#333")
        .font("Helvetica")
        .fontSize(9)
        .text(item.productName || item.name, 60, currentY + 8, { width: 250, truncate: true })
        .text(item.quantity.toString(), 320, currentY + 8)
        .text(`INR ${item.unitPrice.toLocaleString()}`, 370, currentY + 8, { width: 70, align: "right" })
        .text(`${item.taxRate || 0}%`, 440, currentY + 8, { width: 40, align: "right" })
        .text(`INR ${item.amount.toLocaleString()}`, 480, currentY + 8, { width: 60, align: "right" });

      currentY += rowHeight;
    });

    // --- Totals ---
    const sumX = 345;
    let sumY = currentY + 20;
    const boxW = 200;

    const row = (l, v) => {
      doc.fillColor(secondaryColor).fontSize(9).font("Helvetica").text(l, sumX, sumY);
      doc.fillColor("#000").text(v, sumX + 100, sumY, { align: "right", width: 100 });
      sumY += 16;
    };

    row("Subtotal:", `INR ${invoice.subtotal.toLocaleString()}`);
    row("Tax Amount:", `INR ${invoice.taxAmount.toLocaleString()}`);
    
    sumY += 5;
    doc.rect(sumX, sumY, boxW, 24).fill(accentColor);
    doc.fillColor("#fff").font("Helvetica-Bold").fontSize(10).text("GRAND TOTAL", sumX + 10, sumY + 8);
    doc.text(`INR ${invoice.total.toLocaleString()}`, sumX + 100, sumY + 8, { align: "right", width: 90 });

    // --- Footer ---
    const footY = 680;
    doc
      .fillColor(accentColor)
      .fontSize(9)
      .font("Helvetica-Bold")
      .text("BANKING DETAILS:", 50, footY)
      .font("Helvetica")
      .fillColor(secondaryColor)
      .text("HDFC BANK LIMITED", 50, footY + 15)
      .text("A/c No: 50200012345678", 50, footY + 27)
      .text("IFSC Code: HDFC0001234", 50, footY + 39);

    doc
      .fillColor(accentColor)
      .font("Helvetica-Bold")
      .text("TERMS & CONDITIONS:", 300, footY)
      .font("Helvetica")
      .fillColor(secondaryColor)
      .text("1. All payments due within 15 days.", 300, footY + 15)
      .text("2. Please quote Invoice No on remittance.", 300, footY + 27);

    doc
      .fontSize(7)
      .fillColor("#bbb")
      .text("System Updated [v2.1 - PDF Engine Stable] - computer generated document.", 50, 780, { align: "center", width: 500 });

    doc.end();
  });
};
