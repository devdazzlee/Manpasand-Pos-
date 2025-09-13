@echo off
echo Testing Alternative Printing Methods
echo ====================================

echo Creating test file...
echo N > test.epl
echo A50,50,0,2,1,1,N,"Test Label" >> test.epl
echo A50,100,0,2,1,1,N,"Alternative Test" >> test.epl
echo A50,150,0,2,1,1,N,"Date: %date%" >> test.epl
echo A50,200,0,2,1,1,N,"Time: %time%" >> test.epl
echo P1 >> test.epl

echo.
echo Test EPL content:
type test.epl

echo.
echo Method 1: Direct copy to USB001
copy test.epl USB001
echo.

echo Method 2: Using type command
type test.epl > USB001
echo.

echo Method 3: Using echo command
echo N > USB001
echo A50,50,0,2,1,1,N,"Echo Test" >> USB001
echo P1 >> USB001
echo.

echo Method 4: Using PowerShell with different approach
powershell "Set-Content -Path 'USB001' -Value (Get-Content 'test.epl' -Raw)"
echo.

echo Method 5: Using Windows copy with different syntax
copy test.epl "\\localhost\ZDesigner GC420t (EPL)"
echo.

echo Method 6: Using print command with different syntax
print test.epl
echo.

echo Method 7: Direct file copy to printer port
copy test.epl "\\127.0.0.1\ZDesigner GC420t (EPL)"
echo.

echo Method 8: Using cmd /c copy
cmd /c copy test.epl USB001
echo.

echo All methods tested. Check your printer for output.
echo.
echo Cleaning up...
del test.epl
echo Done!
pause
