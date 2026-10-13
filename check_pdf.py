import sys
sys.stdout.reconfigure(encoding='utf-8')
with open('lab_attendance_system/backend/static/script.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()
for i, line in enumerate(lines):
    if 'PDF' in line:
        print(f"Line {i+1}: {line.strip()}")
