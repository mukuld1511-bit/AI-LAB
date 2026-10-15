param(
    [string]$PcNum = ""
)

Write-Host "===================================================================" -ForegroundColor Cyan
Write-Host "  PIET AIML DEPT - LAB 414 WORKSTATION SILENT BACKGROUND AGENT" -ForegroundColor Cyan
Write-Host "===================================================================" -ForegroundColor Cyan
Write-Host ""

if (-not $PcNum) {
    $PcNum = Read-Host "Enter PC Number in Lab 414 (e.g. 01, 02, 15)"
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

# 2. Download Agent Code & Alert HUD Module
Write-Host "[1/4] Downloading latest telemetry agent & alert HUD module..." -ForegroundColor Yellow
$agentUrl = "https://raw.githubusercontent.com/mukuld1511-bit/AI-LAB/main/piet_system/lab_414_windows_agent/lab_414_agent.py"
Invoke-WebRequest -Uri $agentUrl -OutFile "$agentDir\lab_414_agent.py" -UseBasicParsing
$alertUrl = "https://raw.githubusercontent.com/mukuld1511-bit/AI-LAB/main/piet_system/lab_414_windows_agent/show_alert.py"
Invoke-WebRequest -Uri $alertUrl -OutFile "$agentDir\show_alert.py" -UseBasicParsing

# 3. Write Config
Write-Host "[2/4] Saving configuration for $targetPc..." -ForegroundColor Yellow
$cfg = @{
    pc_id = $targetPc
    lab_id = "LAB-414"
    hub_url = "https://raspberrypi.tailc8c1f6.ts.net"
    heartbeat_interval = 6
    idle_threshold_seconds = 180
} | ConvertTo-Json
Set-Content -Path "$agentDir\agent_config.json" -Value $cfg

# 4. Check Python Dependencies
Write-Host "[3/4] Installing dependencies (psutil, pillow)..." -ForegroundColor Yellow
try {
    python -m pip install --quiet psutil pillow
} catch {
    Write-Host "Pip warning ignored." -ForegroundColor DarkGray
}

# 5. Register Permanent Auto-Startup (Task Scheduler + Startup Folder)
Write-Host "[4/4] Registering Permanent Background Auto-Startup Task..." -ForegroundColor Yellow
$scriptPath = "$agentDir\lab_414_agent.py"

# Try Task Scheduler
schtasks /delete /tn "PIET_Lab414_Agent" /f 2>$null | Out-Null
schtasks /create /tn "PIET_Lab414_Agent" /tr "pythonw.exe `"$scriptPath`" $targetPc" /sc onlogon /rl highest /f 2>$null | Out-Null

# Always place fallback in Startup folder
$startupFolder = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup"
$batContent = "@start pythonw.exe `"$scriptPath`" $targetPc"
Set-Content -Path "$startupFolder\run_piet_agent.bat" -Value $batContent

# Kill any older agent instance
Get-Process pythonw -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*python*" } | Stop-Process -Force -ErrorAction SilentlyContinue

# Launch silent background process NOW
Start-Process "pythonw.exe" -ArgumentList "`"$scriptPath`" $targetPc" -WorkingDirectory $agentDir

Write-Host ""
Write-Host "===================================================================" -ForegroundColor Green
Write-Host "  ✅ SUCCESS! $targetPc IS NOW LIVE & RUNNING IN THE BACKGROUND!" -ForegroundColor Green
Write-Host "===================================================================" -ForegroundColor Green
Write-Host "  • Running silently in background via pythonw (No black window)" -ForegroundColor White
Write-Host "  • Auto-starts automatically whenever this PC turns on" -ForegroundColor White
Write-Host "  • Streaming telemetry & on-demand screen captures to Pi Hub" -ForegroundColor White
Write-Host ""
Write-Host "  Aap is PowerShell window ko safely BAND kar sakte hain!" -ForegroundColor Cyan
Write-Host "===================================================================" -ForegroundColor Green
Write-Host ""
Start-Sleep -Seconds 3
