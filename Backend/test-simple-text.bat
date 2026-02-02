@echo off
echo Testing Simple Text Printing
echo =============================

echo Creating simple text file...
echo Test Label > test.txt
echo Simple Text Test >> test.txt
echo Date: %date% >> test.txt
echo Time: %time% >> test.txt
echo This is a test print >> test.txt

echo.
echo Test text content:
type test.txt

echo.
echo Method 1: Print simple text
print /d:"ZDesigner GC420t (EPL)" test.txt
echo.

echo Method 2: Copy text to USB001
copy test.txt USB001
echo.

echo Method 3: Type text to USB001
type test.txt > USB001
echo.

echo Method 4: Echo text to USB001
echo Test Label > USB001
echo Simple Text Test >> USB001
echo Date: %date% >> USB001
echo Time: %time% >> USB001
echo.

echo All methods tested. Check your printer for output.
echo.
echo Cleaning up...
del test.txt
echo Done!
pause
