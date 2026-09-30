import os
import re

def fix_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    # mams_portal/script.js replacements
    content = content.replace("o.", "✅")
    content = content.replace("?3", "⏳")
    content = content.replace("?? Report ?", "📄 Report ↗")
    content = content.replace("dY\", Report Status:", "📄 Report Status:")
    content = content.replace("dY\", Report:", "📄 Report:")
    content = content.replace("dY\" PDF", "📄 PDF")
    content = content.replace("dYs? Add New Research Project", "🚀 Add New Research Project")
    
    # Also just in case the backend one is different:
    content = content.replace('dY",', '📄')
    content = content.replace('dYs?', '🚀')
    content = content.replace('?? Report ?', '📄 Report ↗')

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"Fixed {path}")

fix_file('lab_attendance_system/mams_portal/script.js')
fix_file('lab_attendance_system/backend/static/script.js')
