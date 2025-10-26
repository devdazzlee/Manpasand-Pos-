import express from 'express';
import {
  getPrinters,
  printReceipt,
} from '../controllers/barcode.controller';
import asyncHandler from '../middleware/asyncHandler';
import { ApiResponse } from '../utils/apiResponse';
import { printReceiptPDF } from '../services/print-receipt-pdf.service';

const router = express.Router();
// Get available printers
router.get('/printers', getPrinters);

// Print receipt
router.post('/print-receipt', asyncHandler(async (req, res) => {
  const { printer, job, receiptData } = req.body || {};
  if (!printer?.name || !receiptData) {
    return res.status(400).json({ success: false, message: 'Missing printer.name or receiptData' });
  }
  const result = await printReceiptPDF({ printer, job, receiptData });
  new ApiResponse(result, 'Receipt sent to printer successfully').send(res);
}));


export default router;
