for path in ['lab_attendance_system/mams_portal/script.js', 'lab_attendance_system/backend/static/script.js']:
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    content = content.replace('var(--surface-container-highest)', '#f1f5f9')
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
print("Fixed hover colors")
