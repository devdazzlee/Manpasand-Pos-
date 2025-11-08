const express = require('express');
const cors = require('cors');
const fs = require('fs');
const os = require('os');
const path = require('path');
const PDFDocument = require('pdfkit');
const { print } = require('pdf-to-printer');
const bwipjs = require('bwip-js');

const app = express();
const PORT = 3001; // Local print server port

// Resolve logo path - handle both src and dist directories (same as backend)
const logoPath = fs.existsSync(path.join(__dirname, '../Frontend/public/logo.png'))
  ? path.resolve(__dirname, '../Frontend/public/logo.png')
  : fs.existsSync(path.join(__dirname, 'logo.png'))
    ? path.resolve(__dirname, 'logo.png')
    : null;

if (logoPath) {
  console.log('Logo path resolved to:', logoPath);
} else {
  console.log('No logo found - receipts will print without logo');
}

// CORS configuration - allow requests from Vercel frontend and localhost
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, Postman)
    if (!origin) return callback(null, true);

    // Allow requests from Vercel frontend domain
    const allowedOrigins = [
      'https://pos.manpasandstore.com',
      'https://manpasand-pos-beta.vercel.app',
      'http://localhost:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001'
    ];

    // Check if origin is in allowed list or contains vercel.app
    if (allowedOrigins.includes(origin) || origin.includes('.vercel.app')) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked origin: ${origin}`);
      callback(null, true); // Allow anyway for development (can restrict in production)
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// Helper functions (same as backend)
function mm(n) {
  return n * 2.83464567;
}

function money(n) {
  return Number(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    printerInitialized: true, // We'll check on actual print
    timestamp: new Date().toISOString()
  });
});

// Helper functions for printer detection (same as backend)
const { execFile } = require('child_process');
const util = require('util');
const execFileAsync = util.promisify(execFile);

function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// Get printers via PowerShell CIM (Windows) - same as backend
async function getPrintersViaCIM() {
  const ps = [
    '-NoProfile',
    '-Command',
    `$p = Get-CimInstance Win32_Printer | Select-Object Name,Default,WorkOffline,PrinterStatus,DriverName,PortName,ServerName,ShareName;
     $p | ConvertTo-Json -Compress -Depth 3`
  ];
  const { stdout } = await execFileAsync('powershell', ps, {
    timeout: 5000,
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024
  });
  const data = safeParseJson(stdout);
  if (!data) return [];

  const items = Array.isArray(data) ? data : [data];
  return items.map((p) => ({
    name: p.Name,
    id: `${String(p.Name).toLowerCase().replace(/\s+/g, '-')}@${process.env.COMPUTERNAME || 'local'}`,
    isDefault: !!p.Default,
    status: p.WorkOffline ? 'offline' : ((p.PrinterStatus === 3 || p.PrinterStatus === 0 || p.PrinterStatus == null) ? 'available' : 'unknown'),
    workOffline: !!p.WorkOffline,
    printerStatus: p.PrinterStatus ?? null,
    serverName: p.ServerName ?? null,
    shareName: p.ShareName ?? null,
    driver: { name: p.DriverName ?? null, version: null, manufacturer: null },
    port: { name: p.PortName ?? null, host: null },
    defaults: null
  }));
}

// Get printers via Get-Printer (Windows) - same as backend
async function getPrintersViaGetPrinter() {
  const ps = [
    '-NoProfile',
    '-Command',
    `$p = Get-Printer | Select-Object Name, PrinterStatus, WorkOffline;
     $p | ConvertTo-Json -Compress -Depth 3`
  ];
  const { stdout } = await execFileAsync('powershell', ps, {
    timeout: 5000,
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024
  });
  const data = safeParseJson(stdout);
  if (!data) return [];
  const items = Array.isArray(data) ? data : [data];
  return items.map((p) => ({
    name: p.Name,
    isDefault: false,
    status: p.WorkOffline ? 'offline' : ((p.PrinterStatus === 3 || p.PrinterStatus === 0 || p.PrinterStatus == null) ? 'available' : 'unknown')
  }));
}

// Get default printer from registry (Windows) - same as backend
async function getDefaultPrinterFromRegistryHKCU() {
  const cmd = [
    'reg',
    'query',
    'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Windows',
    '/v',
    'Device'
  ];
  const { stdout } = await execFileAsync(cmd[0], cmd.slice(1), {
    timeout: 4000,
    windowsHide: true
  });
  const line = stdout.split(/\r?\n/).find(l => l.includes('REG_SZ'));
  if (!line) return null;
  const val = line.split('REG_SZ').pop()?.trim() || '';
  const name = val.split(',')[0]?.trim() || null;
  return name || null;
}

// Normalize and sort printers - same as backend
function normalizeAndSort(printers, defaultName = null) {
  const map = new Map();
  for (const p of printers) {
    const key = p.name.trim();
    const prev = map.get(key);
    map.set(key, {
      ...prev,
      ...p,
      isDefault: p.isDefault || prev?.isDefault || (defaultName ? key === defaultName : false)
    });
  }
  const list = Array.from(map.values());
  list.sort((a, b) => (Number(b.isDefault) - Number(a.isDefault)) || a.name.localeCompare(b.name));
  return list;
}

// Derive language hint - same as backend
function deriveLanguageHint(p) {
  const s = `${p.driver?.name || ''} ${p.name || ''}`.toLowerCase();
  if (s.includes('zebra') || s.includes('zdesigner')) return 'zpl';
  if (s.includes('generic') || s.includes('escpos') || s.includes('blackcopper') || s.includes('80mm') || s.includes('58mm')) return 'escpos';
  return 'generic';
}

// Derive receipt profile - same as backend
function deriveReceiptProfile(p) {
  const w = p.defaults?.pageWidthMM ?? null;
  const name = (p.name || '').toLowerCase();
  const roll = (name.includes('80') || (w !== null && w >= 70)) ? '80mm' : '58mm';
  const printableWidthMM = roll === '80mm' ? 72 : 48;
  const columns = roll === '80mm' ? { fontA: 48, fontB: 64 } : { fontA: 32, fontB: 42 };
  return { roll, printableWidthMM, columns };
}

// Get available printers (same as backend) - Windows only for now
async function getAvailablePrinters() {
  const platform = process.platform;

  if (platform !== 'win32') {
    console.log(`Platform ${platform} not supported for printer detection`);
    return [];
  }

  try {
    let printers = [];

    // Try CIM first
    const cimPrinters = await getPrintersViaCIM().catch(() => []);
    if (cimPrinters.length) {
      printers = normalizeAndSort(cimPrinters);
    } else {
      // Fallback to Get-Printer
      const [gpPrintersRaw, defName] = await Promise.all([
        getPrintersViaGetPrinter().catch(() => []),
        getDefaultPrinterFromRegistryHKCU().catch(() => null)
      ]);
      const gpPrinters = gpPrintersRaw.map((p) => ({
        ...p,
        id: `${String(p.name).toLowerCase().replace(/\s+/g, '-')}@windows`
      }));
      if (gpPrinters.length) {
        printers = normalizeAndSort(gpPrinters, defName);
      }
    }

    // Add derived fields
    printers = printers.map(p => ({
      ...p,
      languageHint: deriveLanguageHint(p),
      receiptProfile: deriveReceiptProfile(p)
    }));

    // Fallback to default if no printers found
    if (printers.length === 0) {
      console.log('No printers detected, returning default printer');
      return [{
        name: 'Default Printer',
        id: 'default@local',
        isDefault: true,
        status: 'available',
        languageHint: 'escpos',
        receiptProfile: { roll: '80mm', printableWidthMM: 72, columns: { fontA: 48, fontB: 64 } }
      }];
    }

    console.log(`Found ${printers.length} printers`);
    return printers;
  } catch (e) {
    console.error('Error getting printers:', e);
    return [{
      name: 'Default Printer',
      id: 'default@local',
      isDefault: true,
      status: 'available',
      languageHint: 'escpos',
      receiptProfile: { roll: '80mm', printableWidthMM: 72, columns: { fontA: 48, fontB: 64 } }
    }];
  }
}

// Get available printers endpoint (same format as backend)
app.get('/printers', async (req, res) => {
  try {
    const printers = await getAvailablePrinters();
    res.json({
      success: true,
      data: printers,
      message: 'Printers fetched successfully'
    });
  } catch (error) {
    console.error('Error getting printers:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      data: []
    });
  }
});

// Print receipt endpoint (using same PDF approach as backend)
app.post('/print-receipt', async (req, res) => {
  try {
    const { printer, job, receiptData } = req.body || {};

    if (!printer?.name || !receiptData) {
      return res.status(400).json({
        success: false,
        message: 'Missing printer.name or receiptData'
      });
    }

    const copies = job?.copies ?? 1;
    // Use logoPath from receiptData if provided, otherwise use default
    const logoToUse = receiptData.logoPath || logoPath;

    // Paper geometry (80mm roll) - same as backend
    const pageWidth = mm(72);
    const margins = {
      left: mm(1.0),
      right: mm(1.0),
      top: mm(4),
      bottom: mm(5)
    };
    const W = pageWidth - margins.left - margins.right;

    // PDF init - start with reasonable height, will be trimmed later
    const tmp = path.join(os.tmpdir(), `receipt_${Date.now()}.pdf`);
    const doc = new PDFDocument({
      size: [pageWidth, mm(1400)],
      margins,
      autoFirstPage: true,
      pdfVersion: '1.4'
    });
    const stream = fs.createWriteStream(tmp);
    doc.pipe(stream);

    // Fonts: use Helvetica-Bold (same as backend)
    const baseFont = 'Helvetica-Bold';
    const boldFont = 'Helvetica-Bold';
    doc.fillColor('#000').strokeColor('#000').opacity(1);

    // Global sizes (same as backend)
    const BODY_MAX = 9.4;
    const BODY_MIN = 7.0;
    const TOTAL_MAX = 11.2;
    const TOTAL_MIN = 7.8;
    const HEAD_MAX = 16;

    doc.font(baseFont).fontSize(BODY_MAX);

    // Util: single-line height for current font size
    const lineH = (size) => {
      doc.fontSize(size);
      return Math.ceil(doc.heightOfString('Ag')) + 2;
    };

    // Fit a text into a width by shrinking font down to min
    function drawFit(text, x, y, width, opts) {
      const font = opts.font || baseFont;
      let size = opts.maxSize;
      doc.font(font);
      const absoluteMin = Math.max(6, opts.minSize * 0.85);
      let textWidth = 0;

      // Shrink to fit
      while (size > absoluteMin) {
        doc.fontSize(size);
        textWidth = doc.widthOfString(text, { characterSpacing: 0 });
        if (textWidth <= width) break;
        size -= 0.1;
      }

      // Always draw without width constraint to prevent clipping
      doc.font(font).fontSize(size);
      textWidth = doc.widthOfString(text, { characterSpacing: 0 });

      let drawX = x;
      if (opts.align === 'right') {
        drawX = x + width - textWidth;
      } else if (opts.align === 'center') {
        drawX = x + (width - textWidth) / 2;
      }

      doc.text(text, drawX, y, { lineBreak: false });
      return size;
    }

    // Draw a two-column row (left label, right value)
    function rowLR(label, value, y, opts) {
      const LBL_W = W * 0.45;
      const maxSize = opts?.maxSize ?? BODY_MAX;
      const minSize = opts?.minSize ?? BODY_MIN;
      const font = opts?.bold ? boldFont : baseFont;

      // Left label
      doc.font(font);
      let sizeL = maxSize;
      doc.fontSize(sizeL);
      while (sizeL > minSize && doc.widthOfString(label) > LBL_W) {
        sizeL -= 0.2;
        doc.fontSize(sizeL);
      }
      doc.fontSize(sizeL);
      doc.text(label, margins.left, y, { lineBreak: false });

      // Right value - NO WIDTH CONSTRAINT
      doc.font(font);
      doc.fontSize(maxSize);
      let sizeR = maxSize;
      doc.fontSize(sizeR);
      let checkWidth = doc.widthOfString(value);
      if (checkWidth > W * 0.7) {
        while (sizeR > 7 && checkWidth > W * 0.7) {
          sizeR -= 0.2;
          doc.fontSize(sizeR);
          checkWidth = doc.widthOfString(value);
        }
      }
      doc.fontSize(sizeR);
      const finalValueWidth = doc.widthOfString(value);
      doc.text(value, margins.left + W - finalValueWidth, y, { lineBreak: false });

      const used = Math.min(sizeL, sizeR);
      return lineH(used);
    }

    // Three-column row (ITEM | QTY | RATE)
    function rowIQR(item, qty, rate, y, opts) {
      const maxSize = opts?.header ? TOTAL_MAX : BODY_MAX;
      const minSize = opts?.header ? TOTAL_MIN : BODY_MIN;
      const font = opts?.header ? boldFont : baseFont;

      const itemW = opts?.header ? W * 0.48 : W * 0.50;
      const qtyW = opts?.header ? W * 0.18 : W * 0.16;
      const rateW = W - (itemW + qtyW);

      const X_ITEM = margins.left;
      const X_QTY = X_ITEM + itemW;
      const X_RATE = X_QTY + qtyW;

      doc.font(font);

      // ITEM - left aligned
      const sizeItem = drawFit(item, X_ITEM, y, itemW, {
        maxSize,
        minSize,
        align: 'left',
        font
      });

      // QTY - center aligned
      const sizeQty = drawFit(qty, X_QTY, y, qtyW, {
        maxSize,
        minSize,
        align: 'center',
        font
      });

      // RATE - right aligned
      const sizeRate = drawFit(rate, X_RATE, y, rateW, {
        maxSize,
        minSize,
        align: 'right',
        font
      });

      const used = Math.min(sizeItem, sizeQty, sizeRate);
      return lineH(used);
    }

    function hr(y, style = 'dotted', thick = 1) {
      const yy = y + 1;
      if (style === 'dotted') doc.dash(1, { space: 2 });
      else doc.undash();
      doc.moveTo(margins.left, yy)
        .lineTo(margins.left + W, yy)
        .lineWidth(thick)
        .stroke();
      doc.undash();
      return yy + 3 - y;
    }

    // ===== HEADER =====
    let y = margins.top;

    // Logo (if provided)
    if (logoToUse && fs.existsSync(logoToUse)) {
      const maxW = mm(30);
      const maxH = mm(14);
      const x = (pageWidth - maxW) / 2;
      doc.image(logoToUse, x, y, { fit: [maxW, maxH] });
      y += maxH + mm(2.0);
    }

    // Store name
    doc.font(boldFont);
    const usedHead = drawFit(
      (receiptData.storeName || 'MANPASAND GENERAL STORE').toUpperCase(),
      margins.left,
      y,
      W,
      { maxSize: HEAD_MAX, minSize: 11.0, align: 'center', font: boldFont }
    );
    y += lineH(usedHead) * 0.9;

    // Tagline / Address
    doc.font(baseFont);
    const tg = receiptData.tagline || 'Quality • Service • Value';
    const usedTg = drawFit(tg, margins.left, y, W, {
      maxSize: BODY_MAX,
      minSize: BODY_MIN,
      align: 'center'
    });
    y += lineH(usedTg) - 2;

    const addr = receiptData.address || '';
    if (addr) {
      const usedAddr = drawFit(addr, margins.left, y, W, {
        maxSize: BODY_MAX,
        minSize: BODY_MIN,
        align: 'center'
      });
      y += lineH(usedAddr) - 2;
    }

    if (receiptData.strn) {
      const usedStrn = drawFit(receiptData.strn, margins.left, y, W, {
        maxSize: BODY_MAX,
        minSize: BODY_MIN,
        align: 'center'
      });
      y += lineH(usedStrn) - 2;
    }

    y += hr(y, 'dotted');

    // ===== META =====
    const when = new Date(receiptData.timestamp || Date.now());
    const lh1 = rowLR('Receipt #', String(receiptData.transactionId), y);
    y += lh1;

    const lh2 = rowLR(
      'Date',
      `${when.toLocaleDateString()} ${when.toLocaleTimeString()}`,
      y
    );
    y += lh2;

    // Cashier | Customer
    const cashierName = receiptData.cashier || 'Walk-in';
    const customerType = receiptData.customerType || 'Walk-in';
    const lh3 = rowLR('Cashier', cashierName, y);
    y += lh3;
    const lh4 = rowLR('Customer', customerType, y);
    y += lh4 + 2;

    y += hr(y, 'dotted');

    // ===== ITEMS HEADER =====
    const lhHdr = rowIQR('ITEM', 'QTY', 'RATE', y, { header: true });
    y += lhHdr;
    y += hr(y, 'solid', 1);

    // ===== ITEMS =====
    for (const it of receiptData.items || []) {
      const name = String(it.name || '');
      const qty = (it.quantity ?? 0).toString() + (it.unit ? ` ${it.unit}` : '');
      const rate = `${money(Number(it.price || 0) * Number(it.quantity || 0))}`;
      const lh = rowIQR(name, qty, rate, y);
      y += lh;
    }

    y += hr(y, 'dotted');

    // ===== TOTALS =====
    const subtotal = Number(receiptData.subtotal || 0);
    const discount = Number(receiptData.discount || 0);
    const tax = receiptData.taxPercent
      ? (subtotal - discount) * (receiptData.taxPercent / 100)
      : 0;
    const total = receiptData.total ?? Math.max(0, subtotal - discount + tax);

    y += rowLR('Subtotal', `PKR ${money(subtotal)}`, y);
    if (receiptData.discount != null && receiptData.discount !== undefined && Number(receiptData.discount) > 0) {
      y += rowLR('Discount', `- PKR ${money(discount)}`, y);
    }
    if (tax > 0) {
      y += rowLR(`Tax (${receiptData.taxPercent?.toFixed(0) || 5}%)`, `PKR ${money(tax)}`, y);
    }

    y += rowLR('Grand Total', `PKR ${money(total)}`, y, {
      bold: true,
      maxSize: TOTAL_MAX,
      minSize: TOTAL_MIN
    });
    y += hr(y, 'dotted');

    // ===== PAYMENT =====
    const paymentMethod = String(receiptData.paymentMethod || 'CASH').toUpperCase();
    y += rowLR('Payment', paymentMethod, y);
    if (receiptData.amountPaid != null) {
      y += rowLR('Paid', `PKR ${money(receiptData.amountPaid)}`, y);
    }
    if (receiptData.changeAmount && receiptData.changeAmount > 0) {
      y += rowLR('Change', `PKR ${money(receiptData.changeAmount)}`, y);
    }
    y += hr(y, 'dotted');

    // Optional promo
    if (receiptData.promo) {
      const used = drawFit(`Promo: ${receiptData.promo}`, margins.left, y, W, {
        maxSize: BODY_MAX,
        minSize: BODY_MIN,
        align: 'center'
      });
      y += lineH(used);
    }

    // ===== BARCODE =====
    if (receiptData.transactionId) {
      const png = await new Promise((resolve, reject) => {
        bwipjs.toBuffer(
          {
            bcid: 'code128',
            text: String(receiptData.transactionId),
            scale: 2,
            height: 10,
            includetext: false,
            backgroundcolor: 'FFFFFF',
            paddingwidth: 0,
            paddingheight: 0
          },
          (err, buf) => (err ? reject(err) : resolve(buf))
        );
      });
      const barW = mm(48);
      const barH = mm(14);
      const x = margins.left + (W - barW) / 2;
      doc.image(png, x, y + 2, { width: barW, height: barH });
      y += barH + 6;
      const used = drawFit(receiptData.transactionId, margins.left, y, W, {
        maxSize: 9.8,
        minSize: 8.0,
        align: 'center'
      });
      y += lineH(used);
    }

    // ===== FOOTER =====
    const usedTy = drawFit(
      receiptData.thankYouMessage || 'Thank you for shopping!',
      margins.left,
      y,
      W,
      { maxSize: 10.6, minSize: 8.6, align: 'center', font: boldFont }
    );
    y += lineH(usedTy) - 2;
    if (receiptData.footerMessage) {
      const usedF = drawFit(receiptData.footerMessage, margins.left, y, W, {
        maxSize: 9.8,
        minSize: 8.0,
        align: 'center'
      });
      y += lineH(usedF);
    }

    // Trim height with safety buffer to avoid bottom cut (same as backend)
    const needed = y + margins.bottom + 16;
    if (needed < doc.page.height) doc.page.height = needed;

    doc.end();
    await new Promise((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
    });

    // Print using pdf-to-printer (same as backend)
    for (let i = 0; i < copies; i++) {
      await print(tmp, { printer: printer.name, scale: 'noscale' });
    }

    // Cleanup
    fs.unlink(tmp, () => { });

    res.json({
      success: true,
      message: 'Receipt printed successfully',
      copies,
      printer: printer.name
    });
  } catch (error) {
    console.error('Print error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🖨️  Print Server running on http://localhost:${PORT}`);
  console.log(`📡 Waiting for print requests...`);
});

// Handle errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled Rejection:', error);
});