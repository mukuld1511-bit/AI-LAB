import sys
sys.stdout.reconfigure(encoding='utf-8')
def check_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    print(f"--- {filepath} ---")
    for i, line in enumerate(lines):
        if '✅' in line:
            # strip off ✅ IN since that's expected
            clean = line.replace('✅ IN', '').replace('✅', 'OOO')
            if 'OOO' in clean:
                print(f"Line {i+1}: {line.strip()}")
check_file('lab_attendance_system/backend/static/script.js')
check_file('lab_attendance_system/mams_portal/script.js')
