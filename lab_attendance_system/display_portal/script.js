// ═══════════════════════════════════════════════════════════════════
// AI LAB — DISPLAY & DIGITAL TWIN PORTAL (READ-ONLY)
// ═══════════════════════════════════════════════════════════════════

// ── UTILITIES ──
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe.toString().replace(/[&<"'>]/g, function (m) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
    });
}

// ── DYNAMIC BACKEND URL RESOLUTION ──
const ACTIVE_TUNNEL_FALLBACK = "https://labg418pc12.tailc8c1f6.ts.net";
let storedUrl = localStorage.getItem("lab_display_backend_url");

// If no valid tailscale URL stored, force the default active tunnel
let BASE_URL = ACTIVE_TUNNEL_FALLBACK;
if (storedUrl && storedUrl.includes("tailc8c1f6.ts.net")) {
    BASE_URL = storedUrl;
} else if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    BASE_URL = "http://localhost:8000";
} else {
    BASE_URL = ACTIVE_TUNNEL_FALLBACK;
    localStorage.setItem("lab_display_backend_url", ACTIVE_TUNNEL_FALLBACK);
}

// Global cached states
let registeredUsersList = [];
let allPCsState = [];
let allProjectsData = [];
let currentProjectFilter = "all";
let currentCategoryFilter = "all";
let countdownInterval = null;

// Standalone SVG Avatar & Face Fallback Generators
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

// ── DOM READY ──
document.addEventListener("DOMContentLoaded", () => {
    initTabs();

    // Init 3D Lab Scene
    if (typeof init3DLabScene === "function") {
        init3DLabScene();
    }
    
    // Connection UI setup
    const urlInput = document.getElementById("ngrok-url");
    if (urlInput) {
        urlInput.value = BASE_URL;
    }

    document.getElementById("connect-btn")?.addEventListener("click", () => {
        let url = (urlInput.value || "").trim();
        if (url.endsWith("/")) url = url.slice(0, -1);
        BASE_URL = url;
        localStorage.setItem("lab_display_backend_url", BASE_URL);
        checkConnection();
    });

    document.getElementById("apply-filter-btn")?.addEventListener("click", loadAttendance);
    document.getElementById("refresh-unknown-btn")?.addEventListener("click", loadUnknownFaces);

    // Initial connection check
    checkConnection();

    // Start 1-second interval for real-time countdown clocks
    startCountdownLoop();

    // Auto-poll PC status every 8 seconds for server sync
    setInterval(() => {
        if (BASE_URL) loadPCStatus(true);
    }, 8000);
});

// ── API Fetch Helper with Offline Caching ──
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
            localStorage.setItem("display_cache_" + endpoint, JSON.stringify({
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                data: data
            }));
            setOfflineStatus(false);
        }
        
        return data;
    } catch (e) {
        // Fallback to cache if network fails
        if (isGet) {
            const cachedStr = localStorage.getItem("display_cache_" + endpoint);
            if (cachedStr) {
                try {
                    const cachedObj = JSON.parse(cachedStr);
                    setOfflineStatus(true, cachedObj.timestamp);
                    return cachedObj.data;
                } catch (parseErr) {}
            }
        }
        setOfflineStatus(true);
        throw e;
    }
}

function setOfflineStatus(isOffline, timestamp = null) {
    const status = document.getElementById("connection-status");
    if (!status) return;

    if (isOffline) {
        status.className = "badge badge-disconnected";
        status.innerHTML = timestamp 
            ? `⚠️ Offline (Last: ${timestamp})` 
            : "⚠️ Offline (Cached)";
        status.style.backgroundColor = "#ea580c";
        status.title = "Backend is currently unreachable. Showing locally cached data.";
    } else {
        status.className = "badge badge-connected";
        status.innerHTML = "🟢 Live Online";
        status.style.backgroundColor = "#16a34a";
        status.title = "Connected directly to AI Lab Backend Server";
    }
}

