import sys

def fix_mams(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    target = """                <div class="student-actions" style="display: flex; gap: 4px; flex-wrap: wrap;">
                    <button class="btn btn-primary" style="flex: 1; font-size: 11px; padding: 4px;" onclick="allotPCToStudent('${user.name}', '${user.email || ''}', '${role}')">💻 Allot PC</button>
                    <button class="btn btn-primary" style="font-size: 11px; padding: 4px; background: #16a34a;" onclick="markManualDirect('${user.name}', 'IN')">✅ IN</button>
                    <button class="btn btn-secondary" style="font-size: 11px; padding: 4px;" onclick="markManualDirect('${user.name}', 'OUT')">🚪 OUT</button>
                </div>"""
                    
    replacement = """                <div class="student-actions" style="display: flex; gap: 4px; flex-wrap: wrap;">
                    <button class="btn btn-primary" style="flex: 1; font-size: 11px; padding: 4px;" onclick="allotPCToStudent('${user.name}', '${user.email || ''}', '${role}')">💻 Allot PC</button>
                </div>"""

    if target in content:
        content = content.replace(target, replacement)
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print("Success")
    else:
        print("Target not found")

fix_mams('lab_attendance_system/mams_portal/script.js')
