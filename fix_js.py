for path in ['lab_attendance_system/mams_portal/script.js', 'lab_attendance_system/backend/static/script.js']:
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Force inline styles for checkboxes and labels
    content = content.replace('label.style.display = "flex";', 'label.style.display = "flex";\n        label.style.width = "100%";\n        label.style.justifyContent = "flex-start";')
    content = content.replace('cb.style.margin = "0";', 'cb.style.margin = "0";\n        cb.style.width = "auto";')
    
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
print("Fixed JS styles")
