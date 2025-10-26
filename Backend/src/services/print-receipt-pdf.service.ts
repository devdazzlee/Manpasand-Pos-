// src/services/print-receipt-pdf.service.ts
import fs from 'fs';
import os from 'os';
import path from 'path';
import PDFDocument from 'pdfkit';
import { print } from 'pdf-to-printer';

type PrintJobInput = {
  printer: {
    name: string;                        // Windows queue name
    columns?: { fontA: number; fontB: number }; // optional; for layout logic only
  };
  job?: { copies?: number; cut?: boolean };
  receiptData: any;
};

function mm(n: number) { return n * 2.83464567; } // mm -> points

export async function printReceiptPDF(input: PrintJobInput) {
  const { printer, job, receiptData } = input;
  const copies = job?.copies ?? 1;

  // 80mm wide ticket (height grows with content)
  const pageWidth = mm(80);
  const margins = { left: mm(3), right: mm(3), top: mm(4), bottom: mm(4) };

  // temp file
  const tmp = path.join(os.tmpdir(), `receipt_${Date.now()}.pdf`);
  const doc = new PDFDocument({
    size: [pageWidth, mm(500)], // tall enough; we will let PDFKit expand via doc.addPage if needed
    margins,
    autoFirstPage: true
  });
  const stream = fs.createWriteStream(tmp);
  doc.pipe(stream);

  // fonts
  doc.font('Courier'); // monospaced; available on Windows
  doc.fontSize(10.5);

  // helpers
  const widthChars = (printer.columns?.fontA ?? 48); // close to 80mm printable
  const twoCol = (l: string, r: string) => {
    l = l ?? ''; r = r ?? '';
    const pad = Math.max(1, widthChars - l.length - r.length);
    return l + ' '.repeat(pad) + r;
  };

  // Header
  doc.fontSize(16).font('Courier-Bold').text((receiptData.storeName || 'MANPASAND GENERAL STORE').toUpperCase(), { align: 'center' });
  doc.moveDown(0.1);
  doc.fontSize(10.5).font('Courier').text(receiptData.tagline || 'Quality • Service • Value', { align: 'center' });
  doc.text(receiptData.address || 'Karachi, Pakistan', { align: 'center' });
  doc.moveDown(0.2);
  doc.text(''.padEnd(widthChars, '-'));

  // Info
  const ts = new Date(receiptData.timestamp || Date.now());
  doc.text(`Receipt: ${receiptData.transactionId}`);
  doc.text(`Date: ${ts.toLocaleDateString()} ${ts.toLocaleTimeString()}`);
  doc.text(`Cashier: ${receiptData.cashier || 'Walk-in'}   Customer: ${receiptData.customerType || 'Walk-in'}`);
  doc.text(''.padEnd(widthChars, '-'));

  // Items
  doc.text(twoCol('ITEM                 QTY', 'AMOUNT'));
  doc.text(''.padEnd(widthChars, '-'));
  for (const it of (receiptData.items || [])) {
    const amount = (Number(it.price || 0) * Number(it.quantity || 0)).toFixed(2);
    const name = String(it.name || '');
    // main row
    doc.text(twoCol(`${name.slice(0, 28)} ${it.quantity}x`, `PKR ${amount}`));
    // overflow name on next line if too long
    if (name.length > 28) doc.text(name);
  }
  doc.text(''.padEnd(widthChars, '-'));

  const subtotal = Number(receiptData.subtotal || 0);
  const discount = Number(receiptData.discount || 0);
  const total = Number(receiptData.total ?? Math.max(0, subtotal - discount));

  doc.text(twoCol('Subtotal', `PKR ${subtotal.toFixed(2)}`));
  if (discount > 0) doc.text(twoCol('Discount', `PKR ${discount.toFixed(2)}`));
  doc.font('Courier-Bold');
  doc.text(twoCol('TOTAL', `PKR ${total.toFixed(2)}`));
  doc.font('Courier');
  doc.text(''.padEnd(widthChars, '-'));

  doc.text(twoCol('Payment', String(receiptData.paymentMethod || 'CASH').toUpperCase()));
  if (receiptData.amountPaid != null) doc.text(twoCol('Paid', `PKR ${Number(receiptData.amountPaid).toFixed(2)}`));
  if (receiptData.changeAmount > 0) doc.text(twoCol('Change', `PKR ${Number(receiptData.changeAmount).toFixed(2)}`));
  doc.moveDown(0.5);
  doc.text(receiptData.thankYouMessage || 'Thank you for shopping with us!', { align: 'center' });
  if (receiptData.footerMessage) doc.text(receiptData.footerMessage, { align: 'center' });

  doc.end();
  await new Promise<void>((resolve, reject) => {
    stream.on('finish', () => resolve());
    stream.on('error', reject);
  });

  // print N copies
  for (let i = 0; i < copies; i++) {
    await print(tmp, {
      printer: printer.name    // your Windows queue name (USB is fine)
    });
  }

  // cleanup
  fs.unlink(tmp, () => {});

  return { success: true, printer: printer.name, copies };
}
