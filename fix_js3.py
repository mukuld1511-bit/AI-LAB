import re

def update_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Add Report Button
    # Find the github_url block
    github_block = r"""\$\{proj\.github_url \? `\s*<a href="\$\{escapeHtml\(proj\.github_url\)\}"[^>]*>.*?</a>\s*` : ''\}"""
    
    report_btn_code = """
                        ${proj.report_url ? `
                            <a href="${escapeHtml(proj.report_url)}" target="_blank" class="btn btn-secondary" style="font-size: 11px; padding: 5px 10px; text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">
                                ?? Report ?
                            </a>
                        ` : ''}"""

    # We want to insert report_btn_code right after the github block
    def replacer(match):
        return match.group(0) + report_btn_code

    content = re.sub(github_block, replacer, content, flags=re.DOTALL)

    # 2. Fix the Report Status text
    # Currently it has:
    # ${isFiled && proj.report_url ? `...` : `<span style="font-weight: 600; color: ${isFiled ? '#10b981' : '#f59e0b'};">${escapeHtml(reportText)}</span>`}
    # We replace that whole thing with just the span, since the link is now a button
    report_status_regex = r"""\$\{isFiled && proj\.report_url \? `.*?</a>\s*` : `<span.*?>(.*?)</span>`\}"""
    
    new_span = """<span style="font-weight: 600; color: ${isFiled ? '#10b981' : (proj.report_status === 'Approved' ? '#3b82f6' : '#f59e0b')};">${escapeHtml(proj.report_status || reportText)}</span>"""
    
    content = re.sub(report_status_regex, new_span, content, flags=re.DOTALL)

    # Let's also remove the extra "Duration & Report Details Grid" since we don't want the report link inside anymore
    
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

update_file('lab_attendance_system/mams_portal/script.js')
update_file('lab_attendance_system/backend/static/script.js')
print("Updated JS successfully!")
