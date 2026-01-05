// src/services/label-pdf.service.ts
import fs from 'fs';
import os from 'os';
import path from 'path';
import PDFDocument from 'pdfkit';
import { print } from 'pdf-to-printer';
import * as bwipjs from 'bwip-js';

type PaperSize = '3x2inch' | '50x30mm' | '60x40mm';
type Dpi = 203 | 300;

export interface LabelItem {
  id: string;
  name: string;
  barcode: string;
  netWeight?: string;
  price?: number;
  packageDateISO?: string;
  expiryDateISO?: string;
}

export interface PrintLabelsInput {
  printerName: string;
  items: LabelItem[];
  paperSize?: PaperSize;
  copies?: number;
  dpi?: Dpi;
  humanReadable?: boolean;
}

const mm = (n: number) => n * 2.83464567;

function pageSize(p: PaperSize) {
  // Physical label size AS IT FEEDS through printer
  // For 3x2" labels: 3" is WIDTH (horizontal), 2" is HEIGHT (vertical)
  if (p === '50x30mm') return { w: mm(50), h: mm(30) };
  if (p === '60x40mm') return { w: mm(60), h: mm(40) };
  return { w: mm(76.2), h: mm(50.8) }; // 3" x 2"
}

const shortDate = (iso?: string) =>
  !iso ? '__/__/____' :
  new Date(iso).toLocaleDateString('en-GB',{day:'2-digit',month:'2-digit',year:'numeric'});

