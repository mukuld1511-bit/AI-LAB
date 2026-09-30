import py_compile
import sys

def check_js(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        lines = content.split('\n')
        for i, line in enumerate(lines):
            # Find common JS syntax errors that might have been introduced
            if "onclick=\"allotPCToStudent" in line:
                print(f"Line {i+1}: {line.strip()}")
            if "async function apiFetch" in line:
                print(f"apiFetch is present at line {i+1}")
                
    except Exception as e:
        print(f"Error checking {filepath}: {e}")

check_js('lab_attendance_system/mams_portal/script.js')
