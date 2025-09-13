import { Request, Response } from 'express';
import { BarcodeService } from '../services/barcode.service';
import { ApiResponse } from '../utils/apiResponse';
import asyncHandler from '../middleware/asyncHandler';

const barcodeService = new BarcodeService();

// Get available printers
const getPrinters = asyncHandler(async (req: Request, res: Response) => {
  const printers = await barcodeService.getAvailablePrinters();
  new ApiResponse(printers, 'Printers fetched successfully').send(res);
});

// Test printer connection
const testPrinter = asyncHandler(async (req: Request, res: Response) => {
  console.log('Test printer request body:', JSON.stringify(req.body, null, 2));
  const { printerName } = req.body;
  const result = await barcodeService.testPrinterConnection(printerName);
  new ApiResponse(result, 'Printer test completed').send(res);
});

// Print barcodes
const printBarcodes = asyncHandler(async (req: Request, res: Response) => {
  console.log('Print request body:', JSON.stringify(req.body, null, 2));
  const { products, printerName, settings } = req.body;
  const result = await barcodeService.printBarcodes(products, printerName, settings);
  new ApiResponse(result, 'Barcodes sent to printer successfully').send(res);
});

export { getPrinters, testPrinter, printBarcodes };
