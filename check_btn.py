import sys
sys.stdout.reconfigure(encoding='utf-8')
with open('lab_attendance_system/backend/static/script.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()
for i, line in enumerate(lines):
    if 'Unregister Member' in line:
        print(lines[i-1].rstrip())
        print(lines[i].rstrip())
        print(lines[i+1].rstrip())
        print(lines[i+2].rstrip())
        print(lines[i+3].rstrip())
        print(lines[i+4].rstrip())
