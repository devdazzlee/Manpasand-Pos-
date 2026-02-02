@echo off
echo Testing Zebra GC420t Specific ZPL
echo ==================================

echo Creating GC420t compatible ZPL file...
echo ^XA > test.zpl
echo ^CF0,20 >> test.zpl
echo ^FO50,50^FDTest Label^FS >> test.zpl
echo ^FO50,100^FDGC420t Test^FS >> test.zpl
echo ^FO50,150^FDDate: %date%^FS >> test.zpl
echo ^FO50,200^FDTime: %time%^FS >> test.zpl
echo ^FO50,250^FDZebra GC420t^FS >> test.zpl
echo ^XZ >> test.zpl

echo.
echo Test ZPL content:
type test.zpl

echo.
echo Using Windows print command...
print /d:"ZDesigner GC420t (EPL)" test.zpl

if %errorlevel% equ 0 (
    echo SUCCESS: Print command worked!
    echo Check your printer - it should print now.
) else (
    echo FAILED: Print command failed
)

echo.
echo Cleaning up...
del test.zpl
echo Done!
pause
