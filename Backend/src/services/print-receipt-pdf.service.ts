// src/services/print-receipt-pdf.service.ts
import fs from 'fs';
import os from 'os';
import path from 'path';
import PDFDocument from 'pdfkit';
import { print } from 'pdf-to-printer';

type PrintJobInput = {
  printer: { name: string; columns?: { fontA: number; fontB: number } };
  job?: { copies?: number; cut?: boolean };
  receiptData: any;
};

function mm(n: number) { return n * 2.83464567; } // mm -> pt

export async function printReceiptPDF(input: PrintJobInput) {
  const { printer, job, receiptData } = input;
  const copies = job?.copies ?? 1;

  const pageWidth = mm(80);                       // 80mm roll
  const margins = { left: mm(2), right: mm(2), top: mm(1), bottom: mm(1) };
  const contentWidth = pageWidth - margins.left - margins.right;

  const tmp = path.join(os.tmpdir(), `receipt_${Date.now()}.pdf`);
  const doc = new PDFDocument({
    size: [pageWidth, mm(800)],                   // temporary tall page
    margins,
    autoFirstPage: true,
    pdfVersion: '1.4'
  });

  const out = fs.createWriteStream(tmp);
  doc.pipe(out);

  // Colors & fonts — force solid black & bold for darkness
  doc.fillColor('#000000');
  doc.opacity(1);
  doc.font('Courier-Bold');
  const baseFontSize = 11.5;                      // a bit larger -> darker
  doc.fontSize(baseFontSize);

  // Helpers
  const widthChars = (printer.columns?.fontA ?? 48);
  const twoCol = (l: string, r: string) => {
    l = l ?? ''; r = r ?? '';
    const pad = Math.max(1, widthChars - l.length - r.length);
    return l + ' '.repeat(pad) + r;
  };
  const hr = (thickness = 1) => {
    const y = doc.y + 2;
    doc.moveTo(margins.left, y).lineTo(pageWidth - margins.right, y).lineWidth(thickness).stroke('#000000');
    doc.moveDown(0.2);
  };
  const textLine = (t: string, opts: PDFKit.Mixins.TextOptions = {}) =>
    doc.text(t, { ...opts, width: contentWidth, lineBreak: true, continued: false });

  // ===== Header =====
  doc.fontSize(16).text((receiptData.storeName || 'MANPASAND GENERAL STORE').toUpperCase(), {
    align: 'center', width: contentWidth, lineGap: 0
  });
  doc.moveDown(0.2);
  doc.fontSize(baseFontSize);
  textLine(receiptData.tagline || 'Quality • Service • Value', { align: 'center' });
  textLine(receiptData.address || 'Karachi, Pakistan', { align: 'center' });
  hr(1.2);

  // ===== Info =====
  const ts = new Date(receiptData.timestamp || Date.now());
  textLine(`Receipt: ${receiptData.transactionId}`);
  textLine(`Date: ${ts.toLocaleDateString()} ${ts.toLocaleTimeString()}`);
  textLine(`Cashier: ${receiptData.cashier || 'Walk-in'}   Customer: ${receiptData.customerType || 'Walk-in'}`);
  hr(1.2);

  // ===== Items =====
  textLine(twoCol('ITEM                 QTY', 'AMOUNT'), { lineBreak: false });
  hr(1);
  for (const it of (receiptData.items || [])) {
    const amount = (Number(it.price || 0) * Number(it.quantity || 0)).toFixed(2);
    const name = String(it.name || '');
    textLine(twoCol(`${name.slice(0, 28)} ${it.quantity}x`, `PKR ${amount}`), { lineBreak: false });
    if (name.length > 28) textLine(name); // overflow line
  }
  hr(1.2);

  // ===== Totals =====
  const subtotal = Number(receiptData.subtotal || 0);
  const discount = Number(receiptData.discount || 0);
  const total = Number(receiptData.total ?? Math.max(0, subtotal - discount));

  textLine(twoCol('Subtotal', `PKR ${subtotal.toFixed(2)}`), { lineBreak: false });
  if (discount > 0) textLine(twoCol('Discount', `PKR ${discount.toFixed(2)}`), { lineBreak: false });

  doc.font('Courier-Bold').fontSize(13);
  textLine(twoCol('TOTAL', `PKR ${total.toFixed(2)}`), { lineBreak: false });
  doc.font('Courier-Bold').fontSize(baseFontSize);
  hr(1.4);

  textLine(twoCol('Payment', String(receiptData.paymentMethod || 'CASH').toUpperCase()), { lineBreak: false });
  if (receiptData.amountPaid != null) textLine(twoCol('Paid', `PKR ${Number(receiptData.amountPaid).toFixed(2)}`), { lineBreak: false });
  if (receiptData.changeAmount > 0) textLine(twoCol('Change', `PKR ${Number(receiptData.changeAmount).toFixed(2)}`), { lineBreak: false });

  doc.moveDown(0.4);
  textLine(receiptData.thankYouMessage || 'Thank you for shopping with us!', { align: 'center' });
  if (receiptData.footerMessage) textLine(receiptData.footerMessage, { align: 'center' });

  // ===== Trim the page height to content =====
  const neededHeight = doc.y + margins.bottom + 2; // 2pt safety
  if (neededHeight < doc.page.height) doc.page.height = neededHeight;

  doc.end();
  await new Promise<void>((resolve, reject) => {
    out.on('finish', resolve);
    out.on('error', reject);
  });

  // Print N copies — prevent any scaling on Windows
  for (let i = 0; i < copies; i++) {
    await print(tmp, {
        printer: printer.name,
        scale: 'noscale',     // ✅ typed way to prevent any scaling
        monochrome: true      // optional: forces B/W; often prints darker
      });      
  }

  fs.unlink(tmp, () => {});
  return { success: true, printer: printer.name, copies };
}
