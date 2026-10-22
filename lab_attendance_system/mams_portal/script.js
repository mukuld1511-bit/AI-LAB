// ── UTILITIES ──
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe.toString().replace(/[&<"'>]/g, function (m) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
    });
}

// ── DYNAMIC BACKEND URL (DGX Spark / Remote / Localhost) ──
const ACTIVE_TUNNEL_FALLBACK = "https://labg418pc12.tailc8c1f6.ts.net";
let storedUrl = localStorage.getItem("lab_backend_url");

let BASE_URL = ACTIVE_TUNNEL_FALLBACK;
if (storedUrl && storedUrl.includes("tailc8c1f6.ts.net")) {
    BASE_URL = storedUrl;
} else if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    BASE_URL = "http://localhost:8000";
} else {
    BASE_URL = ACTIVE_TUNNEL_FALLBACK;
    localStorage.setItem("lab_backend_url", ACTIVE_TUNNEL_FALLBACK);
}

function resolveImageUrl(url) {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
        return url;
    }
    const base = (typeof BASE_URL !== 'undefined' && BASE_URL) ? BASE_URL.replace(/\/$/, '') : '';
    return `${base}${url}`;
}

// Global cached states
let registeredUsersList = [];
let allPCsState = [];
let currentSelectedDuration = 30; // default 30 mins
let currentPCId = null;
let currentAction = "occupy"; // "occupy" | "free"
let countdownInterval = null;
let currentCategoryFilter = "all";

// Live Webcam Registration State
let webcamStream = null;
let capturedSnapshotBase64 = null;
let selectedRegRole = "Student";

// Standalone SVG Avatar & Face Fallback Generators (Zero-CDN, 100% reliable on mobile phones)
function getInitialsAvatarSVG(name, role = "Student") {
    const cleanName = (name || "Member").trim();
    const parts = cleanName.split(/\s+/).filter(Boolean);
    let initials = "AI";
    if (parts.length >= 2) {
        initials = (parts[0][0] + parts[1][0]).toUpperCase();
    } else if (cleanName.length > 0) {
        initials = cleanName.slice(0, 2).toUpperCase();
    }
    let col1 = "#4f46e5", col2 = "#7c3aed";
    const rLower = (role || "").toLowerCase();
    if (rLower === "faculty") {
        col1 = "#d97706"; col2 = "#b45309";
    } else if (rLower === "guest") {
        col1 = "#059669"; col2 = "#047857";
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><defs><linearGradient id="g_${initials}" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${col1}"/><stop offset="100%" stop-color="${col2}"/></linearGradient></defs><circle cx="60" cy="60" r="58" fill="url(#g_${initials})"/><text x="60" y="74" font-size="44" font-weight="700" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" fill="#ffffff" text-anchor="middle" dominant-baseline="middle">${initials}</text></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function getPlaceholderFaceSVG(text = "Snapshot") {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200"><rect width="100%" height="100%" fill="#1e293b"/><circle cx="150" cy="75" r="32" fill="#334155"/><path d="M 115 140 Q 150 110 185 140 Z" fill="#334155"/><text x="150" y="170" font-size="13" font-weight="600" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" fill="#94a3b8" text-anchor="middle">${text}</text></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

document.addEventListener("DOMContentLoaded", () => {
    populateMembersDatalist();
    initTabs();
    initDropdowns();

    // Init 3D Lab Scene
    if (typeof init3DLabScene === "function") {
        init3DLabScene();
    }
    
    // Connection UI setup (Supports DGX Spark, Remote IP, or Tunnel)
    const urlInput = document.getElementById("ngrok-url");
    if (urlInput) {
        urlInput.value = BASE_URL;
    }

    document.getElementById("connect-btn")?.addEventListener("click", () => {
        let url = (urlInput.value || "").trim();
        if (url.endsWith("/")) url = url.slice(0, -1);
        BASE_URL = url;
        localStorage.setItem("lab_backend_url", BASE_URL);
        checkConnection();
    });

    document.getElementById("apply-filter-btn")?.addEventListener("click", loadAttendance);
    document.getElementById("refresh-unknown-btn")?.addEventListener("click", loadUnknownFaces);
    document.getElementById("modal-action-btn")?.addEventListener("click", handleModalActionSubmit);

    // Initial connection check
    checkConnection();

    // Start 1-second interval for real-time countdown clocks and expiry polling
    startCountdownLoop();

    // Auto-poll PC status every 8 seconds for server sync
    setInterval(() => {
        if (BASE_URL) loadPCStatus(true);
    }, 8000);
});

// ── API Fetch Helper ──
async function apiFetch(endpoint, options = {}) {
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
}

// ── Offline & Unupdated Status Helper ──
function setOfflineStatus(isOffline, syncTime = "") {
    const status = document.getElementById("connection-status");
    let unupdatedBadge = document.getElementById("corner-unupdated-badge");
    
    if (!unupdatedBadge) {
        unupdatedBadge = document.createElement("div");
        unupdatedBadge.id = "corner-unupdated-badge";
        unupdatedBadge.className = "corner-unupdated-badge";
        document.body.appendChild(unupdatedBadge);
    }

    if (isOffline) {
        const timeDisplay = syncTime || "Previous Session";
        if (status) {
            status.innerHTML = `⚠️ Unupdated (Offline • ${timeDisplay})`;
            status.className = "badge badge-unupdated";
            status.title = `Backend disconnected. Showing last saved allotment from ${timeDisplay}. Click to reconnect.`;
        }
        unupdatedBadge.innerHTML = `<span>⚠️</span> <span><strong>Unupdated</strong> &bull; Showing last saved allotment (${timeDisplay})</span>`;
        unupdatedBadge.style.display = "flex";
    } else {
        if (status) {
            status.innerHTML = "🟢 Connected to AI Lab";
            status.className = "badge badge-connected";
            status.title = "Live connection active";
        }
        unupdatedBadge.style.display = "none";
    }
}

// ── Check Backend Connection ──
async function checkConnection() {
    const status = document.getElementById("connection-status");
    const connUI = document.getElementById("connection-ui");
    
    if (status) {
        status.className = "badge";
        status.innerHTML = "Connecting...";
        status.style.backgroundColor = "#fbbf24";
    }

    try {
        await apiFetch("/health");
        setOfflineStatus(false);
        if (connUI) connUI.style.display = "none";
        
        // Load data for all components
        await loadRegisteredFaces();
        await loadPCStatus();
        loadStudentProjects();
        loadAttendance();
        loadUnknownFaces();
        loadGateCameraStatusFromPortal();
    } catch (e) {
        const syncTime = localStorage.getItem("lab_cached_pc_sync_time") || "Previous Session";
        setOfflineStatus(true, syncTime);
        if (connUI) connUI.style.display = "flex";
        
        // Load cached last-known PC allotment
        loadPCStatus(true);
    }
}

// ── Navigation Tabs ──
function initTabs() {
    const btns = document.querySelectorAll('.tab-btn');
    const contents = document.querySelectorAll('.tab-content');

    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            btns.forEach(b => b.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            const target = document.getElementById(`tab-${btn.dataset.tab}`);
            if (target) target.classList.add('active');
            
            if (btn.dataset.tab === 'pc-status') {
                loadPCStatus();
                setTimeout(() => {
                    if (typeof onWindowResize === 'function') onWindowResize();
                }, 50);
            }
            if (btn.dataset.tab === 'monitoring') {
                loadMonitoringData();
                startMonitoringAutoPoll();
            } else {
                stopMonitoringAutoPoll();
            }
            if (btn.dataset.tab === 'projects') loadStudentProjects();
            if (btn.dataset.tab === 'attendance') loadAttendance();
            if (btn.dataset.tab === 'registered-faces') loadRegisteredFaces();
            if (btn.dataset.tab === 'unknown-faces') loadUnknownFaces();
        });
    });
}

// ── Export Dropdown ──
function initDropdowns() {
    const btn = document.getElementById("export-dropdown-btn");
    const menu = document.getElementById("export-menu");

    if (btn && menu) {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            menu.classList.toggle("show");
        });

        document.addEventListener("click", () => {
            menu.classList.remove("show");
        });
    }
}

// ── PC Status & Countdown Logic ──

async function loadPCStatus(silent = false) {
    if (!BASE_URL) return;
    try {
        const rawPcs = await apiFetch("/pc/status");
        const allowedPCIds = ["PC-1", "PC-2", "PC-3", "PC-4", "PC-5", "PC-6", "PC-7", "PC-8", "BACKEND"];
        allPCsState = rawPcs.filter(p => allowedPCIds.includes(p.pc_id.toUpperCase()));
        
        // Save latest allotment to cache for offline resilience
        const syncTimeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        localStorage.setItem("lab_cached_pc_status", JSON.stringify(allPCsState));
        localStorage.setItem("lab_cached_pc_sync_time", syncTimeStr);

        setOfflineStatus(false);

        const freePCs = allPCsState.filter(p => p.status.toLowerCase() === "free");
        
        document.getElementById("stat-free").innerText = freePCs.length;
        document.getElementById("stat-occupied").innerText = allPCsState.length - freePCs.length;
        document.getElementById("stat-total").innerText = allPCsState.length;

        // 1. Sync 3D Scene
        if (typeof updatePCStatusIn3D === "function") {
            updatePCStatusIn3D(allPCsState);
        }

        // 2. Render 2D Workstation Grid
        render2DGrid();
    } catch(e) {
        if (!silent) console.error("PC load failed", e);
        
        // Backend offline / down: recover last saved PC allotment state
        const cached = localStorage.getItem("lab_cached_pc_status");
        const syncTime = localStorage.getItem("lab_cached_pc_sync_time") || "Previous Session";

        if (cached) {
            try {
                allPCsState = JSON.parse(cached);
                const freePCs = allPCsState.filter(p => p.status.toLowerCase() === "free");
                
                const statFree = document.getElementById("stat-free");
                const statOcc = document.getElementById("stat-occupied");
                const statTot = document.getElementById("stat-total");
                if (statFree) statFree.innerText = freePCs.length;
                if (statOcc) statOcc.innerText = allPCsState.length - freePCs.length;
                if (statTot) statTot.innerText = allPCsState.length;

                // Sync 3D scene & 2D grid with cached state
                if (typeof updatePCStatusIn3D === "function") {
                    updatePCStatusIn3D(allPCsState);
                }
                render2DGrid();
            } catch(err) {
                console.error("Failed to parse cached PCs", err);
            }
        }

        setOfflineStatus(true, syncTime);
    }
}

function formatFriendlyDateTime(dtStr) {
    if (!dtStr) return "Until released";
    try {
        const clean = dtStr.replace("T", " ").split(".")[0].trim();
        const [dPart, tPart] = clean.split(" ");
        const [yyyy, mm, dd] = dPart.split("-");
        const [hh, min] = (tPart || "00:00").split(":");
        
        const d = new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd), parseInt(hh), parseInt(min));
        const today = new Date();
        const isToday = d.toDateString() === today.toDateString();
        
        const tomorrow = new Date();
        tomorrow.setDate(today.getDate() + 1);
        const isTomorrow = d.toDateString() === tomorrow.toDateString();
        
        const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
        
        if (isToday) {
            return `Today at ${timeStr}`;
        } else if (isTomorrow) {
            return `Tomorrow at ${timeStr}`;
        } else {
            const dateStr = d.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });
            return `${dateStr} at ${timeStr}`;
        }
    } catch (e) {
        return dtStr;
    }
}

function formatFriendlyDate(dtStr) {
    if (!dtStr) return "Today";
    try {
        const clean = dtStr.replace("T", " ").split(" ")[0].trim();
        const [yyyy, mm, dd] = clean.split("-");
        const d = new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd));
        return d.toLocaleDateString([], { day: '2-digit', month: 'short' });
    } catch (e) {
        return dtStr.split(" ")[0] || dtStr;
    }
}

