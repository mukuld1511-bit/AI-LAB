param(
    [string]$Lab = "",
    [string]$Pc = ""
)

Write-Host "===================================================================" -ForegroundColor Cyan
Write-Host "  PIET AIML DEPT - MULTI-LAB WORKSTATION SILENT BACKGROUND AGENT" -ForegroundColor Cyan
Write-Host "  Supported Labs: 413, 414, 415, 416, 418, 419 (24 PCs per lab)" -ForegroundColor DarkCyan
Write-Host "===================================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Resolve Lab Number
if (-not $Lab) {
    $Lab = Read-Host "Enter Lab Number (e.g. 413, 414, 415, 416, 418, 419)"
}
if (-not $Lab) { $Lab = "414" }

$cleanLab = $Lab.Trim().ToUpper().Replace("LAB-", "").Replace("LAB", "")
$labId = "LAB-$cleanLab"

# 2. Resolve PC Number
if (-not $Pc) {
    $Pc = Read-Host "Enter PC Number in Lab $cleanLab (1 to 24)"
}
if (-not $Pc) { $Pc = "01" }

if ($Pc -match "^\d+$") {
    $targetPc = "PC-$cleanLab-$("{0:D2}" -f [int]$Pc)"
} elseif ($Pc.StartsWith("PC-")) {
    $targetPc = $Pc
} else {
    $targetPc = "PC-$cleanLab-$Pc"
}

Write-Host ""
Write-Host "🖥️ [Target PC Identifier]: $targetPc" -ForegroundColor Green
Write-Host "🏢 [Assigned Lab        ]: $labId" -ForegroundColor Green
Write-Host "🌐 [Central Pi 5 Hub    ]: https://raspberrypi.tailc8c1f6.ts.net" -ForegroundColor Green
Write-Host ""

# 3. Prepare Working Directory
$agentDir = "C:\PIET_Agent"
if (-not (Test-Path $agentDir)) {
    New-Item -ItemType Directory -Path $agentDir -Force | Out-Null
}

