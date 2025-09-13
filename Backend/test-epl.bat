@echo off
echo Testing EPL Commands for GC420t
echo =================================

echo Creating EPL file...
echo N > test.epl
echo A50,50,0,2,1,1,N,"Test Label" >> test.epl
echo A50,100,0,2,1,1,N,"EPL Test" >> test.epl
echo A50,150,0,2,1,1,N,"Date: %date%" >> test.epl
echo A50,200,0,2,1,1,N,"Time: %time%" >> test.epl
echo B50,250,0,1,2,2,50,N,"TEST123" >> test.epl
echo P1 >> test.epl

echo.
echo Test EPL content:
type test.epl

echo.
echo Using Windows print command...
print /d:"ZDesigner GC420t (EPL)" test.epl

if %errorlevel% equ 0 (
    echo SUCCESS: EPL print command worked!
    echo Check your printer - it should print now.
) else (
    echo FAILED: EPL print command failed
)

echo.
echo Cleaning up...
del test.epl
echo Done!
pause