function formatFriendlyTime(dtStr) {
    if (!dtStr) return "N/A";
    try {
        const timePart = dtStr.includes(" ") ? dtStr.split(" ")[1] : dtStr;
        const [hh, min] = timePart.split(":");
        const d = new Date();
        d.setHours(parseInt(hh), parseInt(min), 0);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch (e) {
        return dtStr.split(" ")[1] || dtStr;
    }
}

function render2DGrid() {
    const grid = document.getElementById("pc-grid");
    if (!grid) return;

    grid.innerHTML = allPCsState.map(pc => {
        const isBackend = pc.pc_id === "BACKEND";
        const isFree = !isBackend && pc.status.toLowerCase() === "free";
        const cardClass = isBackend ? "pc-card-occupied" : (isFree ? "pc-card-free" : "pc-card-occupied");
        const badgeClass = isBackend ? "badge-occupied" : (isFree ? "badge-free" : "badge-occupied");
        const badgeText = isBackend ? "⚡ 24/7 SERVER" : (isFree ? "🟢 AVAILABLE" : "🔴 IN USE");
        
        let countdownHtml = "";
        let timeRemainingStr = "";

        if (isBackend) {
            countdownHtml = `
                <div class="countdown-box" style="background: #eff6ff; color: #1e40af; border-color: #bfdbfe;">
                    <span>Host Status:</span>
                    <strong style="color: #2563eb;">⚡ 24/7 Dedicated Server</strong>
                </div>
                <div style="font-size: 11px; color: #64748b; margin-top: 4px;">
                    Role: <strong style="color: #1e40af;">FastAPI Core + Static Ngrok Tunnel</strong>
                </div>
            `;
        } else if (!isFree) {
            if (pc.end_time) {
                const diff = calculateTimeRemaining(pc.end_time);
                timeRemainingStr = diff.formatted;
                const formattedValidUntil = formatFriendlyDateTime(pc.end_time);
                countdownHtml = `
                    <div class="countdown-box" id="timer-${pc.pc_id}">
                        <span>⏳ Time Left:</span>
                        <strong style="color: #b91c1c;">${timeRemainingStr}</strong>
                    </div>
                    <div style="font-size: 11px; color: var(--on-surface-variant); margin-top: 4px;">
                        Valid Until: <strong style="color: #4338ca;">${formattedValidUntil}</strong>
                    </div>
                `;
            } else {
                countdownHtml = `
                    <div class="countdown-box" style="background: #f1f5f9; color: #475569; border-color: #cbd5e1;">
                        <span>Session:</span>
                        <strong>Active</strong>
                    </div>
                `;
            }
        } else {
            countdownHtml = `
                <div class="countdown-free-ready">
                    ✨ Ready for Assignment
                </div>
            `;
        }

        const occupants = pc.occupied_by ? pc.occupied_by.split(",").map(s => s.trim()).filter(Boolean) : [];
        const isGroup = occupants.length > 1;

        let roleBadge = "";
        if (isBackend) {
            roleBadge = `<span class="role-badge" style="background: #dbeafe; color: #1d4ed8; border: 1px solid #bfdbfe;">🖥️ Server Host</span>`;
        } else if (!isFree && occupants.length > 0) {
            if (isGroup) {
                roleBadge = `<span class="role-badge" style="background: #e0e7ff; color: #4338ca; border: 1px solid #c7d2fe;">👥 Team (${occupants.length})</span>`;
            } else {
                const role = (pc.user_role || "Student").toLowerCase();
                if (role === "faculty") {
                    roleBadge = `<span class="role-badge role-badge-faculty">👨‍🏫 Faculty</span>`;
                } else if (role === "guest") {
                    roleBadge = `<span class="role-badge role-badge-guest">👤 Guest</span>`;
                } else {
                    roleBadge = `<span class="role-badge role-badge-student">🎓 Student</span>`;
                }
            }
        }

        const isOnline = pc.is_online === 1 || pc.is_online === true;
        const onlineBadge = isOnline 
            ? `<span class="badge" style="background: rgba(34, 197, 94, 0.15); color: #16a34a; border: 1px solid rgba(34, 197, 94, 0.3); font-size: 10px; font-weight: 700; padding: 2px 7px;">🟢 ONLINE</span>`
            : `<span class="badge" style="background: rgba(100, 116, 139, 0.15); color: #64748b; border: 1px solid rgba(100, 116, 139, 0.3); font-size: 10px; font-weight: 700; padding: 2px 7px;">⚫ OFFLINE</span>`;

        let telemetryHtml = "";
        if (isOnline) {
            const cpuVal = pc.cpu_percent || 0;
            const ramVal = pc.ram_percent || 0;
            const ramUsed = pc.ram_used_gb || 0;
            const ramTot = pc.ram_total_gb || 0;
            const gpuVal = pc.gpu_percent || 0;
            const gpuTemp = pc.gpu_temp || 0;
            const gpuName = pc.gpu_name || "";

            telemetryHtml = `
                <div class="pc-telemetry-box" style="margin-top: 12px; padding: 10px 12px; background: linear-gradient(135deg, rgba(248, 250, 252, 0.9) 0%, rgba(241, 245, 249, 0.6) 100%); border: 1px solid rgba(226, 232, 240, 0.9); border-radius: 12px; font-size: 11px; box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.6);">
                    <!-- CPU Row -->
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
                        <span style="color: #475569; font-weight: 700; display: flex; align-items: center; gap: 4px;">⚡ CPU Load</span>
                        <strong style="color: ${cpuVal > 80 ? '#dc2626' : (cpuVal > 50 ? '#d97706' : '#16a34a')}; font-family: 'JetBrains Mono', monospace;">${cpuVal}%</strong>
                    </div>
                    <div style="width: 100%; height: 5px; background: #e2e8f0; border-radius: 3px; overflow: hidden; margin-bottom: 8px;">
                        <div style="width: ${Math.min(100, cpuVal)}%; height: 100%; background: ${cpuVal > 80 ? 'linear-gradient(90deg, #ef4444, #dc2626)' : 'linear-gradient(90deg, #10b981, #059669)'}; border-radius: 3px; transition: width 0.3s ease;"></div>
                    </div>

                    <!-- RAM Row -->
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
                        <span style="color: #475569; font-weight: 700; display: flex; align-items: center; gap: 4px;">🧠 Memory</span>
                        <strong style="color: #4338ca; font-family: 'JetBrains Mono', monospace;">${ramVal}% <span style="font-size: 10px; color: #64748b; font-weight: 500;">(${ramUsed}/${ramTot} GB)</span></strong>
                    </div>
                    <div style="width: 100%; height: 5px; background: #e2e8f0; border-radius: 3px; overflow: hidden; margin-bottom: 8px;">
                        <div style="width: ${Math.min(100, ramVal)}%; height: 100%; background: linear-gradient(90deg, #6366f1, #4f46e5); border-radius: 3px; transition: width 0.3s ease;"></div>
                    </div>

                    <!-- GPU Row with % and Temperature -->
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
                        <span style="color: #475569; font-weight: 700; display: flex; align-items: center; gap: 4px;" title="${escapeHtml(gpuName || 'GPU Hardware Accelerator')}">
                            🎮 GPU ${gpuName ? `(${escapeHtml(gpuName.split(' ')[0])})` : ''}
                        </span>
                        <div style="display: flex; align-items: center; gap: 6px;">
                            ${gpuTemp > 0 ? `
                                <span style="background: ${gpuTemp > 75 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)'}; color: ${gpuTemp > 75 ? '#dc2626' : '#d97706'}; padding: 1px 5px; border-radius: 4px; font-size: 10px; font-weight: 700;">
                                    🔥 ${gpuTemp}°C
                                </span>
                            ` : ''}
                            <strong style="color: #0284c7; font-family: 'JetBrains Mono', monospace;">${gpuVal}%</strong>
                        </div>
                    </div>
                    <div style="width: 100%; height: 5px; background: #e2e8f0; border-radius: 3px; overflow: hidden; margin-bottom: ${pc.gpu_vram_total_mb > 0 ? '4px' : '0'};">
                        <div style="width: ${Math.min(100, gpuVal)}%; height: 100%; background: linear-gradient(90deg, #0284c7, #0369a1); border-radius: 3px; transition: width 0.3s ease;"></div>
                    </div>
                    ${pc.gpu_vram_total_mb > 0 ? `
                        <div style="font-size: 9px; color: #64748b; font-family: 'JetBrains Mono', monospace; text-align: right; margin-top: 2px;">
                            VRAM: ${Math.round(pc.gpu_vram_used_mb || 0)} / ${Math.round(pc.gpu_vram_total_mb)} MB
                        </div>
                    ` : ''}
                </div>
            `;
        } else {
            telemetryHtml = `
                <div style="margin-top: 10px; padding: 8px 12px; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 10px; font-size: 11px; color: #94a3b8; text-align: center; font-weight: 500;">
                    ⚫ System Powered Down / Inactive
                </div>
            `;
        }

        const displayTitle = isBackend ? "🖥️ BACKEND SERVER" : `💻 ${pc.pc_id}`;

        return `
            <div class="pc-card ${cardClass}" 
                 id="grid-pc-${pc.pc_id}"
                 style="${isBackend ? 'border: 2px solid #60a5fa; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.15); cursor: default;' : 'cursor: pointer;'}"
                 onclick="${isBackend ? `showToast('🔒 AI Lab Core Backend Host: Read-Only System Node (Access Restricted).', 'info')` : `handlePCClick('${pc.pc_id}', ${isFree})`}"
                 onmouseenter="if (typeof highlightPC === 'function') highlightPC('${pc.pc_id}', true)"
                 onmouseleave="if (typeof highlightPC === 'function') highlightPC('${pc.pc_id}', false)">
                
                <div class="pc-header-row">
                    <div class="pc-title" style="${isBackend ? 'color: #1d4ed8; font-weight: 800;' : ''}">${displayTitle}</div>
                    <div style="display: flex; gap: 4px; align-items: center; flex-wrap: wrap; justify-content: flex-end;">
                        ${onlineBadge}
                        ${roleBadge}
                        <div class="status-badge ${badgeClass}" style="${isBackend ? 'background: #2563eb; color: #ffffff;' : ''}">${badgeText}</div>
                    </div>
                </div>

                <div class="pc-body">
                    ${!isFree && occupants.length > 0 ? `
                        ${isGroup ? `
                            <div class="pc-user-info" style="display: flex; flex-direction: column; gap: 4px;">
                                <div style="font-size: 11px; font-weight: 700; color: #475569; display: flex; align-items: center; gap: 4px;">
                                    <span>👥 Active Team (${occupants.length}):</span>
                                </div>
                                <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                                    ${occupants.map(name => `
                                        <span style="background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 10px;">
                                            👤 ${name}
                                        </span>
                                    `).join("")}
                                </div>
                            </div>
                        ` : `
                            <div class="pc-user-info">
                                <span>${isBackend ? '🖥️' : '👤'}</span> <strong>${pc.occupied_by}</strong>
                            </div>
                        `}
                        ${pc.current_project ? `
                            <div class="pc-project-tag" title="Project: ${pc.current_project}">
                                💼 <span>${pc.current_project}</span>
                            </div>
                        ` : ''}
                        ${pc.user_email ? `<div class="pc-email-info">✉️ ${pc.user_email}</div>` : ''}
                        <div style="font-size: 11px; color: #64748b; margin-top: 4px; display: flex; justify-content: space-between;">
                            <span>📅 ${formatFriendlyDate(pc.since_time)}</span>
                            <span>⏰ Since: ${formatFriendlyTime(pc.since_time)}</span>
                        </div>
                    ` : `
                        <div style="font-size: 13px; color: var(--on-surface-variant); margin-bottom: 4px;">
                            No user currently assigned
                        </div>
                    `}
                </div>

                ${telemetryHtml}

                ${countdownHtml}

                <div class="pc-actions" onclick="event.stopPropagation()">
                    ${isBackend ? `
                        <div style="width: 100%; text-align: center; font-size: 11px; padding: 7px 10px; background: #eff6ff; color: #1e40af; border-radius: 6px; font-weight: 700; border: 1px dashed #bfdbfe;">
                            🔒 Core Server Host • Read-Only
                        </div>
                    ` : isFree ? `
                        <button class="btn btn-primary" style="width: 100%; font-size: 12px; padding: 6px 10px;" onclick="handlePCClick('${pc.pc_id}', true)">
                            ⚡ Assign PC
                        </button>
                    ` : `
                        <button class="btn btn-secondary" style="flex: 1; font-size: 12px; padding: 5px 8px;" onclick="handlePCClick('${pc.pc_id}', false)">
                            🔄 Team / Extend
                        </button>
                        <button class="btn btn-danger" style="flex: 1; font-size: 12px; padding: 5px 8px;" onclick="quickFreePC('${pc.pc_id}')">
                            ❌ Free Slot
                        </button>
                    `}
                </div>
            </div>
        `;
    }).join("");
}

function calculateTimeRemaining(endTimeStr) {
    if (!endTimeStr) return { totalMs: 0, formatted: "N/A", expired: false };
    
    // Parse "YYYY-MM-DD HH:MM:SS"
    const parts = endTimeStr.replace("T", " ").split(" ");
    const dateParts = parts[0].split("-");
    const timeParts = (parts[1] || "00:00:00").split(":");
    
    const targetDate = new Date(
        parseInt(dateParts[0]),
        parseInt(dateParts[1]) - 1,
        parseInt(dateParts[2]),
        parseInt(timeParts[0]),
        parseInt(timeParts[1]),
        parseInt(timeParts[2] || 0)
    );

    const now = new Date();
    const diffMs = targetDate - now;

    if (diffMs <= 0) {
        return { totalMs: 0, formatted: "00:00 (Expired)", expired: true };
    }

    const totalSeconds = Math.floor(diffMs / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    const hours = Math.floor(mins / 60);

    let formatted = "";
    if (hours > 0) {
        formatted = `${hours}h ${mins % 60}m ${secs}s`;
    } else {
        formatted = `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
    }

    return { totalMs: diffMs, formatted, expired: false };
}

// Start 1-second countdown loop for active PC timers
function startCountdownLoop() {
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
        let hasExpired = false;
        allPCsState.forEach(pc => {
            if (pc.status.toLowerCase() === "occupied" && pc.end_time) {
                const diff = calculateTimeRemaining(pc.end_time);
                const timerElem = document.getElementById(`timer-${pc.pc_id}`);
                if (timerElem) {
                    const strong = timerElem.querySelector("strong");
                    if (strong) strong.innerText = diff.formatted;
                }
                if (diff.expired) {
                    hasExpired = true;
                }
            }
        });

        // If any PC session expired, reload once with throttle
        if (hasExpired && !window._lastExpiryReloadTime || (Date.now() - (window._lastExpiryReloadTime || 0) > 30000)) {
            window._lastExpiryReloadTime = Date.now();
            loadPCStatus(true);
        }
    }, 1000);
}

// ── Active Student Projects & Modal Selection ──
let labProjectsCache = [];

async function populateProjectSelect() {
    const select = document.getElementById("modal-project-select");
    if (!select) return;
    try {
        const res = await apiFetch("/api/projects");
        labProjectsCache = res.projects || [];
        select.innerHTML = '<option value="">-- Choose Existing Lab Project or Type Below --</option>';
        labProjectsCache.forEach(p => {
            const opt = document.createElement("option");
            opt.value = p.title;
            opt.innerText = `💼 ${p.title} (${p.status || 'Ongoing'})`;
            select.appendChild(opt);
        });
    } catch (e) {
        console.warn("Could not fetch project list", e);
    }
}

function onProjectSelectChange() {
    const select = document.getElementById("modal-project-select");
    const input = document.getElementById("modal-current-project");
    if (select && input && select.value) {
        input.value = select.value;
    }
}

async function submitQuickProjectUpdate() {
    if (!currentPCId) return;
    const input = document.getElementById("modal-edit-project-input");
    const newProj = (input ? input.value : "").trim();

    try {
        await apiFetch(`/pc/${currentPCId}/project`, {
            method: "POST",
            body: JSON.stringify({
                pc_id: currentPCId,
                current_project: newProj
            })
        });
        showToast(`💼 Updated active project for ${currentPCId} to "${newProj || 'General Work'}"`, "success");
        closePCModal();
        loadPCStatus(false);
    } catch (e) {
        showToast(`Failed to update project: ${e.message}`, "error");
    }
}

// ── Multi-Occupant Group Partner Functions ──
function appendStudentPartner() {
    const select = document.getElementById("modal-student-select");
    const nameInput = document.getElementById("modal-student-name");
    const emailInput = document.getElementById("modal-student-email");
    if (!select || !select.value) {
        showToast("Please choose a student from the dropdown first.", "info");
        return;
    }
    const chosenName = select.value.trim();
    const chosenEmail = (select.options[select.selectedIndex]?.dataset?.email || "").trim();

    if (!nameInput) return;
    const currentNames = nameInput.value.split(",").map(n => n.trim()).filter(Boolean);
    if (currentNames.includes(chosenName)) {
        showToast(`'${chosenName}' is already added to this group.`, "info");
        return;
    }
    currentNames.push(chosenName);
    nameInput.value = currentNames.join(", ");

    if (emailInput && chosenEmail) {
        const currentEmails = emailInput.value.split(",").map(e => e.trim()).filter(Boolean);
        if (!currentEmails.includes(chosenEmail)) {
            currentEmails.push(chosenEmail);
            emailInput.value = currentEmails.join(", ");
        }
    }
    showToast(`👥 Added '${chosenName}' to group for ${currentPCId || 'Workstation'}`, "success");
}

function onAddPartnerSelectChange(sel) {
    if (!sel) return;
    const input = document.getElementById("modal-add-partner-input");
    if (input && sel.value) {
        input.value = sel.value;
    }
}

async function submitAddPartnerToPC() {
    if (!currentPCId) return;
    const select = document.getElementById("modal-add-partner-select");
    const input = document.getElementById("modal-add-partner-input");
    const partnerName = ((input && input.value ? input.value : (select && select.value ? select.value : ""))).trim();
    if (!partnerName) {
        showToast("Please select or enter a student name to add.", "error");
        return;
    }

    let partnerEmail = "";
    if (select && select.selectedOptions && select.selectedOptions[0] && select.selectedOptions[0].dataset.email) {
        partnerEmail = select.selectedOptions[0].dataset.email;
    }
    if (!partnerEmail && typeof registeredUsersList !== "undefined" && registeredUsersList) {
        const found = registeredUsersList.find(u => u.name && u.name.toLowerCase() === partnerName.toLowerCase());
        if (found && found.email) partnerEmail = found.email;
    }

    try {
        const res = await apiFetch(`/pc/${currentPCId}/add_occupant`, {
            method: "POST",
            body: JSON.stringify({
                pc_id: currentPCId,
                student_name: partnerName,
                email: partnerEmail
            })
        });
        let msg = `👥 Added '${partnerName}' to ${currentPCId}`;
        if (res && res.email_result && res.email_result.success) {
            msg += ` • ✉️ Email Delivered`;
        }
        showToast(msg, "success");
        if (input) input.value = "";
        if (select) select.value = "";
        closePCModal();
        loadPCStatus(false);
    } catch (e) {
        showToast(`Failed to add partner: ${e.message}`, "error");
    }
}

async function removePartnerFromPC(studentName) {
    if (!currentPCId || !studentName) return;
    if (!confirm(`Remove ${studentName} from ${currentPCId}?`)) return;

    try {
        const res = await apiFetch(`/pc/${currentPCId}/occupant/${encodeURIComponent(studentName)}`, {
            method: "DELETE"
        });
        showToast(res.message || `Removed ${studentName}`, "success");
        closePCModal();
        loadPCStatus(false);
    } catch (e) {
        showToast(`Failed to remove partner: ${e.message}`, "error");
    }
}

// ── Modal Handling for PC Allotment ──

function handlePCClick(pcId, isFree) {
    if (!BASE_URL) {
        showToast("Please connect to the backend first.", "error");
        return;
    }

    currentPCId = (pcId || "").toUpperCase().trim();
    if (currentPCId === "BACKEND") {
        showToast("🔒 AI Lab Core Backend Host: Read-Only System Node (Access Restricted).", "info");
        return;
    }
    const pcData = allPCsState.find(p => p.pc_id.toUpperCase() === currentPCId);
    const modal = document.getElementById("pc-modal");
    const title = document.getElementById("modal-title");
    const desc = document.getElementById("modal-desc");
    const occupyForm = document.getElementById("modal-occupy-form");
    const freeSection = document.getElementById("modal-free-section");
    const actionBtn = document.getElementById("modal-action-btn");

    if (!modal) return;
    modal.style.display = "flex";

    // Render Telemetry Box inside the Modal
    let modalTelemetryWrap = document.getElementById("modal-hardware-telemetry-banner");
    if (!modalTelemetryWrap) {
        modalTelemetryWrap = document.createElement("div");
        modalTelemetryWrap = document.createElement("div");
        modalTelemetryWrap.id = "modal-hardware-telemetry-banner";
        const header = modal.querySelector(".modal-header");
        if (header && header.parentNode) {
            header.insertAdjacentElement("afterend", modalTelemetryWrap);
        }
    }

    if (pcData && (pcData.is_online === 1 || pcData.is_online === true)) {
        modalTelemetryWrap.style.display = "block";
                const gpuDisplayName = pcData.gpu_name ? escapeHtml(pcData.gpu_name.split(' ')[0]) : 'DGX/RTX';
                const gpuVal = pcData.gpu_percent || 0;
                const gpuTemp = pcData.gpu_temp || 0;
                const vramUsedMb = pcData.gpu_vram_used_mb || 0;
                const vramTotalMb = pcData.gpu_vram_total_mb || 0;
                modalTelemetryWrap.innerHTML = `
            <div style="margin: 12px 24px 0 24px; padding: 10px 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; font-size: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <span style="font-weight: 700; color: #1e293b; display: flex; align-items: center; gap: 6px;">
                        ⚡ Live Telemetry (${pcData.pc_id})
                        <span class="badge" style="background: rgba(34, 197, 94, 0.15); color: #16a34a; font-size: 10px; padding: 2px 6px;">ONLINE</span>
                    </span>
                    <span style="color: #64748b; font-size: 11px;">IP: <strong>${pcData.ip_address || 'Local'}</strong></span>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;">
                    <div style="background: #ffffff; padding: 6px 10px; border-radius: 6px; border: 1px solid #f1f5f9;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
                            <span style="color: #64748b; font-weight: 600;">CPU</span>
                            <strong style="color: ${pcData.cpu_percent > 80 ? '#dc2626' : '#16a34a'};">${pcData.cpu_percent || 0}%</strong>
                        </div>
                        <div style="width: 100%; height: 4px; background: #e2e8f0; border-radius: 2px; overflow: hidden;">
                            <div style="width: ${Math.min(100, pcData.cpu_percent || 0)}%; height: 100%; background: #10b981;"></div>
                        </div>
                    </div>
                    <div style="background: #ffffff; padding: 6px 10px; border-radius: 6px; border: 1px solid #f1f5f9;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
                            <span style="color: #64748b; font-weight: 600;">RAM</span>
                            <strong style="color: #4338ca;">${pcData.ram_percent || 0}% (${pcData.ram_used_gb || 0}/${pcData.ram_total_gb || 0} GB)</strong>
                        </div>
                        <div style="width: 100%; height: 4px; background: #e2e8f0; border-radius: 2px; overflow: hidden;">
                            <div style="width: ${Math.min(100, pcData.ram_percent || 0)}%; height: 100%; background: #6366f1;"></div>
                        </div>
                    </div>
                    <div style="background: #ffffff; padding: 6px 10px; border-radius: 6px; border: 1px solid #f1f5f9;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
                            <span style="color: #64748b; font-weight: 600;" title="${escapeHtml(pcData.gpu_name || 'GPU Hardware Accelerator')}">🎮 GPU (${gpuDisplayName})</span>
                            <div style="display: flex; align-items: center; gap: 4px;">
                                ${gpuTemp > 0 ? `<span style="color: #ea580c; font-weight: 700; font-size: 10px;">🔥 ${gpuTemp}°C</span>` : ''}
                                <strong style="color: #0284c7;">${gpuVal}%</strong>
                            </div>
                        </div>
                        <div style="width: 100%; height: 4px; background: #e2e8f0; border-radius: 2px; overflow: hidden;">
                            <div style="width: ${Math.min(100, gpuVal)}%; height: 100%; background: linear-gradient(90deg, #0284c7, #0369a1);"></div>
                        </div>
                    </div>
                </div>
                ${vramTotalMb > 0 ? `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px; font-size: 10px; color: #64748b;">
                    <span>⚡ Accelerator: <strong>${escapeHtml(pcData.gpu_name || 'NVIDIA DGX Compute')}</strong></span>
                    <span>VRAM: <strong>${Math.round(vramUsedMb)} / ${Math.round(vramTotalMb)} MB</strong></span>
                </div>
                ` : ''}
            </div>
        `;
    } else {
        modalTelemetryWrap.style.display = "block";
        modalTelemetryWrap.innerHTML = `
            <div style="margin: 12px 24px 0 24px; padding: 8px 14px; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 10px; font-size: 11px; color: #94a3b8; display: flex; justify-content: space-between; align-items: center;">
                <span>⚫ Workstation is currently Powered Off or Offline</span>
                <span class="badge" style="background: rgba(100, 116, 139, 0.15); color: #64748b; font-size: 10px;">OFFLINE</span>
            </div>
        `;
    }

    // Populate Live Telemetry HUD (Active Window, Screen Thumbnail, Tasks)
    const winVal = document.getElementById("modal-active-win-val");
    if (winVal) winVal.innerText = pcData.active_window || (pcData.is_online ? "Active Desktop / Idle" : "Workstation Offline");

    const thumbImg = document.getElementById("modal-screen-thumb");
    const thumbPlh = document.getElementById("modal-screen-placeholder");
    if (thumbImg && thumbPlh) {
        if (pcData.screenshot_url) {
            thumbImg.src = resolveImageUrl(pcData.screenshot_url);
            thumbImg.style.display = "block";
            thumbPlh.style.display = "none";
        } else {
            thumbImg.style.display = "none";
            thumbPlh.style.display = "block";
        }
    }

    const procsList = document.getElementById("modal-top-procs-list");
    if (procsList) {
        const procs = pcData.top_processes || [];
        if (procs.length > 0) {
            procsList.innerHTML = procs.map(pr => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0; border-bottom: 1px solid #1e293b;">
                    <span style="color: #cbd5e1; font-weight: 600;">${escapeHtml(pr.name)}</span>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="color: #94a3b8; font-size: 10px;">CPU ${pr.cpu}% | RAM ${pr.ram}%</span>
                        ${pr.pid ? `<button type="button" class="mon-kill-btn" onclick="killWorkstationTask('${currentPCId}', ${pr.pid}, '${escapeHtml(pr.name)}')">✖</button>` : ''}
                    </div>
                </div>
            `).join("");
        } else {
            procsList.innerHTML = `<span style="color: #64748b;">${pcData.is_online ? 'No heavy tasks reported' : 'PC Offline'}</span>`;
        }
    }

    if (isFree || !pcData || pcData.status.toLowerCase() === "free") {
        currentAction = "occupy";
        title.innerText = `Assign Workstation ${currentPCId}`;
        desc.innerText = `Select student and time duration. Workstation will automatically release after time expires.`;
        occupyForm.style.display = "block";
        freeSection.style.display = "none";
        
        actionBtn.innerText = "Confirm & Assign Slot";
        actionBtn.className = "btn btn-primary";

        // Reset form inputs
        selectUserRole("Student");
        document.getElementById("modal-student-name").value = "";
        document.getElementById("modal-student-email").value = "";
        document.getElementById("modal-faculty-notes").value = "";
        document.getElementById("modal-student-select").value = "";
        
        // Reset and populate project & registered student dropdowns
        const curProjInput = document.getElementById("modal-current-project");
        if (curProjInput) curProjInput.value = "";
        populateProjectSelect();
        populateStudentSelect();
        
        // Initialize Date From-To & Time From-To Range with current dynamic times
        initAllotmentRangeDefaults();
    } else {
        // PC is occupied - Allow Free or Extend
        currentAction = "free";
        title.innerText = `Manage ${currentPCId} (Occupied)`;
        desc.innerText = `Workstation is currently occupied by ${pcData.occupied_by || "Student"}`;
        
        occupyForm.style.display = "none";
        freeSection.style.display = "block";

        document.getElementById("modal-free-pc-title").innerText = `${currentPCId} is Allocated to ${pcData.occupied_by}`;
        document.getElementById("modal-free-pc-desc").innerText = `Started: ${formatFriendlyDateTime(pcData.since_time)} • Valid until: ${formatFriendlyDateTime(pcData.end_time)}`;
        
        const activeProjBadge = document.getElementById("modal-active-project-badge");
        if (activeProjBadge) {
            activeProjBadge.innerText = pcData.current_project ? pcData.current_project : "General Research / Coding";
        }
        const editProjInput = document.getElementById("modal-edit-project-input");
        if (editProjInput) {
            editProjInput.value = pcData.current_project || "";
        }

        // Render Current Partners / Teammates List
        const partnersListEl = document.getElementById("modal-current-partners-list");
        if (partnersListEl) {
            const occupants = pcData.occupied_by ? pcData.occupied_by.split(",").map(s => s.trim()).filter(Boolean) : [];
            if (occupants.length > 0) {
                partnersListEl.innerHTML = `
                    <div style="margin-top: 8px;">
                        <strong style="color: #166534; font-size: 11px;">Current Assigned Members (${occupants.length}):</strong>
                        <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px;">
                            ${occupants.map(n => `
                                <span style="display: inline-flex; align-items: center; gap: 6px; background: #ffffff; border: 1px solid #86efac; color: #15803d; padding: 4px 10px; border-radius: 16px; font-size: 12px; font-weight: 700;">
                                    👤 ${n}
                                    <button type="button" onclick="removePartnerFromPC('${n.replace(/'/g, "\\'")}')" style="background: none; border: none; color: #ef4444; font-weight: 800; cursor: pointer; padding: 0 2px;" title="Remove ${n} from this workstation">✕</button>
                                </span>
                            `).join("")}
                        </div>
                    </div>
                `;
            } else {
                partnersListEl.innerHTML = "";
            }
        }

        actionBtn.innerText = "❌ Free / Deselect Workstation";
        actionBtn.className = "btn btn-danger";
    }
}

