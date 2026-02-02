@echo off
echo Testing Printer Hardware
echo ==========================

echo 1. Checking if printer is online...
powershell "Get-Printer -Name 'ZDesigner GC420t (EPL)' | Select-Object Name, PrinterStatus"

echo.
echo 2. Checking printer queue...
powershell "Get-PrintJob -PrinterName 'ZDesigner GC420t (EPL)'"

echo.
echo 3. Testing with Windows test page...
powershell "Get-Printer -Name 'ZDesigner GC420t (EPL)' | ForEach-Object { $_.Name } | ForEach-Object { Start-Process -FilePath 'rundll32.exe' -ArgumentList 'printui.dll,PrintUIEntry /k /n $($_)' -Wait }"

echo.
echo 4. Creating minimal EPL test...
echo N > minimal.epl
echo A10,10,0,1,1,1,N,"MINIMAL TEST" >> minimal.epl
echo P1 >> minimal.epl

echo.
echo Minimal EPL content:
type minimal.epl

echo.
echo 5. Testing minimal EPL...
print /d:"ZDesigner GC420t (EPL)" minimal.epl
echo.

echo 6. Testing direct port with minimal EPL...
type minimal.epl > USB001
echo.

echo 7. Testing with just the print command...
echo N > USB001
echo P1 >> USB001
echo.

echo All tests completed. Check your printer for output.
echo.
echo Cleaning up...
del minimal.epl
echo Done!
pause
