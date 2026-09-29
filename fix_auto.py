path = 'lab_attendance_system/mams_portal/index.html'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('id="proj-duration-input" class="form-input"', 'id="proj-duration-input" class="form-input" autocomplete="off"')
content = content.replace('id="proj-title-input" class="form-input"', 'id="proj-title-input" class="form-input" autocomplete="off"')
content = content.replace('id="proj-students-input" class="form-input"', 'id="proj-students-input" class="form-input" autocomplete="off"')

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Added autocomplete off to mams_portal")
