path = 'lab_attendance_system/mams_portal/index.html'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()
content = content.replace('id="proj-report-url-input"', 'id="proj-report-url"')
content = content.replace('Prof. Richa Choudhary', 'Assistant Professor')
content = content.replace('prof.richa@gmail.com', 'assistant.professor@university.edu')
with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
