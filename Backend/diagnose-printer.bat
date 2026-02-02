@echo off
echo ========================================
echo PRINTER DIAGNOSTICS
echo ========================================
echo.
echo 1. Checking if printer is ready...
powershell "Get-Printer -Name 'BlackCopper 80mm Series(2)' | Select-Object Name, PrinterStatus, PortName"
echo.
echo 2. Checking for stuck print jobs...
powershell "Get-PrintJob -PrinterName 'BlackCopper 80mm Series(2)' | Select-Object Id, Name, Status"
echo.
echo 3. Clearing any stuck jobs...
powershell "Get-PrintJob -PrinterName 'BlackCopper 80mm Series(2)' | Remove-PrintJob"
echo.
echo ========================================
echo Diagnostic complete
echo ========================================
pause


