for path in ['lab_attendance_system/mams_portal/script.js', 'lab_attendance_system/backend/static/script.js']:
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    js_code = '''
// --- Custom Multi-Select for Students ---
let selectedStudents = new Set();
let allRegisteredUsers = [];

function initStudentDropdown(users) {
    allRegisteredUsers = users || [];
    const container = document.getElementById("student-options-container");
    if (!container) return;
    container.innerHTML = "";
    
    allRegisteredUsers.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())).forEach(user => {
        const label = document.createElement("label");
        label.style.display = "flex";
        label.style.width = "100%";
        label.style.justifyContent = "flex-start";
        label.style.flexDirection = "row";
        label.style.alignItems = "center";
        label.style.gap = "8px";
        label.style.padding = "6px";
        label.style.cursor = "pointer";
        label.style.borderRadius = "4px";
        label.className = "tech-option-label"; // reuse styles
        
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.value = user.name;
        cb.className = "tech-cb"; // reuse styles
        cb.style.margin = "0";
        cb.style.width = "auto";
        cb.onclick = (e) => {
            e.stopPropagation();
            if (cb.checked) selectedStudents.add(user.name);
            else selectedStudents.delete(user.name);
            updateStudentBadges();
        };
        
        label.appendChild(cb);
        label.appendChild(document.createTextNode([] ));
        container.appendChild(label);
        
        label.onmouseenter = () => label.style.background = "#f1f5f9";
        label.onmouseleave = () => label.style.background = "transparent";
    });
}

function toggleStudentDropdown() {
    const list = document.getElementById("student-dropdown-list");
    list.style.display = list.style.display === "none" ? "block" : "none";
}

function filterStudentDropdown() {
    const query = document.getElementById("student-search").value.toLowerCase();
    const labels = document.querySelectorAll("#student-options-container label");
    labels.forEach(label => {
        if (label.innerText.toLowerCase().includes(query)) {
            label.style.display = "flex";
        } else {
            label.style.display = "none";
        }
    });
}

function updateStudentBadges() {
    const badgeContainer = document.getElementById("student-selected-badges");
    // Find the hidden input (different id between backend and mams_portal)
    let hiddenInput = document.getElementById("proj-students-input");
    if (!hiddenInput) hiddenInput = document.getElementById("proj-students");
    
    if (selectedStudents.size === 0) {
        badgeContainer.innerHTML = "Select members...";
        if (hiddenInput) hiddenInput.value = "";
        return;
    }
    
    badgeContainer.innerHTML = "";
    Array.from(selectedStudents).forEach(name => {
        const badge = document.createElement("span");
        badge.style.background = "var(--primary-container, #e0e7ff)";
        badge.style.color = "var(--on-primary-container, #3730a3)";
        badge.style.padding = "2px 8px";
        badge.style.borderRadius = "12px";
        badge.style.fontSize = "12px";
        badge.style.fontWeight = "500";
        badge.innerText = name;
        badgeContainer.appendChild(badge);
    });
    
    if (hiddenInput) hiddenInput.value = Array.from(selectedStudents).join(", ");
}

function setStudentSelection(studentString) {
    selectedStudents.clear();
    if (studentString && studentString.trim()) {
        studentString.split(",").map(s => s.trim()).forEach(t => {
            if (t) selectedStudents.add(t);
        });
    }
    
    document.querySelectorAll("#student-options-container .tech-cb").forEach(cb => {
        cb.checked = selectedStudents.has(cb.value);
    });
    
    updateStudentBadges();
}

// Close when clicking outside
document.addEventListener("click", (e) => {
    const multiSelect = document.getElementById("student-multi-select");
    const list = document.getElementById("student-dropdown-list");
    if (multiSelect && list && !multiSelect.contains(e.target)) {
        list.style.display = "none";
    }
});
'''

    if 'function initStudentDropdown' not in content:
        content += "\n" + js_code

    # Modify populateMembersDatalist to also call initStudentDropdown
    if 'datalist.appendChild(option);\n                });' in content:
        content = content.replace('datalist.appendChild(option);\n                });', 'datalist.appendChild(option);\n                });\n                initStudentDropdown(res.users);')

    # Modify openBackendProjectModal (backend) or openProjectModal (mams) to initialize selection
    # For backend:
    if 'document.getElementById("proj-students").value = proj.student_names || "";' in content:
        content = content.replace('document.getElementById("proj-students").value = proj.student_names || "";', 'setStudentSelection(proj.student_names || "");')
    if 'setTechSelection("");' in content and 'setStudentSelection("");' not in content:
        content = content.replace('setTechSelection("");', 'setTechSelection("");\n        setStudentSelection("");')
    
    # For mams_portal:
    if 'document.getElementById("proj-students-input").value = proj.student_names || "";' in content:
        content = content.replace('document.getElementById("proj-students-input").value = proj.student_names || "";', 'setStudentSelection(proj.student_names || "");')
    if 'document.getElementById("proj-students-input").value = "";' in content:
        content = content.replace('document.getElementById("proj-students-input").value = "";', 'setStudentSelection("");')

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

print("Done injecting student multi-select JS")
