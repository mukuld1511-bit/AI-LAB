import sys
sys.stdout.reconfigure(encoding='utf-8')
with open('lab_attendance_system/mams_portal/script.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()
for i, line in enumerate(lines):
    if 'Report ↗' in line or 'Report Status:' in line:
        print(f"Line {i+1}: {line.strip()}")
