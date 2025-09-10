// pages/api/printers.ts or app/api/printers/route.ts (depending on your Next.js version)

import { NextApiRequest, NextApiResponse } from 'next';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface PrinterInfo {
  name: string;
  status: string;
  isDefault: boolean;
  type?: string;
}

// For App Router (Next.js 13+)
export async function GET() {
  try {
    const printers = await getPrintersByPlatform();
    return Response.json({ 
      success: true, 
      printers,
      count: printers.length 
    });
  } catch (error: any) {
    console.error('Error fetching printers:', error);
    return Response.json({ 
      success: false, 
      error: error.message || 'Failed to fetch printers',
      printers: [] 
    }, { status: 500 });
  }
}

// For Pages Router (Next.js 12 and below)
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const printers = await getPrintersByPlatform();
    res.status(200).json({ 
      success: true, 
      printers,
      count: printers.length 
    });
  } catch (error: any) {
    console.error('Error fetching printers:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to fetch printers',
      printers: [] 
    });
  }
}

async function getPrintersByPlatform(): Promise<PrinterInfo[]> {
  const platform = process.platform;
  
  switch (platform) {
    case 'win32':
      return await getWindowsPrinters();
    case 'darwin':
      return await getMacPrinters();
    case 'linux':
      return await getLinuxPrinters();
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

async function getWindowsPrinters(): Promise<PrinterInfo[]> {
  try {
    // Get all printers with their properties
    const { stdout } = await execAsync('wmic printer get name,status,default,drivername /format:csv');
    
    // Get default printer separately
    let defaultPrinter = '';
    try {
      const { stdout: defaultOut } = await execAsync('wmic printer where default=true get name /format:csv');
      const defaultLines = defaultOut.split('\n').filter(line => line.includes(',') && !line.includes('Node'));
      if (defaultLines.length > 0) {
        defaultPrinter = defaultLines[0].split(',')[1]?.trim() || '';
      }
    } catch (error) {
      console.warn('Could not determine default printer:', error);
    }

    const printers: PrinterInfo[] = [];
    const lines = stdout.split('\n');
    
    for (const line of lines) {
      if (line.includes(',') && !line.includes('Node') && !line.includes('Default,DriverName,Name,Status')) {
        const parts = line.split(',').map(part => part?.trim() || '');
        
        if (parts.length >= 4 && parts[2]) { // parts[2] should be the name
          const name = parts[2];
          const status = parts[3] || 'Unknown';
          const isDefault = name === defaultPrinter || parts[0] === 'TRUE';
          const driverName = parts[1] || '';
          
          printers.push({
            name,
            status: status === 'OK' ? 'ready' : status.toLowerCase(),
            isDefault,
            type: driverName || 'Unknown'
          });
        }
      }
    }

    // If no printers found via WMIC, try PowerShell as fallback
    if (printers.length === 0) {
      try {
        const { stdout: psOut } = await execAsync('powershell "Get-Printer | Select-Object Name, PrinterStatus, Type | ConvertTo-Csv -NoTypeInformation"');
        const psLines = psOut.split('\n').slice(1); // Skip header
        
        for (const line of psLines) {
          if (line.trim()) {
            const parts = line.replace(/"/g, '').split(',');
            if (parts.length >= 2 && parts[0]) {
              printers.push({
                name: parts[0].trim(),
                status: parts[1]?.toLowerCase() || 'unknown',
                isDefault: false,
                type: parts[2] || 'Unknown'
              });
            }
          }
        }
      } catch (psError) {
        console.warn('PowerShell fallback failed:', psError);
      }
    }

    return printers;
  } catch (error) {
    console.error('Error getting Windows printers:', error);
    throw new Error('Failed to retrieve Windows printers');
  }
}

async function getMacPrinters(): Promise<PrinterInfo[]> {
  try {
    // Get all printers
    const { stdout } = await execAsync('lpstat -p -d');
    const lines = stdout.split('\n');
    const printers: PrinterInfo[] = [];
    let defaultPrinter = '';

    // Find default printer
    for (const line of lines) {
      if (line.includes('system default destination:')) {
        defaultPrinter = line.split(':')[1]?.trim() || '';
        break;
      }
    }

    // Parse printer information
    for (const line of lines) {
      if (line.startsWith('printer')) {
        const parts = line.split(' ');
        if (parts.length >= 2) {
          const name = parts[1];
          let status = 'ready';
          
          if (line.includes('disabled')) {
            status = 'offline';
          } else if (line.includes('idle')) {
            status = 'idle';
          } else if (line.includes('printing')) {
            status = 'printing';
          }

          printers.push({
            name,
            status,
            isDefault: name === defaultPrinter,
            type: 'Unknown'
          });
        }
      }
    }

    // Get additional printer details if available
    for (const printer of printers) {
      try {
        const { stdout: detailOut } = await execAsync(`lpoptions -p "${printer.name}" -l`);
        // Parse additional details if needed
        // This is optional and can be extended based on requirements
      } catch (error) {
        // Ignore errors for individual printer details
      }
    }

    return printers;
  } catch (error) {
    console.error('Error getting macOS printers:', error);
    throw new Error('Failed to retrieve macOS printers');
  }
}

async function getLinuxPrinters(): Promise<PrinterInfo[]> {
  try {
    // Similar to macOS, Linux uses CUPS
    const { stdout } = await execAsync('lpstat -p -d');
    const lines = stdout.split('\n');
    const printers: PrinterInfo[] = [];
    let defaultPrinter = '';

    // Find default printer
    for (const line of lines) {
      if (line.includes('system default destination:')) {
        defaultPrinter = line.split(':')[1]?.trim() || '';
        break;
      } else if (line.includes('no system default destination')) {
        defaultPrinter = '';
      }
    }

    // Parse printer information
    for (const line of lines) {
      if (line.startsWith('printer')) {
        const parts = line.split(' ');
        if (parts.length >= 2) {
          const name = parts[1];
          let status = 'ready';
          
          if (line.includes('disabled')) {
            status = 'offline';
          } else if (line.includes('idle')) {
            status = 'idle';
          } else if (line.includes('printing')) {
            status = 'printing';
          }

          printers.push({
            name,
            status,
            isDefault: name === defaultPrinter,
            type: 'CUPS'
          });
        }
      }
    }

    // Alternative method using lpadmin if lpstat doesn't work
    if (printers.length === 0) {
      try {
        const { stdout: lpadminOut } = await execAsync('lpadmin -x 2>/dev/null || lpstat -s');
        // Parse lpadmin output if needed
      } catch (error) {
        // Ignore errors for alternative method
      }
    }

    return printers;
  } catch (error) {
    console.error('Error getting Linux printers:', error);
    throw new Error('Failed to retrieve Linux printers');
  }
}