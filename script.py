import re

mams_path = 'lab_attendance_system/mams_portal/index.html'
backend_path = 'lab_attendance_system/backend/static/index.html'

with open(backend_path, 'r', encoding='utf-8') as f:
    backend_content = f.read()

# Extract modal inner HTML from backend
# We want the content from <input type="hidden" id="proj-edit-id"> to the end of the last form group before the footer
match = re.search(r'(<input type="hidden" id="proj-edit-id".*?)(<div class="modal-footer">)', backend_content, re.DOTALL)
if not match:
    print("Backend modal not found")
    exit(1)

backend_modal_inner = match.group(1)

# Now, we need to map the backend IDs to mams_portal IDs to avoid breaking mams_portal/script.js
# Or better yet, just modify mams_portal/script.js to use the backend IDs!
# That way they are literally identical.
