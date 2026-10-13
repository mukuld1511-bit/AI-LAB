import sys

def fix_mams(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Fix mams portal script
    content = content.replace('showToast(${name} marked  successfully!, "success");', 'showToast(`${name} marked ${action} successfully!`, "success");')
    content = content.replace('showToast(Failed to mark : , "error");', 'showToast(`Failed to mark ${action}: ${e.message}`, "error");')

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

def fix_backend(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Fix backend script
    content = content.replace('if (msg) msg.innerHTML = <span style="color: #16a34a; font-weight: 600;">Log recorded:  marked .</span>;', 'if (msg) msg.innerHTML = `<span style="color: #16a34a; font-weight: 600;">Log recorded: ${name} marked ${action}.</span>`;')
    content = content.replace('if (msg) msg.innerHTML = <span style="color: #dc2626;">Error: </span>;', 'if (msg) msg.innerHTML = `<span style="color: #dc2626;">Error: ${e.message}</span>`;')
    content = content.replace('alert(${name} marked  successfully!);', 'alert(`${name} marked ${action} successfully!`);')
    content = content.replace('alert(Failed to mark : );', 'alert(`Failed to mark ${action}: ${e.message}`);')

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

fix_mams('lab_attendance_system/mams_portal/script.js')
fix_backend('lab_attendance_system/backend/static/script.js')
