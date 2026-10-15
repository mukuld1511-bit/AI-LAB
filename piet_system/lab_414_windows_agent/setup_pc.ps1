param(
    [string]$PcNum = ""
)

Write-Host "===================================================================" -ForegroundColor Cyan
Write-Host "  PIET AIML DEPT - LAB 414 WORKSTATION SILENT BACKGROUND AGENT" -ForegroundColor Cyan
Write-Host "===================================================================" -ForegroundColor Cyan
Write-Host ""

if (-not $PcNum) {
    $PcNum = Read-Host "Enter PC Number in Lab 414 (e.g. 01, 02, 13, 19)"
}
if (-not $PcNum) { $PcNum = "01" }

if ($PcNum -match "^\d+$") {
    $targetPc = "PC-414-$("{0:D2}" -f [int]$PcNum)"
} elseif ($PcNum.StartsWith("PC-414")) {
    $targetPc = $PcNum
} else {
    $targetPc = "PC-414-$PcNum"
}

Write-Host "[Target PC Identifier]: $targetPc" -ForegroundColor Green
Write-Host "[Target Hub URL      ]: https://raspberrypi.tailc8c1f6.ts.net" -ForegroundColor Green
Write-Host ""

# 1. Prepare Directory
$agentDir = "C:\PIET_Agent"
if (-not (Test-Path $agentDir)) {
    New-Item -ItemType Directory -Path $agentDir -Force | Out-Null
}

# Helper: Locate existing Python 3 installations
function Get-ValidPython {
    # Check current PATH
    try {
        $pyCmd = Get-Command "python.exe" -ErrorAction SilentlyContinue
        if ($pyCmd -and ($pyCmd.Source -notlike "*WindowsApps*")) {
            $ver = & $pyCmd.Source --version 2>&1
            if ($ver -like "*Python 3*") {
                return $pyCmd.Source
            }
        }
    } catch {}

    # Common installation directories
    $candidates = @(
        "C:\Python312\python.exe",
        "C:\Python311\python.exe",
        "C:\Python310\python.exe",
        "C:\Python39\python.exe",
        "C:\Program Files\Python312\python.exe",
        "C:\Program Files\Python311\python.exe",
        "C:\Program Files\Python310\python.exe",
        "C:\Program Files\Python39\python.exe",
        "C:\Program Files (x86)\Python312\python.exe",
        "C:\Program Files (x86)\Python311\python.exe",
        "C:\Program Files (x86)\Python310\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python310\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python39\python.exe",
        "C:\ProgramData\anaconda3\python.exe",
        "C:\ProgramData\miniconda3\python.exe",
        "C:\anaconda3\python.exe"
    )

    foreach ($path in $candidates) {
        if (Test-Path $path) {
            try {
                $ver = & $path --version 2>&1
                if ($ver -like "*Python 3*") {
                    return $path
                }
            } catch {}
        }
    }

    return $null
}

# 2. Check or Auto-Install Python
Write-Host "[1/5] Checking Python 3 runtime..." -ForegroundColor Yellow
$pythonExe = Get-ValidPython

if (-not $pythonExe) {
    Write-Host "      Python 3 not found on this PC. Auto-downloading official Python 3.10..." -ForegroundColor Cyan
    $pyInstallerUrl = "https://www.python.org/ftp/python/3.10.11/python-3.10.11-amd64.exe"
    $installerPath = "$agentDir\python_installer.exe"

    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $pyInstallerUrl -OutFile $installerPath -UseBasicParsing
        Write-Host "      Installing Python silently in background (approx 20 seconds)..." -ForegroundColor Yellow
        Start-Process -FilePath $installerPath -ArgumentList "/quiet InstallAllUsers=1 PrependPath=1 Include_test=0" -Wait
        Remove-Item -Path $installerPath -Force -ErrorAction SilentlyContinue
    } catch {
        Write-Host "      Auto-install download failed: $_" -ForegroundColor Red
    }

    # Refresh PATH environment
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    $pythonExe = Get-ValidPython
    if (-not $pythonExe -and (Test-Path "C:\Program Files\Python310\python.exe")) {
        $pythonExe = "C:\Program Files\Python310\python.exe"
    }
}

