$wsh = New-Object -ComObject WScript.Shell
$startupPath = [System.Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupPath "AILab24_7.lnk"
$targetBatch = Join-Path $PSScriptRoot "run_24_7.bat"

$shortcut = $wsh.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $targetBatch
$shortcut.WorkingDirectory = $PSScriptRoot
$shortcut.Description = "AI/ML Lab 24/7 Attendance and PC Monitoring Service"
$shortcut.Save()

if (Test-Path $shortcutPath) {
    Write-Host "[SUCCESS] 24/7 Startup shortcut installed to: $shortcutPath"
} else {
    Write-Host "[ERROR] Could not create shortcut."
}