export async function printBarcodeLabels(input: PrintLabelsInput) {
  const paper = input.paperSize ?? '3x2inch';
  const dpi   = input.dpi ?? 203;
  const copies = Math.max(1, input.copies ?? 1);
  const human = !!input.humanReadable;

  // Get physical label dimensions
  const { w: PW, h: PH } = pageSize(paper);

  // Minimal margins for Zebra
  const M = { left: mm(1.5), right: mm(1.5), top: mm(1.5), bottom: mm(1.5) };
  
  // Content area (this is what we draw in)
  const CW = PW - M.left - M.right;
  const CH = PH - M.top - M.bottom;

  const tmp = path.join(os.tmpdir(), `labels_${Date.now()}.pdf`);
  
  // Create PDF with PORTRAIT orientation matching physical label
  const doc = new PDFDocument({ 
    size: [PW, PH],
    margins: { left: 0, right: 0, top: 0, bottom: 0 }, // We'll handle margins manually
    autoFirstPage: false 
  });
  
  const stream = fs.createWriteStream(tmp);
  doc.pipe(stream);

  // Font sizes
  const TITLE = paper === '3x2inch' ? 13 : 10;
  const META  = paper === '3x2inch' ? 9  : 8;

  // Barcode dimensions - optimized for scannability
  const BAR_W_MAX = CW * 0.85; // Reduced from 0.88 to prevent cutting and ensure quiet zones
  const BAR_H_MM  = paper === '3x2inch' ? 12 : 10; // Slightly reduced to ensure proper spacing
  const SCALE     = dpi === 300 ? 5 : 4; // Adjusted for better bar width consistency

  for (const it of input.items) {
    for (let c = 0; c < copies; c++) {
      doc.addPage();

      // Start drawing from top-left with margins
      let y = M.top;
      const leftMargin = M.left;
      const contentWidth = CW;

      // ---- TITLE (Product Name) ----
      doc.font('Helvetica-Bold').fontSize(TITLE);
      let title = (it.name || '').toUpperCase().trim();
      let fontSize = TITLE;
      
      // Auto-shrink title if too wide - ensure it fits with margin
      while (fontSize > 7 && doc.widthOfString(title) > contentWidth * 0.95) { 
        fontSize -= 0.3; 
        doc.fontSize(fontSize); 
      }
      
      const titleHeight = doc.heightOfString(title, { width: contentWidth });
      const titleX = leftMargin + (contentWidth - doc.widthOfString(title)) / 2;
      doc.text(title, titleX, y, { width: contentWidth, align: 'center', lineBreak: false });
      y += titleHeight + mm(2); // Increased spacing after title

      // ---- META ROW (Weight & Price) ----
      doc.font('Helvetica').fontSize(META);
      const leftText  = it.netWeight ? `NET WT: ${it.netWeight}` : '';
      const rightText = Number.isFinite(it.price) ? `RS ${Math.round(Number(it.price))}` : '';
      
      if (leftText || rightText) {
        // Ensure text doesn't overflow - truncate if needed
        const maxMetaWidth = contentWidth * 0.95;
        const gap = mm(5);
        let leftW = doc.widthOfString(leftText);
        let rightW = doc.widthOfString(rightText);
        const totalW = leftW + (leftText && rightText ? gap : 0) + rightW;
        
        // If total width exceeds available space, reduce font or truncate
        if (totalW > maxMetaWidth && leftText && rightText) {
          // Try reducing font size slightly
          doc.fontSize(META * 0.9);
          leftW = doc.widthOfString(leftText);
          rightW = doc.widthOfString(rightText);
        }
        
        const startX = leftMargin + (contentWidth - (leftW + (leftText && rightText ? gap : 0) + rightW)) / 2;
        
        if (leftText) doc.text(leftText, startX, y, { lineBreak: false, width: maxMetaWidth });
        if (rightText) doc.text(rightText, startX + leftW + (leftText ? gap : 0), y, { lineBreak: false, width: maxMetaWidth });
        doc.fontSize(META); // Reset font size
        y += doc.heightOfString('Ag') + mm(2); // Increased spacing after meta
      }

      // ---- DATES ROW (PKG & EXP) ----
      doc.font('Helvetica').fontSize(META);
      const pkgText = `PKG: ${shortDate(it.packageDateISO)}`;
      const expText = `EXP: ${shortDate(it.expiryDateISO)}`;
      const pkgW = doc.widthOfString(pkgText);
      const expW = doc.widthOfString(expText);
      const datesGap = mm(7);
      const datesTotal = pkgW + datesGap + expW;
      const datesX = leftMargin + (contentWidth - datesTotal) / 2;
      
      doc.text(pkgText, datesX, y, { lineBreak: false });
      doc.text(expText, datesX + pkgW + datesGap, y, { lineBreak: false });
      const datesHeight = doc.heightOfString('Ag');
      y += datesHeight + mm(3); // Increased spacing before barcode - critical to prevent overlap

      // ---- BARCODE ----
      try {
        const png: Buffer = await new Promise((res, rej) => {
          bwipjs.toBuffer(
            { 
              bcid: 'code128', 
              text: String(it.barcode), 
              scale: SCALE, 
              height: BAR_H_MM, 
              includetext: human, 
              textxalign: 'center', 
              backgroundcolor: 'FFFFFF' 
            },
            (err, buf) => err ? rej(typeof err === 'string' ? new Error(err) : err) : res(buf)
          );
        });

        // Read PNG dimensions
        let pngWidth = 1, pngHeight = 1;
        try { 
          if (png.length > 24) { 
            pngWidth = png.readUInt32BE(16); 
            pngHeight = png.readUInt32BE(20); 
          } 
        } catch {}
        
        const aspectRatio = pngHeight / pngWidth;

        // Calculate remaining space AFTER dates row with proper margin
        const remainingHeight = (M.top + CH) - y - M.bottom;
        
        // Ensure minimum spacing - barcode should not overlap with dates
        const minBarcodeSpacing = mm(2);
        const availableHeight = Math.max(remainingHeight - minBarcodeSpacing, mm(10));
        
        // Calculate barcode dimensions - use 85% of width for better scannability
        let barcodeWidth = Math.min(BAR_W_MAX * 0.85, contentWidth * 0.85);
        let barcodeHeight = barcodeWidth * aspectRatio;

        // Ensure barcode fits vertically with proper margins
        if (barcodeHeight > availableHeight * 0.9) { 
          barcodeHeight = availableHeight * 0.9; 
          barcodeWidth = barcodeHeight / aspectRatio; 
        }

        // Center barcode horizontally
        const barcodeX = leftMargin + (contentWidth - barcodeWidth) / 2;
        // Position barcode with proper spacing from dates, centered in remaining space
        const barcodeY = y + (availableHeight - barcodeHeight) / 2;

        doc.image(png, barcodeX, barcodeY, { 
          width: barcodeWidth, 
          height: barcodeHeight 
        });
      } catch (err) {
        console.error('Barcode generation error:', err);
      }
    }
  }

  doc.end();
  
  await new Promise<void>((resolve, reject) => {
    stream.once('finish', resolve);
    stream.once('error', reject);
  });

  await print(tmp, { 
    printer: input.printerName, 
    scale: 'noscale' as any 
  });
  
  fs.unlink(tmp, () => {});
  return { success: true };
}