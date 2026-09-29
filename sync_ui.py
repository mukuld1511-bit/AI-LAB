import re

mams_path = 'lab_attendance_system/mams_portal/index.html'
backend_path = 'lab_attendance_system/backend/static/index.html'
mams_js = 'lab_attendance_system/mams_portal/script.js'

with open(backend_path, 'r', encoding='utf-8') as f:
    backend_content = f.read()

# Extract modal inner HTML from backend (from <input type="hidden" id="proj-edit-id"> to <div class="modal-footer">)
match = re.search(r'(<input type="hidden" id="proj-edit-id".*?)(<div class="modal-footer">)', backend_content, re.DOTALL)
backend_modal_inner = match.group(1)

with open(mams_path, 'r', encoding='utf-8') as f:
    mams_content = f.read()

# Replace the mams_portal modal inner HTML
mams_content = re.sub(
    r'<input type="hidden" id="proj-edit-id" value="">.*?(<div class="modal-footer">)',
    backend_modal_inner + r'\1',
    mams_content,
    flags=re.DOTALL
)

with open(mams_path, 'w', encoding='utf-8') as f:
    f.write(mams_content)

# Update mams_portal/script.js to use the new IDs and handle the new 'status' field
with open(mams_js, 'r', encoding='utf-8') as f:
    js_content = f.read()

# Mappings: old_id -> new_id
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

# Also handle the 'status' field in submitProject payload
if 'report_status: reportStatus,' in js_content and 'status: document.getElementById("proj-status").value,' not in js_content:
    js_content = js_content.replace(
        'report_status: reportStatus,',
        'status: document.getElementById("proj-status").value,\n        report_status: reportStatus,'
    )

# Handle clearing 'status' on openAddProjectModal
if 'document.getElementById("proj-title").value = "";' in js_content and 'document.getElementById("proj-status").value = "Ongoing";' not in js_content:
    js_content = js_content.replace(
        'document.getElementById("proj-title").value = "";',
        'document.getElementById("proj-title").value = "";\n    document.getElementById("proj-status").value = "Ongoing";'
    )

# Handle setting 'status' on openProjectModal
if 'document.getElementById("proj-title").value = proj.title || "";' in js_content and 'document.getElementById("proj-status").value = proj.status || "Ongoing";' not in js_content:
    js_content = js_content.replace(
        'document.getElementById("proj-title").value = proj.title || "";',
        'document.getElementById("proj-title").value = proj.title || "";\n    document.getElementById("proj-status").value = proj.status || "Ongoing";'
    )

with open(mams_js, 'w', encoding='utf-8') as f:
    f.write(js_content)

print("Synchronized mams_portal UI with backend UI")