function closePCModal() {
    const modal = document.getElementById("pc-modal");
    if (modal) modal.style.display = "none";
    currentPCId = null;
}

// ── Dynamic Allotment Date & Time Range Math (From-To) ──

function initAllotmentRangeDefaults() {
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    
    const dateFromInput = document.getElementById("modal-date-from");
    const dateToInput = document.getElementById("modal-date-to");
    const timeFromInput = document.getElementById("modal-time-from");
    const timeToInput = document.getElementById("modal-time-to");

    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const timeFromStr = `${hh}:${mm}`;

    // Default +30 minutes
    const future = new Date(now.getTime() + 30 * 60 * 1000);
    const futHh = String(future.getHours()).padStart(2, '0');
    const futMm = String(future.getMinutes()).padStart(2, '0');
    const futDateStr = future.toISOString().split("T")[0];
    const timeToStr = `${futHh}:${futMm}`;

    if (dateFromInput) dateFromInput.value = todayStr;
    if (dateToInput) dateToInput.value = futDateStr;
    if (timeFromInput) timeFromInput.value = timeFromStr;
    if (timeToInput) timeToInput.value = timeToStr;

    onAllotmentRangeChange();
}

function onAllotmentRangeChange() {
    const dateFrom = document.getElementById("modal-date-from")?.value;
    const dateTo = document.getElementById("modal-date-to")?.value;
    const timeFrom = document.getElementById("modal-time-from")?.value;
    const timeTo = document.getElementById("modal-time-to")?.value;

    const durationText = document.getElementById("calc-duration-text");
    const expiryText = document.getElementById("calc-expiry-text");

    if (!dateFrom || !dateTo || !timeFrom || !timeTo) return;

    const startDt = new Date(`${dateFrom}T${timeFrom}:00`);
    const endDt = new Date(`${dateTo}T${timeTo}:00`);

    const diffMs = endDt - startDt;
    if (diffMs <= 0) {
        if (durationText) {
            durationText.innerText = "Invalid Range (End before Start)";
            durationText.style.color = "#ef4444";
        }
        if (expiryText) expiryText.innerText = "End time must be after Start time";
        return;
    }

    const totalMins = Math.round(diffMs / 60000);
    const hours = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    let durStr = "";
    if (hours > 0) {
        durStr = `${hours} hr${hours > 1 ? 's' : ''}${mins > 0 ? ` ${mins} min` : ''}`;
    } else {
        durStr = `${mins} Mins`;
    }

    if (durationText) {
        durationText.innerText = durStr;
        durationText.style.color = "#4338ca";
    }
    if (expiryText) {
        const timeFmt = endDt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
        expiryText.innerText = `${dateTo} at ${timeFmt}`;
    }
}

function applyQuickTimePreset(mins) {
    const dateFrom = document.getElementById("modal-date-from")?.value || new Date().toISOString().split("T")[0];
    const timeFrom = document.getElementById("modal-time-from")?.value || "12:00";
    const startDt = new Date(`${dateFrom}T${timeFrom}:00`);

    let targetDt;
    if (mins === 'eod') {
        targetDt = new Date(`${dateFrom}T18:00:00`);
        if (targetDt <= startDt) {
            targetDt.setDate(targetDt.getDate() + 1);
        }
    } else {
        targetDt = new Date(startDt.getTime() + parseInt(mins) * 60 * 1000);
    }

    const targetDateStr = targetDt.toISOString().split("T")[0];
    const targetHh = String(targetDt.getHours()).padStart(2, '0');
    const targetMm = String(targetDt.getMinutes()).padStart(2, '0');

    const dateToInput = document.getElementById("modal-date-to");
    const timeToInput = document.getElementById("modal-time-to");

    if (dateToInput) dateToInput.value = targetDateStr;
    if (timeToInput) timeToInput.value = `${targetHh}:${targetMm}`;

    onAllotmentRangeChange();
}

// Populate Registered Members Dropdown for Allotment
async function populateStudentSelect() {
    const select = document.getElementById("modal-student-select");
    const partnerSelect = document.getElementById("modal-add-partner-select");

    if (!registeredUsersList || registeredUsersList.length === 0) {
        try {
            const data = await apiFetch("/api/registered_users");
            registeredUsersList = data.users || [];
        } catch (e) {
            console.warn("Failed to fetch registered users for modal select", e);
        }
    }

    if (select) {
        select.innerHTML = '<option value="">-- Choose from Registered Database --</option>';
        registeredUsersList.forEach(user => {
            const opt = document.createElement("option");
            opt.value = user.name;
            const role = user.role || "Student";
            const icon = role.toLowerCase() === "faculty" ? "👨‍🏫" : role.toLowerCase() === "guest" ? "👤" : "🎓";
            const rollStr = user.roll_no ? ` (${user.roll_no})` : "";
            const emailStr = user.email ? ` • ${user.email}` : "";
            opt.innerText = `${icon} [${role}] ${user.name}${rollStr}${emailStr}`;
            opt.dataset.email = user.email || "";
            opt.dataset.role = role;
            select.appendChild(opt);
        });
    }

    if (partnerSelect) {
        partnerSelect.innerHTML = '<option value="">-- Choose from Registered Students --</option>';
        registeredUsersList.forEach(user => {
            const opt = document.createElement("option");
            opt.value = user.name;
            const role = user.role || "Student";
            const icon = role.toLowerCase() === "faculty" ? "👨‍🏫" : role.toLowerCase() === "guest" ? "👤" : "🎓";
            const rollStr = user.roll_no ? ` (${user.roll_no})` : "";
            opt.innerText = `${icon} [${role}] ${user.name}${rollStr}`;
            opt.dataset.email = user.email || "";
            opt.dataset.role = role;
            partnerSelect.appendChild(opt);
        });
    }

    // Also populate registered-members-list datalist
    const datalist = document.getElementById("registered-members-list");
    if (datalist && registeredUsersList.length > 0) {
        datalist.innerHTML = registeredUsersList.map(u => `<option value="${escapeHtml(u.name)}">${escapeHtml(u.role || 'Student')}${u.roll_no ? ` (${escapeHtml(u.roll_no)})` : ''}</option>`).join("");
    }
}

function onStudentSelectChange() {
    const select = document.getElementById("modal-student-select");
    const selectedOpt = select.options[select.selectedIndex];
    if (selectedOpt && selectedOpt.value) {
        document.getElementById("modal-student-name").value = selectedOpt.value;
        const email = selectedOpt.dataset.email || "";
        document.getElementById("modal-student-email").value = email;
        const role = selectedOpt.dataset.role || "Student";
        selectUserRole(role);
    }
}

function appendStudentPartner() {
    const select = document.getElementById("modal-student-select");
    if (!select || !select.value) {
        showToast("Please choose a member from the dropdown first to add as teammate", "info");
        return;
    }
    const nameInput = document.getElementById("modal-student-name");
    if (!nameInput) return;
    const currentVal = nameInput.value.trim();
    if (currentVal) {
        const parts = currentVal.split(",").map(s => s.trim().toLowerCase());
        if (!parts.includes(select.value.toLowerCase())) {
            nameInput.value = currentVal + ", " + select.value;
            showToast(`Added ${select.value} as partner`, "success");
        } else {
            showToast(`${select.value} is already added`, "info");
        }
    } else {
        nameInput.value = select.value;
        showToast(`Selected ${select.value}`, "success");
    }
    const selectedOpt = select.options[select.selectedIndex];
    if (selectedOpt && selectedOpt.dataset.email) {
        const emailInput = document.getElementById("modal-student-email");
        if (emailInput && !emailInput.value.trim()) {
            emailInput.value = selectedOpt.dataset.email;
        }
    }
}

let selectedUserRole = "Student";

function selectUserRole(role) {
    selectedUserRole = role || "Student";
    const chips = document.querySelectorAll(".role-chip-btn");
    chips.forEach(c => {
        if (c.dataset.role === selectedUserRole) {
            c.classList.add("active");
        } else {
            c.classList.remove("active");
        }
    });

    const regGroup = document.getElementById("reg-student-group");
    const nameLabel = document.getElementById("modal-name-label");
    const nameInput = document.getElementById("modal-student-name");

    if (selectedUserRole === "Student") {
        if (regGroup) regGroup.style.display = "block";
        if (nameLabel) nameLabel.innerText = "Student Full Name:";
        if (nameInput) nameInput.placeholder = "e.g. Ayush, Priya (or pick from above list)";
    } else if (selectedUserRole === "Faculty") {
        if (regGroup) regGroup.style.display = "block";
        if (nameLabel) nameLabel.innerText = "Faculty Member Name & Title:";
        if (nameInput) nameInput.placeholder = "e.g. Dr. Sharma, Prof. Verma";
    } else if (selectedUserRole === "Guest") {
        if (regGroup) regGroup.style.display = "block";
        if (nameLabel) nameLabel.innerText = "Guest / Visitor Name:";
        if (nameInput) nameInput.placeholder = "e.g. Rahul (Visiting Guest), External Researcher";
    }
}

// Handle Allot / Free Submit
async function handleModalActionSubmit() {
    if (!currentPCId) return;

    const actionBtn = document.getElementById("modal-action-btn");
    actionBtn.disabled = true;
    actionBtn.innerText = "Processing...";

    try {
        if (currentAction === "occupy") {
            const name = document.getElementById("modal-student-name").value.trim();
            const email = document.getElementById("modal-student-email").value.trim();
            const sendEmail = document.getElementById("modal-send-email").checked;
            const notes = document.getElementById("modal-faculty-notes").value.trim();

            if (!name) {
                showToast("Please enter or select a name.", "error");
                actionBtn.disabled = false;
                actionBtn.innerText = "Confirm & Assign Slot";
                return;
            }

            const dateFrom = document.getElementById("modal-date-from")?.value;
            const dateTo = document.getElementById("modal-date-to")?.value;
            const timeFrom = document.getElementById("modal-time-from")?.value;
            const timeTo = document.getElementById("modal-time-to")?.value;

            if (!dateFrom || !dateTo || !timeFrom || !timeTo) {
                showToast("Please provide both Date From/To and Time From/To ranges.", "error");
                actionBtn.disabled = false;
                actionBtn.innerText = "Confirm & Assign Slot";
                return;
            }

            const startDt = new Date(`${dateFrom}T${timeFrom}:00`);
            const endDt = new Date(`${dateTo}T${timeTo}:00`);

            if (endDt <= startDt) {
                showToast("End Time must be after Start Time.", "error");
                actionBtn.disabled = false;
                actionBtn.innerText = "Confirm & Assign Slot";
                return;
            }

            const durationMins = Math.max(1, Math.round((endDt - startDt) / 60000));
            const explicitStartTime = `${dateFrom} ${timeFrom}:00`;
            const explicitEndTime = `${dateTo} ${timeTo}:00`;
            const currentProject = (document.getElementById("modal-current-project")?.value || "").trim();

            const response = await apiFetch("/pc/occupy", {
                method: "POST",
                body: JSON.stringify({
                    pc_id: currentPCId,
                    name: name,
                    email: email,
                    duration_mins: durationMins,
                    start_time: explicitStartTime,
                    end_time: explicitEndTime,
                    send_email: sendEmail && !!email,
                    notes: notes,
                    user_role: selectedUserRole,
                    current_project: currentProject
                })
            });

            let toastMsg = `💻 ${currentPCId} assigned to ${name} (${selectedUserRole}) until ${timeTo}`;
            if (currentProject) {
                toastMsg += ` • 💼 ${currentProject}`;
            }
            if (sendEmail && email) {
                if (response && response.email_result) {
                    if (response.email_result.success) {
                        toastMsg += ` • ✉️ Email Delivered`;
                    } else {
                        toastMsg += ` • ⚠️ Email Failed: ${response.email_result.message || response.email_result.error || 'Check Mail Config'}`;
                    }
                } else {
                    toastMsg += ` • ✉️ Email Triggered`;
                }
            }
            showToast(toastMsg, response?.email_result?.success === false ? "info" : "success");

        } else if (currentAction === "free") {
            await apiFetch("/pc/free", {
                method: "POST",
                body: JSON.stringify({ pc_id: currentPCId })
            });
            showToast(`🟢 ${currentPCId} marked as available!`, "success");
        }

        closePCModal();
        await loadPCStatus();
    } catch (e) {
        showToast("Error: " + e.message, "error");
        actionBtn.disabled = false;
        actionBtn.innerText = currentAction === "free" ? "❌ Free Workstation" : "Confirm & Assign Slot";
    }
}

async function quickFreePC(pcId) {
    if (pcId && pcId.toUpperCase() === "BACKEND") {
        showToast("🔒 BACKEND server is a protected core node and cannot be freed.", "warning");
        return;
    }
    if (!confirm(`Are you sure you want to deselect and free ${pcId}?`)) return;
    try {
        await apiFetch("/pc/free", {
            method: "POST",
            body: JSON.stringify({ pc_id: pcId })
        });
        showToast(`🟢 ${pcId} is now Free!`, "success");
        await loadPCStatus();
    } catch (e) {
        showToast("Failed to free PC: " + e.message, "error");
    }
}

// ── Organized Logs State & Subsystem (Lecture, Daily, Monthly, Student Dossier) ──
let currentLogsView = "lecture"; // "lecture" | "daily" | "monthly" | "student" | "raw"

function switchLogsView(view) {
    currentLogsView = view;
    const chipIds = {
        lecture: "chip-log-lecture",
        daily: "chip-log-daily",
        monthly: "chip-log-monthly",
        student: "chip-log-student",
        raw: "chip-log-raw"
    };
    Object.keys(chipIds).forEach(k => {
        const el = document.getElementById(chipIds[k]);
        if (el) {
            if (k === view) el.classList.add("active");
            else el.classList.remove("active");
        }
    });

    // Toggle Date vs Month inputs
    const dateCont = document.getElementById("filter-date-container");
    const monthCont = document.getElementById("filter-month-container");
    if (view === "monthly" || view === "student") {
        if (dateCont) dateCont.style.display = "none";
        if (monthCont) monthCont.style.display = "inline-block";
    } else {
        if (dateCont) dateCont.style.display = "inline-block";
        if (monthCont) monthCont.style.display = "none";
    }

    loadAttendance();
}

function applyLogsFilter() {
    loadAttendance();
}

function resetLogsFilter() {
    const d = document.getElementById("filter-log-date");
    const m = document.getElementById("filter-log-month");
    const s = document.getElementById("filter-log-search");
    if (d) d.value = "";
    if (m) m.value = "";
    if (s) s.value = "";
    loadAttendance();
}

async function triggerManualSummaryAggregation() {
    if (!BASE_URL) return showToast("Not connected to backend", "error");
    showToast("Running autonomous aggregation across all periods...", "info");
    try {
        const res = await apiFetch("/api/logs/generate_summary", { method: "POST" });
        showToast(`✅ Aggregation Complete! Today: ${res.daily_summary?.total_lectures_held || 0} lectures, Month: ${res.monthly_summary?.total_lectures || 0} lectures`, "success");
        await loadAttendance();
    } catch (e) {
        showToast("Aggregation failed: " + e.message, "error");
    }
}

function downloadOrganizedLogsDirect(type) {
    if (!BASE_URL) return showToast("Not connected to backend", "error");
    window.open(`${BASE_URL}/api/logs/export_csv?log_type=${type}&lab_id=AI-LAB`, "_blank");
    showToast(`Downloading Official ${type.toUpperCase()} CSV Report...`, "success");
}

function downloadOrganizedLogsCSV() {
    let t = currentLogsView;
    if (t === "raw") {
        downloadAttendanceCSV();
        return;
    }
    const dateVal = document.getElementById("filter-log-date")?.value || "";
    const monthVal = document.getElementById("filter-log-month")?.value || "";
    let param = "";
    if ((t === "monthly" || t === "student") && monthVal) {
        param = `&date_or_month=${monthVal}`;
    } else if (dateVal) {
        param = `&date_or_month=${dateVal}`;
    }
    window.open(`${BASE_URL}/api/logs/export_csv?log_type=${t}&lab_id=AI-LAB${param}`, "_blank");
    showToast(`Downloading ${t.toUpperCase()} CSV export...`, "success");
}

