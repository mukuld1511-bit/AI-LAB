import sys

def fix_mams(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    target = """                    <!-- Project Description -->
                    <p style="margin: 0 0 14px 0; font-size: 12.5px; color: var(--on-surface-variant); line-height: 1.5;">
                        ${escapeHtml(proj.description || 'No description provided.')}
                    </p>"""
                    
    replacement = """                    <!-- Project Description -->
                    <div style="margin: 0 0 14px 0;">
                        <p id="desc-${proj.id || Math.random().toString(36).substr(2, 9)}" style="margin: 0; font-size: 12.5px; color: var(--on-surface-variant); line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; transition: all 0.3s ease;">
                            ${escapeHtml(proj.description || 'No description provided.')}
                        </p>
                        ${(proj.description && proj.description.length > 100) ? `
                            <button onclick="const p = this.previousElementSibling; if(p.style.webkitLineClamp === 'unset') { p.style.webkitLineClamp = '2'; this.innerText = 'Read More ▾'; } else { p.style.webkitLineClamp = 'unset'; this.innerText = 'Read Less ▴'; }" style="background: none; border: none; color: #6366f1; font-size: 11px; padding: 4px 0 0 0; cursor: pointer; font-weight: 700; text-decoration: none;">Read More ▾</button>
                        ` : ''}
                    </div>"""

    if target in content:
        content = content.replace(target, replacement)
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print("Success")
    else:
        print("Target not found")

fix_mams('lab_attendance_system/mams_portal/script.js')
