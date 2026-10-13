import sys, re
sys.stdout.reconfigure(encoding='utf-8')

def cache_apifetch(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    pattern = r'async function apiFetch\(endpoint, options = \{\}\) \{[\s\S]*?return response\.json\(\);\s*\}'

    replacement = '''async function apiFetch(endpoint, options = {}) {
    if (!BASE_URL) throw new Error("Not connected to backend");
    
    const isGet = !options.method || options.method.toUpperCase() === "GET";
    
    try {
        const response = await fetch(${BASE_URL}, {
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
            throw new Error(errData.detail || HTTP error );
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
                    console.warn([Offline Cache] Serving  from cache ());
                    if (typeof setOfflineStatus === "function") setOfflineStatus(true, cachedObj.timestamp);
                    return cachedObj.data;
                } catch (parseErr) {}
            }
        }
        if (typeof setOfflineStatus === "function") setOfflineStatus(true);
        throw e;
    }
}'''

    if re.search(pattern, content):
        content = re.sub(pattern, replacement, content)
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print("Updated " + filepath)
    else:
        print("Target not found in " + filepath)

cache_apifetch('lab_attendance_system/mams_portal/script.js')
cache_apifetch('lab_attendance_system/backend/static/script.js')
