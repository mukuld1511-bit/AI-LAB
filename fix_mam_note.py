path = 'lab_attendance_system/mams_portal/index.html'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()
content = content.replace('Instructions from Mam:', 'Instructions from Assistant Professor:')
with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
