def modify_js(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 1. Update the Report Status block in Duration & Report Details Grid
    old_report_block = '''                              ${isFiled && proj.report_url ? `
                                  <a href="${escapeHtml(proj.report_url)}" target="_blank" style="color: #10b981; font-weight: 700; text-decoration: underline;">
                                      Filed (View Doc ?)
                                  </a>
                              ` : `<span style="font-weight: 600; color: ${isFiled ? '#10b981' : '#f59e0b'};">${escapeHtml(reportText)}</span>`}'''

    new_report_block = '''                              <span style="font-weight: 600; color: ${isFiled ? '#10b981' : (proj.report_status === 'Approved' ? '#3b82f6' : '#f59e0b')};">${escapeHtml(proj.report_status || reportText)}</span>'''
    
    if old_report_block in content:
        content = content.replace(old_report_block, new_report_block)
    else:
        print(f"Old report block not found in {path}")

    # 2. Add Report Button to the footer actions
    old_footer_actions = '''                      <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                          ${proj.deployment_url ? `
                              <a href="${escapeHtml(proj.deployment_url)}" target="_blank" class="btn btn-primary" style="font-size: 11px; padding: 5px 10px; text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">
                                  ?? Deployment ?
                              </a>
                          ` : ''}
                          ${proj.github_url ? `
                              <a href="${escapeHtml(proj.github_url)}" target="_blank" class="btn btn-secondary" style="font-size: 11px; padding: 5px 10px; text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">
                                  ?? Code ?
                              </a>
                          ` : ''}
                      </div>'''

    new_footer_actions = '''                      <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                          ${proj.deployment_url ? `
                              <a href="${escapeHtml(proj.deployment_url)}" target="_blank" class="btn btn-primary" style="font-size: 11px; padding: 5px 10px; text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">
                                  ?? Deployment ?
                              </a>
                          ` : ''}
                          ${proj.github_url ? `
                              <a href="${escapeHtml(proj.github_url)}" target="_blank" class="btn btn-secondary" style="font-size: 11px; padding: 5px 10px; text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">
                                  ?? Code ?
                              </a>
                          ` : ''}
                          ${proj.report_url ? `
                              <a href="${escapeHtml(proj.report_url)}" target="_blank" class="btn btn-secondary" style="font-size: 11px; padding: 5px 10px; text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">
                                  ?? Report ?
                              </a>
                          ` : ''}
                      </div>'''
    
    if old_footer_actions in content:
        content = content.replace(old_footer_actions, new_footer_actions)
    else:
        print(f"Old footer actions not found in {path}")

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

modify_js('lab_attendance_system/mams_portal/script.js')
modify_js('lab_attendance_system/backend/static/script.js')
print("JS modified")
