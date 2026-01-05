/**
 * Print Server API Client
 * Uses connection manager for proper state management
 * No retries, no timeouts - proper connection lifecycle management
 */

import { printServerConnectionManager } from './print-server-connection-manager';

export interface ReceiptItem {
  name: string;
  quantity: number;
  price: number;
  unit?: string;
  unitName?: string;
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
 * Make HTTP request using connection manager
 */
async function makeRequest(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  // Generate unique connection ID to prevent connection reuse
  const connectionId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const response = await fetch(url, {
    ...options,
    // Force new connection - prevent connection reuse
    cache: 'no-store',
    headers: {
      ...options.headers,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'X-Request-ID': connectionId,
    },
  });

  return response;
}

/**
 * Check if local print server is available
 * Uses connection manager for proper state validation
 */
export async function checkPrintServer(): Promise<boolean> {
  const connection = await printServerConnectionManager.ensureConnection();
  return connection.available;
}

/**
 * Get available printers - uses connection manager
 * Only uses local print server - no fallback
 */
export async function getPrinters(): Promise<{
  success: boolean;
  data?: Array<{ name: string; isDefault?: boolean; status?: string }>;
  error?: string;
}> {
  // Ensure connection is valid before operation
  const connection = await printServerConnectionManager.ensureConnection();
  
  if (!connection.available) {
    return {
      success: false,
      error: 'Local print server is not available',
    };
  }

  try {
    const response = await makeRequest(`${connection.url}/printers`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const result = await response.json();
    
    if (result.success) {
      return result;
    }

    return {
      success: false,
      error: result.error || 'Failed to get printers',
    };
  } catch (error: any) {
    // Connection failed - reset state
    printServerConnectionManager.resetConnection();
    return {
      success: false,
      error: error.message || 'Failed to connect to print server',
    };
  }
}

/**
 * Print receipt - uses connection manager for proper state management
 * No retries, no timeouts, no fallback - proper connection validation
 * Only uses local print server
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
  // Always ensure connection is valid before printing
  // This is the key - validates connection state before every operation
  const connection = await printServerConnectionManager.ensureConnection();
  
  if (!connection.available) {
    return {
      success: false,
      error: 'Local print server is not available',
    };
  }

  try {
    const response = await makeRequest(`${connection.url}/print-receipt`, {
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
    // Connection failed - reset state so next attempt validates fresh
    printServerConnectionManager.resetConnection();
    return {
      success: false,
      error: error.message || 'Failed to connect to print server',
    };
  }
}

/**
 * Try to print via local server, fallback to browser print
 */
export async function printReceipt(
  printer: Printer,
  receiptData: ReceiptData,
  job?: PrintJob,
  fallbackToBrowser: () => void = () => {}
): Promise<boolean> {
  const result = await printReceiptViaServer(printer, receiptData, job);
  
  if (result.success) {
    return true;
  }
  
  // Fallback to browser print
  fallbackToBrowser();
  return false;
}

export interface BarcodeLabelItem {
  id: string;
  name: string;
  barcode: string;
  netWeight?: string;
  price?: number;
  packageDateISO?: string;
  expiryDateISO?: string;
}

export interface PrintBarcodeLabelsInput {
  printerName: string;
  items: BarcodeLabelItem[];
  paperSize?: '3x2inch' | '50x30mm' | '60x40mm';
  copies?: number;
  dpi?: 203 | 300;
  humanReadable?: boolean;
}

/**
 * Print barcode labels - uses print server with user-selected printer
 */
export async function printBarcodeLabelsViaServer(
  input: PrintBarcodeLabelsInput
): Promise<{
  success: boolean;
  error?: string;
  message?: string;
}> {
  try {
    const response = await fetch(`${getPrintServerUrl()}/print-barcode-labels`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || result.error || 'Print failed');
    }

    console.log('✅ Barcode labels printed via print server');
    return {
      success: true,
      message: result.message || 'Barcode labels printed successfully',
    };
  } catch (error: any) {
    console.error('Print barcode labels failed:', error);
    return {
      success: false,
      error: error.message || 'Failed to connect to print server',
    };
  }
}