async function loadAttendance() {
    if (!BASE_URL) return;
    const container = document.getElementById("organized-logs-container");
    if (!container) return;

    const dateVal = document.getElementById("filter-log-date")?.value || "";
    const monthVal = document.getElementById("filter-log-month")?.value || "";
    const searchVal = document.getElementById("filter-log-search")?.value.trim().toLowerCase() || "";

    const m1Val = document.getElementById("stat-log-metric-1");
    const m1Lbl = document.getElementById("stat-log-label-1");
    const m2Val = document.getElementById("stat-log-metric-2");
    const m2Lbl = document.getElementById("stat-log-label-2");
    const m3Val = document.getElementById("stat-log-metric-3");
    const m3Lbl = document.getElementById("stat-log-label-3");

    container.innerHTML = `<div style="text-align: center; padding: 40px; color: #64748b; font-weight: 600;">⏳ Loading organized logs...</div>`;

    try {
        if (currentLogsView === "lecture") {
            let url = `/api/logs/lecture?lab_id=AI-LAB`;
            if (dateVal) url += `&date=${dateVal}`;
            const res = await apiFetch(url);
            let logs = res.data || [];

            if (searchVal) {
                logs = logs.filter(r => 
                    (r.subject || "").toLowerCase().includes(searchVal) ||
                    (r.faculty || "").toLowerCase().includes(searchVal) ||
                    (r.slot_name || "").toLowerCase().includes(searchVal) ||
                    (r.batch || "").toLowerCase().includes(searchVal)
                );
            }

            const countChip = document.getElementById("chip-count-lecture");
            if (countChip) countChip.innerText = logs.length;

            if (m1Val) m1Val.innerText = logs.length;
            if (m1Lbl) m1Lbl.innerText = "LECTURE SESSIONS";
            const avgPCs = logs.length ? Math.round(logs.reduce((acc, r) => acc + (r.active_pcs_count || 0), 0) / logs.length) : 0;
            if (m2Val) m2Val.innerText = avgPCs;
            if (m2Lbl) m2Lbl.innerText = "AVG ACTIVE PCs";
            const avgFruit = logs.length ? Math.round(logs.reduce((acc, r) => acc + (r.avg_fruitful_percent || 0), 0) / logs.length) : 0;
            if (m3Val) m3Val.innerText = `${avgFruit}%`;
            if (m3Lbl) m3Lbl.innerText = "AVG PRODUCTIVITY";

            if (logs.length === 0) {
                container.innerHTML = `<div style="text-align: center; color: var(--on-surface-variant); padding: 40px;">No lecture session records found for the selected filter.</div>`;
                return;
            }

            container.innerHTML = `
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Period / Time Slot</th>
                            <th>Subject & Batch</th>
                            <th>Faculty In-Charge</th>
                            <th>Date</th>
                            <th>Active PCs</th>
                            <th>Students Present</th>
                            <th>Fruitful %</th>
                            <th>Telemetry</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${logs.map(r => {
                            let pcsList = [];
                            try { pcsList = typeof r.active_pcs_list === 'string' ? JSON.parse(r.active_pcs_list) : (r.active_pcs_list || []); } catch(e){}
                            let fruitful = Math.round(r.avg_fruitful_percent || 0);
                            let color = fruitful >= 75 ? "#16a34a" : (fruitful >= 50 ? "#d97706" : "#dc2626");
                            return `
                                <tr>
                                    <td>
                                        <div style="font-weight: 800; color: #1e293b;">${r.slot_id}</div>
                                        <div style="font-size: 11px; color: #64748b;">${r.slot_name || `${r.start_time} - ${r.end_time}`}</div>
                                    </td>
                                    <td>
                                        <div style="font-weight: 700; color: #4338ca;">${escapeHtml(r.subject || 'AI Project Lab')}</div>
                                        <span class="project-tag" style="font-size: 10px; padding: 2px 6px;">Batch: ${escapeHtml(r.batch || 'AIML')}</span>
                                    </td>
                                    <td>
                                        <div style="font-weight: 600; color: #0f172a;">${escapeHtml(r.faculty || 'Dr. Richa Choudhary')}</div>
                                    </td>
                                    <td style="font-family: 'JetBrains Mono', monospace; font-size: 12px;">${r.log_date}</td>
                                    <td>
                                        <div style="font-weight: 800; font-size: 14px; color: #0284c7;">${r.active_pcs_count} PCs</div>
                                        <div style="font-size: 10px; color: #64748b; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${pcsList.join(', ')}">
                                            ${pcsList.slice(0, 4).join(', ')}${pcsList.length > 4 ? ` +${pcsList.length - 4}` : ''}
                                        </div>
                                    </td>
                                    <td>
                                        <span class="badge" style="background: #e0e7ff; color: #3730a3; font-weight: 700; font-size: 12px;">
                                            👥 ${r.students_present_count}
                                        </span>
                                    </td>
                                    <td>
                                        <div style="display: flex; align-items: center; gap: 8px;">
                                            <div style="flex: 1; height: 6px; background: #e2e8f0; border-radius: 3px; min-width: 60px;">
                                                <div style="width: ${Math.min(100, fruitful)}%; height: 100%; background: ${color}; border-radius: 3px;"></div>
                                            </div>
                                            <span style="font-weight: 800; color: ${color}; font-size: 12px; font-family: 'JetBrains Mono', monospace;">${fruitful}%</span>
                                        </div>
                                    </td>
                                    <td style="font-size: 11px; color: #475569;">
                                        <div>CPU: <strong>${Math.round(r.avg_cpu_percent || 0)}%</strong> • RAM: <strong>${Math.round(r.avg_ram_percent || 0)}%</strong></div>
                                        ${r.total_distractions > 0 ? `<div style="color: #dc2626; font-size: 10px; font-weight: 700;">⚠️ ${r.total_distractions} distractions</div>` : `<div style="color: #16a34a; font-size: 10px;">✅ Zero distractions</div>`}
                                    </td>
                                </tr>
                            `;
                        }).join("")}
                    </tbody>
                </table>
            `;

        } else if (currentLogsView === "daily") {
            const res = await apiFetch(`/api/logs/daily?lab_id=AI-LAB`);
            let logs = res.data || [];

            if (searchVal) {
                logs = logs.filter(r => (r.log_date || "").includes(searchVal) || (r.day_of_week || "").toLowerCase().includes(searchVal));
            }

            const countChip = document.getElementById("chip-count-daily");
            if (countChip) countChip.innerText = logs.length;

            if (m1Val) m1Val.innerText = logs.length;
            if (m1Lbl) m1Lbl.innerText = "DAYS LOGGED";
            const peakPcs = logs.reduce((acc, r) => Math.max(acc, r.peak_active_pcs || 0), 0);
            if (m2Val) m2Val.innerText = peakPcs;
            if (m2Lbl) m2Lbl.innerText = "PEAK WORKSTATIONS";
            const avgAtt = logs.length ? Math.round(logs.reduce((acc, r) => acc + (r.attendance_rate_percent || 0), 0) / logs.length) : 0;
            if (m3Val) m3Val.innerText = `${avgAtt}%`;
            if (m3Lbl) m3Lbl.innerText = "ATTENDANCE RATE";

            if (logs.length === 0) {
                container.innerHTML = `<div style="text-align: center; color: var(--on-surface-variant); padding: 40px;">No daily consolidated records found.</div>`;
                return;
            }

            container.innerHTML = `
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Date & Day</th>
                            <th>Lectures Conducted</th>
                            <th>Total Students</th>
                            <th>Peak Active PCs</th>
                            <th>Total Active Lab Hours</th>
                            <th>Avg Fruitful %</th>
                            <th>Attendance Rate %</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${logs.map(r => `
                            <tr>
                                <td>
                                    <div style="font-weight: 800; color: #0f172a; font-family: 'JetBrains Mono', monospace;">${r.log_date}</div>
                                    <div style="font-size: 11px; color: #6366f1; font-weight: 700;">${r.day_of_week}</div>
                                </td>
                                <td>
                                    <span class="badge" style="background: #eef2ff; color: #4338ca; font-size: 13px; font-weight: 800;">
                                        📖 ${r.total_lectures_held} Lectures
                                    </span>
                                </td>
                                <td><strong>👥 ${r.total_students_attended}</strong> Students</td>
                                <td style="color: #0284c7; font-weight: 800; font-size: 14px;">💻 ${r.peak_active_pcs} PCs</td>
                                <td style="font-family: 'JetBrains Mono', monospace; font-weight: 600;">⏱️ ${r.total_active_hours} hrs</td>
                                <td>
                                    <span style="font-weight: 800; color: ${r.avg_fruitful_percent >= 75 ? '#16a34a' : '#d97706'}; font-size: 13px;">
                                        ${r.avg_fruitful_percent}%
                                    </span>
                                </td>
                                <td>
                                    <span class="badge ${r.attendance_rate_percent >= 75 ? 'badge-connected' : 'badge-disconnected'}" style="font-weight: 800;">
                                        ${r.attendance_rate_percent}%
                                    </span>
                                </td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            `;

        } else if (currentLogsView === "monthly") {
            let url = `/api/logs/monthly?lab_id=AI-LAB`;
            if (monthVal) url += `&month=${monthVal}`;
            const res = await apiFetch(url);
            let logs = res.data || [];

            const countChip = document.getElementById("chip-count-monthly");
            if (countChip) countChip.innerText = logs.length;

            const workDays = logs.reduce((acc, r) => acc + (r.working_days || 0), 0);
            if (m1Val) m1Val.innerText = workDays;
            if (m1Lbl) m1Lbl.innerText = "WORKING DAYS";
            const avgUtil = logs.length ? Math.round(logs.reduce((acc, r) => acc + (r.lab_utilization_percent || 0), 0) / logs.length) : 0;
            if (m2Val) m2Val.innerText = `${avgUtil}%`;
            if (m2Lbl) m2Lbl.innerText = "LAB UTILIZATION";
            const avgFruit = logs.length ? Math.round(logs.reduce((acc, r) => acc + (r.avg_fruitful_percent || 0), 0) / logs.length) : 0;
            if (m3Val) m3Val.innerText = `${avgFruit}%`;
            if (m3Lbl) m3Lbl.innerText = "AVG PRODUCTIVITY";

            if (logs.length === 0) {
                container.innerHTML = `<div style="text-align: center; color: var(--on-surface-variant); padding: 40px;">No monthly audit records found.</div>`;
                return;
            }

            container.innerHTML = `
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Month</th>
                            <th>Working Days</th>
                            <th>Total Lectures</th>
                            <th>Student Sessions</th>
                            <th>Avg Daily Attendance</th>
                            <th>Lab Utilization %</th>
                            <th>Avg Fruitful %</th>
                            <th>Top Software Used</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${logs.map(r => {
                            let topApps = [];
                            try { topApps = typeof r.top_software_used === 'string' ? JSON.parse(r.top_software_used) : (r.top_software_used || []); } catch(e){}
                            return `
                                <tr>
                                    <td>
                                        <div style="font-weight: 900; color: #4338ca; font-size: 15px; font-family: 'JetBrains Mono', monospace;">
                                            🗓️ ${r.log_month}
                                        </div>
                                    </td>
                                    <td><strong>${r.working_days}</strong> Days</td>
                                    <td><span class="badge badge-connected">📖 ${r.total_lectures}</span></td>
                                    <td>👥 <strong>${r.total_student_attendances}</strong></td>
                                    <td>${r.avg_daily_attendance} / day</td>
                                    <td>
                                        <div style="font-weight: 800; color: #0284c7; font-size: 13px;">${r.lab_utilization_percent}%</div>
                                    </td>
                                    <td>
                                        <span style="font-weight: 800; color: #16a34a; font-size: 13px;">${r.avg_fruitful_percent}%</span>
                                    </td>
                                    <td>
                                        <div style="display: flex; flex-wrap: wrap; gap: 4px; max-width: 220px;">
                                            ${topApps.map(a => `
                                                <span style="background: #f1f5f9; color: #334155; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; border: 1px solid #cbd5e1;">
                                                    ⚙️ ${escapeHtml(a.app || a)}
                                                </span>
                                            `).join("")}
                                        </div>
                                    </td>
                                </tr>
                            `;
                        }).join("")}
                    </tbody>
                </table>
            `;

        } else if (currentLogsView === "student") {
            let url = `/api/logs/students_monthly`;
            if (monthVal) url += `?month=${monthVal}`;
            const res = await apiFetch(url);
            let students = res.data || [];

            if (searchVal) {
                students = students.filter(s => (s.student_name || "").toLowerCase().includes(searchVal));
            }

            const countChip = document.getElementById("chip-count-student");
            if (countChip) countChip.innerText = students.length;

            const eligibleCount = students.filter(s => s.status === "ELIGIBLE").length;
            const shortCount = students.length - eligibleCount;
            if (m1Val) m1Val.innerText = students.length;
            if (m1Lbl) m1Lbl.innerText = "TOTAL STUDENTS";
            if (m2Val) m2Val.innerText = eligibleCount;
            if (m2Lbl) m2Lbl.innerText = "ELIGIBLE (>=75%)";
            if (m3Val) m3Val.innerText = shortCount;
            if (m3Lbl) m3Lbl.innerText = "SHORT ATTENDANCE";

            if (students.length === 0) {
                container.innerHTML = `<div style="text-align: center; color: var(--on-surface-variant); padding: 40px;">No student monthly records found.</div>`;
                return;
            }

            container.innerHTML = `
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Student Full Name</th>
                            <th>Month</th>
                            <th>Classes (Attended / Total)</th>
                            <th>Attendance %</th>
                            <th>NBA Criteria Status</th>
                            <th>Total Lab Hours</th>
                            <th>Fruitful Hours</th>
                            <th>Last Active</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${students.map(s => {
                            const isEligible = s.status === "ELIGIBLE";
                            return `
                                <tr>
                                    <td>
                                        <div style="font-weight: 800; color: #0f172a; font-size: 13px;">👤 ${escapeHtml(s.student_name)}</div>
                                    </td>
                                    <td style="font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #64748b;">${s.log_month}</td>
                                    <td>
                                        <strong>${s.total_classes_attended}</strong> / ${s.total_classes_scheduled}
                                    </td>
                                    <td>
                                        <div style="display: flex; align-items: center; gap: 8px;">
                                            <div style="flex: 1; height: 6px; background: #e2e8f0; border-radius: 3px; min-width: 50px;">
                                                <div style="width: ${Math.min(100, s.attendance_percent)}%; height: 100%; background: ${isEligible ? '#16a34a' : '#dc2626'}; border-radius: 3px;"></div>
                                            </div>
                                            <strong style="color: ${isEligible ? '#16a34a' : '#dc2626'}; font-family: 'JetBrains Mono', monospace; font-size: 12px;">
                                                ${s.attendance_percent}%
                                            </strong>
                                        </div>
                                    </td>
                                    <td>
                                        ${isEligible ? `
                                            <span style="background: #dcfce7; color: #15803d; border: 1px solid #86efac; padding: 4px 10px; border-radius: 20px; font-weight: 800; font-size: 11px; display: inline-flex; align-items: center; gap: 4px;">
                                                🛡️ ELIGIBLE (&ge;75%)
                                            </span>
                                        ` : `
                                            <span style="background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; padding: 4px 10px; border-radius: 20px; font-weight: 800; font-size: 11px; display: inline-flex; align-items: center; gap: 4px;">
                                                ⚠️ SHORT ATTENDANCE (&lt;75%)
                                            </span>
                                        `}
                                    </td>
                                    <td style="font-family: 'JetBrains Mono', monospace;">⏱️ ${s.total_lab_hours} hrs</td>
                                    <td style="font-family: 'JetBrains Mono', monospace; color: #16a34a; font-weight: 700;">🎯 ${s.fruitful_lab_hours} hrs</td>
                                    <td style="font-size: 11px; color: #64748b;">${s.last_seen || '-'}</td>
                                </tr>
                            `;
                        }).join("")}
                    </tbody>
                </table>
            `;

        } else if (currentLogsView === "raw") {
            let params = new URLSearchParams();
            if (dateVal) params.set("date", dateVal);
            if (searchVal) params.set("name", searchVal);

            const logs = await apiFetch("/attendance/logs?" + params.toString());

            if (m1Val) m1Val.innerText = logs.length;
            if (m1Lbl) m1Lbl.innerText = "BIOMETRIC ENTRIES";
            const known = logs.filter(r => r.is_known).length;
            if (m2Val) m2Val.innerText = known;
            if (m2Lbl) m2Lbl.innerText = "REGISTERED";
            if (m3Val) m3Val.innerText = logs.length - known;
            if (m3Lbl) m3Lbl.innerText = "UNKNOWN GUESTS";

            if (logs.length === 0) {
                container.innerHTML = `<div style="text-align: center; color: var(--on-surface-variant); padding: 40px;">No biometric entry logs found.</div>`;
                return;
            }

            container.innerHTML = `
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Student Name</th>
                            <th>User Type</th>
                            <th>Project / Domain</th>
                            <th>IN Time</th>
                            <th>OUT Time</th>
                            <th>Date</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${logs.map(row => `
                            <tr>
                                <td><strong>${escapeHtml(row.name || "-")}</strong></td>
                                <td>${row.is_known ? '<span class="badge badge-connected">✅ Registered</span>' : '<span class="badge badge-disconnected">❓ Unknown</span>'}</td>
                                <td>${row.current_project ? `<span class="project-tag" style="background:#eef2ff; color:#4338ca; padding:3px 8px; border-radius:4px; font-weight:600; font-size:12px; display:inline-block; border:1px solid #c7d2fe;">🚀 ${escapeHtml(row.current_project)}</span>` : '<span style="color:#94a3b8; font-size:12px;">General AI/ML Research</span>'}</td>
                                <td style="font-family: 'JetBrains Mono', monospace;">${row.in_time || "-"}</td>
                                <td style="font-family: 'JetBrains Mono', monospace;">${row.out_time || "<span style='color: #15803d; font-weight: bold;'>🟢 Inside Lab</span>"}</td>
                                <td style="font-family: 'JetBrains Mono', monospace;">${row.date || "-"}</td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            `;
        }
    } catch(e) {
        container.innerHTML = `<div style="color: #dc2626; padding: 30px; text-align: center; font-weight: 700;">⚠️ Error fetching logs: ${escapeHtml(e.message)}</div>`;
    }
}


// ── Registered Users Directory & Categorized Filtering ──

async function loadRegisteredFaces() {
    if (!BASE_URL) return;
    const countBadge = document.getElementById("nav-reg-count");

    try {
        const data = await apiFetch("/api/registered_users");
        registeredUsersList = data.users || [];
        
        if (countBadge) countBadge.innerText = registeredUsersList.length;
        updateCategoryCounts(registeredUsersList);
        renderRegisteredUsersGrid(registeredUsersList);
        populateStudentSelect();
    } catch(e) {
        console.error("Failed to load registered users", e);
    }
}

function updateCategoryCounts(users) {
    const total = users.length;
    const students = users.filter(u => (u.role || "Student").toLowerCase() === "student").length;
    const faculty = users.filter(u => (u.role || "").toLowerCase() === "faculty").length;
    const guests = users.filter(u => (u.role || "").toLowerCase() === "guest").length;

    const countAll = document.getElementById("cat-count-all");
    const countStud = document.getElementById("cat-count-students");
    const countFac = document.getElementById("cat-count-faculty");
    const countGst = document.getElementById("cat-count-guests");

    if (countAll) countAll.innerText = total;
    if (countStud) countStud.innerText = students;
    if (countFac) countFac.innerText = faculty;
    if (countGst) countGst.innerText = guests;
}

let currentSelectedDept = "";

function filterDirectoryDept(dept) {
    currentSelectedDept = dept;
    document.querySelectorAll(".dept-chip-btn").forEach(btn => {
        if (btn.dataset.dept === dept) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });
    filterRegisteredUsers();
}

function selectUserCategory(cat) {
    currentCategoryFilter = cat;
    document.querySelectorAll(".cat-chip-btn").forEach(btn => {
        if (btn.dataset.cat === cat) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });
    filterRegisteredUsers();
}

function renderRegisteredUsersGrid(users) {
    const grid = document.getElementById("registered-grid");
    if (!grid) return;

    let filtered = users;
    if (currentCategoryFilter !== "all") {
        filtered = filtered.filter(u => (u.role || "Student").toLowerCase() === currentCategoryFilter.toLowerCase());
    }
    if (currentSelectedDept) {
        filtered = filtered.filter(u => u.department && u.department.toLowerCase() === currentSelectedDept.toLowerCase());
    }

    if (filtered.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--on-surface-variant);">No ${currentCategoryFilter === 'all' ? 'members' : currentCategoryFilter + 's'} found for selected filter. Click "Register Member" to add!</div>`;
        return;
    }

    grid.innerHTML = filtered.map(user => {
        const role = (user.role || "Student").capitalize ? user.role.capitalize() : user.role || "Student";
        const fallbackAvatar = getInitialsAvatarSVG(user.name, role);
        const avatarUrl = user.avatar_base64 || (user.avatar_url ? `${BASE_URL}${user.avatar_url}` : fallbackAvatar);
        const roleBadgeClass = role.toLowerCase() === "faculty" ? "badge-role-faculty" : role.toLowerCase() === "guest" ? "badge-role-guest" : "badge-role-student";
        const roleIcon = role.toLowerCase() === "faculty" ? "👨‍🏫" : role.toLowerCase() === "guest" ? "👤" : "🎓";

        return `
            <div class="student-card">
                <div class="student-card-top">
                    <img src="${avatarUrl}" class="student-avatar" alt="${user.name}" onerror="this.onerror=null; this.src='${fallbackAvatar}';">
                    <div class="student-info">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 6px;">
                            <h4 style="margin: 0; font-size: 15px;">${escapeHtml(user.name)}</h4>
                            <span class="role-badge ${roleBadgeClass}">${roleIcon} ${role}</span>
                        </div>
                        ${user.roll_no ? `<p style="font-weight: 600; color: #475569; font-size: 11px; margin-top: 2px;">🆔 ${escapeHtml(user.roll_no)}</p>` : ''}
                        ${user.department ? `<p style="display: inline-block; background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; margin: 3px 0 2px 0;">🏢 ${escapeHtml(user.department)}</p>` : ''}
                        <p style="margin-top: 2px;">${user.email ? `✉️ ${escapeHtml(user.email)}` : '<span style="color: #94a3b8;">No email saved</span>'}</p>
                        <small style="color: #94a3b8; font-size: 11px;">Enrolled: ${user.created_at ? user.created_at.split(" ")[0] : 'Yes'}</small>
                    </div>
                </div>
                
                <div class="student-actions" style="display: flex; gap: 4px; flex-wrap: wrap;">
                    <button class="btn btn-primary" style="flex: 1; font-size: 11px; padding: 4px;" onclick="allotPCToStudent('${escapeHtml(user.name)}', '${escapeHtml(user.email || '')}', '${role}')">
                        💻 Allot PC
                    </button>
                    
                    <button class="btn btn-secondary" style="font-size: 11px; padding: 5px 8px; color: #0284c7; border-color: #bae6fd;" onclick="openEditStudentModal('${escapeHtml(user.name)}')" title="Edit Member Details">
                        ✏️ Edit
                    </button>
                    
                    ${user.email ? `
                        <button class="btn btn-secondary" style="font-size: 12px; padding: 6px 10px;" onclick="openDirectEmailModal('${escapeHtml(user.email)}', '${escapeHtml(user.name)}')" title="Email Member">
                            ✉️
                        </button>
                    ` : ''}
                    <button class="btn btn-secondary" style="font-size: 12px; padding: 6px 8px; color: var(--error);" onclick="deleteStudent('${escapeHtml(user.name)}')" title="Unregister Member">
                        🗑️
                    </button>
                </div>
            </div>
        `;
    }).join("");
}

function filterRegisteredUsers() {
    const q = (document.getElementById("search-reg-input")?.value || "").toLowerCase();
    const filtered = registeredUsersList.filter(u => {
        if (currentCategoryFilter !== "all" && (u.role || "Student").toLowerCase() !== currentCategoryFilter.toLowerCase()) {
            return false;
        }
        if (currentSelectedDept && (!u.department || u.department.toLowerCase() !== currentSelectedDept.toLowerCase())) {
            return false;
        }
        if (!q) return true;
        const matchesQuery = u.name.toLowerCase().includes(q) || 
                             (u.email && u.email.toLowerCase().includes(q)) ||
                             (u.roll_no && u.roll_no.toLowerCase().includes(q)) ||
                             (u.department && u.department.toLowerCase().includes(q)) ||
                             (u.role && u.role.toLowerCase().includes(q));
        return matchesQuery;
    });
    renderRegisteredUsersGrid(filtered);
}

function openEditStudentModal(name) {
    const user = registeredUsersList.find(u => u.name.toLowerCase() === name.toLowerCase()) || { name: name };
    document.getElementById("edit-orig-name").value = user.name;
    document.getElementById("edit-student-name").value = user.name;
    document.getElementById("edit-student-role").value = user.role || "Student";
    document.getElementById("edit-student-roll").value = user.roll_no || "";
    document.getElementById("edit-student-dept").value = user.department || "";
    document.getElementById("edit-student-email").value = user.email || "";
    const msg = document.getElementById("edit-student-msg");
    if (msg) msg.innerHTML = "";
    const modal = document.getElementById("edit-student-modal");
    if (modal) modal.style.display = "flex";
}

function closeEditStudentModal() {
    const modal = document.getElementById("edit-student-modal");
    if (modal) modal.style.display = "none";
}

async function submitEditStudent(e) {
    e.preventDefault();
    const origName = document.getElementById("edit-orig-name").value;
    const newName = document.getElementById("edit-student-name").value.trim();
    const role = document.getElementById("edit-student-role").value;
    const rollNo = document.getElementById("edit-student-roll").value.trim();
    const dept = document.getElementById("edit-student-dept").value;
    const email = document.getElementById("edit-student-email").value.trim();
    const msg = document.getElementById("edit-student-msg");
    const saveBtn = document.getElementById("edit-student-save-btn");

    if (!newName) {
        if (msg) msg.innerHTML = '<span style="color: #dc2626;">Name cannot be empty.</span>';
        return;
    }

    if (saveBtn) saveBtn.disabled = true;
    if (msg) msg.innerHTML = '<span style="color: #0284c7;">Saving changes...</span>';

    try {
        await apiFetch(`/api/registered_users/${encodeURIComponent(origName)}`, {
            method: "PUT",
            body: JSON.stringify({
                name: newName,
                role: role,
                roll_no: rollNo,
                department: dept,
                email: email
            })
        });

        if (msg) msg.innerHTML = `<span style="color: #16a34a;">✅ Details updated successfully!</span>`;
        showToast(`Details updated for ${newName}!`, "success");
        setTimeout(async () => {
            closeEditStudentModal();
            if (saveBtn) saveBtn.disabled = false;
            await loadRegisteredFaces();
        }, 800);
    } catch (err) {
        if (saveBtn) saveBtn.disabled = false;
        if (msg) msg.innerHTML = `<span style="color: #dc2626;">❌ Update failed: ${err.message}</span>`;
    }
}

function allotPCToStudent(name, email, role = "Student") {
    // Find first available PC
    const firstFree = allPCsState.find(p => p.status.toLowerCase() === "free");
    const targetPC = firstFree ? firstFree.pc_id : "PC-1";
    
    handlePCClick(targetPC, true);
    
    // Auto-fill member info and select their role
    setTimeout(() => {
        selectUserRole(role);
        const nameInput = document.getElementById("modal-student-name");
        const emailInput = document.getElementById("modal-student-email");
        if (nameInput) nameInput.value = name;
        if (emailInput) emailInput.value = email;
    }, 50);
}

async function deleteStudent(name) {
    if (!confirm(`Are you sure you want to unregister ${name}? This will remove facial recognition biometric data as well.`)) return;
    try {
        await apiFetch(`/api/registered_users/${encodeURIComponent(name)}`, { method: "DELETE" });
        showToast(`Member '${name}' unregistered.`, "success");
        await loadRegisteredFaces();
    } catch (e) {
        showToast("Error deleting member: " + e.message, "error");
    }
}

// ── Unknown Faces / Intruders Tab ──

async function loadUnknownFaces() {
    if (!BASE_URL) return;
    const grid = document.getElementById("unknown-grid");
    const countBadge = document.getElementById("nav-unknown-count");
    if (!grid) return;
    
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px;"><span class="spinner"></span> Loading intruder captures...</div>';
    
    try {
        const data = await apiFetch("/unknown_faces");
        if (countBadge) countBadge.innerText = data.length;
        
        if (data.length === 0) {
            grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--on-surface-variant);">No unwanted or unknown visitors detected! 🎉</div>';
            return;
        }

        grid.innerHTML = data.map(face => {
            const imgUrl = face.image_base64 || (face.url ? `${BASE_URL}${face.url}` : "");
            const fallbackSnapshot = getPlaceholderFaceSVG("No Photo");
            return `
                <div class="unknown-card">
                    <div class="unknown-img-wrap" onclick="openLightbox('${imgUrl}', '${face.filename}', '${face.timestamp}', '${face.date}')">
                        <img src="${imgUrl || fallbackSnapshot}" alt="Intruder Snapshot" onerror="this.onerror=null; this.src='${fallbackSnapshot}';">
                    </div>
                    <div class="unknown-meta">
                        <strong>Captured:</strong> ${face.timestamp}<br>
                        <p>Date: ${face.date}</p>
                    </div>
                    <div class="unknown-actions">
                        <button class="btn btn-secondary" style="flex: 1; font-size: 11px; padding: 5px 6px;" onclick="openLightbox('${imgUrl}', '${face.filename}', '${face.timestamp}', '${face.date}')">
                            🔍 Zoom
                        </button>
                        <button class="btn btn-secondary" style="font-size: 11px; padding: 5px 8px; color: var(--error);" onclick="deleteUnknownPhoto('${face.filename}')" title="Delete Image">
                            🗑️
                        </button>
                    </div>
                </div>
            `;
        }).join("");
    } catch(e) {
        grid.innerHTML = `<p style="color:red; grid-column: 1/-1;">Error loading unknown faces: ${e.message}</p>`;
    }
}

