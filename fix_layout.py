def modify_html(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    content = content.replace(
        'grid-template-columns: repeat(auto-fill, minmax(380px, 1fr))',
        'grid-template-columns: 1fr'
    )
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

modify_html('lab_attendance_system/mams_portal/index.html')
modify_html('lab_attendance_system/backend/static/index.html')
print("HTML modified for full width list")