function toggleServerConfigBar() {
    const connUI = document.getElementById("connection-ui");
    if (connUI) {
        connUI.style.display = (connUI.style.display === "flex") ? "none" : "flex";
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
        const syncTime = localStorage.getItem("display_cached_pc_sync_time") || "Previous Session";
        setOfflineStatus(true, syncTime);
        loadPCStatus(true);
        loadStudentProjects();
        loadRegisteredFaces();
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
            if (btn.dataset.tab === 'projects') loadStudentProjects();
            if (btn.dataset.tab === 'attendance') loadAttendance();
            if (btn.dataset.tab === 'registered-faces') loadRegisteredFaces();
            if (btn.dataset.tab === 'unknown-faces') loadUnknownFaces();
        });
    });
}

function switchTab(tabName) {
    const btn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
    if (btn) btn.click();
}

// ── PC Status & Countdown Logic ──

async function loadPCStatus(silent = false) {
    if (!BASE_URL) return;
    try {
        const rawPcs = await apiFetch("/pc/status");
        const allowedPCIds = ["PC-1", "PC-2", "PC-3", "PC-4", "PC-5", "PC-6", "PC-7", "PC-8", "BACKEND"];
        allPCsState = rawPcs.filter(p => allowedPCIds.includes(p.pc_id.toUpperCase()));
        
        const syncTimeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        localStorage.setItem("display_cached_pc_status", JSON.stringify(allPCsState));
        localStorage.setItem("display_cached_pc_sync_time", syncTimeStr);

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
        
        const cached = localStorage.getItem("display_cached_pc_status");
        const syncTime = localStorage.getItem("display_cached_pc_sync_time") || "Previous Session";

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
                    Role: <strong style="color: #1e40af;">FastAPI Core + Tailscale Funnel</strong>
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
                 onclick="${isBackend ? `showToast('🔒 AI Lab Core Backend Host: Read-Only System Node (Access Restricted).', 'info')` : `handlePCClick('${pc.pc_id}')`}"
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
                                            👤 ${escapeHtml(name)}
                                        </span>
                                    `).join("")}
                                </div>
                            </div>
                        ` : `
                            <div class="pc-user-info">
                                <span>${isBackend ? '🖥️' : '👤'}</span> <strong>${escapeHtml(pc.occupied_by)}</strong>
                            </div>
                        `}
                        ${pc.current_project ? `
                            <div class="pc-project-tag" title="Project: ${escapeHtml(pc.current_project)}">
                                💼 <span>${escapeHtml(pc.current_project)}</span>
                            </div>
                        ` : ''}
                        ${pc.user_email ? `<div class="pc-email-info">✉️ ${escapeHtml(pc.user_email)}</div>` : ''}
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
                    ` : `
                        <button class="btn btn-secondary" style="width: 100%; font-size: 12px; padding: 6px 10px;" onclick="handlePCClick('${pc.pc_id}')">
                            🔍 View Workstation Details
                        </button>
                    `}
                </div>
            </div>
        `;
    }).join("");
}

function calculateTimeRemaining(endTimeStr) {
    if (!endTimeStr) return { totalMs: 0, formatted: "N/A", expired: false };
    
    const parts = endTimeStr.replace("T", " ").split(" ");
    const dateParts = parts[0].split("-");
    const timeParts = (parts[1] || "00:00:00").split(":");
    
    const end = new Date(
        parseInt(dateParts[0]),
        parseInt(dateParts[1]) - 1,
        parseInt(dateParts[2]),
        parseInt(timeParts[0] || 0),
        parseInt(timeParts[1] || 0),
        parseInt(timeParts[2] || 0)
    );

    const now = new Date();
    const diff = end - now;

    if (diff <= 0) {
        return { totalMs: 0, formatted: "Expired (Available)", expired: true };
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    if (hours > 0) {
        return { totalMs: diff, formatted: `${hours}h ${minutes}m ${seconds}s`, expired: false };
    }
    return { totalMs: diff, formatted: `${minutes}m ${seconds}s`, expired: false };
}

function startCountdownLoop() {
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
        let hasExpired = false;

        allPCsState.forEach(pc => {
            if (pc.status.toLowerCase() === "occupied" && pc.end_time) {
                const diff = calculateTimeRemaining(pc.end_time);
                const timerEl = document.getElementById(`timer-${pc.pc_id}`);
                if (timerEl) {
                    const strong = timerEl.querySelector("strong");
                    if (strong) strong.innerText = diff.formatted;
                }
                if (diff.expired) {
                    hasExpired = true;
                }
            }
        });

        if (hasExpired && (!window._lastExpiryReloadTime || (Date.now() - (window._lastExpiryReloadTime || 0) > 30000))) {
            window._lastExpiryReloadTime = Date.now();
            loadPCStatus(true);
        }
    }, 1000);
}

