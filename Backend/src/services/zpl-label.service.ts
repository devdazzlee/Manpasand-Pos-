// ZPL Label Service for Zebra/ZDdesigner Printers (GC420t)
// This service generates proper ZPL commands that respect printer settings
import os from 'os';
import fs from 'fs';
import path from 'path';
import util from 'util';
import { execFile, exec } from 'child_process';
import { promisify } from 'util';
const execFileAsync = util.promisify(execFile);
const execAsync = promisify(exec);

export interface LabelItem {
  id: string;
  name: string;
  barcode: string;
  netWeight?: string;
  price?: number;
  packageDateISO?: string;
  expiryDateISO?: string;
}

export interface ZPLPrintOptions {
  printerName: string;
  items: LabelItem[];
  paperSize?: '3x2inch' | '50x30mm' | '60x40mm';
  copies?: number;
  dpi?: 203 | 300;
  humanReadable?: boolean;
}

// Convert mm to dots at specified DPI
const mmToDots = (mm: number, dpi: number) => Math.round((mm / 25.4) * dpi);

// Convert inches to dots
const inchToDots = (inches: number, dpi: number) => Math.round(inches * dpi);

// Get label dimensions in dots based on paper size and DPI
function getLabelDimensions(paperSize: string, dpi: number) {
  switch (paperSize) {
    case '3x2inch':
      return {
        width: inchToDots(3, dpi),    // 609 dots at 203 DPI
        height: inchToDots(2, dpi),   // 406 dots at 203 DPI
      };
    case '50x30mm':
      return {
        width: mmToDots(50, dpi),
        height: mmToDots(30, dpi),
      };
    case '60x40mm':
      return {
        width: mmToDots(60, dpi),
        height: mmToDots(40, dpi),
      };
    default:
      return {
        width: inchToDots(3, dpi),
        height: inchToDots(2, dpi),
      };
  }
}

// Format date to DD/MM/YYYY
function formatDate(isoDate?: string): string {
  if (!isoDate) return '__/__/____';
  try {
    const date = new Date(isoDate);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return '__/__/____';
  }
}

// Escape special ZPL characters
function escapeZPL(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\^/g, '\\^')
    .replace(/~/g, '\\~')
    .replace(/`/g, '\\`');
}

