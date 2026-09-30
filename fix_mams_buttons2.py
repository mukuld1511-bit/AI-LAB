import sys

def fix_mams(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    new_lines = []
    
    for line in lines:
        if '<div class="student-actions">' in line:
            new_lines.append(line.replace('<div class="student-actions">', '<div class="student-actions" style="display: flex; gap: 4px; flex-wrap: wrap;">'))
        elif 'onclick="allotPCToStudent' in line:
            new_lines.append(line.replace('</button>', '</button>\n                      <button class="btn btn-primary" style="font-size: 11px; padding: 4px; background: #16a34a;" onclick="markManualDirect(\\'${user.name}\\', \\'IN\\')">✅ IN</button>\n                      <button class="btn btn-secondary" style="font-size: 11px; padding: 4px;" onclick="markManualDirect(\\'${user.name}\\', \\'OUT\\')">🚪 OUT</button>'))
        else:
            new_lines.append(line)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)

fix_mams('lab_attendance_system/mams_portal/script.js')