// ── Workstation Read-Only Inspection Modal ──
function handlePCClick(pcId) {
    if ((pcId || "").toUpperCase().trim() === "BACKEND") {
        showToast("🔒 AI Lab Core Backend Host: Read-Only System Node (Access Restricted).", "info");
        return;
    }

    const pc = allPCsState.find(p => p.pc_id.toUpperCase() === pcId.toUpperCase());
    if (!pc) return;

    const modal = document.getElementById("pc-details-modal");
    const title = document.getElementById("modal-pc-title");
    const desc = document.getElementById("modal-pc-desc");
    const body = document.getElementById("modal-pc-body");

    if (!modal) return;

    const isBackend = pc.pc_id === "BACKEND";
    const isFree = !isBackend && pc.status.toLowerCase() === "free";

    title.innerText = isBackend ? "🖥️ BACKEND SERVER DETAILS" : `💻 Workstation ${pc.pc_id}`;
    desc.innerText = isFree ? "Workstation is currently available for student/researcher assignment" : "Live session telemetry and occupant assignment";

    const occupants = pc.occupied_by ? pc.occupied_by.split(",").map(s => s.trim()).filter(Boolean) : [];

    let detailsHtml = "";
    if (isBackend) {
        detailsHtml = `
            <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 14px; margin-bottom: 12px;">
                <div style="font-weight: 700; color: #1e40af; font-size: 14px; margin-bottom: 4px;">⚡ Dedicated Host Machine</div>
                <div style="font-size: 12px; color: #3b82f6;">Runs FastAPI Core server, Biometric Attendance Engine, and Tunnel daemon.</div>
            </div>
            <div style="font-size: 13px; line-height: 1.8; color: var(--on-surface);">
                <div><strong>Role:</strong> Lab Server & Entrance Gate Host</div>
                <div><strong>Uptime:</strong> 24/7 Background System Service</div>
                <div><strong>Status:</strong> <span class="badge badge-success" style="font-size: 11px;">ACTIVE</span></div>
            </div>
        `;
    } else if (isFree) {
        detailsHtml = `
            <div style="text-align: center; padding: 24px 14px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px;">
                <div style="font-size: 32px; margin-bottom: 8px;">🟢</div>
                <div style="font-size: 16px; font-weight: 700; color: #166534;">Workstation Available</div>
                <div style="font-size: 13px; color: #15803d; margin-top: 4px;">This computer is currently unallocated and ready for AI/ML development.</div>
            </div>
        `;
    } else {
        const timeDiff = pc.end_time ? calculateTimeRemaining(pc.end_time).formatted : "Active Session";
        detailsHtml = `
            <div style="background: var(--surface-variant); border: 1px solid var(--border); border-radius: 8px; padding: 14px; margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <span class="badge badge-occupied" style="font-weight: 700;">🔴 IN USE</span>
                    <span style="font-size: 12px; font-weight: 700; color: #b91c1c;">⏳ ${timeDiff}</span>
                </div>
                <div style="font-size: 13px; line-height: 1.7; color: var(--on-surface);">
                    <div><strong>Occupant(s):</strong> ${escapeHtml(pc.occupied_by || 'Unknown')}</div>
                    ${pc.user_role ? `<div><strong>Category:</strong> ${escapeHtml(pc.user_role)}</div>` : ''}
                    ${pc.current_project ? `<div><strong>Project:</strong> <span style="color: #4338ca; font-weight: 600;">${escapeHtml(pc.current_project)}</span></div>` : ''}
                    ${pc.user_email ? `<div><strong>Email:</strong> ${escapeHtml(pc.user_email)}</div>` : ''}
                    <div><strong>Since:</strong> ${formatFriendlyDate(pc.since_time)} at ${formatFriendlyTime(pc.since_time)}</div>
                    ${pc.end_time ? `<div><strong>Valid Until:</strong> ${formatFriendlyDateTime(pc.end_time)}</div>` : ''}
                </div>
            </div>
        `;
    }

    const isOnline = pc.is_online === 1 || pc.is_online === true;
    const onlineBadge = isOnline 
        ? `<span class="badge" style="background: rgba(34, 197, 94, 0.15); color: #16a34a; font-weight: 700; border: 1px solid rgba(34, 197, 94, 0.3);">🟢 Online & Active</span>`
        : `<span class="badge" style="background: rgba(100, 116, 139, 0.15); color: #64748b; font-weight: 700; border: 1px solid rgba(100, 116, 139, 0.3);">⚫ Offline (Powered Down)</span>`;

    const telemetryReport = `
        <div style="margin-top: 14px; padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span style="font-size: 12px; font-weight: 700; color: #1e293b;">⚡ Live Hardware Telemetry</span>
                ${onlineBadge}
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px;">
                <div style="padding: 6px 8px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px;">
                    <div style="color: #64748b; font-size: 10px; font-weight: 600;">CPU LOAD</div>
                    <div style="font-size: 14px; font-weight: 700; color: ${pc.cpu_percent > 80 ? '#dc2626' : '#0f172a'};">${pc.cpu_percent || 0}%</div>
                </div>
                <div style="padding: 6px 8px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px;">
                    <div style="color: #64748b; font-size: 10px; font-weight: 600;">RAM USAGE</div>
                    <div style="font-size: 14px; font-weight: 700; color: #4338ca;">${pc.ram_percent || 0}% <span style="font-size: 11px; font-weight: 500; color: #64748b;">(${pc.ram_used_gb || 0}/${pc.ram_total_gb || 0} GB)</span></div>
                </div>
            </div>
            ${(pc.gpu_name || isOnline || (pc.gpu_percent > 0) || (pc.gpu_temp > 0)) ? `
                <div style="margin-top: 8px; padding: 8px 10px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="color: #64748b; font-size: 10px; font-weight: 700; text-transform: uppercase;">🎮 GPU ACCELERATOR</span>
                        ${(pc.gpu_temp || 0) > 0 ? `
                            <span style="background: ${pc.gpu_temp > 75 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)'}; color: ${pc.gpu_temp > 75 ? '#dc2626' : '#d97706'}; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 700;">
                                🔥 ${pc.gpu_temp}°C
                            </span>
                        ` : ''}
                    </div>
                    <div style="font-weight: 700; color: #0284c7; margin-top: 2px;">${escapeHtml(pc.gpu_name || 'Dedicated Lab GPU')}</div>
                    <div style="font-size: 11px; color: #475569; margin-top: 4px; display: flex; justify-content: space-between;">
                        <span>Utilization: <strong style="color: #0f172a;">${pc.gpu_percent || 0}%</strong></span>
                        <span>VRAM: <strong style="color: #0f172a;">${Math.round(pc.gpu_vram_used_mb || 0)} / ${Math.round(pc.gpu_vram_total_mb || 0)} MB</strong></span>
                    </div>
                    <div style="width: 100%; height: 5px; background: #e2e8f0; border-radius: 3px; overflow: hidden; margin-top: 6px;">
                        <div style="width: ${Math.min(100, pc.gpu_percent || 0)}%; height: 100%; background: linear-gradient(90deg, #0284c7, #0369a1); border-radius: 3px;"></div>
                    </div>
                </div>
            ` : ''}
            <div style="margin-top: 8px; font-size: 11px; color: #64748b; display: flex; justify-content: space-between;">
                <span>${pc.ip_address ? `🌐 IP: ${escapeHtml(pc.ip_address)}` : ''}</span>
                <span>${pc.last_heartbeat ? `Heartbeat: ${escapeHtml(pc.last_heartbeat)}` : 'No recent signal'}</span>
            </div>
        </div>
    `;

    body.innerHTML = detailsHtml + telemetryReport;
    modal.style.display = "flex";
}

