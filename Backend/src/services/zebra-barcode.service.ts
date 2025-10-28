// src/services/barcode-zebra.service.ts
import { execFile } from 'child_process';
import util from 'util';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { logger } from '../utils/logger';
const execFileAsync = util.promisify(execFile);

// ===== Types =====
export interface ZebraPrintItem {
  id: string;
  name: string;
  sku?: string;
  code?: string;
  barcode: string;                 // final Code128 content to encode
  netWeight: string;
  price: number;                   // integer/rounded for printing
  packageDateISO: string;          // e.g. 2025-10-27T...
  expiryDateISO?: string;          // optional  
}

export type PaperPreset = '50x30mm' | '60x40mm' | '40x25mm';

export interface ZebraPrintRequest {
  printerName: string;             // e.g. "ZDesigner GC420t"
  copies?: number;                 // per item
  paperSize?: PaperPreset;         // UI dropdown
  dpi?: 203 | 300;                 // default 203 for GC420t
  humanReadable?: boolean;         // print text under barcode
  items: ZebraPrintItem[];
}

export interface PrinterInfo {
  name: string;
  id: string;
  isDefault: boolean;
  status: 'available' | 'offline' | 'unknown';
  workOffline?: boolean;
  printerStatus?: number;
  port?: { name?: string | null; host?: string | null } | null;
  driver?: { name?: string | null; version?: string | null; manufacturer?: string | null } | null;
  defaults?: {
    paperSize?: string | null;
    pageWidthMM?: number | null;
    pageHeightMM?: number | null;
    orientation?: string | null;
    dpi?: { x?: number | null; y?: number | null } | null;
  } | null;
  languageHint?: 'escpos' | 'zpl' | 'generic';
}

// ===== Helpers for printers (same approach you use elsewhere) =====
function safeParseJson<T = any>(text: string): T | null {
  try { return JSON.parse(text); } catch { return null; }
}

async function getPrintersViaCIM(): Promise<PrinterInfo[]> {
  const ps = [
    '-NoProfile',
    '-Command',
    `$p = Get-CimInstance Win32_Printer | Select-Object Name,Default,WorkOffline,PrinterStatus,DriverName,PortName;
     $p | ConvertTo-Json -Compress -Depth 3`
  ];
  const { stdout } = await execFileAsync('powershell', ps, { timeout: 6000, windowsHide: true, maxBuffer: 10 * 1024 * 1024 });
  const data = safeParseJson(stdout);
  if (!data) return [];
  const arr = Array.isArray(data) ? data : [data];
  return arr.map((p: any) => ({
    name: p.Name,
    id: `${String(p.Name).toLowerCase().replace(/\s+/g, '-')}@${process.env.COMPUTERNAME || 'local'}`,
    isDefault: !!p.Default,
    status: p.WorkOffline ? 'offline' : ((p.PrinterStatus === 3 || p.PrinterStatus === 0 || p.PrinterStatus == null) ? 'available' : 'unknown'),
    workOffline: !!p.WorkOffline,
    printerStatus: p.PrinterStatus ?? null,
    port: { name: p.PortName ?? null, host: null },
    driver: { name: p.DriverName ?? null, version: null, manufacturer: null },
    defaults: null,
    languageHint: ((p.DriverName || '').toLowerCase().includes('zebra') || (p.Name || '').toLowerCase().includes('zdesigner')) ? 'zpl' : 'generic'
  }));
}

export class ZebraBarcodeService {
  // List printers (USB and TCP/IP) — no IP required
  async listPrinters(): Promise<PrinterInfo[]> {
    try {
      const list = await getPrintersViaCIM();
      if (list.length) return list.sort((a, b) => (Number(b.isDefault) - Number(a.isDefault)) || a.name.localeCompare(b.name));
      return [{ name: 'Default Printer', id: 'default@local', isDefault: true, status: 'available', languageHint: 'generic' }];
    } catch (e) {
      logger.error('listPrinters error', e);
      return [{ name: 'Default Printer', id: 'default@local', isDefault: true, status: 'available', languageHint: 'generic' }];
    }
  }

  // Send a tiny ZPL to verify spooling to a Windows queue by name
  async testPrinter(printerName: string) {
    const zpl =
      '^XA^PW400^LL200^LH0,0' +
      '^FO20,20^A0N,30,30^FDZebra Test^FS' +
      '^FO20,70^BCN,60,Y,N,N^FDTEST123^FS' +
      '^XZ';
    await this.spoolZPL(printerName, zpl);
    return { success: true, message: 'Test label sent' };
  }

