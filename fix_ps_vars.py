import sys
sys.stdout.reconfigure(encoding='utf-8')

def fix_script(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Fix backend
    content = content.replace("markManualDirect('', 'IN')", "markManualDirect('${user.name}', 'IN')")
    content = content.replace("markManualDirect('', 'OUT')", "markManualDirect('${user.name}', 'OUT')")
    content = content.replace("deleteRegisteredMember('')", "deleteRegisteredMember('${user.name}')")
    
    # Fix frontend
    content = content.replace("allotPCToStudent('', '', '')", "allotPCToStudent('${user.name}', '${user.email || \\'\\'}', '${role}')")

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

fix_script('lab_attendance_system/backend/static/script.js')
fix_script('lab_attendance_system/mams_portal/script.js')
