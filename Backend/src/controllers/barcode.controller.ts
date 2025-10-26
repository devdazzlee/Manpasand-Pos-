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

// Print receipt
const printReceipt = asyncHandler(async (req, res) => {
  console.log('Print receipt request body:', JSON.stringify(req.body, null, 2));

  const { printer, job, receiptData } = req.body || {};
  if (!printer?.name || !receiptData) {
    return res.status(400).json({ success: false, message: 'Missing printer.name or receiptData' });
  }

  const result = await barcodeService.printReceipt({
    printer,
    job: job ?? { copies: 1, cut: true, openDrawer: false },
    receiptData
  });

  new ApiResponse(result, 'Receipt sent to printer successfully').send(res);
});


export { getPrinters, printReceipt };
