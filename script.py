import re
path = 'lab_attendance_system/backend/static/script.js'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Check if population function already exists
if 'function populateMembersDatalist' not in content:
    func_code = '''
async function populateMembersDatalist() {
    try {
        const res = await apiFetch("/api/registered_users");
        if (res.users) {
            const datalist = document.getElementById("registered-members-list");
            if (datalist) {
                datalist.innerHTML = "";
                res.users.forEach(user => {
                    const option = document.createElement("option");
                    option.value = user.name;
                    option.text = \[\] \\;
                    datalist.appendChild(option);
                });
            }
        }
    } catch (e) {
        console.warn("Could not load datalist users:", e);
    }
}
'''
    # Insert it before the end of the file
    content += func_code
    
    # Add a call to populateMembersDatalist() in the DOMContentLoaded event if present
    content = re.sub(r'(document\.addEventListener\([\'"]DOMContentLoaded[\'"],\s*(?:async\s*)?\(\)\s*=>\s*\{)', r'\1\n    populateMembersDatalist();', content)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Done modifying script.js')
