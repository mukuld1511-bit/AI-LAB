import sys, re
sys.stdout.reconfigure(encoding='utf-8')

def fix_mams(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Remove the two buttons
    pattern = r'<button class="btn btn-primary"[^>]*onclick="markManualDirect\([^>]*\)".*?<\/button>'
    content = re.sub(pattern, '', content)
    
    pattern2 = r'<button class="btn btn-secondary"[^>]*onclick="markManualDirect\([^>]*\)".*?<\/button>'
    content = re.sub(pattern2, '', content)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Success")

fix_mams('lab_attendance_system/mams_portal/script.js')
