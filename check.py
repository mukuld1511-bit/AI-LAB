import sys
# Set console to utf-8
sys.stdout.reconfigure(encoding='utf-8')

with open('lab_attendance_system/mams_portal/script.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()
for line in lines:
    if 'Report Status:' in line or 'reportBadgeIcon =' in line or 'Report ↗' in line or 'Report ?' in line:
        print(line.strip())