function closePCDetailsModal(event) {
    const modal = document.getElementById("pc-details-modal");
    if (modal) modal.style.display = "none";
}

// ── STUDENT RESEARCH PROJECTS (READ-ONLY) ──

async function loadStudentProjects() {
    if (!BASE_URL) return;
    try {
        const data = await apiFetch("/api/projects");
        allProjectsData = Array.isArray(data) ? data : (data.projects || []);
        updateProjectMetrics();
        filterProjectsList(currentProjectFilter);
    } catch (e) {
        console.error("Failed to load student projects", e);
        const grid = document.getElementById("projects-grid");
        if (grid && (!allProjectsData || allProjectsData.length === 0)) {
            grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--on-surface-variant);">⚠️ Could not load projects. Please verify connection.</div>`;
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
                <div style="font-size: 13px; color: var(--on-surface-variant);">Adjust filters to view lab research records.</div>
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
                        <p style="margin: 0; font-size: 12.5px; color: var(--on-surface-variant); line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; transition: all 0.3s ease;">
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

                <!-- Footer External Links (Read-Only) -->
                <div style="display: flex; gap: 8px; align-items: center; justify-content: flex-start; padding-top: 12px; border-top: 1px solid var(--border); flex-wrap: wrap;">
                    ${proj.deployment_url ? `
                        <a href="${escapeHtml(proj.deployment_url)}" target="_blank" class="btn btn-primary" style="font-size: 11px; padding: 5px 10px; text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">
                            🌐 Live Deployment ↗
                        </a>
                    ` : ''}
                    ${proj.github_url ? `
                        <a href="${escapeHtml(proj.github_url)}" target="_blank" class="btn btn-secondary" style="font-size: 11px; padding: 5px 10px; text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">
                            💻 GitHub Repo ↗
                        </a>
                    ` : ''}
                    ${proj.report_url ? `
                        <a href="${escapeHtml(proj.report_url)}" target="_blank" class="btn btn-secondary" style="font-size: 11px; padding: 5px 10px; text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">
                            📄 Research Report ↗
                        </a>
                    ` : ''}
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

// ── ATTENDANCE LOGS (READ-ONLY) ──

async function loadAttendance() {
    if (!BASE_URL) return;
    const date = document.getElementById("filter-date")?.value;
    const name = document.getElementById("filter-name")?.value;
    
    let url = "/attendance/logs?";
    if (date) url += `date=${date}&`;
    if (name) url += `name=${encodeURIComponent(name)}&`;

    try {
        const data = await apiFetch(url);
        renderAttendanceTable(data);
    } catch(e) {
        const tbody = document.getElementById("attendance-tbody");
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--error);">Error loading attendance: ${e.message}</td></tr>`;
        }
    }
}

