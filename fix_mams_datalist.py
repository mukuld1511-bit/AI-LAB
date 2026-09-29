path = 'lab_attendance_system/mams_portal/index.html'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Add datalist
if 'id="registered-members-list"' not in content:
    content = content.replace('</body>', '    <datalist id="registered-members-list"></datalist>\n</body>')

# Add list attribute to proj-students-input
content = content.replace('id="proj-students-input" class="form-input" autocomplete="off"', 'id="proj-students-input" class="form-input" autocomplete="off" list="registered-members-list"')
content = content.replace('id="proj-students-input" class="form-input"', 'id="proj-students-input" class="form-input" list="registered-members-list"')

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

path_js = 'lab_attendance_system/mams_portal/script.js'
with open(path_js, 'r', encoding='utf-8') as f:
    content_js = f.read()

func = '''
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
                    option.text = [] ;
                    datalist.appendChild(option);
                });
            }
        }
    } catch (e) {
        console.warn("Could not load datalist users:", e);
    }
}
'''
if 'function populateMembersDatalist' not in content_js:
    content_js += "\n" + func

if 'document.addEventListener("DOMContentLoaded", () => {' in content_js:
    import re
    content_js = re.sub(r'(document\.addEventListener\([\'"]DOMContentLoaded[\'"],\s*(?:async\s*)?\(\)\s*=>\s*\{)', r'\1\n    populateMembersDatalist();', content_js)

with open(path_js, 'w', encoding='utf-8') as f:
    f.write(content_js)
print("Done adding datalist to mams_portal")
