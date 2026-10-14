param(
    [string]$PcNum = ""
)

Write-Host "===================================================================" -ForegroundColor Cyan
Write-Host "  PIET AIML DEPT - LAB 414 WORKSTATION 1-CLICK DEPLOYMENT" -ForegroundColor Cyan
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

$agentDir = "C:\PIET_Agent"
if (-not (Test-Path $agentDir)) {
    New-Item -ItemType Directory -Path $agentDir -Force | Out-Null
}

Write-Host "[1/3] Downloading lightweight agent (12 KB)..." -ForegroundColor Yellow
$agentUrl = "https://raw.githubusercontent.com/mukuld1511-bit/AI-LAB/main/piet_system/lab_414_windows_agent/lab_414_agent.py"
Invoke-WebRequest -Uri $agentUrl -OutFile "$agentDir\lab_414_agent.py" -UseBasicParsing

Write-Host "[2/3] Writing configuration for $targetPc..." -ForegroundColor Yellow
$cfg = @{
    pc_id = $targetPc
    lab_id = "LAB-414"
    hub_url = "https://raspberrypi.tailc8c1f6.ts.net"
    heartbeat_interval = 6
    idle_threshold_seconds = 180
} | ConvertTo-Json
Set-Content -Path "$agentDir\agent_config.json" -Value $cfg

Write-Host "[3/3] Checking dependencies (psutil, pillow)..." -ForegroundColor Yellow
try {
    python -m pip install --quiet psutil pillow
} catch {
    Write-Host "Pip warning ignored." -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "===================================================================" -ForegroundColor Green
Write-Host "  ✅ READY! Connecting $targetPc to Raspberry Pi Hub..." -ForegroundColor Green
Write-Host "===================================================================" -ForegroundColor Green
Write-Host ""

Set-Location $agentDir
python "$agentDir\lab_414_agent.py" $targetPc
