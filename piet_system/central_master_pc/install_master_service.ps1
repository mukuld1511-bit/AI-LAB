# install_master_service.ps1 — 24/7 Production Service Installer for PIET Master PC
# ==================================================================================
# Run in Administrator PowerShell on the Department Master PC to install autonomous auto-start.

$CurrentDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$TaskName = "PIET_Department_Central_Master_Server"
$BatchScript = Join-Path $CurrentDir "run_master_server.bat"

Write-Host "=====================================================================" -ForegroundColor Green
Write-Host " PIET AIML DEPARTMENT CENTRAL MASTER SERVER AUTO-START INSTALLER   " -ForegroundColor Green
Write-Host "=====================================================================" -ForegroundColor Green

Write-Host "`nTarget Directory: $CurrentDir"
Write-Host "Target Script:    $BatchScript"

# 1. Unregister older task if present
try {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "[OK] Cleaned previous task registration." -ForegroundColor Yellow
} catch {}

# 2. Register Startup Scheduled Task
$Action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$BatchScript`"" -WorkingDirectory $CurrentDir
$Trigger = New-ScheduledTaskTrigger -AtStartup
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 365)
$Principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal -Description "PIET AIML 5-Lab Central Supervision Master Server" | Out-Null

Write-Host "`n[SUCCESS] Central Master Server scheduled task registered successfully!" -ForegroundColor Green
Write-Host "The server will now automatically start on every system boot with highest privileges."
Write-Host "To start immediately without rebooting, run:" -ForegroundColor Cyan
Write-Host "   Start-ScheduledTask -TaskName '$TaskName'`n" -ForegroundColor White
