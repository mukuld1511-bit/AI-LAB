def fix_tab1_grid(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    content = content.replace(
        'id="tab1-featured-projects-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 18px; margin-top: 14px;"',
        'id="tab1-featured-projects-grid" style="display: grid; grid-template-columns: 1fr; gap: 18px; margin-top: 14px;"'
    )
    
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

fix_tab1_grid('lab_attendance_system/mams_portal/index.html')
print("Fixed tab1 grid")
