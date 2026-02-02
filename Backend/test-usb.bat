@echo off
echo Testing Direct USB001 Printing
echo ===============================

echo Creating test ZPL file...
echo ^XA > test.zpl
echo ^CF0,20 >> test.zpl
echo ^FO50,50^FDTest Label^FS >> test.zpl
echo ^FO50,100^FDUSB Direct Test^FS >> test.zpl
echo ^FO50,150^FDDate: %date%^FS >> test.zpl
echo ^FO50,200^FDTime: %time%^FS >> test.zpl
echo ^XZ >> test.zpl

echo.
echo Test ZPL content:
type test.zpl

echo.
echo Sending ZPL directly to USB001 port...
type test.zpl > USB001

if %errorlevel% equ 0 (
    echo SUCCESS: ZPL sent to USB001 port!
    echo Check your printer - it should print now.
) else (
    echo FAILED: Could not send to USB001 port
)

echo.
echo Cleaning up...
del test.zpl
echo Done!
pause
