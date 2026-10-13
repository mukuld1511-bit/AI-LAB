import sys, re
sys.stdout.reconfigure(encoding='utf-8')

def fix_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Regex to match the div with the delete button and replace it
    pattern = r'(<div>\s*<button class="btn btn-secondary"[^>]*onclick="deleteRegisteredMember[^>]*>.*?<\/button>\s*<\/div>)'
    
    replacement = '''<div style="display: flex; flex-direction: column; gap: 6px;">
                    <button class="btn btn-primary" style="font-size: 10px; padding: 4px; background: #16a34a;" onclick="markManualDirect('', 'IN')" title="Mark IN">✅ IN</button>
                    <button class="btn btn-secondary" style="font-size: 10px; padding: 4px;" onclick="markManualDirect('', 'OUT')" title="Mark OUT">🚪 OUT</button>
                    <button class="btn btn-secondary" style="font-size: 10px; padding: 4px; color: var(--error);" onclick="deleteRegisteredMember('')" title="Unregister Member">🗑️ Del</button>
                </div>'''

    if re.search(pattern, content):
        content = re.sub(pattern, replacement, content)
        
        # Append the new function at the end of the file if it's not there
        if "async function markManualDirect" not in content:
            content += '''\n\nasync function markManualDirect(name, action) {
    try {
        await apiFetch("/attendance/manual", {
            method: "POST",
            body: JSON.stringify({ name, action })
        });
        alert(${name} marked  successfully!);
        if (typeof loadAttendance === "function") loadAttendance();
    } catch (e) {
        alert(Failed to mark : );
    }
}\n'''
            
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print("Updated " + filepath)
    else:
        print("Target not found in " + filepath)

fix_file('lab_attendance_system/backend/static/script.js')
fix_file('lab_attendance_system/mams_portal/script.js')
