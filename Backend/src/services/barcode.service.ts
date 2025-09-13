import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

interface Product {
  id: string;
  name: string;
  sku?: string;
  code?: string;
  sales_rate_exc_dis_and_tax?: number;
  netWeight: string;
  packageDate: string;
  expiryDate: string;
}

interface PrintSettings {
  paperSize?: string;
  copies?: number;
}

export class BarcodeService {
  // Get available printers using Windows command
  async getAvailablePrinters(): Promise<any[]> {
    try {
      // Try multiple methods to get printer list
      let printers: any[] = [];
      
      // Method 1: Try PowerShell Get-Printer command
      try {
        const { stdout } = await execAsync('powershell "Get-Printer | Select-Object Name, Default | ConvertTo-Json"');
        const printerData = JSON.parse(stdout);
        
        if (Array.isArray(printerData)) {
          printers = printerData.map((printer: any) => ({
            name: printer.Name,
            isDefault: printer.Default || false,
            status: 'available'
          }));
        }
      } catch (psError) {
        logger.warn('PowerShell method failed, trying alternative:', psError);
        
        // Method 2: Try WMIC with different syntax
        try {
          const { stdout } = await execAsync('wmic printer list brief /format:csv');
          const lines = stdout.split('\n').filter(line => line.trim() && !line.includes('Node'));
          
          printers = lines.map(line => {
            const parts = line.split(',');
            if (parts.length >= 2) {
              const name = parts[1]?.trim();
              return {
                name,
                isDefault: false, // WMIC doesn't easily show default status
                status: 'available'
              };
            }
            return null;
          }).filter(Boolean);
        } catch (wmicError) {
          logger.warn('WMIC method failed, trying registry method:', wmicError);
          
          // Method 3: Try registry query
          try {
            const { stdout } = await execAsync('reg query "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Print\\Printers" /s /f "Printer"');
            const lines = stdout.split('\n');
            const printerNames = new Set<string>();
            
            lines.forEach(line => {
              const match = line.match(/HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Print\\Printers\\([^\\]+)/);
              if (match) {
                printerNames.add(match[1]);
              }
            });
            
            printers = Array.from(printerNames).map(name => ({
              name,
              isDefault: false,
              status: 'available'
            }));
          } catch (regError) {
            logger.error('All printer detection methods failed:', regError);
            throw new Error('Unable to detect printers using any method');
          }
        }
      }
      
      // If no printers found, return a default printer option
      if (printers.length === 0) {
        printers = [
          {
            name: 'Default Printer',
            isDefault: true,
            status: 'available'
          }
        ];
      }
      
      logger.info(`Found ${printers.length} printers`);
      return printers;
    } catch (error) {
      logger.error('Error getting printers:', error);
      // Return a fallback printer instead of throwing error
      return [
        {
          name: 'Default Printer',
          isDefault: true,
          status: 'available'
        }
      ];
    }
  }

