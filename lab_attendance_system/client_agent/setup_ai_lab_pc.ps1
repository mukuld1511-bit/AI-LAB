param(
    [string]$PcNum = "",
    [string]$BackendUrl = "https://labg418pc12.tailc8c1f6.ts.net"
)

Write-Host "===================================================================" -ForegroundColor Cyan
Write-Host "   AI/ML LAB WORKSTATION TELEMETRY AGENT AUTO-STARTUP SETUP       " -ForegroundColor Cyan
Write-Host "   In-Charge: Dr. Richa Choudhary (Assistant Professor)           " -ForegroundColor Cyan
Write-Host "===================================================================" -ForegroundColor Cyan
Write-Host ""

if (-not $PcNum) {
    $PcNum = Read-Host "Enter AI Lab PC Number (1 to 8)"
}
if (-not $PcNum) { $PcNum = "1" }

# Normalize to PC-X
$digits = [regex]::Match($PcNum, '\d+').Value
if ($digits) {
    $targetPc = "PC-$([int]$digits)"
} else {
    $targetPc = $PcNum.ToUpper()
}

Write-Host "[Target PC Identifier]: $targetPc" -ForegroundColor Green
Write-Host "[Backend URL        ]: $BackendUrl" -ForegroundColor Green
Write-Host ""

# 1. Prepare Directory
$agentDir = "C:\AI_LAB_Agent"
if (-not (Test-Path $agentDir)) {
    New-Item -ItemType Directory -Path $agentDir -Force | Out-Null
}

# 2. Download Agent Code & Alert HUD Module
Write-Host "[1/4] Downloading latest AI Lab telemetry agent & alert HUD module..." -ForegroundColor Yellow
$agentUrl = "https://raw.githubusercontent.com/mukuld1511-bit/AI-LAB/main/lab_attendance_system/client_agent/pc_telemetry_agent.py"
Invoke-WebRequest -Uri $agentUrl -OutFile "$agentDir\pc_telemetry_agent.py" -UseBasicParsing
$alertUrl = "https://raw.githubusercontent.com/mukuld1511-bit/AI-LAB/main/lab_attendance_system/client_agent/show_alert.py"
Invoke-WebRequest -Uri $alertUrl -OutFile "$agentDir\show_alert.py" -UseBasicParsing

# 3. Write Config
Write-Host "[2/4] Saving configuration for $targetPc..." -ForegroundColor Yellow
$cfg = @{
    pc_id = $targetPc
    backend_url = $BackendUrl
    heartbeat_interval = 6
} | ConvertTo-Json
Set-Content -Path "$agentDir\agent_config.json" -Value $cfg

# 4. Check Python Dependencies
Write-Host "[3/4] Installing dependencies (psutil, pillow, pynvml)..." -ForegroundColor Yellow
try {
    python -m pip install --quiet psutil pillow pynvml
} catch {
    Write-Host "Pip warning ignored." -ForegroundColor DarkGray
}

# 5. Register Permanent Auto-Startup (Task Scheduler + Startup Folder)
Write-Host "[4/4] Registering Permanent Background Auto-Startup Task..." -ForegroundColor Yellow
$scriptPath = "$agentDir\pc_telemetry_agent.py"

# Try Task Scheduler
schtasks /delete /tn "AILab_PC_TelemetryAgent" /f 2>$null | Out-Null
schtasks /create /tn "AILab_PC_TelemetryAgent" /tr "pythonw.exe `"$scriptPath`" $targetPc" /sc onlogon /rl highest /f 2>$null | Out-Null

# Always place fallback in Startup folder
$startupFolder = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup"
$batContent = "@start pythonw.exe `"$scriptPath`" $targetPc"
Set-Content -Path "$startupFolder\run_ai_lab_agent.bat" -Value $batContent

# Kill any older agent instance
Get-Process pythonw -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*pc_telemetry_agent*" } | Stop-Process -Force -ErrorAction SilentlyContinue

# Launch silent background process NOW
Start-Process "pythonw.exe" -ArgumentList "`"$scriptPath`" $targetPc" -WorkingDirectory $agentDir

Write-Host ""
Write-Host "===================================================================" -ForegroundColor Green
Write-Host "  ✅ SUCCESS! $targetPc IS NOW LIVE & STREAMING TO AI LAB BACKEND!" -ForegroundColor Green
Write-Host "===================================================================" -ForegroundColor Green
Write-Host "  • Running silently in background via pythonw (No black window)" -ForegroundColor White
Write-Host "  • Auto-starts automatically whenever this PC turns ON" -ForegroundColor White
Write-Host "  • Streaming CPU/RAM/GPU, active focus & on-demand screen captures" -ForegroundColor White
Write-Host ""
Write-Host "  Aap is PowerShell window ko safely BAND kar sakte hain!" -ForegroundColor Cyan
Write-Host "===================================================================" -ForegroundColor Green
Write-Host ""
Start-Sleep -Seconds 3
