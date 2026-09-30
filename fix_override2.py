import sys
sys.stdout.reconfigure(encoding='utf-8')

def fix_override(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    new_lines = []
    in_form = False
    
    for line in lines:
        if '<input type="text" id="manual-name" class="form-input"' in line:
            new_lines.append(line.replace('class="form-input"', 'class="form-input" list="manual-names-list" autocomplete="off"'))
            new_lines.append('                <datalist id="manual-names-list"></datalist>\n')
            in_form = True
        elif in_form and '<select id="manual-action"' in line:
            pass # skip
        elif in_form and '<option' in line:
            pass # skip
        elif in_form and '</select>' in line:
            pass # skip
        elif in_form and '<button id="manual-btn"' in line:
            new_lines.append('                <button class="btn btn-primary" style="background: #16a34a; white-space: nowrap; padding: 8px 16px;" onclick="submitManualAttendanceFast(\'IN\')">✅ Mark IN</button>\n')
            new_lines.append('                <button class="btn btn-secondary" style="white-space: nowrap; padding: 8px 16px;" onclick="submitManualAttendanceFast(\'OUT\')">🚪 Mark OUT</button>\n')
            in_form = False
        else:
            new_lines.append(line)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)
    print("Updated " + filepath)

fix_override('lab_attendance_system/backend/static/index.html')