# Helper: Locate existing Python 3 installations
function Get-ValidPython {
    # Check py launcher first
    try {
        $pyLauncher = Get-Command "py.exe" -ErrorAction SilentlyContinue
        if ($pyLauncher) {
            $pyPath = (& $pyLauncher.Source -3 -c "import sys; print(sys.executable)" 2>$null).Trim()
            if ($pyPath -and (Test-Path $pyPath)) {
                return $pyPath
            }
        }
    } catch {}

    # Check python in PATH
    try {
        $pyCmd = Get-Command "python.exe" -ErrorAction SilentlyContinue
        if ($pyCmd -and ($pyCmd.Source -notlike "*WindowsApps*")) {
            $ver = & $pyCmd.Source --version 2>&1
            if ($ver -like "*Python 3*") {
                return $pyCmd.Source
            }
        }
    } catch {}

    $candidates = @(
        "C:\Python313\python.exe",
        "C:\Python312\python.exe",
        "C:\Python311\python.exe",
        "C:\Python310\python.exe",
        "C:\Python39\python.exe",
        "C:\Python38\python.exe",
        "C:\Program Files\Python313\python.exe",
        "C:\Program Files\Python312\python.exe",
        "C:\Program Files\Python311\python.exe",
        "C:\Program Files\Python310\python.exe",
        "C:\Program Files\Python39\python.exe",
        "C:\Program Files\Python38\python.exe",
        "C:\Program Files (x86)\Python312\python.exe",
        "C:\Program Files (x86)\Python311\python.exe",
        "C:\Program Files (x86)\Python310\python.exe",
        "C:\Program Files (x86)\Python39\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python313\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python310\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python39\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python38\python.exe",
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

# 4. Check or Auto-Install Python
Write-Host "[1/5] Checking Python 3 runtime..." -ForegroundColor Yellow
$pythonExe = Get-ValidPython

if (-not $pythonExe) {
    Write-Host "      Python 3 not found on this PC. Auto-downloading official Python 3.10..." -ForegroundColor Cyan
    $pyInstallerUrl = "https://www.python.org/ftp/python/3.10.11/python-3.10.11-amd64.exe"
    $installerPath = "$agentDir\python_installer.exe"

    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $pyInstallerUrl -OutFile $installerPath -UseBasicParsing -TimeoutSec 30
        Write-Host "      Installing Python silently in background (approx 20 seconds)..." -ForegroundColor Yellow
        $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
        $installArgs = if ($isAdmin) {
            "/quiet InstallAllUsers=1 PrependPath=1 Include_test=0 SimpleInstall=1"
        } else {
            "/quiet InstallAllUsers=0 PrependPath=1 Include_test=0 SimpleInstall=1"
        }
        Start-Process -FilePath $installerPath -ArgumentList $installArgs -Wait
        Remove-Item -Path $installerPath -Force -ErrorAction SilentlyContinue
    } catch {
        Write-Host "      Direct download warning: $_" -ForegroundColor DarkGray
    }

    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    $pythonExe = Get-ValidPython
    if (-not $pythonExe) {
        if (Test-Path "C:\Program Files\Python310\python.exe") {
            $pythonExe = "C:\Program Files\Python310\python.exe"
        } elseif (Test-Path "$env:LOCALAPPDATA\Programs\Python\Python310\python.exe") {
            $pythonExe = "$env:LOCALAPPDATA\Programs\Python\Python310\python.exe"
        } elseif (Test-Path "C:\Python310\python.exe") {
            $pythonExe = "C:\Python310\python.exe"
        }
    }
}

if (-not $pythonExe) {
    Write-Host "❌ ERROR: Python 3 could not be located or installed automatically." -ForegroundColor Red
    Write-Host "   Please install Python 3 from https://www.python.org or winget install Python.Python.3.10" -ForegroundColor Yellow
    exit 1
}

$pythonwExe = $pythonExe.Replace("python.exe", "pythonw.exe")
if (-not (Test-Path $pythonwExe)) {
    $pythonwExe = $pythonExe
}

Write-Host "      Using Python: $pythonExe" -ForegroundColor Green

# 5. Download Universal Telemetry Agent & HUD Module
Write-Host "[2/5] Downloading universal piet_agent.py & alert HUD module..." -ForegroundColor Yellow
try {
    Invoke-WebRequest -Uri "https://raspberrypi.tailc8c1f6.ts.net/static/piet_agent.py" -OutFile "$agentDir\piet_agent.py" -UseBasicParsing -TimeoutSec 8
} catch {
    Invoke-WebRequest -Uri "https://raw.githubusercontent.com/mukuld1511-bit/AI-LAB/main/piet_system/piet_agent.py" -OutFile "$agentDir\piet_agent.py" -UseBasicParsing
}

try {
    Invoke-WebRequest -Uri "https://raspberrypi.tailc8c1f6.ts.net/static/show_alert.py" -OutFile "$agentDir\show_alert.py" -UseBasicParsing -TimeoutSec 8
} catch {
    Invoke-WebRequest -Uri "https://raw.githubusercontent.com/mukuld1511-bit/AI-LAB/main/piet_system/lab_414_windows_agent/show_alert.py" -OutFile "$agentDir\show_alert.py" -UseBasicParsing
}

# 6. Save Configuration
Write-Host "[3/5] Saving configuration for $targetPc..." -ForegroundColor Yellow
$cfg = @{
    pc_id = $targetPc
    lab_id = $labId
    hub_url = "https://raspberrypi.tailc8c1f6.ts.net"
    heartbeat_interval = 6
    idle_threshold_seconds = 180
} | ConvertTo-Json
Set-Content -Path "$agentDir\agent_config.json" -Value $cfg

# 7. Check Python Dependencies
Write-Host "[4/5] Installing dependencies (psutil, pillow)..." -ForegroundColor Yellow
try {
    & $pythonExe -m pip install --quiet psutil pillow
} catch {
    Write-Host "Pip warning ignored." -ForegroundColor DarkGray
}

# 8. Register Permanent Auto-Startup Task
Write-Host "[5/5] Registering Permanent Background Auto-Startup Task..." -ForegroundColor Yellow
$scriptPath = "$agentDir\piet_agent.py"

schtasks /delete /tn "PIET_Workstation_Agent" /f 2>$null | Out-Null
schtasks /create /tn "PIET_Workstation_Agent" /tr "`"$pythonwExe`" `"$scriptPath`" $targetPc" /sc onlogon /rl highest /f 2>$null | Out-Null

$startupFolder = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup"
$batContent = "@start `"`" `"$pythonwExe`" `"$scriptPath`" $targetPc"
Set-Content -Path "$startupFolder\run_piet_agent.bat" -Value $batContent

# Kill older instances and launch silent background process NOW
Get-Process pythonw -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*python*" } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Process $pythonwExe -ArgumentList "`"$scriptPath`" $targetPc" -WorkingDirectory $agentDir

Write-Host ""
Write-Host "===================================================================" -ForegroundColor Green
Write-Host "  ✅ SUCCESS! $targetPc ($labId) IS PERMANENTLY LIVE & ACTIVE!" -ForegroundColor Green
Write-Host "===================================================================" -ForegroundColor Green
Write-Host "  • Running silently in background via: $pythonwExe" -ForegroundColor White
Write-Host "  • Auto-starts automatically on every system boot / restart" -ForegroundColor White
Write-Host "  • Auto-updates silently every 15 minutes & accepts remote updates" -ForegroundColor White
Write-Host "  • Streaming telemetry to Raspberry Pi Hub: https://raspberrypi.tailc8c1f6.ts.net" -ForegroundColor White
Write-Host ""
Write-Host "  Aap is PowerShell window ko safely BAND kar sakte hain!" -ForegroundColor Cyan
Write-Host "===================================================================" -ForegroundColor Green
Write-Host ""
Start-Sleep -Seconds 3
