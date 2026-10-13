import sys
sys.stdout.reconfigure(encoding='utf-8')

def fix_script(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    new_func = '''
async function submitManualAttendanceFast(action) {
    const name = document.getElementById("manual-name").value.trim();
    const msg = document.getElementById("manual-message");

    if (!name) return alert("Please enter the attendee name.");

    try {
        await apiFetch("/attendance/manual", {
            method: "POST",
            body: JSON.stringify({ name, action })
        });
        if (msg) msg.innerHTML = <span style="color: #16a34a; font-weight: 600;">Log recorded:  marked .</span>;
        document.getElementById("manual-name").value = "";
        await loadAttendance();
    } catch (e) {
        if (msg) msg.innerHTML = <span style="color: #dc2626;">Error: </span>;
    }
}

function populateManualNamesList(users) {
    const datalist = document.getElementById("manual-names-list");
    if (!datalist) return;
    datalist.innerHTML = "";
    users.forEach(u => {
        const opt = document.createElement("option");
        opt.value = u.name;
        datalist.appendChild(opt);
    });
}
'''

    if "function populateManualNamesList" not in content:
        content += new_func

    # Hook the populate function inside loadRegisteredFaces
    content = content.replace('populateAllotRegisteredDropdown(registeredUsersList);', 'populateAllotRegisteredDropdown(registeredUsersList);\n        populateManualNamesList(registeredUsersList);')

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Updated " + filepath)

fix_script('lab_attendance_system/backend/static/script.js')
