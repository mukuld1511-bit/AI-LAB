def replace_in_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Replacements
    content = content.replace('Prof. Richa Choudhary - AI Lab', 'Assistant Professor - AI Lab')
    content = content.replace('Prof. Richa Choudhary', 'Assistant Professor')
    content = content.replace('prof.richa@gmail.com', 'assistant.professor@gmail.com')
    content = content.replace('Prof. Richa Mam', 'Assistant Professor')
    content = content.replace('Richa Mam', 'Assistant Professor')
    content = content.replace('Built for Richa Mam', 'Built for Assistant Professor')
    
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

replace_in_file('lab_attendance_system/mams_portal/index.html')
replace_in_file('lab_attendance_system/backend/static/index.html')
print("Names replaced")