// Generate ZPL for a single label
function generateLabelZPL(item: LabelItem, options: { width: number; height: number; dpi: number; humanReadable: boolean }): string {
  const { width, height, dpi, humanReadable } = options;
  
  // Calculate font sizes based on DPI (larger for 300 DPI)
  const fontSizeLarge = dpi === 300 ? 35 : 28;
  const fontSizeMedium = dpi === 300 ? 26 : 22;
  const fontSizeSmall = dpi === 300 ? 20 : 18;
  const fontSizeTiny = dpi === 300 ? 16 : 14;

  // Margins (safe printing area)
  const marginX = dpi === 300 ? 15 : 10;
  const marginY = dpi === 300 ? 10 : 8;
  
  // Content area
  const contentWidth = width - (marginX * 2);
  const startX = marginX;
  
  // Y positions (in dots from top)
  let yPos = marginY;
  const lineHeight = dpi === 300 ? 30 : 24;
  const lineSpacing = dpi === 300 ? 8 : 6;

  // Product name (Title) - centered, auto-wrap if needed
  const productName = escapeZPL((item.name || '').trim().toUpperCase());
  const titleY = yPos;
  
  // Price (right aligned, same line as title if space permits)
  const priceText = Number.isFinite(item.price) ? `RS ${Math.round(Number(item.price))}` : '';
  const priceY = yPos;

  yPos += lineHeight + lineSpacing;

  // Meta row (Weight and Price if not on title line)
  let metaY = yPos;
  const netWeightText = item.netWeight ? `NET WT: ${escapeZPL(item.netWeight)}` : '';
  
  yPos += lineHeight + (lineSpacing * 2);

  // Dates row
  const pkgDate = formatDate(item.packageDateISO);
  const expDate = formatDate(item.expiryDateISO);
  const pkgText = `PKG: ${pkgDate}`;
  const expText = `EXP: ${expDate}`;
  const datesY = yPos;
  
  yPos += lineHeight + (lineSpacing * 3);

  // Barcode position and size
  // Barcode height in dots
  const barcodeHeight = dpi === 300 ? 100 : 70;
  const barcodeY = yPos;
  
  // Module width (bar width multiplier)
  // For 203 DPI: 2-3 is typical, for 300 DPI: 3-4 is typical
  const barcodeBarWidth = dpi === 300 ? 3 : 2;
  
  // Calculate approximate max barcode width (for centering)
  const maxBarcodeWidth = contentWidth * 0.92;

  // Build ZPL command
  let zpl = '^XA\n'; // Start label
  
  // Label format setup
  zpl += `^PW${width}\n`;  // Print width
  zpl += `^LL${height}\n`; // Label length
  zpl += `^LH0,0\n`;       // Label home position
  zpl += `^CI28\n`;        // Character set (UTF-8 support)
  zpl += `^FWN\n`;         // Field orientation normal (portrait)
  
  // Product name - centered with auto-wrap
  if (productName) {
    zpl += `^CF0,${fontSizeLarge}\n`; // Set font
    // Use FB (Field Block) for automatic text wrapping and centering
    zpl += `^FO${startX},${titleY}^FB${contentWidth},2,0,C,0^FD${productName}^FS\n`;
  }

  // Price - right aligned on same line or next line
  if (priceText && productName.length < 20) {
    // If title is short, put price on same line (right)
    zpl += `^CF0,${fontSizeMedium}\n`;
    zpl += `^FO${startX},${priceY}^FB${contentWidth},1,0,R,0^FD${priceText}^FS\n`;
  }

  // Meta row (Weight)
  if (netWeightText) {
    zpl += `^CF0,${fontSizeSmall}\n`;
    zpl += `^FO${startX},${metaY}^FD${netWeightText}^FS\n`;
    
    // Price on same line if title was long
    if (priceText && productName.length >= 20) {
      zpl += `^FO${startX},${metaY}^FB${contentWidth},1,0,R,0^FD${priceText}^FS\n`;
    }
  } else if (priceText && productName.length >= 20) {
    // Price only on meta line if no weight
    zpl += `^CF0,${fontSizeSmall}\n`;
    zpl += `^FO${startX},${metaY}^FB${contentWidth},1,0,R,0^FD${priceText}^FS\n`;
  }

  // Dates row
  zpl += `^CF0,${fontSizeSmall}\n`;
  zpl += `^FO${startX},${datesY}^FD${pkgText}^FS\n`;
  zpl += `^FO${startX},${datesY}^FB${contentWidth},1,0,R,0^FD${expText}^FS\n`;

  // Barcode (Code 128) - centered
  if (item.barcode) {
    // Center the barcode horizontally
    // For Code 128, we approximate the width, but ZPL will handle actual sizing
    const barcodeX = Math.floor((width - maxBarcodeWidth) / 2);
    
    // Set barcode default parameters: ^BY = module width multiplier, wide bar ratio, bar height
    // Note: The third parameter in ^BY should be bar height, but ^BC overrides it
    zpl += `^BY${barcodeBarWidth}\n`;
    
    // ^BC = Code 128
    // N = normal (portrait) orientation
    // height = barcode height in dots
    // Y/N = print human readable interpretation line below barcode
    // N = no check digit above code
    // N = no check digit below code
    const hri = humanReadable ? 'Y' : 'N';
    zpl += `^FO${barcodeX},${barcodeY}^BCN,${barcodeHeight},${hri},N,N\n`;
    zpl += `^FD${escapeZPL(String(item.barcode))}^FS\n`;
  }

  zpl += '^XZ\n'; // End label

  return zpl;
}

// Export function to generate ZPL without printing (for testing/preview)
export function generateZPLCode(options: Omit<ZPLPrintOptions, 'printerName'>): string {
  const {
    items,
    paperSize = '3x2inch',
    copies = 1,
    dpi = 203,
    humanReadable = false,
  } = options;

  const dimensions = getLabelDimensions(paperSize, dpi);
  let zplCommands = '';

  for (const item of items) {
    const itemZPL = generateLabelZPL(item, {
      width: dimensions.width,
      height: dimensions.height,
      dpi,
      humanReadable,
    });

    for (let i = 0; i < copies; i++) {
      zplCommands += itemZPL;
    }
  }

  return zplCommands;
}

