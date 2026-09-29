path = 'lab_attendance_system/backend/static/script.js'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('label.style.display = "flex";', 'label.style.display = "flex";\n        label.style.justifyContent = "flex-start";\n        label.style.flexDirection = "row";')
content = content.replace('cb.className = "tech-cb";', 'cb.className = "tech-cb";\n        cb.style.margin = "0";')

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated label style")
