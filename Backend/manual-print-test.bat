@echo off
echo ========================================
echo MANUAL PRINTER TEST
echo ========================================
echo.
echo This will test if Windows can print to your printer...
echo.

REM Create a test file with ESC/POS commands
echo Creating test file...
(
  echo [27][64]           REM ESC @ - Initialize printer
  echo [27][97][1]        REM ESC a 1 - Center align
  echo TEST RECEIPT
  echo.  
  echo This is a test from Windows
  echo.
  echo If you see this, the printer works!
  echo.
  echo [29][86][65][3]    REM GS V A 3 - Cut paper
) > test-receipt.txt

echo.
echo Attempting to print...
copy /B test-receipt.txt USB002

echo.
echo ========================================
echo Check your printer now!
echo.
echo If nothing printed:
echo   1. Check if printer has paper
echo   2. Check if printer is turned on
echo   3. Try pressing printer's test button
echo   4. Check Windows Print Queue for errors
echo ========================================
echo.

del test-receipt.txt

pause


