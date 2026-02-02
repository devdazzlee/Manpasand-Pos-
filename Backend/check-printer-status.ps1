# Comprehensive Printer Diagnostics
$printerName = "BlackCopper 80mm Series(2)"

Write-Host "=========================================="
Write-Host "PRINTER DIAGNOSTICS"
Write-Host "=========================================="
Write-Host ""

# 1. Check if printer exists
Write-Host "1. Checking if printer exists..."
$printer = Get-Printer -Name $printerName -ErrorAction SilentlyContinue

if ($printer) {
    Write-Host "   ✓ Printer found: $($printer.Name)"
    Write-Host "   Status: $($printer.PrinterStatus)"
    Write-Host "   Port: $($printer.PortName)"
    Write-Host "   IsDefault: $($printer.IsDefault)"
    Write-Host ""
} else {
    Write-Host "   ✗ PRINTER NOT FOUND!"
    Write-Host ""
    exit
}

# 2. Check if printer is ready
Write-Host "2. Checking printer readiness..."
if ($printer.PrinterStatus -eq "Normal") {
    Write-Host "   ✓ Printer is ONLINE and READY"
    Write-Host ""
} else {
    Write-Host "   ✗ PROBLEM: Printer status is: $($printer.PrinterStatus)"
    Write-Host "   - Check if printer is powered on"
    Write-Host "   - Check if paper is loaded"
    Write-Host "   - Check if cover is closed"
    Write-Host ""
}

# 3. Check print queue
Write-Host "3. Checking print queue..."
$jobs = Get-PrintJob -PrinterName $printerName -ErrorAction SilentlyContinue

if ($jobs) {
    Write-Host "   Found $($jobs.Count) print job(s):"
    $jobs | ForEach-Object {
        Write-Host "   - Job ID: $($_.Id), Status: $($_.Status), Time: $($_.SubmittedTime)"
    }
    
    # Cancel stuck jobs
    Write-Host ""
    Write-Host "   Canceling all print jobs..."
    $jobs | ForEach-Object { 
        Remove-PrintJob -PrinterName $printerName -ID $_.Id -Force
        Write-Host "   ✓ Canceled job ID: $($_.Id)"
    }
    Write-Host ""
} else {
    Write-Host "   ✓ No print jobs in queue"
    Write-Host ""
}

# 4. Test port communication
Write-Host "4. Testing port communication (USB002)..."
try {
    $testFile = "test-print.txt"
    "TEST PRINT FROM DIAGNOSTIC`n`nIf you see this, port works!" | Out-File -FilePath $testFile
    
    Start-Process -FilePath "cmd" -ArgumentList "/c", "copy", "/B", $testFile, "USB002" -NoNewWindow -Wait
    
    if (Test-Path $testFile) {
        Remove-Item $testFile
    }
    
    Write-Host "   ✓ Test data sent to USB002 port"
    Write-Host "   CHECK YOUR PRINTER NOW!"
    Write-Host ""
} catch {
    Write-Host "   ✗ Error sending test data: $_"
    Write-Host ""
}

# 5. Final recommendations
Write-Host "=========================================="
Write-Host "RECOMMENDATIONS:"
Write-Host "=========================================="

if ($printer.PrinterStatus -ne "Normal") {
    Write-Host "1. PRINTER IS NOT READY"
    Write-Host "   - Turn printer OFF and ON"
    Write-Host "   - Check if paper is loaded"
    Write-Host "   - Press printer's TEST button"
    Write-Host ""
}

    Write-Host "2. Try printing from Windows Settings:"
    Write-Host "   - Open Settings > Printers and scanners"
    Write-Host "   - Click on printer > Manage"
    Write-Host "   - Click 'Print test page'"
    Write-Host ""
    Write-Host "3. If test page works = Code issue"
    Write-Host "   If test page FAILS = Hardware/Windows issue"
Write-Host ""
Write-Host "=========================================="

