# Check if printer is ready and has pending jobs
$printerName = "BlackCopper 80mm Series(2)"

Write-Host "Checking printer status..."
$printer = Get-Printer -Name $printerName -ErrorAction SilentlyContinue

if ($printer) {
    Write-Host "Printer found: $($printer.Name)"
    Write-Host "Status: $($printer.PrinterStatus)"
    Write-Host "Port: $($printer.PortName)"
    Write-Host ""
    Write-Host "Checking for print jobs..."
    $jobs = Get-PrintJob -PrinterName $printerName -ErrorAction SilentlyContinue
    if ($jobs) {
        Write-Host "Found $($jobs.Count) print job(s):"
        $jobs | Format-Table Id, Name, Status, SubmittedTime
    } else {
        Write-Host "No print jobs found in queue"
    }
} else {
    Write-Host "Printer not found!"
}


