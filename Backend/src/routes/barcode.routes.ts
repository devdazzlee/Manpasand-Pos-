import express from 'express';
import {
  getPrinters,
  printBarcodes,
  testPrinter,
} from '../controllers/barcode.controller';
import { validate } from '../middleware/validation.middleware';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { printBarcodesSchema, testPrinterSchema } from '../validations/barcode.validation';

const router = express.Router();

// Health check for barcode service (no auth required)
router.get('/health', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Barcode service is running',
    timestamp: new Date().toISOString()
  });
});

// Test endpoint for debugging (no auth required)
router.post('/test-debug', (req, res) => {
  console.log('Test debug request body:', JSON.stringify(req.body, null, 2));
  res.json({ 
    success: true, 
    message: 'Debug endpoint working',
    receivedData: req.body,
    timestamp: new Date().toISOString()
  });
});

// Apply authentication to all other routes
router.use(authenticate, authorize(['SUPER_ADMIN', 'ADMIN']));

// Get available printers
router.get('/printers', getPrinters);

// Test printer connection
router.post('/test-printer', validate(testPrinterSchema), testPrinter);

// Print barcodes
router.post('/print', validate(printBarcodesSchema), printBarcodes);

export default router;