function renderAttendanceTable(logs) {
    const tbody = document.getElementById("attendance-tbody");
    if (!tbody) return;

    if (!logs || logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 24px; color: var(--on-surface-variant);">No attendance logs found for selected filters.</td></tr>';
        return;
    }

    tbody.innerHTML = logs.map(row => {
        const role = row.user_type || "Student";
        const roleBadgeClass = role.toLowerCase() === "faculty" ? "badge-role-faculty" : role.toLowerCase() === "guest" ? "badge-role-guest" : "badge-role-student";
        const roleIcon = role.toLowerCase() === "faculty" ? "👨‍🏫" : role.toLowerCase() === "guest" ? "👤" : "🎓";

        return `
            <tr>
                <td><strong>${escapeHtml(row.name)}</strong></td>
                <td><span class="role-badge ${roleBadgeClass}">${roleIcon} ${escapeHtml(role)}</span></td>
                <td><span style="color: #4338ca; font-weight: 500;">${escapeHtml(row.project || "General Lab Work")}</span></td>
                <td><span class="badge badge-success">${escapeHtml(row.in_time || "N/A")}</span></td>
                <td><span class="badge ${row.out_time ? 'badge-warning' : ''}">${escapeHtml(row.out_time || "Active in Lab")}</span></td>
                <td>${escapeHtml(row.date)}</td>
            </tr>
        `;
    }).join("");
}

