import sys, re
sys.stdout.reconfigure(encoding='utf-8')

def fix_mams(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    pattern = r'(<div class="student-actions">\s*<button class="btn btn-primary"[^>]*>[\s\S]*?<\/button>\s*\$\{user\.email \? [\s\S]*? : \'\'\}\s*<\/div>)'

    replacement = '''<div class="student-actions" style="display: flex; gap: 4px; flex-wrap: wrap;">
                    <button class="btn btn-primary" style="flex: 1; font-size: 11px; padding: 4px;" onclick="allotPCToStudent('', '', '')">💻 Allot PC</button>
                    <button class="btn btn-primary" style="font-size: 11px; padding: 4px; background: #16a34a;" onclick="markManualDirect('', 'IN')">✅ IN</button>
                    <button class="btn btn-secondary" style="font-size: 11px; padding: 4px;" onclick="markManualDirect('', 'OUT')">🚪 OUT</button>
                </div>'''

    if re.search(pattern, content):
        content = re.sub(pattern, replacement, content)
        
        if "async function markManualDirect" not in content:
            content += '''\n\nasync function markManualDirect(name, action) {
    try {
        await apiFetch("/attendance/manual", {
            method: "POST",
            body: JSON.stringify({ name, action })
        });
        showToast(${name} marked  successfully!, "success");
        if (typeof fetchAttendanceLogs === "function") fetchAttendanceLogs();
    } catch (e) {
        showToast(Failed to mark : , "error");
    }
}\n'''
            
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print("Updated " + filepath)
    else:
        print("Target not found in " + filepath)

fix_mams('lab_attendance_system/mams_portal/script.js')
