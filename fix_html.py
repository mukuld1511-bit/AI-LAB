path = 'lab_attendance_system/mams_portal/index.html'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('list="registered-members-list" \nautocomplete="off" list="registered-members-list"', 'list="registered-members-list" autocomplete="off"')
content = content.replace('list="registered-members-list" autocomplete="off" list="registered-members-list"', 'list="registered-members-list" autocomplete="off"')
content = content.replace('class="form-input" list="registered-members-list" \nautocomplete="off"', 'class="form-input" list="registered-members-list"')
content = content.replace('class="form-input" list="registered-members-list" autocomplete="off"', 'class="form-input" list="registered-members-list"')

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