async function deleteUnknownPhoto(filename) {
    if (!confirm(`Delete this photo snapshot?`)) return;
    try {
        await apiFetch(`/unknown_faces/${encodeURIComponent(filename)}`, { method: "DELETE" });
        showToast("Photo deleted successfully.", "success");
        closeLightbox();
        await loadUnknownFaces();
    } catch (e) {
        showToast("Failed to delete photo: " + e.message, "error");
    }
}

async function clearAllUnknownPhotos() {
    if (!confirm("Are you sure you want to clear ALL intruder face photos?")) return;
    try {
        await apiFetch("/api/unknown_faces/clear_all", { method: "DELETE" });
        showToast("All unknown photos cleared.", "success");
        await loadUnknownFaces();
    } catch (e) {
        showToast("Error clearing photos: " + e.message, "error");
    }
}

// Lightbox modal for Unknown Faces
let currentLightboxFile = null;
function openLightbox(url, filename, timestamp, date) {
    currentLightboxFile = filename;
    const modal = document.getElementById("lightbox-modal");
    const img = document.getElementById("lightbox-img");
    const meta = document.getElementById("lightbox-meta");
    const deleteBtn = document.getElementById("lightbox-delete-btn");
    const registerBtn = document.getElementById("lightbox-register-btn");

    if (!modal) return;
    img.src = url;
    meta.innerHTML = `<strong>Snapshot:</strong> ${filename} &bull; <strong>Time:</strong> ${timestamp} &bull; <strong>Date:</strong> ${date}`;
    
    deleteBtn.onclick = () => deleteUnknownPhoto(filename);
    registerBtn.onclick = () => {
        closeLightbox();
        openAddStudentModal();
    };

    modal.style.display = "flex";
}

function closeLightbox() {
    const modal = document.getElementById("lightbox-modal");
    if (modal) modal.style.display = "none";
}

// ── Direct Email / Notice Modal ──

function openDirectEmailModal(recipientEmail = "", recipientName = "") {
    const modal = document.getElementById("direct-email-modal");
    if (!modal) return;
    
    document.getElementById("direct-email-to").value = recipientEmail;
    document.getElementById("direct-email-name").value = recipientName;
    document.getElementById("direct-email-body").value = "";
    
    modal.style.display = "flex";
}

function closeDirectEmailModal() {
    const modal = document.getElementById("direct-email-modal");
    if (modal) modal.style.display = "none";
}

async function submitDirectEmail() {
    const to = document.getElementById("direct-email-to").value.trim();
    const name = document.getElementById("direct-email-name").value.trim();
    const subject = document.getElementById("direct-email-subject").value.trim();
    const body = document.getElementById("direct-email-body").value.trim();
    const btn = document.getElementById("send-direct-email-btn");

    if (!to || !body) {
        showToast("Please provide recipient email and message.", "error");
        return;
    }

    btn.disabled = true;
    btn.innerText = "Sending...";

    try {
        const result = await apiFetch("/api/send_email", {
            method: "POST",
            body: JSON.stringify({
                to_email: to,
                recipient_name: name,
                subject: subject,
                message: body
            })
        });

        showToast(result.message || "Email sent successfully!", "success");
        closeDirectEmailModal();
    } catch (e) {
        showToast("Failed to send email: " + e.message, "error");
    } finally {
        btn.disabled = false;
        btn.innerText = "Send Email";
    }
}

// ── Live Circular Webcam Face Registration Module ──

function openAddUserModal(prefillData = {}) {
    const modal = document.getElementById("add-student-modal");
    if (!modal) return;
    modal.style.display = "flex";

    selectRegRole(prefillData.role || "Student");
    capturedSnapshotBase64 = null;

    document.getElementById("new-student-name").value = prefillData.name || "";
    document.getElementById("new-student-email").value = prefillData.email || "";
    document.getElementById("new-user-roll-dept").value = prefillData.roll_no || "";
    const deptSelect = document.getElementById("new-student-dept");
    if (deptSelect) deptSelect.value = prefillData.department || "";

    // Reset camera preview & snapshot elements
    const video = document.getElementById("reg-webcam-video");
    const previewImg = document.getElementById("reg-snapshot-preview");
    const captureBtn = document.getElementById("btn-capture-snapshot");
    const retakeBtn = document.getElementById("btn-retake-snapshot");
    const scanRing = document.getElementById("camera-scan-ring");
    const statusPill = document.getElementById("camera-status-pill");

    if (video) video.style.display = "block";
    if (previewImg) {
        previewImg.style.display = "none";
        previewImg.src = "";
    }
    if (captureBtn) captureBtn.style.display = "inline-flex";
    if (retakeBtn) retakeBtn.style.display = "none";
    if (scanRing) scanRing.style.display = "block";
    if (statusPill) statusPill.innerText = "🟢 Initializing Camera...";

    startRegistrationCamera();
}

// Alias for legacy calls
function openAddStudentModal() {
    openAddUserModal();
}

function closeAddUserModal() {
    const modal = document.getElementById("add-student-modal");
    if (modal) modal.style.display = "none";
    stopRegistrationCamera();
    capturedSnapshotBase64 = null;
}

function closeAddStudentModal() {
    closeAddUserModal();
}

function selectRegRole(role) {
    selectedRegRole = role || "Student";
    const chips = document.querySelectorAll("[data-regrole]");
    chips.forEach(c => {
        if (c.dataset.regrole === selectedRegRole) {
            c.classList.add("active");
        } else {
            c.classList.remove("active");
        }
    });

    const idLabel = document.getElementById("new-user-id-label");
    const idInput = document.getElementById("new-user-roll-dept");
    const nameLabel = document.getElementById("new-user-name-label");
    const nameInput = document.getElementById("new-student-name");

    if (selectedRegRole === "Student") {
        if (nameLabel) nameLabel.innerText = "Student Full Name:";
        if (nameInput) nameInput.placeholder = "e.g. Ayush Sharma";
        if (idLabel) idLabel.innerText = "Roll Number / Batch:";
        if (idInput) idInput.placeholder = "e.g. 21BCSE101";
    } else if (selectedRegRole === "Faculty") {
        if (nameLabel) nameLabel.innerText = "Faculty Name & Title:";
        if (nameInput) nameInput.placeholder = "e.g. Dr. Sharma, Prof. Verma";
        if (idLabel) idLabel.innerText = "Designation / Department:";
        if (idInput) idInput.placeholder = "e.g. Associate Professor (CSE)";
    } else if (selectedRegRole === "Guest") {
        if (nameLabel) nameLabel.innerText = "Guest / Visitor Name:";
        if (nameInput) nameInput.placeholder = "e.g. Rahul Verma (External Researcher)";
        if (idLabel) idLabel.innerText = "Organization / Purpose:";
        if (idInput) idInput.placeholder = "e.g. Visiting Scholar / Workshop";
    }
}

async function startRegistrationCamera() {
    const video = document.getElementById("reg-webcam-video");
    const statusPill = document.getElementById("camera-status-pill");
    if (!video) return;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (statusPill) statusPill.innerText = "⚠️ Camera not supported";
        showToast("Camera API not available in this browser. You can use the photo upload option.", "info");
        toggleUploadFallback(true);
        return;
    }

    try {
        stopRegistrationCamera();
        webcamStream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: "user",
                width: { ideal: 640 },
                height: { ideal: 640 }
            },
            audio: false
        });
        video.srcObject = webcamStream;
        video.onloadedmetadata = () => {
            video.play().catch(() => {});
            if (statusPill) statusPill.innerText = "🟢 Live Face Frame";
        };
    } catch (err) {
        console.warn("Webcam access error:", err);
        if (statusPill) statusPill.innerText = "⚠️ Camera Access Denied";
        showToast("Camera access was blocked or unavailable. Falling back to file upload.", "info");
        toggleUploadFallback(true);
    }
}

function stopRegistrationCamera() {
    if (webcamStream) {
        webcamStream.getTracks().forEach(track => track.stop());
        webcamStream = null;
    }
    const video = document.getElementById("reg-webcam-video");
    if (video) video.srcObject = null;
}

function captureWebcamSnapshot() {
    const video = document.getElementById("reg-webcam-video");
    const canvas = document.getElementById("reg-webcam-canvas");
    const previewImg = document.getElementById("reg-snapshot-preview");
    const captureBtn = document.getElementById("btn-capture-snapshot");
    const retakeBtn = document.getElementById("btn-retake-snapshot");
    const scanRing = document.getElementById("camera-scan-ring");
    const statusPill = document.getElementById("camera-status-pill");

    if (!video || !canvas || !previewImg) return;
    if (!video.videoWidth || !video.videoHeight) {
        showToast("Camera is still warming up. Please wait a moment.", "info");
        return;
    }

    const size = Math.min(video.videoWidth, video.videoHeight);
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");

    // Center crop square from video frame with mirror flip for intuitive matching
    const startX = (video.videoWidth - size) / 2;
    const startY = (video.videoHeight - size) / 2;

    ctx.save();
    ctx.translate(size, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, startX, startY, size, size, 0, 0, size, size);
    ctx.restore();

    capturedSnapshotBase64 = canvas.toDataURL("image/jpeg", 0.92);
    previewImg.src = capturedSnapshotBase64;

    video.style.display = "none";
    previewImg.style.display = "block";
    if (captureBtn) captureBtn.style.display = "none";
    if (retakeBtn) retakeBtn.style.display = "inline-flex";
    if (scanRing) scanRing.style.display = "none";
    if (statusPill) statusPill.innerText = "✨ Snapshot Captured";

    showToast("📸 Face snapshot captured! Ready to enroll.", "success");
}

function retakeWebcamSnapshot() {
    const video = document.getElementById("reg-webcam-video");
    const previewImg = document.getElementById("reg-snapshot-preview");
    const captureBtn = document.getElementById("btn-capture-snapshot");
    const retakeBtn = document.getElementById("btn-retake-snapshot");
    const scanRing = document.getElementById("camera-scan-ring");
    const statusPill = document.getElementById("camera-status-pill");

    capturedSnapshotBase64 = null;
    if (previewImg) previewImg.style.display = "none";
    if (video) video.style.display = "block";
    if (captureBtn) captureBtn.style.display = "inline-flex";
    if (retakeBtn) retakeBtn.style.display = "none";
    if (scanRing) scanRing.style.display = "block";
    if (statusPill) statusPill.innerText = "🟢 Live Face Frame";

    if (!webcamStream || !webcamStream.active) {
        startRegistrationCamera();
    }
}

function toggleUploadFallback(forceOpen = false) {
    const wrap = document.getElementById("file-upload-fallback-wrap");
    if (!wrap) return;
    if (forceOpen) {
        wrap.style.display = "block";
    } else {
        wrap.style.display = wrap.style.display === "none" ? "block" : "none";
    }
}

function handleFallbackFileSelected(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        capturedSnapshotBase64 = e.target.result;
        const video = document.getElementById("reg-webcam-video");
        const previewImg = document.getElementById("reg-snapshot-preview");
        const statusPill = document.getElementById("camera-status-pill");

        if (video) video.style.display = "none";
        if (previewImg) {
            previewImg.src = capturedSnapshotBase64;
            previewImg.style.display = "block";
        }
        if (statusPill) statusPill.innerText = "📁 File Uploaded";
        showToast("Photo loaded into preview circle.", "success");
    };
    reader.readAsDataURL(file);
}

function toggleServerConfigBar() {
    const connUI = document.getElementById("connection-ui");
    if (connUI) {
        connUI.style.display = connUI.style.display === "none" ? "flex" : "none";
    }
}

async function submitNewStudent() {
    const name = document.getElementById("new-student-name").value.trim();
    const email = document.getElementById("new-student-email").value.trim();
    const rollNo = document.getElementById("new-user-roll-dept")?.value.trim() || "";
    const dept = document.getElementById("new-student-dept")?.value.trim() || "";
    const fileInput = document.getElementById("new-student-photo");
    const btn = document.getElementById("save-student-btn");

    if (!name) {
        showToast("Please enter the member's full name.", "error");
        return;
    }

    btn.disabled = true;
    btn.innerText = "Enrolling...";

    try {
        let finalImageBase64 = capturedSnapshotBase64;

        if (!finalImageBase64 && fileInput && fileInput.files && fileInput.files[0]) {
            finalImageBase64 = await new Promise((resolve) => {
                const r = new FileReader();
                r.onload = (e) => resolve(e.target.result);
                r.readAsDataURL(fileInput.files[0]);
            });
        }

        if (finalImageBase64) {
            await apiFetch("/enroll", {
                method: "POST",
                body: JSON.stringify({
                    name: name,
                    email: email,
                    role: selectedRegRole,
                    roll_no: rollNo,
                    department: dept,
                    image_base64: finalImageBase64
                })
            });
            showToast(`✅ ${selectedRegRole} '${name}' registered with biometric facial profile!`, "success");
        } else {
            // Register member record without face embedding
            await apiFetch("/api/registered_users", {
                method: "POST",
                body: JSON.stringify({
                    name: name,
                    email: email,
                    role: selectedRegRole,
                    roll_no: rollNo,
                    department: dept
                })
            });
            showToast(`✅ ${selectedRegRole} '${name}' registered in directory.`, "success");
        }

        closeAddUserModal();
        await loadRegisteredFaces();
        populateMembersDatalist();
    } catch (e) {
        showToast("Registration failed: " + e.message, "error");
    } finally {
        btn.disabled = false;
        btn.innerText = "Save & Enroll Member";
    }
}

// ── Email Settings Modal ──

async function openEmailSettingsModal() {
    const modal = document.getElementById("email-settings-modal");
    if (!modal) return;

    modal.style.display = "flex";

    if (BASE_URL) {
        try {
            const data = await apiFetch("/api/email_settings");
            document.getElementById("smtp-user-input").value = data.smtp_user || "";
            document.getElementById("smtp-sender-name-input").value = data.sender_name || "";
            document.getElementById("smtp-host-input").value = data.smtp_host || "smtp.gmail.com";
            document.getElementById("smtp-port-input").value = data.smtp_port || 587;
            
            if (data.is_configured) {
                document.getElementById("smtp-pass-input").placeholder = "•••••••••••• (Password configured)";
            }
        } catch (e) {
            console.error("Failed to load email settings", e);
        }
    }
}

function closeEmailSettingsModal() {
    const modal = document.getElementById("email-settings-modal");
    if (modal) modal.style.display = "none";
}

async function saveEmailSettings() {
    const user = document.getElementById("smtp-user-input").value.trim();
    const pass = document.getElementById("smtp-pass-input").value.trim();
    const name = document.getElementById("smtp-sender-name-input").value.trim();
    const host = document.getElementById("smtp-host-input").value.trim();
    const port = parseInt(document.getElementById("smtp-port-input").value) || 587;
    const btn = document.getElementById("save-smtp-btn");

    if (!user || !pass) {
        showToast("Please provide your Gmail address and App Password.", "error");
        return;
    }

    btn.disabled = true;
    btn.innerText = "Saving...";

    try {
        await apiFetch("/api/email_settings", {
            method: "POST",
            body: JSON.stringify({
                smtp_user: user,
                smtp_password: pass,
                smtp_host: host,
                smtp_port: port,
                sender_name: name,
                sender_email: user
            })
        });

        showToast("Email settings saved! Live emails are now enabled.", "success");
        closeEmailSettingsModal();
    } catch (e) {
        showToast("Failed to save settings: " + e.message, "error");
    } finally {
        btn.disabled = false;
        btn.innerText = "Save Settings";
    }
}

