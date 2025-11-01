/**
 * Print Server API Client
 * Sends print requests to local print server running on client machine
 * Uses same API format as backend (printer, job, receiptData)
 */

const PRINT_SERVER_URL = 'http://localhost:3001';

export interface ReceiptItem {
  name: string;
  quantity: number;
  price: number;
  unit?: string;
}

export interface ReceiptData {
  storeName?: string;
  tagline?: string;
  address?: string;
  strn?: string;
  transactionId: string;
  timestamp?: string;
  cashier?: string;
  customerType?: string;
  items: ReceiptItem[];
  subtotal: number;
  discount?: number;
  taxPercent?: number;
  total?: number;
  paymentMethod?: string;
  amountPaid?: number;
  changeAmount?: number;
  promo?: string;
  thankYouMessage?: string;
  footerMessage?: string;
  logoPath?: string;
}

export interface Printer {
  name: string;
  columns?: {
    fontA: number;
    fontB: number;
  };
}

export interface PrintJob {
  copies?: number;
  cut?: boolean;
  openDrawer?: boolean;
}

/**
 * Check if print server is available
 */
export async function checkPrintServer(): Promise<boolean> {
  try {
    const response = await fetch(`${PRINT_SERVER_URL}/health`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    const data = await response.json();
    return data.status === 'ok' && data.printerInitialized === true;
  } catch (error) {
    console.error('Print server not available:', error);
    return false;
  }
}

/**
 * Get available printers from local print server
 */
export async function getPrinters(): Promise<{
  success: boolean;
  data?: Array<{ name: string; isDefault?: boolean; status?: string }>;
  error?: string;
}> {
  try {
    const response = await fetch(`${PRINT_SERVER_URL}/printers`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    const result = await response.json();
    return result;
  } catch (error: any) {
    console.error('Error getting printers:', error);
    return {
      success: false,
      error: error.message || 'Failed to get printers',
    };
  }
}

/**
 * Print receipt via local print server (same format as backend API)
 */
export async function printReceiptViaServer(
  printer: Printer,
  receiptData: ReceiptData,
  job?: PrintJob
): Promise<{
  success: boolean;
  error?: string;
  message?: string;
}> {
  try {
    const response = await fetch(`${PRINT_SERVER_URL}/print-receipt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        printer,
        job: job ?? { copies: 1, cut: true, openDrawer: false },
        receiptData,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || result.error || 'Print failed');
    }

    return {
      success: true,
      message: result.message || 'Receipt printed successfully',
    };
  } catch (error: any) {
    console.error('Print server error:', error);
    return {
      success: false,
      error: error.message || 'Failed to connect to print server',
    };
  }
}

/**
 * Try to print via local server, fallback to browser print
 * (Helper function - use printReceiptViaServer directly for more control)
 */
export async function printReceipt(
  printer: Printer,
  receiptData: ReceiptData,
  job?: PrintJob,
  fallbackToBrowser: () => void = () => {}
): Promise<boolean> {
  // Check if print server is available
  const isAvailable = await checkPrintServer();

  if (isAvailable) {
    // Use local print server (same format as backend)
    const result = await printReceiptViaServer(printer, receiptData, job);
    if (result.success) {
      return true;
    }
    // If print server fails, fallback to browser
    console.warn('Print server failed, falling back to browser print:', result.error);
  } else {
    console.warn('Print server not available, falling back to browser print');
  }

  // Fallback to browser print
  fallbackToBrowser();
  return false;
}