async function downloadAttendanceCSV() {
    if (!BASE_URL) return;
    try {
        const logs = await apiFetch("/attendance/logs");
        if (!logs || logs.length === 0) {
            showToast("No attendance logs found to download.", "info");
            return;
        }

        let csv = "ID,Name,User Type,Project,IN Time,OUT Time,Date\n";
        logs.forEach(l => {
            csv += `"${l.id || ''}","${l.name || ''}","${l.user_type || 'Student'}","${l.project || ''}","${l.in_time || ''}","${l.out_time || ''}","${l.date || ''}"\n`;
        });

        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `AI_LAB_Attendance_${new Date().toISOString().split("T")[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        showToast("Attendance CSV downloaded successfully!", "success");
    } catch (e) {
        showToast("Failed to download CSV: " + e.message, "error");
    }
}

// ── REGISTERED MEMBERS DIRECTORY (READ-ONLY) ──

async function loadRegisteredFaces() {
    if (!BASE_URL) return;
    const grid = document.getElementById("registered-grid");
    const countBadge = document.getElementById("nav-reg-count");
    if (!grid) return;

    try {
        const data = await apiFetch("/api/registered_users");
        registeredUsersList = data.users || [];
        
        if (countBadge) countBadge.innerText = registeredUsersList.length;

        // Update category counts
        const allCnt = registeredUsersList.length;
        const stuCnt = registeredUsersList.filter(u => (u.role || "Student").toLowerCase() === "student").length;
        const facCnt = registeredUsersList.filter(u => (u.role || "").toLowerCase() === "faculty").length;
        const gstCnt = registeredUsersList.filter(u => (u.role || "").toLowerCase() === "guest").length;

        document.getElementById("cat-count-all") && (document.getElementById("cat-count-all").innerText = allCnt);
        document.getElementById("cat-count-students") && (document.getElementById("cat-count-students").innerText = stuCnt);
        document.getElementById("cat-count-faculty") && (document.getElementById("cat-count-faculty").innerText = facCnt);
        document.getElementById("cat-count-guests") && (document.getElementById("cat-count-guests").innerText = gstCnt);

        filterRegisteredUsers();
    } catch(e) {
        console.error("Failed to load registered users", e);
    }
}

let currentDeptFilter = "all";

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

function selectUserDept(dept) {
    currentDeptFilter = dept;
    document.querySelectorAll(".dept-chip-btn").forEach(btn => {
        if (btn.dataset.dept.toLowerCase() === dept.toLowerCase()) {
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

    if (currentDeptFilter !== "all") {
        const selDept = currentDeptFilter.toLowerCase();
        filtered = filtered.filter(u => {
            const uDept = (u.department || "").toLowerCase();
            return uDept === selDept || uDept.includes(selDept.replace("b.tech ", "").trim());
        });
    }

    if (filtered.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--on-surface-variant);">No members found matching selected filters.</div>`;
        return;
    }

    grid.innerHTML = filtered.map(user => {
        const role = user.role || "Student";
        const fallbackAvatar = getInitialsAvatarSVG(user.name, role);
        const avatarUrl = user.avatar_base64 || (user.avatar_url ? `${BASE_URL}${user.avatar_url}` : fallbackAvatar);
        const roleBadgeClass = role.toLowerCase() === "faculty" ? "badge-role-faculty" : role.toLowerCase() === "guest" ? "badge-role-guest" : "badge-role-student";
        const roleIcon = role.toLowerCase() === "faculty" ? "👨‍🏫" : role.toLowerCase() === "guest" ? "👤" : "🎓";

        return `
            <div class="student-card" style="box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
                <div class="student-card-top">
                    <img src="${avatarUrl}" class="student-avatar" alt="${escapeHtml(user.name)}" onerror="this.onerror=null; this.src='${fallbackAvatar}';">
                    <div class="student-info">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 6px;">
                            <h4 style="margin: 0; font-size: 15px;">${escapeHtml(user.name)}</h4>
                            <span class="role-badge ${roleBadgeClass}">${roleIcon} ${escapeHtml(role)}</span>
                        </div>
                        ${user.department ? `<p style="font-weight: 700; color: #0284c7; font-size: 11px; margin-top: 2px;">🏢 ${escapeHtml(user.department)}</p>` : ''}
                        ${user.roll_no ? `<p style="font-weight: 600; color: #475569; font-size: 11px; margin-top: 2px;">🆔 ${escapeHtml(user.roll_no)}</p>` : ''}
                        <p style="margin-top: 2px;">${user.email ? `✉️ ${escapeHtml(user.email)}` : '<span style="color: #94a3b8;">No email saved</span>'}</p>
                        <small style="color: #94a3b8; font-size: 11px;">Enrolled: ${user.created_at ? user.created_at.split(" ")[0] : 'Active'}</small>
                    </div>
                </div>
            </div>
        `;
    }).join("");
}

