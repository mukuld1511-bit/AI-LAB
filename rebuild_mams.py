import sys

def rebuild_mams(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Tailscale Tunnel update
    content = content.replace(
        'const ACTIVE_TUNNEL_FALLBACK = "https://sonic-aurora-effort-perfect.trycloudflare.com";',
        'const ACTIVE_TUNNEL_FALLBACK = "https://labg418pc12.tailc8c1f6.ts.net";'
    )

    # 2. apiFetch caching
    old_fetch = '''async function apiFetch(endpoint, options = {}) {
    if (!BASE_URL) throw new Error("Not connected to backend");
    const response = await fetch(`${BASE_URL}${endpoint}`, {
        ...options,
        headers: {
            "ngrok-skip-browser-warning": "true",
            "Content-Type": "application/json",
            ...(options.headers || {})
        },
        cache: "no-store"
    });
    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || `HTTP error ${response.status}`);
    }
    return response.json();
}'''

    new_fetch = '''async function apiFetch(endpoint, options = {}) {
    if (!BASE_URL) throw new Error("Not connected to backend");
    
    const isGet = !options.method || options.method.toUpperCase() === "GET";
    
    try {
        const response = await fetch(`${BASE_URL}${endpoint}`, {
            ...options,
            headers: {
                "ngrok-skip-browser-warning": "true",
                "Content-Type": "application/json",
                ...(options.headers || {})
            },
            cache: "no-store"
        });
        
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.detail || `HTTP error ${response.status}`);
        }
        
        const data = await response.json();
        
        // Cache successful GET responses
        if (isGet) {
            localStorage.setItem("cache_" + endpoint, JSON.stringify({
                timestamp: new Date().toLocaleString(),
                data: data
            }));
            if (typeof setOfflineStatus === "function") setOfflineStatus(false);
        }
        
        return data;
    } catch (e) {
        // If GET request fails (network error / offline), try loading from cache
        if (isGet) {
            const cachedStr = localStorage.getItem("cache_" + endpoint);
            if (cachedStr) {
                try {
                    const cachedObj = JSON.parse(cachedStr);
                    console.warn(`[Offline Cache] Serving ${endpoint} from cache (${cachedObj.timestamp})`);
                    if (typeof setOfflineStatus === "function") setOfflineStatus(true, cachedObj.timestamp);
                    return cachedObj.data;
                } catch (parseErr) {}
            }
        }
        if (typeof setOfflineStatus === "function") setOfflineStatus(true);
        throw e;
    }
}'''
    content = content.replace(old_fetch, new_fetch)

    # 3. Add IN/OUT buttons in Registered Directory
    old_actions = '''                <div class="student-actions">
                    <button class="btn btn-primary" style="flex: 1; font-size: 12px; padding: 6px 8px;" onclick="allotPCToStudent('${user.name}', '${user.email || ''}', '${role}')">
                        💻 Allot PC
                    </button>
                    ${user.email ? `
                        <a href="mailto:${user.email}" class="btn btn-secondary" style="font-size: 12px; padding: 6px 8px;" title="Send Email">📧 Email</a>
                    ` : ''}
                </div>'''

    new_actions = '''                <div class="student-actions" style="display: flex; gap: 4px; flex-wrap: wrap;">
                    <button class="btn btn-primary" style="flex: 1; font-size: 11px; padding: 4px;" onclick="allotPCToStudent('${user.name}', '${user.email || ''}', '${role}')">💻 Allot PC</button>
                    <button class="btn btn-primary" style="font-size: 11px; padding: 4px; background: #16a34a;" onclick="markManualDirect('${user.name}', 'IN')">✅ IN</button>
                    <button class="btn btn-secondary" style="font-size: 11px; padding: 4px;" onclick="markManualDirect('${user.name}', 'OUT')">🚪 OUT</button>
                </div>'''
    content = content.replace(old_actions, new_actions)

    # 4. Add markManualDirect function at the end
    content += '''\n
async function markManualDirect(name, action) {
    try {
        await apiFetch("/attendance/manual", {
            method: "POST",
            body: JSON.stringify({ name, action })
        });
        showToast(`${name} marked ${action} successfully!`, "success");
        if (typeof fetchAttendanceLogs === "function") fetchAttendanceLogs();
    } catch (e) {
        showToast(`Failed to mark ${action}: ${e.message}`, "error");
    }
}
'''
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
        
rebuild_mams('lab_attendance_system/mams_portal/script.js')
