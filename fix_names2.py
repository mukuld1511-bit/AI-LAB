def replace_in_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Replacements back to Dr. Richa Choudhary
    content = content.replace('Assistant Professor - AI Lab', 'Dr. Richa Choudhary - AI Lab')
    content = content.replace('Assistant Professor', 'Dr. Richa Choudhary')
    content = content.replace('assistant.professor@gmail.com', 'dr.richa.choudhary@gmail.com')
    content = content.replace('assistant.professor@university.edu', 'dr.richa.choudhary@university.edu')
    
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

replace_in_file('lab_attendance_system/mams_portal/index.html')
replace_in_file('lab_attendance_system/backend/static/index.html')
print("Names replaced back to Dr. Richa Choudhary")
