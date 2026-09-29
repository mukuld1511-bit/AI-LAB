mams_path = 'lab_attendance_system/mams_portal/index.html'
backend_path = 'lab_attendance_system/backend/static/index.html'
mams_js = 'lab_attendance_system/mams_portal/script.js'

with open(backend_path, 'r', encoding='utf-8') as f:
    b_lines = f.readlines()

# Extract from <input type="hidden" id="proj-edit-id" value=""> to <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;"> before the footer
start_idx = -1
end_idx = -1
for i, line in enumerate(b_lines):
    if 'id="proj-edit-id"' in line:
        start_idx = i
    if 'id="proj-report-status"' in line:
        # The end should be a few lines down where the select ends
        end_idx = i + 5
        break

backend_modal_inner = "".join(b_lines[start_idx:end_idx+1])

with open(mams_path, 'r', encoding='utf-8') as f:
    m_lines = f.readlines()

start_m = -1
end_m = -1
for i, line in enumerate(m_lines):
    if 'id="proj-edit-id"' in line:
        start_m = i
    if 'id="proj-report-status-input"' in line:
        end_m = i + 5
        break

mams_content = "".join(m_lines[:start_m]) + backend_modal_inner + "\n" + "".join(m_lines[end_m+1:])

with open(mams_path, 'w', encoding='utf-8') as f:
    f.write(mams_content)

# Update mams_portal/script.js to use the new IDs and handle the new 'status' field
with open(mams_js, 'r', encoding='utf-8') as f:
    js_content = f.read()

mappings = {
    'proj-title-input': 'proj-title',
    'proj-students-input': 'proj-students',
    'proj-pc-input': 'proj-pc-assigned',
    'proj-details-input': 'proj-details',
    'proj-desc-input': 'proj-description',
    'proj-tech-input': 'proj-technologies',
    'proj-duration-input': 'proj-duration',
    'proj-deploy-input': 'proj-deployment-url',
    'proj-github-input': 'proj-github-url',
    'proj-report-status-input': 'proj-report-status',
    'proj-report-url-input': 'proj-report-url'
}

for old, new in mappings.items():
    js_content = js_content.replace(f'"{old}"', f'"{new}"')

if 'report_status: reportStatus,' in js_content and 'status: document.getElementById("proj-status").value,' not in js_content:
    js_content = js_content.replace(
        'report_status: reportStatus,',
        'status: document.getElementById("proj-status").value,\n        report_status: reportStatus,'
    )

if 'document.getElementById("proj-title").value = "";' in js_content and 'document.getElementById("proj-status").value = "Ongoing";' not in js_content:
    js_content = js_content.replace(
        'document.getElementById("proj-title").value = "";',
        'document.getElementById("proj-title").value = "";\n    document.getElementById("proj-status").value = "Ongoing";'
    )

if 'document.getElementById("proj-title").value = proj.title || "";' in js_content and 'document.getElementById("proj-status").value = proj.status || "Ongoing";' not in js_content:
    js_content = js_content.replace(
        'document.getElementById("proj-title").value = proj.title || "";',
        'document.getElementById("proj-title").value = proj.title || "";\n    document.getElementById("proj-status").value = proj.status || "Ongoing";'
    )

with open(mams_js, 'w', encoding='utf-8') as f:
    f.write(js_content)

print("Synchronized mams_portal UI with backend UI via line slicing")