if (-not $pythonExe) {
    Write-Host "❌ ERROR: Python 3 could not be located or installed automatically." -ForegroundColor Red
    Write-Host "   Please install Python 3 manually from https://www.python.org and re-run this script." -ForegroundColor Yellow
    exit 1
}

$pythonwExe = $pythonExe.Replace("python.exe", "pythonw.exe")
if (-not (Test-Path $pythonwExe)) {
    $pythonwExe = $pythonExe
}

Write-Host "      Using Python: $pythonExe" -ForegroundColor Green

# 3. Download Agent Code & Alert HUD Module
Write-Host "[2/5] Downloading latest telemetry agent & alert HUD module..." -ForegroundColor Yellow
$agentUrl = "https://raw.githubusercontent.com/mukuld1511-bit/AI-LAB/main/piet_system/lab_414_windows_agent/lab_414_agent.py"
Invoke-WebRequest -Uri $agentUrl -OutFile "$agentDir\lab_414_agent.py" -UseBasicParsing
$alertUrl = "https://raw.githubusercontent.com/mukuld1511-bit/AI-LAB/main/piet_system/lab_414_windows_agent/show_alert.py"
Invoke-WebRequest -Uri $alertUrl -OutFile "$agentDir\show_alert.py" -UseBasicParsing

# 4. Write Config
Write-Host "[3/5] Saving configuration for $targetPc..." -ForegroundColor Yellow
$cfg = @{
    pc_id = $targetPc
    lab_id = "LAB-414"
    hub_url = "https://raspberrypi.tailc8c1f6.ts.net"
    heartbeat_interval = 6
    idle_threshold_seconds = 180
} | ConvertTo-Json
Set-Content -Path "$agentDir\agent_config.json" -Value $cfg

# 5. Check Python Dependencies
Write-Host "[4/5] Installing dependencies (psutil, pillow)..." -ForegroundColor Yellow
try {
    & $pythonExe -m pip install --quiet --upgrade pip 2>$null
    & $pythonExe -m pip install --quiet psutil pillow
} catch {
    Write-Host "Pip warning ignored." -ForegroundColor DarkGray
}

# 6. Register Permanent Auto-Startup (Task Scheduler + Startup Folder)
Write-Host "[5/5] Registering Permanent Background Auto-Startup Task..." -ForegroundColor Yellow
$scriptPath = "$agentDir\lab_414_agent.py"

# Try Task Scheduler with exact pythonw path
schtasks /delete /tn "PIET_Lab414_Agent" /f 2>$null | Out-Null
schtasks /create /tn "PIET_Lab414_Agent" /tr "`"$pythonwExe`" `"$scriptPath`" $targetPc" /sc onlogon /rl highest /f 2>$null | Out-Null

# Always place fallback in Startup folder with exact pythonw path
$startupFolder = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup"
$batContent = "@start `"`" `"$pythonwExe`" `"$scriptPath`" $targetPc"
Set-Content -Path "$startupFolder\run_piet_agent.bat" -Value $batContent

# Kill any older agent instance
Get-Process pythonw -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*python*" } | Stop-Process -Force -ErrorAction SilentlyContinue

# Launch silent background process NOW using exact pythonw path
Start-Process $pythonwExe -ArgumentList "`"$scriptPath`" $targetPc" -WorkingDirectory $agentDir

Write-Host ""
Write-Host "===================================================================" -ForegroundColor Green
Write-Host "  ✅ SUCCESS! $targetPc IS NOW LIVE & RUNNING IN THE BACKGROUND!" -ForegroundColor Green
Write-Host "===================================================================" -ForegroundColor Green
Write-Host "  • Running silently in background via: $pythonwExe" -ForegroundColor White
Write-Host "  • Auto-starts automatically whenever this PC turns on" -ForegroundColor White
Write-Host "  • Streaming telemetry & on-demand screen captures to Pi Hub" -ForegroundColor White
Write-Host ""
Write-Host "  Aap is PowerShell window ko safely BAND kar sakte hain!" -ForegroundColor Cyan
Write-Host "===================================================================" -ForegroundColor Green
Write-Host ""
Start-Sleep -Seconds 3
