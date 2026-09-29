for path in ['lab_attendance_system/mams_portal/index.html', 'lab_attendance_system/backend/static/index.html']:
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    content = content.replace('id="tech-options-container" style="padding: 8px; background: #ffffff;"', 'id="tech-options-container" style="padding: 8px; background: #ffffff; text-align: left; display: flex; flex-direction: column; align-items: flex-start;"')
    content = content.replace('id="tech-options-container" style="padding: 8px;"', 'id="tech-options-container" style="padding: 8px; background: #ffffff; text-align: left; display: flex; flex-direction: column; align-items: flex-start;"')
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
print("Fixed options container")