async function sendTestEmail() {
    const testEmail = document.getElementById("smtp-test-email-input").value.trim();
    if (!testEmail || !testEmail.includes("@")) {
        showToast("Please enter a valid recipient email to test.", "error");
        return;
    }

    showToast("Sending test email...", "info");

    try {
        const result = await apiFetch("/api/email_settings/test", {
            method: "POST",
            body: JSON.stringify({ test_email: testEmail })
        });
        showToast("Test email sent! Please check your inbox / spam folder.", "success");
    } catch (e) {
        showToast("Test failed: " + e.message, "error");
    }
}

// ── Database Downloads ──

function downloadAttendanceCSV() {
    if (!BASE_URL) return showToast("Not connected to backend", "error");
    window.open(`${BASE_URL}/db/download/csv`, "_blank");
    showToast("Downloading Attendance Logs CSV...", "success");
}

function downloadAllotmentsCSV() {
    if (!BASE_URL) return showToast("Not connected to backend", "error");
    window.open(`${BASE_URL}/db/download/allotments`, "_blank");
    showToast("Downloading PC Allotment History CSV...", "success");
}

function downloadSQLiteDB() {
    if (!BASE_URL) return showToast("Not connected to backend", "error");
    window.open(`${BASE_URL}/db/download/sqlite`, "_blank");
    showToast("Downloading raw SQLite Database (.db)...", "success");
}

// ── Toast Utility ──

function showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast ${type === 'success' ? 'toast-success' : type === 'error' ? 'toast-error' : ''}`;
    toast.innerText = message;

    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(40px)";
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// ── Gate Camera Live Stream & Power Controls (Modal 6) ──

let gateCameraStatusPollInterval = null;

function openGateCameraModal() {
    const modal = document.getElementById("gate-camera-modal");
    if (!modal) return;
    modal.style.display = "flex";
    
    // Set live stream URL
    const streamImg = document.getElementById("portal-camera-stream");
    const fallback = document.getElementById("portal-camera-fallback");
    if (streamImg) {
        streamImg.style.display = "block";
        if (fallback) fallback.style.display = "none";
        streamImg.src = `${BASE_URL}/video_feed?t=${Date.now()}`;
    }

    // Refresh current power status
    loadGateCameraStatusFromPortal();

    // Start 4-second status poll while modal is open
    if (!gateCameraStatusPollInterval) {
        gateCameraStatusPollInterval = setInterval(loadGateCameraStatusFromPortal, 4000);
    }
}

function closeGateCameraModal() {
    const modal = document.getElementById("gate-camera-modal");
    if (modal) modal.style.display = "none";
    
    // Stop image stream fetching to save client bandwidth
    const streamImg = document.getElementById("portal-camera-stream");
    if (streamImg) {
        streamImg.src = "";
    }

    if (gateCameraStatusPollInterval) {
        clearInterval(gateCameraStatusPollInterval);
        gateCameraStatusPollInterval = null;
    }
}

async function loadGateCameraStatusFromPortal() {
    try {
        const res = await apiFetch("/api/camera/status");
        updateGateCameraPortalUI(res.enabled);
    } catch (e) {
        // Backend might be offline
    }
}

async function toggleGateCameraFromPortal() {
    const toggleBtn = document.getElementById("portal-toggle-camera-btn");
    if (toggleBtn) {
        toggleBtn.disabled = true;
        toggleBtn.innerText = "Switching...";
    }
    try {
        const res = await apiFetch("/api/camera/toggle", { method: "POST" });
        updateGateCameraPortalUI(res.enabled);
        showToast(res.message || "Camera power updated", "info");
        
        // Refresh stream image
        setTimeout(() => {
            const streamImg = document.getElementById("portal-camera-stream");
            if (streamImg && streamImg.style.display !== "none") {
                streamImg.src = `${BASE_URL}/video_feed?t=${Date.now()}`;
            }
        }, 500);
    } catch (e) {
        showToast("Failed to switch camera: " + e.message, "error");
    } finally {
        if (toggleBtn) toggleBtn.disabled = false;
    }
}

function updateGateCameraPortalUI(isEnabled) {
    const toggleBtn = document.getElementById("portal-toggle-camera-btn");
    const headerPill = document.getElementById("portal-cam-pill");
    const modalBadge = document.getElementById("modal-camera-badge");
    const powerText = document.getElementById("camera-power-text");
    const recDot = document.getElementById("portal-camera-rec-dot");
    const recText = document.getElementById("portal-camera-rec-text");

    if (isEnabled) {
        if (toggleBtn) {
            toggleBtn.className = "btn btn-danger";
            toggleBtn.innerHTML = "🛑 Turn Camera OFF";
        }
        if (headerPill) {
            headerPill.innerText = "ON";
            headerPill.style.background = "#22c55e";
        }
        if (modalBadge) {
            modalBadge.className = "badge badge-success";
            modalBadge.innerText = "ONLINE";
        }
        if (powerText) {
            powerText.innerText = "Camera Hardware State: Active (ON)";
        }
        if (recDot) {
            recDot.style.background = "#4ade80";
            recDot.style.boxShadow = "0 0 8px #4ade80";
        }
        if (recText) {
            recText.innerText = "LIVE MJPEG FEED";
            recText.style.color = "#4ade80";
        }
    } else {
        if (toggleBtn) {
            toggleBtn.className = "btn btn-primary";
            toggleBtn.innerHTML = "🟢 Turn Camera ON";
        }
        if (headerPill) {
            headerPill.innerText = "OFF";
            headerPill.style.background = "#ef4444";
        }
        if (modalBadge) {
            modalBadge.className = "badge badge-danger";
            modalBadge.innerText = "OFFLINE / PAUSED";
        }
        if (powerText) {
            powerText.innerText = "Camera Hardware State: OFF (Standby / Released)";
        }
        if (recDot) {
            recDot.style.background = "#ef4444";
            recDot.style.boxShadow = "0 0 8px #ef4444";
        }
        if (recText) {
            recText.innerText = "CAMERA OFF (STANDBY)";
            recText.style.color = "#ef4444";
        }
    }
}

function handleStreamImageError() {
    const streamImg = document.getElementById("portal-camera-stream");
    const fallback = document.getElementById("portal-camera-fallback");
    if (streamImg) streamImg.style.display = "none";
    if (fallback) fallback.style.display = "block";
}

async function triggerKioskScanFromModal() {
    const resultBox = document.getElementById("modal-scan-result-box");
    if (resultBox) {
        resultBox.style.display = "block";
        resultBox.style.background = "rgba(99, 102, 241, 0.1)";
        resultBox.style.border = "1px solid #6366f1";
        resultBox.style.color = "#818cf8";
        resultBox.innerHTML = "⚡ Scanning gate camera frame for faces...";
    }
    try {
        const res = await apiFetch("/api/scan_entry", { method: "POST" });
        if (resultBox) {
            resultBox.style.background = "rgba(34, 197, 94, 0.1)";
            resultBox.style.border = "1px solid #22c55e";
            resultBox.style.color = "#4ade80";
            resultBox.innerHTML = `✅ Face Recognized: <strong>${res.student_name || 'Verified'}</strong> (Attendance Logged)`;
        }
        showToast(`Attendance scanned: ${res.student_name || 'Success'}`, "success");
        loadAttendance();
    } catch (e) {
        if (resultBox) {
            resultBox.style.background = "rgba(239, 68, 68, 0.1)";
            resultBox.style.border = "1px solid #ef4444";
            resultBox.style.color = "#f87171";
            resultBox.innerHTML = `⚠️ Scan error: ${e.message}`;
        }
        showToast("Scan error: " + e.message, "error");
    }
}

// ── Student Research Projects & Deployments (Tab 2) ──

let allProjectsData = [];
let currentProjectFilter = "all";

async function loadStudentProjects() {
    try {
        const res = await apiFetch("/api/projects");
        allProjectsData = res.projects || [];
        updateProjectMetrics();
        renderProjectsGrid(allProjectsData);
    } catch (e) {
        console.warn("Failed to load projects:", e);
        const grid = document.getElementById("projects-grid");
        if (grid && allProjectsData.length === 0) {
            grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--on-surface-variant);">⚠️ Could not load projects. Please verify backend connection.</div>`;
        }
    }
}

function updateProjectMetrics() {
    const activeCount = allProjectsData.filter(p => (p.status || '').toLowerCase() === 'ongoing' || !p.status).length;
    const deployedCount = allProjectsData.filter(p => !!(p.deployment_url || '').trim()).length;
    const filedCount = allProjectsData.filter(p => (p.report_status || '').toLowerCase() === 'filed').length;
    const pendingCount = allProjectsData.filter(p => (p.report_status || '').toLowerCase() !== 'filed').length;

    const navBadge = document.getElementById("nav-project-count");
    if (navBadge) navBadge.innerText = allProjectsData.length;

    const statActive = document.getElementById("stat-proj-active");
    if (statActive) statActive.innerText = activeCount || allProjectsData.length;

    const statDeployed = document.getElementById("stat-proj-deployed");
    if (statDeployed) statDeployed.innerText = deployedCount;

    const statReports = document.getElementById("stat-proj-reports");
    if (statReports) statReports.innerText = filedCount;

    const fAll = document.getElementById("filter-cnt-all");
    if (fAll) fAll.innerText = allProjectsData.length;

    const fFiled = document.getElementById("filter-cnt-filed");
    if (fFiled) fFiled.innerText = filedCount;

    const fPending = document.getElementById("filter-cnt-pending");
    if (fPending) fPending.innerText = pendingCount;
}

function filterProjectsList(filter) {
    currentProjectFilter = filter;
    document.querySelectorAll("[data-proj-filter]").forEach(btn => {
        btn.classList.toggle("active", btn.getAttribute("data-proj-filter") === filter);
    });

    let filtered = allProjectsData;
    if (filter === "filed") {
        filtered = allProjectsData.filter(p => (p.report_status || '').toLowerCase() === 'filed');
    } else if (filter === "pending") {
        filtered = allProjectsData.filter(p => (p.report_status || '').toLowerCase() !== 'filed');
    }
    renderProjectsGrid(filtered);
}

function renderProjectsGrid(projects) {
    const grid = document.getElementById("projects-grid");
    if (!grid) return;

    if (!projects || projects.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 48px; background: var(--surface); border-radius: 12px; border: 1px dashed var(--border);">
                <div style="font-size: 36px; margin-bottom: 8px;">🚀</div>
                <div style="font-size: 16px; font-weight: 700; margin-bottom: 4px;">No Projects Found</div>
                <div style="font-size: 13px; color: var(--on-surface-variant); margin-bottom: 16px;">Add a new project or adjust filters to view research records.</div>
                <button class="btn btn-primary" onclick="openAddProjectModal()">➕ Add First Project</button>
            </div>
        `;
        return;
    }

    const cardsHtml = projects.map(proj => {
        const isFiled = (proj.report_status || '').toLowerCase() === 'filed';
        const reportBadgeClass = isFiled ? 'badge-success' : 'badge-warning';
        const reportBadgeIcon = isFiled ? '✅' : '⏳';
        const reportText = isFiled ? 'Report Filed' : (proj.report_status || 'Report Pending');

        const studentsArr = (proj.student_names || '').split(',').map(s => s.trim()).filter(Boolean);
        const techArr = (proj.technologies || '').split(',').map(t => t.trim()).filter(Boolean);

        return `
            <div class="project-card" style="background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 18px; display: flex; flex-direction: column; justify-content: space-between; transition: transform 0.2s, box-shadow 0.2s; box-shadow: 0 4px 12px rgba(0,0,0,0.05);" onmouseenter="this.style.transform='translateY(-2px)'" onmouseleave="this.style.transform='none'">
                <div>
                    <!-- Top Badges Row -->
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 6px;">
                        <div style="display: flex; gap: 6px; align-items: center;">
                            <span class="badge" style="background: rgba(99, 102, 241, 0.12); color: #6366f1; font-weight: 700; border: 1px solid rgba(99, 102, 241, 0.25);">
                                🖥️ ${escapeHtml(proj.pc_assigned || 'Unassigned')}
                            </span>
                            <span class="badge badge-success" style="font-size: 11px;">
                                ● ${escapeHtml(proj.status || 'Ongoing')}
                            </span>
                        </div>
                        <span class="badge ${reportBadgeClass}" style="font-weight: 700; font-size: 11px; padding: 3px 8px;">
                            ${reportBadgeIcon} ${escapeHtml(reportText)}
                        </span>
                    </div>

                    <!-- Project Title -->
                    <h3 style="margin: 0 0 8px 0; font-size: 17px; font-weight: 700; color: var(--on-surface); line-height: 1.35;">
                        ${escapeHtml(proj.title)}
                    </h3>

                    <!-- Project Description -->
                    <div style="margin: 0 0 14px 0;">
                        <p id="desc-${proj.id || Math.random().toString(36).substr(2, 9)}" style="margin: 0; font-size: 12.5px; color: var(--on-surface-variant); line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; transition: all 0.3s ease;">
                            ${escapeHtml(proj.description || 'No description provided.')}
                        </p>
                        ${(proj.description && proj.description.length > 100) ? `
                            <button onclick="const p = this.previousElementSibling; if(p.style.webkitLineClamp === 'unset') { p.style.webkitLineClamp = '2'; this.innerText = 'Read More ▾'; } else { p.style.webkitLineClamp = 'unset'; this.innerText = 'Read Less ▴'; }" style="background: none; border: none; color: #6366f1; font-size: 11px; padding: 4px 0 0 0; cursor: pointer; font-weight: 700; text-decoration: none;">Read More ▾</button>
                        ` : ''}
                    </div>

                    <!-- Assigned Students -->
                    <div style="margin-bottom: 12px; padding: 10px 12px; background: var(--surface-variant); border-radius: 8px; border: 1px solid var(--border);">
                        <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--on-surface-variant); letter-spacing: 0.5px; margin-bottom: 6px;">
                            👥 Assigned Students & Roles
                        </div>
                        <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                            ${studentsArr.map(st => `
                                <span style="background: var(--surface); border: 1px solid var(--border); padding: 3px 9px; border-radius: 14px; font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 5px;">
                                    <span style="width: 7px; height: 7px; border-radius: 50%; background: #6366f1;"></span>
                                    ${escapeHtml(st)}
                                </span>
                            `).join('')}
                        </div>
                        ${proj.student_details ? `
                            <div style="font-size: 11px; color: var(--on-surface-variant); margin-top: 6px; font-style: italic;">
                                💡 ${escapeHtml(proj.student_details)}
                            </div>
                        ` : ''}
                    </div>

                    <!-- Tech Stack Badges -->
                    ${techArr.length > 0 ? `
                        <div style="margin-bottom: 14px; display: flex; flex-wrap: wrap; gap: 5px;">
                            ${techArr.map(t => `
                                <span style="font-size: 11px; font-weight: 600; padding: 2px 7px; border-radius: 4px; background: rgba(56, 189, 248, 0.1); color: #0284c7; border: 1px solid rgba(56, 189, 248, 0.2);">
                                    ${escapeHtml(t)}
                                </span>
                            `).join('')}
                        </div>
                    ` : ''}

                    <!-- Duration & Report Details Grid -->
                    <div style="font-size: 11.5px; color: var(--on-surface-variant); display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 14px; padding-top: 10px; border-top: 1px dashed var(--border);">
                        <div>
                            <strong>⏱️ Duration:</strong><br>
                            ${escapeHtml(proj.duration || proj.start_date || 'N/A')}
                        </div>
                        <div>
                            <strong>📄 Report Status:</strong><br>
                            <span style="font-weight: 600; color: ${isFiled ? '#10b981' : (proj.report_status === 'Approved' ? '#3b82f6' : '#f59e0b')};">${escapeHtml(proj.report_status || reportText)}</span>
                        </div>
                    </div>
                </div>

                <!-- Footer Action Buttons -->
                <div style="display: flex; gap: 8px; align-items: center; justify-content: space-between; padding-top: 12px; border-top: 1px solid var(--border);">
                    <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                        ${proj.deployment_url ? `
                            <a href="${escapeHtml(proj.deployment_url)}" target="_blank" class="btn btn-primary" style="font-size: 11px; padding: 5px 10px; text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">
                                🌐 Deployment ↗
                            </a>
                        ` : ''}
                        ${proj.github_url ? `
                            <a href="${escapeHtml(proj.github_url)}" target="_blank" class="btn btn-secondary" style="font-size: 11px; padding: 5px 10px; text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">
                                💻 Code ↗
                            </a>
                        ` : ''}
                        ${proj.report_url ? `
                            <a href="${escapeHtml(proj.report_url)}" target="_blank" class="btn btn-secondary" style="font-size: 11px; padding: 5px 10px; text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">
                                ?? Report ?
                            </a>
                        ` : ''}
                    </div>
                    <div style="display: flex; gap: 4px;">
                        <button class="btn btn-secondary" onclick="openEditProjectModal(${proj.id})" style="font-size: 11px; padding: 5px 8px;" title="Edit Project">
                            ✏️
                        </button>
                        <button class="btn btn-secondary" onclick="deleteStudentProject(${proj.id})" style="font-size: 11px; padding: 5px 8px; color: var(--error);" title="Delete Project">
                            🗑️
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    grid.innerHTML = cardsHtml;
    const tab1Grid = document.getElementById("tab1-featured-projects-grid");
    if (tab1Grid) {
        tab1Grid.innerHTML = cardsHtml;
    }
}

function openAddProjectModal() {
    populateMembersDatalist();
    document.getElementById("project-modal-title").innerText = "➕ Add Student Research Project";
    document.getElementById("proj-edit-id").value = "";
    document.getElementById("proj-title").value = "";
    document.getElementById("proj-status").value = "Ongoing";
    setStudentSelection("");
    document.getElementById("proj-details").value = "";
    document.getElementById("proj-description").value = "";
    setTechSelection("");
    setDurationSelection("");
    document.getElementById("proj-deployment-url").value = "";
    document.getElementById("proj-github-url").value = "";
    document.getElementById("proj-report-status").value = "Pending";
    document.getElementById("proj-report-url").value = "";
    document.getElementById("proj-pc-assigned").value = "PC-1";

    const modal = document.getElementById("project-modal");
    if (modal) modal.style.display = "flex";
}

function openEditProjectModal(projectId) {
    populateMembersDatalist();
    const proj = allProjectsData.find(p => p.id === projectId);
    if (!proj) return;

    document.getElementById("project-modal-title").innerText = "✏️ Edit Student Research Project";
    document.getElementById("proj-edit-id").value = proj.id;
    document.getElementById("proj-title").value = proj.title || "";
    document.getElementById("proj-status").value = proj.status || "Ongoing";
    setStudentSelection(proj.student_names || "");
    document.getElementById("proj-details").value = proj.student_details || "";
    document.getElementById("proj-description").value = proj.description || "";
    setTechSelection(proj.technologies || "");
    setDurationSelection(proj.duration || "");
    document.getElementById("proj-deployment-url").value = proj.deployment_url || "";
    document.getElementById("proj-github-url").value = proj.github_url || "";
    document.getElementById("proj-report-status").value = proj.report_status || "Pending";
    document.getElementById("proj-report-url").value = proj.report_url || "";
    document.getElementById("proj-pc-assigned").value = proj.pc_assigned || "PC-1";

    const modal = document.getElementById("project-modal");
    if (modal) modal.style.display = "flex";
}

function closeProjectModal() {
    const modal = document.getElementById("project-modal");
    if (modal) modal.style.display = "none";
}

async function saveProjectFromModal() {
    const editId = document.getElementById("proj-edit-id").value;
    const title = document.getElementById("proj-title").value.trim();
    const studentNames = document.getElementById("proj-students").value.trim();
    const studentDetails = document.getElementById("proj-details").value.trim();
    const description = document.getElementById("proj-description").value.trim();
    const tech = document.getElementById("proj-technologies").value.trim();
    const duration = document.getElementById("proj-duration").value.trim();
    const deployUrl = document.getElementById("proj-deployment-url").value.trim();
    const githubUrl = document.getElementById("proj-github-url").value.trim();
    const reportStatus = document.getElementById("proj-report-status").value;
    const reportUrl = document.getElementById("proj-report-url").value.trim();
    const pcAssigned = document.getElementById("proj-pc-assigned").value;

    if (!title) {
        return showToast("Project title is required", "error");
    }
    if (!studentNames) {
        return showToast("Assigned student(s) required", "error");
    }

    const payload = {
        title,
        student_names: studentNames,
        student_details: studentDetails,
        description,
        technologies: tech,
        duration,
        deployment_url: deployUrl,
        github_url: githubUrl,
        status: document.getElementById("proj-status").value,
        report_status: reportStatus,
        report_url: reportUrl,
        pc_assigned: pcAssigned
    };

    const saveBtn = document.getElementById("save-project-btn");
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerText = "Saving...";
    }

    try {
        if (editId) {
            await apiFetch(`/api/projects/${editId}`, {
                method: "PUT",
                body: JSON.stringify(payload)
            });
            showToast("Project updated successfully!", "success");
        } else {
            await apiFetch("/api/projects", {
                method: "POST",
                body: JSON.stringify(payload)
            });
            showToast("Project added successfully!", "success");
        }
        closeProjectModal();
        await loadStudentProjects();
    } catch (e) {
        showToast("Error saving project: " + e.message, "error");
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerText = "Save Project";
        }
    }
}

