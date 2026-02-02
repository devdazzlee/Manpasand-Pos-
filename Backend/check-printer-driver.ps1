# Check printer driver and configuration
$printerName = "BlackCopper 80mm Series(2)"

Write-Host "=== PRINTER DIAGNOSTIC ===" -ForegroundColor Cyan
Write-Host ""

$printer = Get-Printer -Name $printerName -ErrorAction SilentlyContinue

if ($printer) {
    Write-Host "PRINTER FOUND" -ForegroundColor Green
    Write-Host "Name: $($printer.Name)"
    Write-Host "Status: $($printer.PrinterStatus)"
    Write-Host "Driver: $($printer.DriverName)"
    Write-Host "Port: $($printer.PortName)"
    Write-Host "Default: $($printer.Default)"
    Write-Host ""
    
    # Check driver details
    $driver = Get-PrinterDriver -Name $printer.DriverName -ErrorAction SilentlyContinue
    if ($driver) {
        Write-Host "DRIVER INFO:"
        Write-Host "  Name: $($driver.Name)"
        Write-Host "  Manufacturer: $($driver.Manufacturer)"
        Write-Host "  Version: $($driver.Version)"
    }
    
    # Check if printer is ready
    Write-Host ""
    Write-Host "PRINTER STATE:" -ForegroundColor Yellow
    $status = Get-Printer | Where-Object { $_.Name -eq $printerName }
    if ($status.PrinterStatus -eq "Normal") {
        Write-Host "  Status: READY" -ForegroundColor Green
    } else {
        Write-Host "  Status: $($status.PrinterStatus)" -ForegroundColor Red
        Write-Host "  ⚠️  Check if printer has paper and is powered on!"
    }
    
} else {
    Write-Host "PRINTER NOT FOUND!" -ForegroundColor Red
    Write-Host "Make sure the printer is installed in Windows"
}

Write-Host ""
Write-Host "=== TEST NOW ===" -ForegroundColor Cyan
Write-Host "1. Check if printer has paper"
Write-Host "2. Check if printer is powered ON"
Write-Host "3. Look at printer display - any error messages?"
Write-Host "4. Press test button on printer if available"