function filterRegisteredUsers() {
    const q = (document.getElementById("search-reg-input")?.value || "").toLowerCase();
    const filtered = registeredUsersList.filter(u => {
        const matchesQuery = u.name.toLowerCase().includes(q) || 
                             (u.email && u.email.toLowerCase().includes(q)) ||
                             (u.roll_no && u.roll_no.toLowerCase().includes(q)) ||
                             (u.department && u.department.toLowerCase().includes(q)) ||
                             (u.role && u.role.toLowerCase().includes(q));
        return matchesQuery;
    });
    renderRegisteredUsersGrid(filtered);
}

// ── UNWANTED VISITORS & INTRUDERS (VIEW ONLY) ──

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
                    <div class="unknown-img-wrap" onclick="openLightbox('${imgUrl}', '${escapeHtml(face.filename)}', '${escapeHtml(face.timestamp)}', '${escapeHtml(face.date)}')">
                        <img src="${imgUrl || fallbackSnapshot}" alt="Intruder Snapshot" onerror="this.onerror=null; this.src='${fallbackSnapshot}';">
                    </div>
                    <div class="unknown-meta">
                        <strong>Captured:</strong> ${escapeHtml(face.timestamp)}<br>
                        <p>Date: ${escapeHtml(face.date)}</p>
                    </div>
                    <div class="unknown-actions">
                        <button class="btn btn-secondary" style="width: 100%; font-size: 11px; padding: 5px 6px;" onclick="openLightbox('${imgUrl}', '${escapeHtml(face.filename)}', '${escapeHtml(face.timestamp)}', '${escapeHtml(face.date)}')">
                            🔍 Zoom & Inspect
                        </button>
                    </div>
                </div>
            `;
        }).join("");
    } catch(e) {
        grid.innerHTML = `<p style="color:red; grid-column: 1/-1;">Error loading unknown faces: ${e.message}</p>`;
    }
}

function openLightbox(url, filename, timestamp, date) {
    const modal = document.getElementById("lightbox-modal");
    const img = document.getElementById("lightbox-img");
    const meta = document.getElementById("lightbox-meta");

    if (!modal) return;
    img.src = url;
    meta.innerHTML = `<strong>Snapshot:</strong> ${escapeHtml(filename)} &bull; <strong>Time:</strong> ${escapeHtml(timestamp)} &bull; <strong>Date:</strong> ${escapeHtml(date)}`;
    modal.style.display = "flex";
}

function closeLightbox(event) {
    const modal = document.getElementById("lightbox-modal");
    if (modal) modal.style.display = "none";
}

// ── GATE CAMERA LIVE STREAM (VIEW-ONLY) ──

async function loadGateCameraStatusFromPortal() {
    if (!BASE_URL) return;
    try {
        const data = await apiFetch("/api/camera/status");
        const pill = document.getElementById("portal-cam-pill");
        if (pill) {
            if (data.is_running) {
                pill.innerText = "LIVE";
                pill.style.background = "#22c55e";
            } else {
                pill.innerText = "OFF";
                pill.style.background = "#64748b";
            }
        }
    } catch (e) {
        console.error("Camera status error:", e);
    }
}

function openGateCameraModal() {
    const modal = document.getElementById("gate-camera-modal");
    if (!modal) return;
    modal.style.display = "flex";

    const streamImg = document.getElementById("portal-camera-stream");
    const fallback = document.getElementById("portal-camera-fallback");
    if (streamImg && BASE_URL) {
        streamImg.src = `${BASE_URL}/video_feed?t=${Date.now()}`;
        streamImg.style.display = "block";
        if (fallback) fallback.style.display = "none";
    }
}

function closeGateCameraModal(event) {
    const modal = document.getElementById("gate-camera-modal");
    if (modal) modal.style.display = "none";
    const streamImg = document.getElementById("portal-camera-stream");
    if (streamImg) streamImg.src = ""; // Stop stream download
}

function handleStreamImageError() {
    const streamImg = document.getElementById("portal-camera-stream");
    const fallback = document.getElementById("portal-camera-fallback");
    if (streamImg) streamImg.style.display = "none";
    if (fallback) fallback.style.display = "block";
}

// ── TOAST NOTIFICATIONS ──
function showToast(message, type = "info") {
    let container = document.getElementById("toast-container");
    if (!container) return;
    
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.innerText = message;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = "0";
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