async function deleteStudentProject(projectId) {
    if (!confirm("Are you sure you want to remove this project?")) return;
    try {
        await apiFetch(`/api/projects/${projectId}`, { method: "DELETE" });
        showToast("Project deleted", "info");
        await loadStudentProjects();
    } catch (e) {
        showToast("Failed to delete project: " + e.message, "error");
    }
}




// --- Custom Multi-Select for Technologies ---
const predefinedTechs = [
    // Core AI & ML Languages & Libraries
    "Python", "PyTorch", "TensorFlow", "Keras", "Scikit-Learn", "Pandas", "NumPy", "SciPy", "Polars", "Statsmodels",
    
    // Reinforcement Learning (RL) & Simulation
    "Reinforcement Learning (RL)", "Stable-Baselines3 (SB3)", "Gymnasium / OpenAI Gym", "RLlib / Ray", "CleanRL",
    "Deep Q-Learning (DQN)", "PPO (Proximal Policy)", "SAC (Soft Actor-Critic)", "MuJoCo", "NVIDIA Isaac Sim", 
    "NVIDIA Isaac Gym", "PyBullet", "PettingZoo (Multi-Agent RL)",

    // Machine Learning & Gradient Boosting
    "Machine Learning (ML)", "Deep Learning (DL)", "XGBoost", "LightGBM", "CatBoost", "Optuna (HPO)",
    "MLflow", "Weights & Biases (W&B)", "DVC (Data Version Control)", "Seaborn", "Matplotlib",

    // Computer Vision & Object Detection
    "OpenCV", "YOLOv8", "YOLOv10", "YOLOv11", "MediaPipe", "Albumentations", "DeepFace", "SAM (Segment Anything)",

    // LLM, Agents & GenAI
    "LangChain", "LangGraph", "LlamaIndex", "CrewAI", "AutoGen", "Transformers", "HuggingFace", "Diffusers",
    "ComfyUI", "Ollama", "vLLM", "DeepSpeed", "LoRA / QLoRA", "PEFT", "Unsloth", "Whisper",

    // Hardware, Acceleration & Embedded
    "CUDA", "TensorRT", "TensorRT-LLM", "OpenVINO", "Triton Inference Server", "TFLite", "ONNX",
    "NVIDIA Jetson", "Raspberry Pi", "Arduino", "MATLAB", "ROS", "ROS2",

    // Data & Notebook Environments
    "Jupyter Lab / Notebook", "Google Colab", "Kaggle",

    // Databases & Vector Stores
    "MongoDB", "PostgreSQL", "SQLite", "MySQL", "Redis", "Elasticsearch", "Qdrant", "ChromaDB", "Pinecone", "Milvus",

    // Web & Full-Stack
    "FastAPI", "Flask", "Django", "React", "Next.js", "Vue", "Angular", "Node.js", "Express", "TypeScript",
    "Three.js", "WebGL", "WebRTC", "Socket.io",

    // Systems, Languages & DevOps
    "C++", "C#", "Java", "Go", "Rust", "Linux", "Bash", "Docker", "Kubernetes", "AWS", "GCP", "Azure",
    "Git", "GitHub Actions", "Jenkins", "Terraform", "Ansible"
];

let selectedTechs = new Set();

function initTechDropdown() {
    const container = document.getElementById("tech-options-container");
    if (!container) return;
    container.innerHTML = "";
    
    // Sort alphabetically
    predefinedTechs.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())).forEach(tech => {
        const label = document.createElement("label");
        label.style.display = "flex";
        label.style.width = "100%";
        label.style.justifyContent = "flex-start";
        label.style.justifyContent = "flex-start";
        label.style.flexDirection = "row";
        label.style.alignItems = "center";
        label.style.gap = "8px";
        label.style.padding = "6px";
        label.style.cursor = "pointer";
        label.style.borderRadius = "4px";
        label.className = "tech-option-label";
        
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.value = tech;
        cb.className = "tech-cb";
        cb.style.margin = "0";
        cb.style.width = "auto";
        cb.onclick = (e) => {
            e.stopPropagation();
            if (cb.checked) selectedTechs.add(tech);
            else selectedTechs.delete(tech);
            updateTechBadges();
        };
        
        label.appendChild(cb);
        label.appendChild(document.createTextNode(tech));
        container.appendChild(label);
        
        // Add hover effect via JS since inline styles are easy
        label.onmouseenter = () => label.style.background = "#f1f5f9";
        label.onmouseleave = () => label.style.background = "transparent";
    });
}

function toggleTechDropdown() {
    const list = document.getElementById("tech-dropdown-list");
    list.style.display = list.style.display === "none" ? "block" : "none";
}

function filterTechDropdown() {
    const query = document.getElementById("tech-search").value.toLowerCase();
    const labels = document.querySelectorAll("#tech-options-container label");
    labels.forEach(label => {
        if (label.innerText.toLowerCase().includes(query)) {
            label.style.display = "flex";
        label.style.width = "100%";
        label.style.justifyContent = "flex-start";
        } else {
            label.style.display = "none";
        }
    });
}

function updateTechBadges() {
    const badgeContainer = document.getElementById("tech-selected-badges");
    const hiddenInput = document.getElementById("proj-technologies");
    
    if (selectedTechs.size === 0) {
        badgeContainer.innerHTML = "Select technologies...";
        hiddenInput.value = "";
        return;
    }
    
    badgeContainer.innerHTML = "";
    Array.from(selectedTechs).forEach(tech => {
        const badge = document.createElement("span");
        badge.style.background = "var(--primary-container)";
        badge.style.color = "var(--on-primary-container)";
        badge.style.padding = "2px 8px";
        badge.style.borderRadius = "12px";
        badge.style.fontSize = "12px";
        badge.style.fontWeight = "500";
        badge.innerText = tech;
        badgeContainer.appendChild(badge);
    });
    
    hiddenInput.value = Array.from(selectedTechs).join(", ");
}

function setTechSelection(techString) {
    selectedTechs.clear();
    if (techString && techString.trim()) {
        techString.split(",").map(s => s.trim()).forEach(t => {
            if (t) selectedTechs.add(t);
        });
    }
    
    // Update checkboxes
    document.querySelectorAll(".tech-cb").forEach(cb => {
        cb.checked = selectedTechs.has(cb.value);
    });
    
    updateTechBadges();
}

// Close dropdown when clicking outside
document.addEventListener("click", (e) => {
    const multiSelect = document.getElementById("tech-multi-select");
    const list = document.getElementById("tech-dropdown-list");
    if (multiSelect && list && !multiSelect.contains(e.target)) {
        list.style.display = "none";
    }
});

document.addEventListener("DOMContentLoaded", () => {
    populateMembersDatalist();
    initTechDropdown();
});


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
                initStudentDropdown(res.users);
            }
        }
    } catch (e) {
        console.warn("Could not load datalist users:", e);
    }
}


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
        label.appendChild(document.createTextNode("[" + (user.role || "Member") + "] " + user.name));
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
    let hiddenInput = document.getElementById("proj-students");
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


