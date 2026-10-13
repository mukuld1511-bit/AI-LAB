import sys, re
sys.stdout.reconfigure(encoding='utf-8')

def fix_manual_override(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # We want to replace the manual-action select and manual-btn with two buttons, and add a datalist
    
    pattern = r'(<input type="text" id="manual-name" class="form-input" placeholder="Member Name[^"]*">)\s*<select id="manual-action" class="form-select"[^>]*>[\s\S]*?<\/select>\s*<button id="manual-btn" class="btn btn-primary" onclick="submitManualAttendance\(\)">[^<]*<\/button>'

    replacement = '''\\1
                <datalist id="registered-names-list"></datalist>
                <button class="btn btn-primary" style="background: #16a34a;" onclick="submitManualAttendanceFast('IN')">✅ Mark IN</button>
                <button class="btn btn-secondary" onclick="submitManualAttendanceFast('OUT')">🚪 Mark OUT</button>'''

    # Ensure the input has the list attribute
    if 'list="registered-names-list"' not in content:
        content = content.replace('id="manual-name" class="form-input"', 'id="manual-name" class="form-input" list="registered-names-list"')

    if re.search(pattern, content):
        content = re.sub(pattern, replacement, content)
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print("Updated " + filepath)
    else:
        print("Target not found in " + filepath)

fix_manual_override('lab_attendance_system/backend/static/index.html')