  // Test printer connection
  async testPrinterConnection(printerName: string): Promise<any> {
    try {
      // Try PowerShell first
      try {
        const { stdout } = await execAsync(`powershell "Get-Printer -Name '${printerName}' | Select-Object Name"`);
        if (stdout.includes(printerName)) {
          return {
            success: true,
            message: 'Printer connection successful',
            printerName
          };
        }
      } catch (psError) {
        logger.warn('PowerShell printer test failed, trying alternative:', psError);
        
        // Try WMIC alternative
        try {
          const { stdout } = await execAsync(`wmic printer where name="${printerName}" get name /format:csv`);
          if (stdout.includes(printerName)) {
            return {
              success: true,
              message: 'Printer connection successful',
              printerName
            };
          }
        } catch (wmicError) {
          logger.warn('WMIC printer test failed:', wmicError);
        }
      }
      
      // If we get here, printer not found
      return {
        success: false,
        message: 'Printer not found or not accessible',
        printerName
      };
    } catch (error) {
      logger.error('Error testing printer:', error);
      return {
        success: false,
        message: 'Failed to test printer connection',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Generate EPL commands for barcode labels (GC420t EPL mode)
  private generateEPL(product: Product, settings: PrintSettings = {}): string {
    const name = (product.name || "").toUpperCase();
    const weight = this.formatWeightDisplay(product.netWeight);
    const price = Math.round(
      Number(this.calculatePriceByWeight(product.netWeight, product.sales_rate_exc_dis_and_tax))
    );
    const pkg = this.formatDate(new Date(product.packageDate));
    const exp = this.formatDate(new Date(product.expiryDate));
    const barcodeValue = `${product.sku || product.code || "PROD"}-${price}`;

    // Generate EPL commands for the label - GC420t EPL format
    const epl = `N
A50,50,0,2,1,1,N,"${name}"
A50,120,0,2,1,1,N,"${weight}"
A250,120,0,2,1,1,N,"Rs ${price}"
B50,150,0,1,2,2,50,N,"${barcodeValue}"
A50,220,0,2,1,1,N,"Pkg: ${pkg}"
A250,220,0,2,1,1,N,"Exp: ${exp}"
P1`;

    return epl;
  }

  // Print barcodes to specified printer
  async printBarcodes(products: Product[], printerName: string, settings: PrintSettings = {}): Promise<any> {
    try {
      // Validate printer exists
      const printerTest = await this.testPrinterConnection(printerName);
      if (!printerTest.success) {
        throw new Error(`Printer "${printerName}" not found or not accessible`);
      }

      // Stop any existing print jobs to prevent continuous printing
      try {
        await execAsync(`powershell "Get-Printer -Name '${printerName}' | Get-PrintJob | Remove-PrintJob"`);
        logger.info('Cleared existing print jobs');
      } catch (clearError) {
        logger.warn('Could not clear print jobs:', clearError);
      }

      // Get the actual printer name and port info
      try {
        const { stdout } = await execAsync(`powershell "Get-Printer -Name '${printerName}' | Select-Object Name, PortName, DriverName | ConvertTo-Json"`);
        const printerInfo = JSON.parse(stdout);
        logger.info('Printer info:', printerInfo);
      } catch (infoError) {
        logger.warn('Could not get printer info:', infoError);
      }

      // Generate EPL commands for all products
      let allEplCommands = "";
      const copies = Math.min(settings.copies || 1, 5); // Limit to max 5 copies to prevent issues

      for (let copy = 0; copy < copies; copy++) {
        products.forEach((product) => {
          allEplCommands += this.generateEPL(product, settings);
        });
      }

      // Save EPL to temporary file
      const tempDir = path.join(process.cwd(), 'temp');
      
      // Create temp directory if it doesn't exist
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const tempFile = path.join(tempDir, `barcode_${Date.now()}.epl`);
      fs.writeFileSync(tempFile, allEplCommands);
      
      // Also create a .prn file (Windows raw printer file)
      const prnFile = path.join(tempDir, `barcode_${Date.now()}.prn`);
      fs.writeFileSync(prnFile, allEplCommands);
      
      // Also save to desktop for easy testing
      const desktopPath = path.join(process.env.USERPROFILE || '', 'Desktop', `barcode_${Date.now()}.epl`);
      try {
        fs.writeFileSync(desktopPath, allEplCommands);
        logger.info('EPL file also saved to desktop:', desktopPath);
      } catch (desktopError) {
        logger.warn('Could not save to desktop:', desktopError);
      }
      
      // No need for test ZPL - go directly to printing
      
      // Create a batch file for printing (more reliable)
      const batchFile = path.join(tempDir, `print_${Date.now()}.bat`);
      const batchContent = `@echo off
echo Printing to ${printerName}
print /d:"${printerName}" "${tempFile}"
if %errorlevel% neq 0 (
    echo Print command failed, trying direct port
    type "${tempFile}" > "USB001"
)
echo Print job completed`;
      fs.writeFileSync(batchFile, batchContent);
      logger.info('Batch file created:', batchFile);
      
      // Log the EPL content for debugging
      logger.info('EPL Content:', allEplCommands);
      logger.info('Temp file created:', tempFile);

      try {
        // Try multiple printing methods
        let printSuccess = false;
        let printError: any = null;
        
        // Method 1: Try multiple different approaches
        try {
          logger.info(`Attempting multiple printing methods to: ${printerName}`);
          
          // Try different methods in sequence
          const methods = [
            `print /d:"${printerName}" "${tempFile}"`,
            `copy "${tempFile}" USB001`,
            `type "${tempFile}" > USB001`,
            `copy "${tempFile}" "\\\\localhost\\${printerName}"`,
            `copy "${tempFile}" "\\\\127.0.0.1\\${printerName}"`
          ];
          
          for (const method of methods) {
            try {
              logger.info(`Trying method: ${method}`);
              await execAsync(method);
              printSuccess = true;
              logger.info(`Method successful: ${method}`);
              break;
            } catch (methodError) {
              logger.warn(`Method failed: ${method}`, methodError);
            }
          }
          
          if (printSuccess) {
            logger.info('One of the printing methods was successful');
          } else {
            throw new Error('All printing methods failed');
          }
        } catch (printError) {
          logger.warn('Windows print command failed, trying alternative approach:', printError);
          printError = printError;
          
          // Method 2: Try PowerShell with binary data
          try {
            logger.info(`Attempting PowerShell binary printing`);
            const escapedPrinterName = printerName.replace(/'/g, "''");
            await execAsync(`powershell "[System.IO.File]::WriteAllBytes('${tempFile}', [System.IO.File]::ReadAllBytes('${tempFile}')); Get-Content '${tempFile}' -Raw | Out-Printer -Name '${escapedPrinterName}'"`);
            printSuccess = true;
            logger.info('PowerShell binary printing successful');
          } catch (psError) {
            logger.warn('PowerShell binary printing failed, trying .prn file method:', psError);
            printError = psError;
            
            // Method 3: Try direct port using printer's actual port
            try {
              logger.info(`Attempting direct port printing using printer port`);
              
              // Get the actual printer port from Windows
              const { stdout: portInfo } = await execAsync(`powershell "Get-Printer -Name '${printerName}' | Select-Object -ExpandProperty PortName"`);
              const printerPort = portInfo.trim();
              logger.info(`Printer port: ${printerPort}`);
              
              // Send ZPL directly to the printer's port
              await execAsync(`type "${tempFile}" > "${printerPort}"`);
              printSuccess = true;
              logger.info('Direct port printing successful');
            } catch (portError) {
              logger.warn('Direct port failed, trying batch file:', portError);
              printError = portError;
              
              // Method 4: Try batch file approach
              try {
                await execAsync(`"${batchFile}"`);
                printSuccess = true;
                logger.info('Batch file printing successful');
              } catch (batchError) {
                logger.error('All printing methods failed:', batchError);
                printError = batchError;
              }
            }
          }
        }
        
        // Clean up temp files
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
        if (fs.existsSync(prnFile)) {
          fs.unlinkSync(prnFile);
        }
        if (fs.existsSync(batchFile)) {
          fs.unlinkSync(batchFile);
        }
        
        if (printSuccess) {
          logger.info(`Successfully printed ${products.length} barcodes to ${printerName}`);
          
          // Add a small delay to prevent rapid-fire printing
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          return {
            success: true,
            message: `Successfully sent ${products.length} labels to printer`,
            printedCount: products.length,
            printerName
          };
        } else {
          throw printError || new Error('All printing methods failed');
        }
      } catch (printError) {
        // Clean up temp files on error
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
        if (fs.existsSync(prnFile)) {
          fs.unlinkSync(prnFile);
        }
        if (fs.existsSync(batchFile)) {
          fs.unlinkSync(batchFile);
        }
        throw printError;
      }

    } catch (error) {
      logger.error('Error printing barcodes:', error);
      throw new Error(`Failed to print barcodes: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Helper methods (copied from frontend logic)
  private parseWeightToGrams(weightInput: any): number {
    if (!weightInput || weightInput.trim() === "") return 0;

    const input = weightInput.toLowerCase().trim();
    let weight = 0;

    const numberMatch = input.match(/(\d+\.?\d*)/);
    if (!numberMatch) return 0;

    const number = Number.parseFloat(numberMatch[1]);

    if (input.includes("kg")) {
      weight = number * 1000;
    } else if (input.includes("g") && !input.includes("kg")) {
      weight = number;
    } else if (input.includes("ml") || input.includes("l")) {
      if (input.includes("ml")) {
        weight = number;
      } else if (input.includes("l")) {
        weight = number * 1000;
      }
    } else {
      weight = number;
    }

    return weight;
  }

  private calculatePriceByWeight(netWeightInput: any, basePrice: any): number {
    if (!netWeightInput || !basePrice) return basePrice || 0;

    const input = netWeightInput.toLowerCase().trim();
    const numberMatch = input.match(/(\d+\.?\d*)/);
    if (!numberMatch) return basePrice;

    const weightValue = Number.parseFloat(numberMatch[1]);
    if (weightValue <= 0) return basePrice;

    let multiplier = 1;

    if (input.includes("kg") || input.includes("kilo")) {
      multiplier = weightValue;
    } else if (
      input.includes("g") &&
      !input.includes("kg") &&
      !input.includes("mg")
    ) {
      multiplier = weightValue / 1000;
    } else if (input.includes("mg")) {
      multiplier = weightValue / 1000000;
    } else if (input.includes("lb") || input.includes("pound")) {
      multiplier = weightValue * 0.453592;
    } else if (input.includes("oz") && !input.includes("fl")) {
      multiplier = weightValue * 0.0283495;
    } else if (
      input.includes("l") &&
      !input.includes("ml") &&
      !input.includes("fl")
    ) {
      multiplier = weightValue;
    } else if (input.includes("ml") || input.includes("milliliter")) {
      multiplier = weightValue / 1000;
    } else if (input.includes("ser") || input.includes("seer")) {
      multiplier = weightValue * 0.933105;
    } else if (input.includes("maund")) {
      multiplier = weightValue * 37.3242;
    } else if (
      input.includes("pc") ||
      input.includes("piece") ||
      input.includes("pcs")
    ) {
      multiplier = weightValue;
    } else if (input.includes("dozen")) {
      multiplier = weightValue * 12;
    } else {
      multiplier = weightValue / 1000;
    }

    const finalPrice = basePrice * multiplier;
    return Number(finalPrice.toFixed(2));
  }

  private formatWeightDisplay(netWeightInput: any): string {
    if (!netWeightInput) return "Not specified";

    const input = netWeightInput.toLowerCase().trim();
    const numberMatch = input.match(/(\d+\.?\d*)/);
    if (!numberMatch) return netWeightInput;

    const number = Number.parseFloat(numberMatch[1]);

    if (input.includes("kg")) return `${number}kg`;
    if (input.includes("g") && !input.includes("kg") && !input.includes("mg"))
      return `${number}g`;
    if (input.includes("mg")) return `${number}mg`;
    if (input.includes("lb")) return `${number}lb`;
    if (input.includes("oz") && !input.includes("fl")) return `${number}oz`;
    if (input.includes("l") && !input.includes("ml")) return `${number}L`;
    if (input.includes("ml")) return `${number}ml`;
    if (input.includes("ser")) return `${number} seer`;
    if (input.includes("maund")) return `${number} maund`;
    if (input.includes("pc") || input.includes("piece")) return `${number} pcs`;
    if (input.includes("dozen")) return `${number} dozen`;

    return `${number}g`;
  }

  private formatDate(date: Date): string {
    if (!date) return "__/__/____";
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }
}
