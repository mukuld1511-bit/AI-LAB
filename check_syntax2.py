import py_compile
import sys
import subprocess

def check_js(filepath):
    try:
        # We can use node if available, but node isn't available. 
        # So we can't easily parse JS. Let's just find ANY remaining emojis.
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        print(f"File: {filepath}")
        print("Instances of '✅':", content.count("✅"))
        
        # Look for missing quotes or brackets around ✅
        for i, line in enumerate(content.split('\n')):
            if "✅" in line and "Mark IN" not in line and "IN<" not in line and "success" not in line and "Log recorded" not in line:
                print(f"Line {i+1}: {line}")
                
    except Exception as e:
        print(f"Error checking {filepath}: {e}")

check_js('lab_attendance_system/backend/static/script.js')
check_js('lab_attendance_system/mams_portal/script.js')