  // Build + print labels
  async printLabels(req: ZebraPrintRequest) {
    const dpi = req.dpi ?? 203;
    const copies = req.copies ?? 1;
    const size = req.paperSize ?? '50x30mm';
    const { wDots, hDots } = this.sizeToDots(size, dpi);

    const labels: string[] = [];
    for (const it of req.items) {
      const title = (it.name || '').toUpperCase().slice(0, 32);
      const pkg = new Date(it.packageDateISO);
      const exp = it.expiryDateISO ? new Date(it.expiryDateISO) : undefined;

      // Layout tuned for 50x30 @ 203dpi, scales by width/height from preset
      const left = 20;
      let y = 18;

      const z: string[] = [];
      z.push('^XA');
      z.push(`^PW${wDots}`);
      z.push(`^LL${hDots}`);
      z.push('^LH0,0');

      // Title
      z.push(`^FO${left},${y}^A0N,26,26^FD${this.escapeZPL(title)}^FS`);
      y += 30;

      // Row: Net Wt | Price
      z.push(`^FO${left},${y}^A0N,22,22^FDNET WT: ${this.escapeZPL(this.formatWeight(it.netWeight))}^FS`);
      z.push(`^FO${wDots - 20 - 180},${y}^A0N,22,22^FDRs ${Math.round(it.price)}^FS`);
      y += 28;

      // Row: PKG | EXP
      z.push(`^FO${left},${y}^A0N,20,20^FDPKG: ${this.dateGB(pkg)}^FS`);
      z.push(`^FO${wDots - 20 - 220},${y}^A0N,20,20^FDEXP: ${exp ? this.dateGB(exp) : '--/--/----'}^FS`);
      y += 28;

      // Barcode (Code128)
      // Height ~60 dots on 30mm label; HRI off (we draw text optionally below)
      z.push(`^FO${left},${y}`);
      z.push(`^BCN,60,N,N,N`);
      z.push(`^FD${this.escapeZPL(it.barcode)}^FS`);
      y += 72;

      if (req.humanReadable) {
        z.push(`^FO${left},${y}^A0N,18,18^FD${this.escapeZPL(it.barcode)}^FS`);
        y += 22;
      }

      z.push('^XZ');

      for (let c = 0; c < copies; c++) labels.push(z.join(''));
    }

    await this.spoolZPL(req.printerName, labels.join('\n'));
    return { success: true, message: `Sent ${labels.length} label(s)` };
  }

  // ===== Low-level spooling (RAW to Windows queue by name) =====
  private async spoolZPL(printerName: string, zplData: string): Promise<void> {
    // Create temp file with ZPL data
    const tmpFile = path.join(os.tmpdir(), `zebra_${Date.now()}.zpl`);
    fs.writeFileSync(tmpFile, zplData, 'utf8');

    try {
      // Method 1: Use Windows COPY command for RAW printing
      const escapedPrinter = printerName.replace(/"/g, '""');
      const escapedFile = tmpFile.replace(/\\/g, '/');
      
      const psScript = `
        $printerName = "${escapedPrinter}"
        $filePath = "${escapedFile}"
        $content = Get-Content $filePath -Raw -Encoding UTF8
        $content | Out-Printer -Name $printerName
      `;

      await execFileAsync('powershell', [
        '-NoProfile',
        '-Command',
        psScript
      ], { timeout: 15000, windowsHide: true });

      // Clean up temp file
      if (fs.existsSync(tmpFile)) {
        fs.unlinkSync(tmpFile);
      }
    } catch (error) {
      // Clean up temp file on error
      if (fs.existsSync(tmpFile)) {
        fs.unlinkSync(tmpFile);
      }
      
      logger.error(`Failed to print ZPL to ${printerName}:`, error);
      throw new Error(`Failed to print to ${printerName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // ===== Small helpers =====
  private sizeToDots(preset: PaperPreset, dpi: number) {
    const mmToDots = (mm: number) => Math.round((mm / 25.4) * dpi);
    switch (preset) {
      case '60x40mm': return { wDots: mmToDots(60), hDots: mmToDots(40) };
      case '40x25mm': return { wDots: mmToDots(40), hDots: mmToDots(25) };
      default:        return { wDots: mmToDots(50), hDots: mmToDots(30) };
    }
  }
  private dateGB(d: Date) {
    return d.toLocaleDateString('en-GB', { day:'2-digit', month:'2-digit', year:'numeric' });
    // If you need fixed formatting without locale: 
    // const dd = String(d.getDate()).padStart(2,'0'); const mm = String(d.getMonth()+1).padStart(2,'0'); const yy = d.getFullYear();
    // return `${dd}/${mm}/${yy}`;
  }
  private formatWeight(s: string) {
    return (s ?? '').trim() || 'Not specified';
  }
  private escapeZPL(s: string) {
    // Escape ^ and \ and ~ which can break ZPL fields
    return String(s).replace(/[\^~\\]/g, ' ');
  }
}