// --- Custom Duration Calendar Logic ---
function updateDurationString(elem) {
    const start = document.getElementById("proj-duration-start").value;
    const end = document.getElementById("proj-duration-end").value;
    let hiddenInput = document.getElementById("proj-duration");
    if (!hiddenInput) hiddenInput = document.getElementById("proj-duration");
    
    if (!start || !end) {
        hiddenInput.value = "";
        return;
    }
    
    const d1 = new Date(start + "-01");
    const d2 = new Date(end + "-01");
    
    if (d2 < d1) {
        alert("End date cannot be before start date!");
        elem.value = "";
        hiddenInput.value = "";
        return;
    }
    
    let months = (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
    if (months === 0) months = 1; // if same month, count as 1 month
    
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const startStr = monthNames[d1.getMonth()] + " " + d1.getFullYear();
    const endStr = monthNames[d2.getMonth()] + " " + d2.getFullYear();
    
    hiddenInput.value = months + " Months (" + startStr + " - " + endStr + ")";
}

function setDurationSelection(durationString) {
    const startElem = document.getElementById("proj-duration-start");
    const endElem = document.getElementById("proj-duration-end");
    let hiddenInput = document.getElementById("proj-duration");
    if (!hiddenInput) hiddenInput = document.getElementById("proj-duration");
    
    if (!durationString) {
        startElem.value = "";
        endElem.value = "";
        hiddenInput.value = "";
        return;
    }
    
    // Fallback: just set hidden input
    hiddenInput.value = durationString;
    
    // Try to parse "4 Months (Jan 2026 - May 2026)"
    const match = durationString.match(/\((.*) - (.*)\)/);
    if (match && match.length === 3) {
        try {
            const d1 = new Date(match[1]);
            const d2 = new Date(match[2]);
            if (!isNaN(d1) && !isNaN(d2)) {
                startElem.value = d1.toISOString().slice(0, 7);
                endElem.value = d2.toISOString().slice(0, 7);
            }
        } catch(e) {}
    }
}


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

// ═════════════════════════════════════════════════════════
// ── LIVE LAB MONITORING, TASKS & ON-DEMAND SCREEN SNAPS ──
// ═════════════════════════════════════════════════════════
let monitoringPollInterval = null;
let monitoringAutoRefresh = true;

function startMonitoringAutoPoll() {
    stopMonitoringAutoPoll();
    if (monitoringAutoRefresh) {
        monitoringPollInterval = setInterval(() => {
            loadMonitoringData(true);
        }, 5000);
    }
}

function stopMonitoringAutoPoll() {
    if (monitoringPollInterval) {
        clearInterval(monitoringPollInterval);
        monitoringPollInterval = null;
    }
}

function toggleMonitoringAutoRefresh() {
    monitoringAutoRefresh = !monitoringAutoRefresh;
    const btn = document.getElementById("mon-auto-toggle-btn");
    if (btn) {
        btn.innerText = monitoringAutoRefresh ? "⚡ Auto-Refresh: 5s (ON)" : "⏸️ Auto-Refresh: OFF";
        btn.style.color = monitoringAutoRefresh ? "#10b981" : "#64748b";
    }
    if (monitoringAutoRefresh) {
        startMonitoringAutoPoll();
        loadMonitoringData(false);
    } else {
        stopMonitoringAutoPoll();
    }
}

async function loadMonitoringData(silent = false) {
    if (!BASE_URL) return [];
    try {
        const res = await apiFetch("/api/pc/monitoring");
        const pcs = res.workstations || [];
        renderMonitoringGrid(pcs);
        return pcs;
    } catch (e) {
        if (!silent) console.error("Failed to load monitoring data", e);
        return [];
    }
}

function renderMonitoringGrid(pcs) {
    const grid = document.getElementById("monitoring-grid");
    if (!grid) return;

    let onlineCount = 0;
    let activeAppCount = 0;
    let alertCount = 0;

    const cardsHtml = pcs.map(p => {
        const isOnline = p.is_online === 1;
        if (isOnline) onlineCount++;

        const isBackend = p.is_backend || p.pc_id === "BACKEND";
        const pcLabel = isBackend ? "BACKEND SERVER" : p.pc_id;
        const activeWin = p.active_window || (isOnline ? "Active Desktop" : "System Offline");
        if (isOnline && p.active_window && p.active_window !== "Desktop / Idle") {
            activeAppCount++;
        }

        // Detect potential distraction keywords
        const winLower = activeWin.toLowerCase();
        const isDistraction = ["youtube", "netflix", "instagram", "facebook", "game", "steam", "valorant", "roblox", "discord", "tiktok"].some(k => winLower.includes(k));
        if (isDistraction && isOnline) alertCount++;

        const topProcs = (p.top_processes || []).filter(pr => {
            if (!pr || !pr.name) return false;
            const n = pr.name.toLowerCase();
            return !['ps', 'top', 'htop', 'grep', 'awk', 'sed', 'sh', 'bash', 'zsh', 'dash', 'systemd', 'sshd', 'sleep', 'snapd'].includes(n) && !n.startsWith('kworker');
        });
        const snapUrl = p.screenshot_url ? resolveImageUrl(p.screenshot_url) : null;

        return `
            <div class="mon-card ${isOnline ? 'mon-online' : 'mon-offline'}" id="mon-card-${p.pc_id}">
                <!-- Header -->
                <div class="mon-header">
                    <div class="mon-title">
                        <span>${isBackend ? '🖥️' : '💻'}</span>
                        <span>${pcLabel}</span>
                        <span class="badge ${isOnline ? 'badge-connected' : 'badge-disconnected'}" style="font-size: 11px; padding: 2px 8px;">
                            ${isOnline ? '🟢 ONLINE' : '⚫ OFFLINE'}
                        </span>
                    </div>
                    <div>
                        ${p.occupied_by ? `
                            <span class="mon-user-badge" title="Occupied by ${p.occupied_by}">👤 ${escapeHtml(p.occupied_by.split(',')[0])}</span>
                        ` : `
                            <span class="mon-user-badge" style="color: #10b981; background: #ecfdf5;">🟢 Available</span>
                        `}
                    </div>
                </div>

                <!-- Active Foreground Window Banner -->
                <div class="mon-active-win ${isDistraction ? 'distraction' : ''}" title="${escapeHtml(activeWin)}">
                    <span>${isDistraction ? '⚠️' : '📱'}</span>
                    <strong style="font-size: 11px; color: #94a3b8;">ACTIVE:</strong>
                    <span style="overflow: hidden; text-overflow: ellipsis;">${escapeHtml(activeWin)}</span>
                </div>

                <!-- Resource Gauges -->
                <div class="mon-gauges-row">
                    <div class="mon-gauge-box">
                        <div class="mon-gauge-val" style="color: ${p.cpu_percent > 80 ? '#ef4444' : '#10b981'};">${p.cpu_percent || 0}%</div>
                        <div class="mon-gauge-lbl">CPU LOAD</div>
                    </div>
                    <div class="mon-gauge-box">
                        <div class="mon-gauge-val" style="color: #6366f1;">${p.ram_percent || 0}%</div>
                        <div class="mon-gauge-lbl">RAM (${p.ram_used_gb || 0}G)</div>
                    </div>
                    <div class="mon-gauge-box">
                        <div class="mon-gauge-val" style="color: #0284c7;">${p.gpu_percent || 0}%</div>
                        <div class="mon-gauge-lbl">GPU (${p.gpu_temp || 0}°C)</div>
                    </div>
                </div>

                <!-- On-Demand Screen Snapshot Frame -->
                <div class="mon-screen-preview" onclick="openScreenLightbox('${p.pc_id}', '${snapUrl || ''}', '${escapeHtml(activeWin)}')">
                    ${snapUrl ? `
                        <img src="${snapUrl}" alt="${p.pc_id} Screen" loading="lazy">
                        <div class="mon-screen-overlay">
                            <span style="color: #fff; font-weight: 700; font-size: 12px; background: rgba(0,0,0,0.7); padding: 6px 12px; border-radius: 20px;">
                                🔍 Click to Expand Screen
                            </span>
                        </div>
                    ` : `
                        <div style="text-align: center; color: #64748b; font-size: 11px; padding: 20px;">
                            <div style="font-size: 28px; margin-bottom: 6px;">📷</div>
                            <div>No Snapshot Captured Yet</div>
                            <div style="color: #94a3b8; font-size: 10px; margin-top: 2px;">Click 'Grab Live Screen' to pull current display</div>
                        </div>
                    `}
                </div>

                <!-- Snapshot Action Controls -->
                <div class="mon-snap-action-bar" style="display: flex; gap: 6px; align-items: center; justify-content: space-between; flex-wrap: wrap;">
                    <div style="display: flex; gap: 6px; align-items: center;">
                        <button class="btn btn-primary mon-snap-btn" id="btn-snap-${p.pc_id}" onclick="requestScreenGrab('${p.pc_id}')" ${!isOnline ? 'disabled style="opacity: 0.5;"' : ''}>
                            📸 Grab Live Screen
                        </button>
                        ${snapUrl ? `
                            <a href="${snapUrl}" download="${p.pc_id}_screen.jpg" class="btn btn-secondary" style="font-size: 11px; padding: 5px 9px; text-decoration: none; display: inline-flex; align-items: center; gap: 4px; font-weight: 700; background: #f1f5f9; border: 1px solid #cbd5e1; color: #1e293b;" title="Download this workstation screen photo" onclick="event.stopPropagation()">
                                📥 Save Photo
                            </a>
                        ` : ''}
                    </div>
                    ${p.last_screenshot_at ? `
                        <span style="font-size: 10px; color: #64748b;" title="Last screenshot taken at ${p.last_screenshot_at}">
                            🕒 ${p.last_screenshot_at.split(' ')[1] || ''}
                        </span>
                    ` : ''}
                </div>

                <!-- Top Running Processes Table -->
                <div class="mon-tasks-list">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                        <strong style="color: #475569; font-size: 11px;">⚡ TOP TASKS / APPS</strong>
                        <span style="font-size: 10px; color: #94a3b8;">${topProcs.length} reported</span>
                    </div>
                    ${topProcs.length > 0 ? topProcs.map(pr => `
                        <div class="mon-task-item">
                            <span class="mon-task-name" title="${escapeHtml(pr.name)}">
                                ${escapeHtml(pr.name)}
                            </span>
                            <div class="mon-task-stats">
                                <span>${Math.min(100, Math.round(pr.cpu || 0))}% C</span>
                                <span>${Math.min(100, Math.round(pr.ram || 0))}% M</span>
                                ${pr.pid ? `
                                    <button class="mon-kill-btn" title="Terminate ${escapeHtml(pr.name)} (PID ${pr.pid})" onclick="killWorkstationTask('${p.pc_id}', ${pr.pid}, '${escapeHtml(pr.name)}')">
                                        ✖
                                    </button>
                                ` : ''}
                            </div>
                        </div>
                    `).join('') : `
                        <div style="color: #94a3b8; font-size: 11px; text-align: center; padding: 4px 0;">
                            ${isOnline ? 'No heavy tasks reported' : 'PC Offline • No process data'}
                        </div>
                    `}
                </div>
            </div>
        `;
    }).join("");

    grid.innerHTML = cardsHtml;

    // Update Overview Stats
    const monStatOnline = document.getElementById("mon-stat-online");
    if (monStatOnline) monStatOnline.innerText = `${onlineCount} / ${pcs.length}`;

    const navMonCount = document.getElementById("nav-mon-count");
    if (navMonCount) navMonCount.innerText = `${onlineCount} On`;

    const monStatApps = document.getElementById("mon-stat-active-apps");
    if (monStatApps) monStatApps.innerText = activeAppCount;

    const alertCard = document.getElementById("mon-stat-alert-card");
    const monStatAlerts = document.getElementById("mon-stat-alerts");
    if (alertCard && monStatAlerts) {
        if (alertCount > 0) {
            alertCard.style.display = "block";
            monStatAlerts.innerText = `${alertCount} PC(s)`;
        } else {
            alertCard.style.display = "none";
        }
    }
}

async function requestScreenGrab(pcId) {
    if (!BASE_URL) return;
    const cleanId = pcId.toUpperCase();
    const btn = document.getElementById(`btn-snap-${cleanId}`);
    if (btn) {
        btn.innerText = "⏳ Capturing...";
        btn.disabled = true;
    }
    showToast(`📸 Requesting screen snapshot from ${cleanId}...`, "info");

    try {
        const resp = await apiFetch(`/api/pc/${cleanId}/request_screenshot`, {
            method: "POST",
            body: JSON.stringify({ command: "capture_screen" })
        });

        // Instant capture for BACKEND
        if (resp && resp.url) {
            await loadMonitoringData(true);
            if (btn) {
                btn.innerText = "📸 Grab Live Screen";
                btn.disabled = false;
            }
            showToast(`✅ Live snapshot ready for ${cleanId}!`, "success");
            return;
        }

        // Poll for new image uploaded by client PC (10 attempts x 1.5s = 15s)
        let attempts = 0;
        const maxAttempts = 10;
        const checkPoll = setInterval(async () => {
            attempts++;
            if (btn) btn.innerText = `⏳ Capturing (${attempts}/${maxAttempts})...`;
            const pcs = await loadMonitoringData(true);
            const target = pcs.find(p => p.pc_id === cleanId);
            if (target && target.screenshot_url) {
                clearInterval(checkPoll);
                if (btn) {
                    btn.innerText = "📸 Grab Live Screen";
                    btn.disabled = false;
                }
                showToast(`✅ Live snapshot ready for ${cleanId}!`, "success");
            } else if (attempts >= maxAttempts) {
                clearInterval(checkPoll);
                if (btn) {
                    btn.innerText = "📸 Grab Live Screen";
                    btn.disabled = false;
                }
                showToast(`⚠️ Workstation ${cleanId} par frame capture hone me time lag raha hai ya screen asleep hai. Please check agent status.`, "warning");
            }
        }, 1500);
    } catch (e) {
        showToast(`Failed to request screen: ${e.message}`, "error");
        if (btn) {
            btn.innerText = "📸 Grab Live Screen";
            btn.disabled = false;
        }
    }
}

async function requestAllScreenshots() {
    showToast("📸 Requesting live screenshots from all online workstations...", "info");
    const onlineCards = document.querySelectorAll(".mon-card.mon-online");
    onlineCards.forEach(c => {
        const pcId = c.id.replace("mon-card-", "");
        if (pcId) requestScreenGrab(pcId);
    });
}

function formatUptime(bootTimeStr) {
    if (!bootTimeStr) return "N/A";
    try {
        const boot = new Date(bootTimeStr.replace(" ", "T"));
        const now = new Date();
        const diffMs = now - boot;
        if (diffMs <= 0 || isNaN(diffMs)) return "Just started";
        const totalMins = Math.floor(diffMs / 60000);
        const hrs = Math.floor(totalMins / 60);
        const mins = totalMins % 60;
        const days = Math.floor(hrs / 24);
        if (days > 0) return `${days}d ${hrs % 24}h ${mins}m`;
        if (hrs > 0) return `${hrs}h ${mins}m`;
        return `${mins}m`;
    } catch (e) {
        return bootTimeStr;
    }
}

function formatWorkTime(sinceTimeStr) {
    if (!sinceTimeStr) return "No active session";
    try {
        const since = new Date(sinceTimeStr.replace(" ", "T"));
        const now = new Date();
        const diffMs = now - since;
        if (diffMs <= 0 || isNaN(diffMs)) return "Just assigned";
        const totalMins = Math.floor(diffMs / 60000);
        const hrs = Math.floor(totalMins / 60);
        const mins = totalMins % 60;
        const days = Math.floor(hrs / 24);
        if (days > 0) return `${days}d ${hrs % 24}h ${mins}m`;
        if (hrs > 0) return `${hrs}h ${mins}m`;
        return `${mins}m Active`;
    } catch (e) {
        return sinceTimeStr;
    }
}

function openScreenLightbox(pcId, imgUrl, activeWin) {
    const modal = document.getElementById("screen-lightbox-modal");
    if (!modal) return;

    const cleanId = (pcId || "").toUpperCase();
    const isBackendNode = cleanId === "BACKEND";
    const pc = (typeof lastMonitoringPCs !== 'undefined' && lastMonitoringPCs.find(p => p.pc_id === cleanId)) || 
               (allPCsState || []).find(p => p.pc_id === cleanId) || 
               { pc_id: cleanId };

    modal.dataset.currentPc = cleanId;

    // Hide power buttons for BACKEND
    const powerButtons = modal.querySelectorAll("button[onclick^='triggerAILabPower']");
    powerButtons.forEach(b => {
        b.style.display = isBackendNode ? "none" : "inline-block";
    });

    // Title & Header Badges
    const title = document.getElementById("screen-lightbox-title");
    if (title) title.innerText = isBackendNode ? "🖥️ BACKEND SERVER — Read-Only Briefing" : `Workstation ${cleanId} — Complete Briefing`;

    const onlineBadge = document.getElementById("brief-online-badge");
    const isOnline = pc.is_online === 1 || pc.is_online === true;
    if (onlineBadge) {
        onlineBadge.innerText = isOnline ? "🟢 ONLINE" : "⚫ OFFLINE";
        onlineBadge.style.color = isOnline ? "#4ade80" : "#94a3b8";
        onlineBadge.style.background = isOnline ? "rgba(34, 197, 94, 0.2)" : "rgba(100, 116, 139, 0.2)";
    }

    const statusPill = document.getElementById("brief-status-pill");
    const isFree = !pc.is_backend && (pc.status || "free").toLowerCase() === "free";
    if (statusPill) {
        statusPill.innerText = pc.is_backend ? "24/7 Host" : isFree ? "🟢 Free" : "🔴 Occupied";
        statusPill.style.color = isFree ? "#4ade80" : "#f87171";
        statusPill.style.background = isFree ? "rgba(34, 197, 94, 0.2)" : "rgba(239, 68, 68, 0.2)";
    }

    // Active Window
    const winText = activeWin || pc.active_window || (isOnline ? "Active Desktop / Idle" : "System Offline");
    const winEl = document.getElementById("brief-active-win");
    if (winEl) winEl.innerText = winText;

    const snapTimeEl = document.getElementById("brief-snap-timestamp");
    if (snapTimeEl) {
        snapTimeEl.innerText = pc.last_screenshot_at ? `🕒 ${pc.last_screenshot_at.split(' ')[1] || pc.last_screenshot_at}` : "🕒 No snap yet";
    }

    // Image & Fallback
    const img = document.getElementById("screen-lightbox-img");
    const fallback = document.getElementById("brief-screen-fallback");
    const downloadBtn = document.getElementById("brief-download-btn");
    const openFullBtn = document.getElementById("brief-open-full-btn");
    const resolvedUrl = imgUrl ? resolveImageUrl(imgUrl) : (pc.screenshot_url ? resolveImageUrl(pc.screenshot_url) : "");

    if (img && fallback) {
        if (resolvedUrl) {
            img.src = resolvedUrl;
            img.style.display = "block";
            fallback.style.display = "none";
        } else {
            img.style.display = "none";
            fallback.style.display = "flex";
        }
    }

    if (downloadBtn) {
        if (resolvedUrl) {
            downloadBtn.href = resolvedUrl;
            downloadBtn.download = `${cleanId}_${new Date().toISOString().slice(0, 10)}.jpg`;
            downloadBtn.style.display = "inline-flex";
        } else {
            downloadBtn.style.display = "none";
        }
    }
    if (openFullBtn) {
        if (resolvedUrl) {
            openFullBtn.href = resolvedUrl;
            openFullBtn.style.display = "inline-flex";
        } else {
            openFullBtn.style.display = "none";
        }
    }

    // Uptime & Boot Time
    const uptimeEl = document.getElementById("brief-uptime");
    if (uptimeEl) uptimeEl.innerText = formatUptime(pc.boot_time);

    const bootTimeEl = document.getElementById("brief-boot-time");
    if (bootTimeEl) bootTimeEl.innerText = pc.boot_time ? `Boot: ${pc.boot_time.split(' ')[1] || pc.boot_time}` : "Boot time: N/A";

    // Work Time & Since Time
    const workTimeEl = document.getElementById("brief-work-time");
    if (workTimeEl) workTimeEl.innerText = formatWorkTime(pc.since_time);

    const sinceTimeEl = document.getElementById("brief-since-time");
    if (sinceTimeEl) sinceTimeEl.innerText = pc.since_time ? `Assigned: ${pc.since_time.split(' ')[1] || pc.since_time}` : "No active session";

    // Occupant and Project
    const userEl = document.getElementById("brief-user-name");
    if (userEl) userEl.innerText = pc.occupied_by || "Available / None Assigned";

    const projEl = document.getElementById("brief-project-name");
    if (projEl) projEl.innerText = pc.current_project || "General Lab Work";

    const timeLeftEl = document.getElementById("brief-time-left");
    if (timeLeftEl) {
        if (pc.is_backend) {
            timeLeftEl.innerText = "24/7 Dedicated Server";
        } else if (isFree) {
            timeLeftEl.innerText = "Ready for Allotment";
        } else if (pc.end_time) {
            const rem = calculateTimeRemaining(pc.end_time);
            timeLeftEl.innerText = rem ? rem.formatted : "Active Session";
        } else {
            timeLeftEl.innerText = "Active Session";
        }
    }

    // Hardware Gauges
    const cpuEl = document.getElementById("brief-cpu-val");
    if (cpuEl) cpuEl.innerText = `${pc.cpu_percent || 0}%`;

    const ramEl = document.getElementById("brief-ram-val");
    if (ramEl) ramEl.innerText = `${pc.ram_percent || 0}%`;

    const ramSub = document.getElementById("brief-ram-sub");
    if (ramSub) ramSub.innerText = `RAM (${pc.ram_used_gb || 0} / ${pc.ram_total_gb || 0}G)`;

    const gpuEl = document.getElementById("brief-gpu-val");
    if (gpuEl) gpuEl.innerText = `${pc.gpu_percent || 0}%`;

    const gpuSub = document.getElementById("brief-gpu-sub");
    if (gpuSub) gpuSub.innerText = `GPU (${pc.gpu_temp || 0}°C)`;

    const gpuNameEl = document.getElementById("brief-gpu-name");
    if (gpuNameEl) {
        gpuNameEl.innerText = `${pc.gpu_name || 'Host Accelerator'} • VRAM: ${pc.gpu_vram_used_mb || 0} / ${pc.gpu_vram_total_mb || 0} MB`;
    }

    // Top Processes Table
    const tasksCount = document.getElementById("brief-tasks-count");
    const tasksCont = document.getElementById("brief-tasks-container");
    const rawProcs = pc.top_processes || [];
    const procs = rawProcs.filter(pr => {
        if (!pr || !pr.name) return false;
        const n = pr.name.toLowerCase();
        return !['ps', 'top', 'htop', 'grep', 'awk', 'sed', 'sh', 'bash', 'zsh', 'dash', 'systemd', 'sshd', 'sleep', 'snapd'].includes(n) && !n.startsWith('kworker');
    });
    if (tasksCount) tasksCount.innerText = `${procs.length} reported`;
    if (tasksCont) {
        if (procs.length > 0) {
            tasksCont.innerHTML = procs.map(pr => `
                <div style="display: flex; justify-content: space-between; align-items: center; background: #0f172a; padding: 6px 10px; border-radius: 6px; font-size: 11px;">
                    <div style="display: flex; align-items: center; gap: 6px; overflow: hidden;">
                        <strong style="color: #f8fafc; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 140px;" title="${escapeHtml(pr.name)}">
                            ${escapeHtml(pr.name)}
                        </strong>
                        <span style="color: #64748b; font-size: 10px;">(PID: ${pr.pid || 'N/A'})</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="color: #38bdf8; font-weight: 700;">${Math.min(100, Math.round(pr.cpu || 0))}% C</span>
                        <span style="color: #a78bfa;">${Math.min(100, Math.round(pr.ram || 0))}% M</span>
                        ${pr.pid ? `
                            <button class="mon-kill-btn" title="Kill PID ${pr.pid}" onclick="killWorkstationTask('${cleanId}', ${pr.pid}, '${escapeHtml(pr.name)}')">
                                ✖
                            </button>
                        ` : ''}
                    </div>
                </div>
            `).join("");
        } else {
            tasksCont.innerHTML = `<div style="color: #94a3b8; font-size: 11px; text-align: center; padding: 12px;">${isOnline ? 'No heavy tasks reported' : 'PC Offline • No process data'}</div>`;
        }
    }

    modal.style.display = "flex";
}

function closeScreenLightbox(e) {
    if (e && e.target && e.target.id !== "screen-lightbox-modal" && !e.target.classList.contains("modal-close-btn")) {
        return;
    }
    const modal = document.getElementById("screen-lightbox-modal");
    if (modal) modal.style.display = "none";
}

async function requestLightboxFreshSnap() {
    const modal = document.getElementById("screen-lightbox-modal");
    const pcId = modal ? modal.dataset.currentPc : null;
    if (!pcId) return;

    const refreshBtn = document.getElementById("screen-lightbox-refresh-btn");
    const img = document.getElementById("screen-lightbox-img");
    const fallback = document.getElementById("brief-screen-fallback");

    if (refreshBtn) {
        refreshBtn.innerText = "⏳ Capturing Frame...";
        refreshBtn.disabled = true;
    }

    showToast(`📸 Requesting live frame from ${pcId}...`, "info");

    try {
        await apiFetch(`/api/pc/${pcId}/request_screenshot`, {
            method: "POST",
            body: JSON.stringify({ command: "capture_screen" })
        });

        // Instant capture for BACKEND
        if (pcId === "BACKEND") {
            setTimeout(async () => {
                await loadMonitoringData(true);
                if (img) {
                    img.src = resolveImageUrl(`/static/screenshots/backend.jpg?t=${Date.now()}`);
                    img.style.display = "block";
                    if (fallback) fallback.style.display = "none";
                }
                if (refreshBtn) {
                    refreshBtn.innerText = "📸 Grab Fresh Snap";
                    refreshBtn.disabled = false;
                }
                showToast(`✅ Fresh snapshot loaded for ${pcId}!`, "success");
            }, 800);
            return;
        }

        // Active poll up to 10 attempts (15 seconds)
        let attempts = 0;
        const maxAttempts = 10;
        const poll = setInterval(async () => {
            attempts++;
            if (refreshBtn) refreshBtn.innerText = `⏳ Capturing (${attempts}/${maxAttempts})...`;
            const pcs = await loadMonitoringData(true);
            const target = pcs.find(p => p.pc_id === pcId);

            // Test image load
            const testImg = new Image();
            const freshUrl = resolveImageUrl(`/static/screenshots/${pcId.toLowerCase()}.jpg?t=${Date.now()}`);
            testImg.onload = () => {
                clearInterval(poll);
                if (img) {
                    img.src = freshUrl;
                    img.style.display = "block";
                    if (fallback) fallback.style.display = "none";
                }
                const downloadBtn = document.getElementById("brief-download-btn");
                const openFullBtn = document.getElementById("brief-open-full-btn");
                if (downloadBtn) {
                    downloadBtn.href = freshUrl;
                    downloadBtn.download = `${pcId}_${new Date().toISOString().slice(0, 10)}.jpg`;
                    downloadBtn.style.display = "inline-flex";
                }
                if (openFullBtn) {
                    openFullBtn.href = freshUrl;
                    openFullBtn.style.display = "inline-flex";
                }
                if (refreshBtn) {
                    refreshBtn.innerText = "📸 Grab Fresh Snap";
                    refreshBtn.disabled = false;
                }
                showToast(`✅ Fresh snapshot updated for ${pcId}!`, "success");
            };
            testImg.onerror = () => {
                if (attempts >= maxAttempts) {
                    clearInterval(poll);
                    if (refreshBtn) {
                        refreshBtn.innerText = "📸 Grab Fresh Snap";
                        refreshBtn.disabled = false;
                    }
                    showToast(`⚠️ Workstation ${pcId} frame capture timed out. Device display may be asleep or locked.`, "warning");
                }
            };
            testImg.src = freshUrl;
        }, 1500);

    } catch (e) {
        showToast(`Failed to capture: ${e.message}`, "error");
        if (refreshBtn) {
            refreshBtn.innerText = "📸 Grab Fresh Snap";
            refreshBtn.disabled = false;
        }
    }
}

function openScreenLightboxFromModal() {
    if (!currentPCId) return;
    const thumbImg = document.getElementById("modal-screen-thumb");
    const winVal = document.getElementById("modal-active-win-val");
    if (thumbImg && thumbImg.src && thumbImg.style.display !== "none") {
        openScreenLightbox(currentPCId, thumbImg.src, winVal ? winVal.innerText : "");
    } else {
        requestModalScreenGrab();
    }
}

function requestModalScreenGrab() {
    if (!currentPCId) return;
    const btn = document.getElementById("modal-grab-screen-btn");
    if (btn) btn.innerText = "⏳ Capturing...";
    requestScreenGrab(currentPCId);
    setTimeout(() => {
        if (btn) btn.innerText = "📸 Grab Live Screen";
        const thumbImg = document.getElementById("modal-screen-thumb");
        const thumbPlh = document.getElementById("modal-screen-placeholder");
        if (thumbImg) {
            thumbImg.src = resolveImageUrl(`/static/screenshots/${currentPCId.toLowerCase()}.jpg?t=${Date.now()}`);
            thumbImg.style.display = "block";
            if (thumbPlh) thumbPlh.style.display = "none";
        }
    }, 3200);
}

async function killWorkstationTask(pcId, pid, procName) {
    if (pcId && pcId.toUpperCase() === "BACKEND") {
        alert("🔒 Protected System Node: Cannot terminate processes on the BACKEND core server.");
        return;
    }
    if (!confirm(`⚠️ Terminate Process: Are you sure you want to kill '${procName}' (PID ${pid}) on ${pcId}?`)) {
        return;
    }

    try {
        await apiFetch(`/api/pc/${pcId}/kill_task`, {
            method: "POST",
            body: JSON.stringify({ pid, name: procName })
        });
        showToast(`🛑 Kill command sent for '${procName}' on ${pcId}`, "success");
        setTimeout(() => {
            loadMonitoringData(true);
        }, 2500);
    } catch (e) {
        showToast(`Failed to kill process: ${e.message}`, "error");
    }
}

// ── AI Lab Workstation Remote Power & Control ──
async function triggerAILabPower(action) {
    const modal = document.getElementById("screen-lightbox-modal");
    const pcId = modal ? modal.dataset.currentPc : currentPCId;
    if (!pcId) {
        showToast("No workstation selected", "warning");
        return;
    }

    if (pcId.toUpperCase() === "BACKEND") {
        alert("⚠️ Protected Host: All remote power and control commands are disabled for the BACKEND master server to protect ongoing lab databases and background services.");
        return;
    }

    let cmd = action;
    if (action === "shutdown") {
        if (!confirm(`🛑 CRITICAL CONFIRMATION:\n\nAre you sure you want to SHUT DOWN workstation ${pcId} remotely?\nThis will close all active applications and turn off the machine in 5 seconds.`)) {
            return;
        }
    } else if (action === "restart") {
        if (!confirm(`🔄 CONFIRM REBOOT:\n\nAre you sure you want to RESTART workstation ${pcId} remotely?\nSystem will reboot in 5 seconds.`)) {
            return;
        }
    } else if (action === "lock") {
        if (!confirm(`🔒 Lock screen on workstation ${pcId}?`)) {
            return;
        }
    } else if (action === "warn") {
        const msg = prompt(`Enter administrative alert message for student on ${pcId}:`, "AI Lab Administrator Notice: Please focus on your assigned lab work.");
        if (!msg || !msg.trim()) return;
        cmd = `warn:${msg.trim()}`;
    }

    try {
        const resp = await apiFetch("/api/command", {
            method: "POST",
            body: JSON.stringify({ pc_id: pcId, command: cmd })
        });
        if (resp && resp.status === "error") {
            showToast(`⚠️ ${resp.message}`, "warning");
        } else {
            showToast(`⚡ Command '${cmd}' dispatched to ${pcId}`, "success");
        }
    } catch (e) {
        showToast(`Failed to dispatch command: ${e.message}`, "error");
    }
}

function openAILabPowerModal() {
    const modal = document.getElementById("ai-lab-power-modal");
    if (modal) {
        modal.style.display = "flex";
    }
}

function closeAILabPowerModal() {
    const modal = document.getElementById("ai-lab-power-modal");
    if (modal) {
        modal.style.display = "none";
    }
}

async function executeAILabBulkPower(action) {
    let confirmMsg = "";
    if (action === "shutdown") {
        confirmMsg = `🛑 DANGER: MASTER AI LAB SHUTDOWN\n\nAre you sure you want to SHUT DOWN ALL WORKSTATIONS in the AI Lab?\n\nThis will send an immediate 5-second shutdown sequence to every active client PC (PC-1 to PC-8, DGX). The BACKEND server will remain protected and online.`;
    } else if (action === "restart") {
        confirmMsg = `🔄 MASTER AI LAB REBOOT\n\nAre you sure you want to REBOOT ALL CLIENT WORKSTATIONS in the AI Lab?`;
    } else if (action === "lock") {
        confirmMsg = `🔒 MASTER AI LAB SCREEN LOCK\n\nAre you sure you want to LOCK ALL WORKSTATION SCREENS in the AI Lab?`;
    } else if (action === "update") {
        confirmMsg = `⚡ AUTO-UPDATE ALL AGENTS\n\nAre you sure you want to trigger a silent remote self-update for ALL active workstations (PC-1 to PC-8 & DGX Node)?\n\nEvery agent will automatically download the latest script from the server SSD and hot-restart within 5 seconds without manual visits.`;
    }

    if (!confirm(confirmMsg)) return;

    try {
        showToast(`Queuing master '${action}' command for AI Lab workstations...`, "info");
        const resp = await apiFetch("/api/lab/power", {
            method: "POST",
            body: JSON.stringify({ action: action })
        });
        showToast(`✅ ${resp.message || `Dispatched ${action} across AI Lab`}`, "success");
        closeAILabPowerModal();
        loadMonitoringData(true);
    } catch (e) {
        showToast(`Bulk command failed: ${e.message}`, "error");
    }
}
