import sys
sys.stdout.reconfigure(encoding='utf-8')
with open('lab_attendance_system/backend/static/script.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()
for line in lines:
    if 'Report:' in line or 'PDF</a>' in line or 'Report ↗' in line or 'Add New Research Project' in line:
        print(line.strip())
