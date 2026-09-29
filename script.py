import re
path = 'lab_attendance_system/backend/static/index.html'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Add list attribute to specific inputs
targets = ['tt-student-name', 'tt-filter-name', 'proj-students', 'pc-allot-name']
for t in targets:
    pattern = r'(<input[^>]+id=[\"\']' + t + r'[\"\'])([^>]*)>'
    content = re.sub(pattern, r'\1 list="registered-members-list"\2>', content)

# Add datalist before closing body if not present
if 'id="registered-members-list"' not in content:
    content = content.replace('</body>', '    <datalist id="registered-members-list"></datalist>\n</body>')

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Done modifying index.html')
