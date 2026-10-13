import sys
sys.stdout.reconfigure(encoding='utf-8')

def fix_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    target = '''                <div>
                    <button class="btn btn-secondary" style="font-size: 11px; padding: 4px 8px; color: var(--error);" onclick="deleteRegisteredMember('')" title="Unregister Member">🗑️</button>
                </div>
            </div>
        ;
    }).join("");'''

    replacement = '''                <div style="display: flex; flex-direction: column; gap: 6px;">
                    <button class="btn btn-primary" style="font-size: 10px; padding: 4px; background: #16a34a;" onclick="markManualDirect('', 'IN')" title="Mark IN">✅ IN</button>
                    <button class="btn btn-secondary" style="font-size: 10px; padding: 4px;" onclick="markManualDirect('', 'OUT')" title="Mark OUT">🚪 OUT</button>
                    <button class="btn btn-secondary" style="font-size: 10px; padding: 4px; color: var(--error);" onclick="deleteRegisteredMember('')" title="Unregister Member">🗑️ Del</button>
                </div>
            </div>
        ;
    }).join("");

async function markManualDirect(name, action) {
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
}'''
    
    if target in content:
        content = content.replace(target, replacement)
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print("Updated " + filepath)
    else:
        print("Target not found in " + filepath)

fix_file('lab_attendance_system/backend/static/script.js')
fix_file('lab_attendance_system/mams_portal/script.js')
