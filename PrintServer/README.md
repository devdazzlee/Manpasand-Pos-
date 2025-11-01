# Manpasand POS Print Server

Local print server that runs on the client machine to handle receipt printing directly with the thermal printer using PDF approach (same as backend).

## Architecture

```
Vercel Frontend (https://pos.manpasandstore.com)
    ↓ JavaScript runs in user's browser (on local machine)
    ↓ HTTP Request → http://localhost:3001
Print Server (Local on Client Machine)
    ↓ PDF Generation (PDFKit + bwip-js)
    ↓ Direct Print (pdf-to-printer)
Thermal Printer
```

**Important**: The frontend JavaScript runs in the user's browser (on their local machine), not on Vercel's servers. This means:
- ✅ The browser can access `localhost:3001` on the same machine
- ✅ CORS is configured to allow requests from Vercel domain
- ✅ Each client machine needs the print server running locally

## Setup

1. **Install Node.js** (if not already installed)
   - Download from https://nodejs.org/
   - Install version 18 or higher

2. **Install Dependencies**
   ```bash
   cd PrintServer
   npm install
   ```

3. **Update Printer Name** (if needed)
   - Default: "BlackCopper 80mm Series"
   - The printer name should match your Windows printer name exactly
   - You can check printer name in Windows Settings > Printers & scanners

4. **Start the Server**
   ```bash
   npm start
   ```

## API Endpoints

### Health Check
```
GET http://localhost:3001/health
```

### Get Printers
```
GET http://localhost:3001/printers
```

### Print Receipt (Same format as backend)
```
POST http://localhost:3001/print-receipt
Content-Type: application/json

{
  "printer": {
    "name": "BlackCopper 80mm Series",
    "columns": { "fontA": 48, "fontB": 64 }
  },
  "job": {
    "copies": 1,
    "cut": true,
    "openDrawer": false
  },
  "receiptData": {
    "storeName": "MANPASAND GENERAL STORE",
    "tagline": "Quality • Service • Value",
    "address": "bahadrabad, Karachi",
    "transactionId": "SALE-123456",
    "timestamp": "2025-01-01T12:00:00Z",
    "cashier": "Muhammad",
    "customerType": "Walk-in",
    "items": [
      {
        "name": "Product Name",
        "quantity": 2,
        "price": 100.50,
        "unit": "pc"
      }
    ],
    "subtotal": 201.00,
    "discount": 0,
    "taxPercent": 5,
    "total": 211.05,
    "paymentMethod": "CASH",
    "amountPaid": 220.00,
    "changeAmount": 8.95
  }
}
```

## Features

- ✅ **Same PDF approach as backend** - Uses PDFKit, pdf-to-printer, bwip-js
- ✅ **Exact page height** - Calculates content height and trims PDF (no blank paper)
- ✅ **No print dialog** - Direct printer communication
- ✅ **Same API format** - Compatible with backend API
- ✅ **Automatic fallback** - Frontend falls back to browser print if server unavailable

## Auto-Start with Windows (No User Interaction)

### Recommended: Install as Windows Service

The easiest way to make the server start automatically and restart if it closes:

**Quick Setup:**
1. Right-click `install-service.bat`
2. Select **"Run as administrator"**
3. Done! ✅

**Manual Setup:**
```bash
# Install node-windows
npm install node-windows --save

# Install as Windows service (run as Administrator)
node install-service.js

# Start the service
node start-service.js
```

**What it does:**
- ✅ Starts automatically when Windows boots
- ✅ Auto-restarts if it crashes or closes
- ✅ Runs in background (no user interaction needed)
- ✅ Runs even when no user is logged in

**Service Management:**
- **Start:** `node start-service.js` or `start-service.bat`
- **Stop:** `node stop-service.js` or `stop-service.bat`
- **Uninstall:** `node uninstall-service.js` or `uninstall-service.bat`

**Check Service Status:**
1. Open Services (`services.msc` or `Win + R` → `services.msc`)
2. Look for "Manpasand Print Server"

📖 **Full documentation:** See `SERVICE-SETUP.md`

### Alternative: PM2 (Process Manager)

If you prefer PM2:
```bash
# Install PM2 globally
npm install -g pm2

# Start with PM2
pm2 start pm2-ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 to start on Windows boot
pm2 startup
# (Follow the instructions shown)
```

### Old Methods (Not Recommended)

<details>
<summary>Click to expand old methods</summary>

#### Option 1: Startup Folder

1. Press `Win + R`
2. Type: `shell:startup`
3. Copy `start-print-server.bat` to that folder

#### Option 2: Task Scheduler

1. Open Task Scheduler
2. Create Basic Task
3. Name: "Manpasand Print Server"
4. Trigger: "When the computer starts"
5. Action: "Start a program"
6. Program: `node.exe` (full path)
7. Arguments: Full path to `server.js`
8. Start in: Full path to `PrintServer` directory

</details>

## Logo Support

The server automatically looks for logo.png in:
1. `../Frontend/public/logo.png`
2. `./logo.png` (PrintServer directory)

Or you can provide logoPath in receiptData.

## CORS Configuration

The print server is configured to accept requests from:
- ✅ `https://pos.manpasandstore.com` (your production domain)
- ✅ `https://manpasand-pos-beta.vercel.app` (Vercel preview deployments)
- ✅ Any `.vercel.app` domain
- ✅ `http://localhost:3000` (local development)
- ✅ `http://localhost:3001` (local development)

**How it works:**
1. User opens Vercel frontend in their browser
2. Frontend JavaScript runs in the user's browser (on their local machine)
3. JavaScript makes request to `http://localhost:3001`
4. Print server accepts request (CORS allows Vercel origin)
5. Print server sends receipt to local printer

**Note**: If using HTTPS on Vercel, modern browsers will allow requests to `http://localhost` (mixed content is allowed for localhost).

## Troubleshooting

### CORS Errors
- **Error**: "CORS policy blocked request"
- **Solution**: Ensure the print server is running and CORS configuration includes your Vercel domain
- Check browser console for the exact origin being blocked
- The print server logs CORS warnings to console

### Print Server Not Found (from Vercel Frontend)
- **Error**: "Failed to connect to print server"
- **Solution**: The print server must be running on the client machine
- Each client machine needs the print server installed and running
- The frontend automatically falls back to browser print if server unavailable

### Printer Not Found
- Check printer name matches Windows printer name exactly
- Use `GET /printers` to see available printers
- Update printer name in the API request

### Print Server Not Starting
- Check Node.js is installed: `node --version`
- Check port 3001 is not in use
- Check console for error messages

### Receipt Not Printing
- Check printer is online and has paper
- Check Windows printer settings
- Verify print server is running: `GET http://localhost:3001/health`
