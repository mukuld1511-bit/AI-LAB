import sys
sys.stdout.reconfigure(encoding='utf-8')

def fix_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    content = content.replace('dT✅', 'dTo.')
    content = content.replace('tT✅', 'tTo.')
    content = content.replace('vide✅', 'video.')
    content = content.replace('roll_n✅', 'roll_no.')
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
        
fix_file('lab_attendance_system/backend/static/script.js')
fix_file('lab_attendance_system/mams_portal/script.js')
print('FIXED')
