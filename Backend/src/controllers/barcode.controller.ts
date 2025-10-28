import { Request, Response } from 'express';
import { BarcodeService } from '../services/barcode.service';
import { ApiResponse } from '../utils/apiResponse';
import asyncHandler from '../middleware/asyncHandler';
import { ZebraBarcodeService } from '../services/zebra-barcode.service';

const barcodeService = new BarcodeService();
const zebra = new ZebraBarcodeService();

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


export const printZebra = async (req: Request, res: Response) => {
  const { printerName, copies, paperSize, dpi, humanReadable, items } = req.body || {};
  if (!printerName || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: 'printerName and items[] are required' });
  }
  try {
    const out = await zebra.printLabels({ printerName, copies, paperSize, dpi, humanReadable, items });
    new ApiResponse(out, out.message).send(res);
  } catch (e: any) {
    res.status(500).json({ success: false, message: String(e?.message || e) });
  }
};


export { getPrinters, printReceipt };
