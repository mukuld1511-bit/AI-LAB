for path in ['lab_attendance_system/mams_portal/index.html', 'lab_attendance_system/backend/static/index.html']:
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    html_to_replace_mams = '<input type=\"text\" id=\"proj-duration-input\" class=\"form-input\" autocomplete=\"off\" placeholder=\"e.g. 4 Months (Jan 2026 - May 2026)\">'
    html_to_replace_backend = '<input type=\"text\" id=\"proj-duration\" class=\"form-input\" required placeholder=\"e.g. 4 Months (Jan 2026 - May 2026)\">'

    new_html_mams = '''<div style="display: flex; gap: 8px;">
                        <input type="month" id="proj-duration-start" class="form-input" style="flex: 1;" onchange="updateDurationString(this)">
                        <span style="align-self: center; color: var(--on-surface-variant); font-weight: 600;">?</span>
                        <input type="month" id="proj-duration-end" class="form-input" style="flex: 1;" onchange="updateDurationString(this)">
                    </div>
                    <input type="hidden" id="proj-duration-input">'''

    new_html_backend = '''<div style="display: flex; gap: 8px;">
                        <input type="month" id="proj-duration-start" class="form-input" style="flex: 1;" onchange="updateDurationString(this)">
                        <span style="align-self: center; color: var(--on-surface-variant); font-weight: 600;">?</span>
                        <input type="month" id="proj-duration-end" class="form-input" style="flex: 1;" onchange="updateDurationString(this)">
                    </div>
                    <input type="hidden" id="proj-duration">'''

    if 'id="proj-duration-input"' in content and '<input type="month"' not in content:
        content = content.replace(html_to_replace_mams, new_html_mams)
    
    if 'id="proj-duration"' in content and 'id="proj-duration-input"' not in content and '<input type="month"' not in content:
        content = content.replace(html_to_replace_backend, new_html_backend)

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

for path in ['lab_attendance_system/mams_portal/script.js', 'lab_attendance_system/backend/static/script.js']:
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    js_logic = '''
// --- Custom Duration Calendar Logic ---
function updateDurationString(elem) {
    const start = document.getElementById("proj-duration-start").value;
    const end = document.getElementById("proj-duration-end").value;
    let hiddenInput = document.getElementById("proj-duration-input");
    if (!hiddenInput) hiddenInput = document.getElementById("proj-duration");
    
    if (!start || !end) {
        hiddenInput.value = "";
        return;
    }
    
    const d1 = new Date(start + "-01");
    const d2 = new Date(end + "-01");
    
    if (d2 < d1) {
        alert("End date cannot be before start date!");
        elem.value = "";
        hiddenInput.value = "";
        return;
    }
    
    let months = (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
    if (months === 0) months = 1; // if same month, count as 1 month
    
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const startStr = monthNames[d1.getMonth()] + " " + d1.getFullYear();
    const endStr = monthNames[d2.getMonth()] + " " + d2.getFullYear();
    
    hiddenInput.value = months + " Months (" + startStr + " - " + endStr + ")";
}

function setDurationSelection(durationString) {
    const startElem = document.getElementById("proj-duration-start");
    const endElem = document.getElementById("proj-duration-end");
    let hiddenInput = document.getElementById("proj-duration-input");
    if (!hiddenInput) hiddenInput = document.getElementById("proj-duration");
    
    if (!durationString) {
        startElem.value = "";
        endElem.value = "";
        hiddenInput.value = "";
        return;
    }
    
    // Fallback: just set hidden input
    hiddenInput.value = durationString;
    
    // Try to parse "4 Months (Jan 2026 - May 2026)"
    const match = durationString.match(/\\((.*) - (.*)\\)/);
    if (match && match.length === 3) {
        try {
            const d1 = new Date(match[1]);
            const d2 = new Date(match[2]);
            if (!isNaN(d1) && !isNaN(d2)) {
                startElem.value = d1.toISOString().slice(0, 7);
                endElem.value = d2.toISOString().slice(0, 7);
            }
        } catch(e) {}
    }
}
'''
    if 'function updateDurationString' not in content:
        content += "\n" + js_logic

    if 'document.getElementById("proj-duration-input").value = proj.duration || "";' in content:
        content = content.replace('document.getElementById("proj-duration-input").value = proj.duration || "";', 'setDurationSelection(proj.duration || "");')
    if 'document.getElementById("proj-duration-input").value = "";' in content:
        content = content.replace('document.getElementById("proj-duration-input").value = "";', 'setDurationSelection("");')

    if 'document.getElementById("proj-duration").value = proj.duration || "";' in content:
        content = content.replace('document.getElementById("proj-duration").value = proj.duration || "";', 'setDurationSelection(proj.duration || "");')
    if 'document.getElementById("proj-duration").value = "";' in content:
        content = content.replace('document.getElementById("proj-duration").value = "";', 'setDurationSelection("");')

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

print("Done calendar")
