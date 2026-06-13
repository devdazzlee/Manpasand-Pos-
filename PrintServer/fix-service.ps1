# Fix "The system cannot find the file specified" service error
# Run as Administrator (right-click -> Run with PowerShell)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[ERROR] Run this script as Administrator!" -ForegroundColor Red
    pause
    exit 1
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Fix Manpasand Print Server Service" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Current folder: $scriptDir" -ForegroundColor Gray
Write-Host ""

# Show broken paths from old service config
$daemonXml = Join-Path $scriptDir "daemon\manpasandprintserver.xml"
if (Test-Path $daemonXml) {
    Write-Host "[CHECK] Old service config:" -ForegroundColor Cyan
    $xml = Get-Content $daemonXml -Raw
    $matches = [regex]::Matches($xml, '<(executable|argument|workingdirectory)>([^<]+)</\1>')
    foreach ($m in $matches) {
        $p = $m.Groups[2].Value.Trim()
        if ($p -and -not $p.StartsWith("--") -and $p -ne "undefined") {
            if (Test-Path $p) {
                Write-Host "  [OK] $p" -ForegroundColor Green
            } else {
                Write-Host "  [MISSING] $p" -ForegroundColor Red
            }
        }
    }
    Write-Host ""
}

Write-Host "[STEP 1] npm install..." -ForegroundColor Cyan
& npm install
if ($LASTEXITCODE -ne 0) { pause; exit 1 }
Write-Host "[OK]" -ForegroundColor Green
Write-Host ""

Write-Host "[STEP 2] Test server manually..." -ForegroundColor Cyan
$nodeProc = Start-Process -FilePath "node" -ArgumentList "server.js" -WorkingDirectory $scriptDir -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 4
try {
    Invoke-WebRequest -Uri "http://localhost:3001/health" -TimeoutSec 5 -UseBasicParsing | Out-Null
    Write-Host "[OK] Server works manually" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] server.js failed! Run: node server.js" -ForegroundColor Red
    Stop-Process -Id $nodeProc.Id -Force -ErrorAction SilentlyContinue
    pause
    exit 1
}
Stop-Process -Id $nodeProc.Id -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Write-Host ""

Write-Host "[STEP 3] Remove OLD service completely..." -ForegroundColor Cyan
foreach ($name in @("manpasandprintserver.exe", "Manpasand Print Server")) {
    $svc = Get-Service -Name $name -ErrorAction SilentlyContinue
    if ($svc -and $svc.Status -eq "Running") {
        Stop-Service -Name $name -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
    }
}
if (Test-Path "uninstall-service.js") {
    & node uninstall-service.js 2>&1 | Out-Host
}
sc.exe delete "manpasandprintserver.exe" 2>&1 | Out-Null
Start-Sleep -Seconds 3

# Remove stale daemon config so paths get regenerated
$daemonDir = Join-Path $scriptDir "daemon"
if (Test-Path $daemonDir) {
    Remove-Item "$daemonDir\*" -Force -ErrorAction SilentlyContinue
    Write-Host "[OK] Cleared old daemon config" -ForegroundColor Green
}
Write-Host "[OK] Old service removed" -ForegroundColor Green
Write-Host ""

Write-Host "[STEP 4] Install service with CURRENT paths..." -ForegroundColor Cyan
Write-Host "  node.exe: $(Get-Command node | Select-Object -ExpandProperty Source)" -ForegroundColor Gray
Write-Host "  folder:   $scriptDir" -ForegroundColor Gray
& node install-service.js 2>&1 | Out-Host
Start-Sleep -Seconds 8
Write-Host ""

Write-Host "[STEP 5] Verify new config..." -ForegroundColor Cyan
if (Test-Path $daemonXml) {
    $xml = Get-Content $daemonXml -Raw
    $allOk = $true
    $matches = [regex]::Matches($xml, '<(executable|argument|workingdirectory)>([^<]+)</\1>')
    foreach ($m in $matches) {
        $p = $m.Groups[2].Value.Trim()
        if ($p -and -not $p.StartsWith("--") -and $p -ne "undefined") {
            if (-not (Test-Path $p)) {
                Write-Host "  [STILL MISSING] $p" -ForegroundColor Red
                $allOk = $false
            }
        }
    }
    if ($allOk) { Write-Host "[OK] All paths exist" -ForegroundColor Green }
}
Write-Host ""

Write-Host "[STEP 6] Start service..." -ForegroundColor Cyan
$started = $false
foreach ($name in @("manpasandprintserver.exe", "Manpasand Print Server")) {
    try {
        Start-Service -Name $name -ErrorAction Stop
        $started = $true
        break
    } catch {}
}
Start-Sleep -Seconds 5

$running = $false
foreach ($name in @("manpasandprintserver.exe", "Manpasand Print Server")) {
    $svc = Get-Service -Name $name -ErrorAction SilentlyContinue
    if ($svc -and $svc.Status -eq "Running") {
        Write-Host "[SUCCESS] Service is RUNNING!" -ForegroundColor Green
        $running = $true
        break
    }
}

if (-not $running) {
    Write-Host "[ERROR] Service still not running." -ForegroundColor Red
    Write-Host "Check: PrintServer\daemon\*.log" -ForegroundColor Yellow
    Get-ChildItem "$scriptDir\daemon\*.log" -ErrorAction SilentlyContinue | ForEach-Object {
        Write-Host "--- $($_.Name) ---" -ForegroundColor Gray
        Get-Content $_.FullName -Tail 15
    }
    pause
    exit 1
}

try {
    Invoke-WebRequest -Uri "http://localhost:3001/health" -TimeoutSec 5 -UseBasicParsing | Out-Null
    Write-Host "[SUCCESS] http://localhost:3001/health works!" -ForegroundColor Green
} catch {
    Write-Host "[WARNING] Wait a few seconds and try http://localhost:3001/health" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Fixed! Service will auto-start on Windows reboot." -ForegroundColor Green
pause
