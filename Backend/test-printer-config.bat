@echo off
echo Testing Printer Configuration
echo =============================

echo 1. Checking printer status...
powershell "Get-Printer -Name 'ZDesigner GC420t (EPL)' | Select-Object Name, PortName, DriverName, PrinterStatus"

echo.
echo 2. Checking printer driver...
powershell "Get-PrinterDriver -Name 'ZDesigner GC420t (EPL)' | Select-Object Name, DriverType, Version"

echo.
echo 3. Checking printer port...
powershell "Get-PrinterPort -Name 'USB001' | Select-Object Name, PortType, Description"

echo.
echo 4. Creating simple test ZPL...
echo ^XA > test.zpl
echo ^CF0,20 >> test.zpl
echo ^FO50,50^FDTest Label^FS >> test.zpl
echo ^FO50,100^FDConfig Test^FS >> test.zpl
echo ^FO50,150^FDDate: %date%^FS >> test.zpl
echo ^FO50,200^FDTime: %time%^FS >> test.zpl
echo ^XZ >> test.zpl

echo.
echo 5. Test ZPL content:
type test.zpl

echo.
echo 6. Testing different printing methods...
echo.
echo Method 1: Windows print command
print /d:"ZDesigner GC420t (EPL)" test.zpl
echo.

echo Method 2: Direct port
type test.zpl > USB001
echo.

echo Method 3: PowerShell Out-Printer
powershell "Get-Content 'test.zpl' -Raw | Out-Printer -Name 'ZDesigner GC420t (EPL)'"
echo.

echo All methods tested. Check your printer for output.
echo.
echo Cleaning up...
del test.zpl
echo Done!
pause