// Main function to generate and print ZPL labels
export async function printZPLLabels(options: ZPLPrintOptions): Promise<{ success: boolean; message?: string; zplPreview?: string; tempFile?: string }> {
  try {
    const {
      printerName,
      items,
      paperSize = '3x2inch',
      copies = 1,
      dpi = 203,
      humanReadable = false,
    } = options;

    if (!printerName || !items || items.length === 0) {
      return { success: false, message: 'Missing printerName or items' };
    }

    // Get label dimensions
    const dimensions = getLabelDimensions(paperSize, dpi);

    // Generate ZPL for all items
    const zplCommands = generateZPLCode({
      items,
      paperSize,
      copies,
      dpi,
      humanReadable,
    });

    // Write ZPL to temp file
    const tempFile = path.join(os.tmpdir(), `zpl_label_${Date.now()}_${Math.random().toString(36).slice(2)}.zpl`);
    await fs.promises.writeFile(tempFile, zplCommands, 'utf8');

    console.log('Generated ZPL:', zplCommands.substring(0, 500) + '...');
    console.log('ZPL file saved to:', tempFile);

    // Try multiple methods to send to printer
    let success = false;
    let lastError: any = null;

    // Get printer port information
    let printerPort: string | null = null;
    let shareName: string | null = null;
    
    try {
      // Get printer info using WMIC with CSV format for easier parsing
      const { stdout } = await execFileAsync('wmic', [
        'printer', 'where', `name="${printerName.replace(/"/g, '\\"')}"`, 'get', 'PortName,ShareName', '/format:csv',
      ], { windowsHide: true, timeout: 5000 });
      
      // Parse CSV format: Node,Default,Name,PortName,PrinterStatus,ShareName
      const lines = stdout.split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        if (line.includes('PortName') || line.includes('ShareName')) continue; // Skip header
        const parts = line.split(',');
        if (parts.length >= 6) {
          // CSV order: Node,Default,Name,PortName,PrinterStatus,ShareName
          printerPort = parts[3]?.trim() || null;
          shareName = parts[5]?.trim() || null;
          
          // Filter out invalid values
          if (printerPort === 'NULL' || printerPort === 'PortName' || !printerPort) printerPort = null;
          if (shareName === 'NULL' || shareName === 'ShareName' || !shareName) shareName = null;
          break;
        }
      }
      
      console.log(`Printer Port: ${printerPort || 'Not found'}, Share: ${shareName || 'Not found'}`);
    } catch (error) {
      console.log('Failed to get printer info:', error);
    }
    
    // If we got shareName as USB001 but no port, use shareName as port
    if (!printerPort && shareName && (shareName.startsWith('USB') || shareName.startsWith('COM') || shareName.startsWith('LPT'))) {
      printerPort = shareName;
      console.log(`Using share name as port: ${printerPort}`);
    }

    // Method 1: Direct port write for COM/LPT/USB printers (BEST METHOD - bypasses driver)
    if (printerPort && (printerPort.startsWith('COM') || printerPort.startsWith('LPT') || printerPort.startsWith('USB'))) {
      try {
        console.log(`Attempting direct write to port: ${printerPort}`);
        
        // For USB/COM/LPT ports, use COPY command with /B flag (binary mode)
        // This sends raw data directly to the port, bypassing the driver completely
        const { stdout, stderr } = await execAsync(`copy /b "${tempFile}" "${printerPort}"`, { windowsHide: true, timeout: 10000 });
        
        // Check if copy actually succeeded (not 0 files)
        if (stdout && stdout.includes('file(s) copied') && !stdout.includes('0 file')) {
          success = true;
          console.log(`✅ Successfully sent raw ZPL via direct port ${printerPort}`);
        } else {
          throw new Error(`Copy command returned: ${stdout || stderr || 'unknown error'}`);
        }
      } catch (portError: any) {
        console.log(`Direct port write to ${printerPort} failed:`, portError.message || portError);
        lastError = portError;
      }
    }

    // Method 2: Direct COPY to printer share (UNC path)
    if (!success && shareName) {
      try {
        const hostname = os.hostname();
        const uncPaths = [
          `\\\\localhost\\${shareName}`,
          `\\\\${hostname}\\${shareName}`,
          `\\\\127.0.0.1\\${shareName}`,
        ];
        
        for (const uncPath of uncPaths) {
          try {
            console.log(`Attempting COPY to UNC: ${uncPath}`);
            await execAsync(`copy /b "${tempFile}" "${uncPath}"`, { windowsHide: true, timeout: 10000 });
            
            success = true;
            console.log('Successfully sent via COPY to UNC');
            break;
          } catch (uncError) {
            console.log(`UNC path ${uncPath} failed, trying next...`);
            lastError = uncError;
          }
        }
      } catch (error) {
        console.log('COPY to UNC failed:', error);
        lastError = error;
      }
    }

    // Method 3: Try direct copy to printer name as UNC
    if (!success) {
      try {
        console.log(`Attempting direct copy to printer name: ${printerName}`);
        await execAsync(`cmd /c copy /b "${tempFile}" "\\\\localhost\\${printerName}"`, { windowsHide: true, timeout: 10000 });
        success = true;
        console.log('Successfully sent via direct printer name copy');
      } catch (error) {
        console.log('Direct printer name copy failed:', error);
        lastError = error;
      }
    }

    // Method 4: Use .NET to send raw bytes directly to printer
    if (!success) {
      try {
        console.log(`Attempting .NET RawPrinterHelper to: ${printerName}`);
        // Create a temporary PowerShell script file for more reliable execution
        const psScriptFile = path.join(os.tmpdir(), `print_raw_${Date.now()}.ps1`);
        const psScript = `
$printerName = '${printerName}'
$filePath = '${tempFile.replace(/\\/g, '\\\\')}'
$fileContent = [System.IO.File]::ReadAllBytes($filePath)

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class RawPrinterHelper {
    [DllImport("winspool.drv", CharSet = CharSet.Auto, SetLastError = true)]
    public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string printerName, out IntPtr hPrinter, IntPtr printerDefaults);
    
    [DllImport("winspool.drv", SetLastError = true, ExactSpelling = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);
    
    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, [MarshalAs(UnmanagedType.LPStr)] string jobName, int level, IntPtr docInfo);
    
    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);
    
    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);
    
    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);
    
    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);
}

public static class PrinterHelper {
    public static bool SendRawData(string printerName, byte[] data) {
        IntPtr hPrinter = IntPtr.Zero;
        try {
            if (!RawPrinterHelper.OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) {
                return false;
            }
            
            // Use DOCINFO struct for StartDocPrinter
            string jobName = "ZPL Print Job";
            int level = 1;
            
            if (!RawPrinterHelper.StartDocPrinter(hPrinter, jobName, level, IntPtr.Zero)) {
                return false;
            }
            
            if (!RawPrinterHelper.StartPagePrinter(hPrinter)) {
                return false;
            }
            
            IntPtr pBytes = Marshal.AllocHGlobal(data.Length);
            Marshal.Copy(data, 0, pBytes, data.Length);
            int dwWritten = 0;
            
            bool success = RawPrinterHelper.WritePrinter(hPrinter, pBytes, data.Length, out dwWritten);
            
            Marshal.FreeHGlobal(pBytes);
            RawPrinterHelper.EndPagePrinter(hPrinter);
            RawPrinterHelper.EndDocPrinter(hPrinter);
            
            return success;
        } finally {
            if (hPrinter != IntPtr.Zero) {
                RawPrinterHelper.ClosePrinter(hPrinter);
            }
        }
    }
}
"@

$result = [PrinterHelper]::SendRawData($printerName, $fileContent)
if ($result) {
    Write-Host "SUCCESS"
} else {
    Write-Host "FAILED: $([System.Runtime.InteropServices.Marshal]::GetLastWin32Error())"
    exit 1
}
        `;
        
        await fs.promises.writeFile(psScriptFile, psScript, 'utf8');
        const { stdout, stderr } = await execAsync(`powershell -ExecutionPolicy Bypass -File "${psScriptFile}"`, { windowsHide: true, timeout: 20000 });
        
        // Clean up script file
        try {
          await fs.promises.unlink(psScriptFile);
        } catch {}
        
        if (stdout && stdout.includes('SUCCESS')) {
          success = true;
          console.log('Successfully sent via .NET RawPrinterHelper');
        } else {
          throw new Error(stderr || stdout || 'Failed to send via .NET');
        }
      } catch (error) {
        console.log('.NET RawPrinterHelper failed:', error);
        lastError = error;
      }
    }

    // Method 5: Try copying to USB port directly (if USB port detected)
    if (!success && printerPort && printerPort.startsWith('USB')) {
      try {
        console.log(`Attempting direct USB port copy: ${printerPort}`);
        // Try copying directly to USB port - this often works for USB printers
        const { stdout } = await execAsync(`copy /b "${tempFile}" "${printerPort}"`, { windowsHide: true, timeout: 10000 });
        
        // Check if copy actually succeeded
        if (stdout && stdout.includes('file(s) copied') && !stdout.includes('0 file')) {
          success = true;
          console.log(`Successfully sent via USB port ${printerPort}`);
        } else {
          throw new Error('Copy returned 0 files');
        }
      } catch (error) {
        console.log(`USB port copy failed: ${error}`);
        lastError = error;
      }
    }

    // Method 6: Use Windows PRINT command (LAST RESORT - often formats data incorrectly)
    if (!success) {
      try {
        console.log(`⚠️ Attempting PRINT command (may format data incorrectly): ${printerName}`);
        await execAsync(`print /D:"${printerName}" "${tempFile}"`, { windowsHide: true, timeout: 15000 });
        
        // Don't mark as success - PRINT command often formats instead of sending raw
        console.log('⚠️ PRINT command executed, but data may be formatted. Check printer settings for RAW mode.');
        success = false; // Set to false to trigger error message
        lastError = new Error('PRINT command sent data but it may be formatted. Set printer to RAW mode in printer properties.');
      } catch (error) {
        console.log('PRINT command failed:', error);
        lastError = error;
      }
    }

    // Final check: If all methods failed, provide detailed error info
    if (!success) {
      console.error('All printing methods failed!');
      console.error('Printer Info:', { printerName, printerPort, shareName });
      console.error('Last Error:', lastError);
      
      // Provide helpful error message
      const errorDetails = lastError?.stderr || lastError?.stdout || lastError?.message || String(lastError);
      return {
        success: false,
        message: `Failed to print. Printer: ${printerName}, Port: ${printerPort || 'Unknown'}, Share: ${shareName || 'None'}. Error: ${errorDetails}. Make sure the printer driver is set to "RAW" mode in printer properties.`,
        zplPreview: zplCommands.substring(0, 1000),
      };
    }

    // Don't delete temp file immediately - keep it for manual testing if needed
    const keepTempFile = !success; // Keep file if printing failed for debugging
    
    if (!keepTempFile) {
      try {
        await fs.promises.unlink(tempFile);
      } catch (error) {
        console.warn('Failed to delete temp file:', error);
      }
    } else {
      console.log(`⚠️ ZPL file kept for manual testing: ${tempFile}`);
      console.log(`To test manually, run: copy /b "${tempFile}" "\\\\localhost\\${printerName}"`);
    }

    if (success) {
      return { 
        success: true, 
        message: `Successfully sent ${items.length} label(s) to printer. Check printer for output.`,
        zplPreview: zplCommands.substring(0, 1000), // First 1000 chars for debugging
        tempFile: keepTempFile ? tempFile : undefined,
      };
    } else {
      const errorMsg = lastError?.message || lastError?.stderr || lastError?.stdout || String(lastError);
      return {
        success: false,
        message: `Failed to print. Make sure: 1) Printer driver is set to RAW mode, 2) Printer is online, 3) ZPL file: ${tempFile}. Error: ${errorMsg}`,
        zplPreview: zplCommands.substring(0, 1000),
        tempFile: tempFile, // Always include temp file path for manual testing
      };
    }
  } catch (error: any) {
    console.error('ZPL printing error:', error);
    return {
      success: false,
      message: error?.message || 'Unknown error occurred while printing',
      tempFile: undefined,
    };
  }
}

