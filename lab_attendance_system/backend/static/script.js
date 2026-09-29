// ═════════════════════════════════════════════════════════════════
// AI/ML LAB MASTER OPERATIONS DASHBOARD — ROOT JAVASCRIPT
// High-Speed Administrative & Security Command Hub
// ═════════════════════════════════════════════════════════════════

let pcDataList = [];
let registeredUsersList = [];
let currentAllotRole = "Student";
let currentRegRole = "Student";
let currentDirCategory = "all";
let capturedBase64ForEnroll = null;
let currentLightboxFilename = null;

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
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><defs><linearGradient id="gb_${initials}" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${col1}"/><stop offset="100%" stop-color="${col2}"/></linearGradient></defs><circle cx="60" cy="60" r="58" fill="url(#gb_${initials})"/><text x="60" y="74" font-size="44" font-weight="700" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif" fill="#ffffff" text-anchor="middle" dominant-baseline="middle">${initials}</text></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function getPlaceholderFaceSVG(text = "Snapshot") {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200"><rect width="100%" height="100%" fill="#1e293b"/><circle cx="150" cy="75" r="32" fill="#334155"/><path d="M 115 140 Q 150 110 185 140 Z" fill="#334155"/><text x="150" y="170" font-size="13" font-weight="600" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif" fill="#94a3b8" text-anchor="middle">${text}</text></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// ── DOM Ready ──
document.addEventListener("DOMContentLoaded", () => {
    populateMembersDatalist();
    initTabs();
    initClock();
    initAllotDefaults();

    // Set today in filter
    const today = new Date().toISOString().split("T")[0];
    const filterDateInput = document.getElementById("filter-date");
    if (filterDateInput) filterDateInput.value = today;

    // Initial Data Loads
    loadPCStatus();
    loadAttendance();
    loadUnknownFaces();
    loadRegisteredFaces();
    loadTimetable();
    loadGateCameraStatus();

    // Auto-refresh PC status & Gate stats every 6 seconds
    setInterval(() => {
        loadPCStatus(true);
        refreshGateStats();
    }, 6000);
});

// ═════════════════════════════════════════════════════════════════
// TAB NAVIGATION
// ═════════════════════════════════════════════════════════════════
function initTabs() {
    const tabs = document.querySelectorAll(".tab-btn");
    tabs.forEach(btn => {
        btn.addEventListener("click", () => {
            tabs.forEach(t => t.classList.remove("active"));
            document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));

            btn.classList.add("active");
            const tabId = "tab-" + btn.dataset.tab;
            const targetContent = document.getElementById(tabId);
            if (targetContent) targetContent.classList.add("active");

            if (btn.dataset.tab === "pc-status") loadPCStatus();
            else if (btn.dataset.tab === "projects") loadBackendProjects();
            else if (btn.dataset.tab === "attendance") loadAttendance();
            else if (btn.dataset.tab === "unknown-faces") loadUnknownFaces();
            else if (btn.dataset.tab === "registered-faces") loadRegisteredFaces();
            else if (btn.dataset.tab === "gate-cam") reloadCameraFeed();
            else if (btn.dataset.tab === "timetable") loadTimetable();
        });
    });
}

function switchTab(tabName) {
    const btn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
    if (btn) btn.click();
}

function initClock() {
    const clockEl = document.getElementById("stream-clock");
    setInterval(() => {
        if (clockEl) {
            clockEl.innerText = new Date().toLocaleTimeString();
        }
    }, 1000);
}

// ═════════════════════════════════════════════════════════════════
// OFFLINE & UNUPDATED STATUS HELPER
// ═════════════════════════════════════════════════════════════════
function setOfflineStatus(isOffline, syncTime = "") {
    const badge = document.getElementById("connection-badge");
    let unupdatedBadge = document.getElementById("corner-unupdated-badge");
    
    if (!unupdatedBadge) {
        unupdatedBadge = document.createElement("div");
        unupdatedBadge.id = "corner-unupdated-badge";
        unupdatedBadge.className = "corner-unupdated-badge";
        document.body.appendChild(unupdatedBadge);
    }

    if (isOffline) {
        const timeDisplay = syncTime || "Previous Session";
        if (badge) {
            badge.innerText = `⚠️ Unupdated (Offline • ${timeDisplay})`;
            badge.className = "badge badge-unupdated";
        }
        unupdatedBadge.innerHTML = `<span>⚠️</span> <span><strong>Unupdated</strong> &bull; Showing last saved allotment (${timeDisplay})</span>`;
        unupdatedBadge.style.display = "flex";
    } else {
        if (badge) {
            badge.innerText = "🟢 Backend Active";
            badge.className = "badge badge-connected";
        }
        unupdatedBadge.style.display = "none";
    }
}

// ═════════════════════════════════════════════════════════════════
// API FETCH HELPER (HITS SAME ORIGIN FASTAPI BACKEND)
// ═════════════════════════════════════════════════════════════════
async function apiFetch(endpoint, options = {}) {
    const defaultHeaders = { "ngrok-skip-browser-warning": "true" };
    if (options.body) defaultHeaders["Content-Type"] = "application/json";

    const resp = await fetch(endpoint, {
        ...options,
        cache: "no-store",
        headers: { ...defaultHeaders, ...(options.headers || {}) }
    });
    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`API ${resp.status}: ${text}`);
    }
    return resp.json();
}

// ═════════════════════════════════════════════════════════════════
// TAB 1: LIVE GATE CAMERA & INTRUDER DETECTION
// ═════════════════════════════════════════════════════════════════
function reloadCameraFeed() {
    const img = document.getElementById("gate-video-stream");
    const fallback = document.getElementById("stream-fallback-msg");
    if (img) {
        img.style.display = "block";
        if (fallback) fallback.style.display = "none";
        img.src = `/video_feed?t=${Date.now()}`;
    }
}

async function toggleGateCameraPower() {
    try {
        const res = await apiFetch("/api/camera/toggle", { method: "POST" });
        updateGateCameraPowerUI(res.enabled);
        showToast(res.message || "Camera power toggled", "info");
        setTimeout(reloadCameraFeed, 400);
    } catch (e) {
        showToast("Failed to toggle camera: " + e.message, "error");
    }
}

async function loadGateCameraStatus() {
    try {
        const res = await apiFetch("/api/camera/status");
        updateGateCameraPowerUI(res.enabled);
    } catch (e) {}
}

function updateGateCameraPowerUI(isEnabled) {
    const mainBtn = document.getElementById("gate-camera-power-btn");
    const miniBtn = document.getElementById("stream-mini-toggle-btn");
    const recDot = document.getElementById("stream-rec-dot");
    const recLabel = document.getElementById("stream-rec-label");

    if (isEnabled) {
        if (mainBtn) {
            mainBtn.innerHTML = "🟢 Camera: ON";
            mainBtn.style.color = "#15803d";
            mainBtn.style.borderColor = "#86efac";
            mainBtn.style.background = "#f0fdf4";
        }
        if (miniBtn) {
            miniBtn.innerHTML = "🛑 Turn OFF";
            miniBtn.style.color = "#dc2626";
        }
        if (recDot) recDot.style.background = "#ef4444";
        if (recLabel) recLabel.innerText = "LIVE GATE SURVEILLANCE";
    } else {
        if (mainBtn) {
            mainBtn.innerHTML = "🔴 Camera: OFF";
            mainBtn.style.color = "#dc2626";
            mainBtn.style.borderColor = "#fca5a5";
            mainBtn.style.background = "#fef2f2";
        }
        if (miniBtn) {
            miniBtn.innerHTML = "▶️ Turn ON";
            miniBtn.style.color = "#15803d";
        }
        if (recDot) recDot.style.background = "#94a3b8";
        if (recLabel) recLabel.innerText = "GATE CAMERA PAUSED (OFF)";
    }
}

function handleStreamError(img) {
    img.style.display = "none";
    const fallback = document.getElementById("stream-fallback-msg");
    if (fallback) fallback.style.display = "block";
}

async function triggerKioskScan() {
    const msgEl = document.getElementById("kiosk-status-message");
    if (msgEl) msgEl.innerText = "Scanning face at gate camera...";

    try {
        const res = await apiFetch("/api/scan_entry", { method: "POST" });
        if (msgEl) msgEl.innerText = res.message || "Face processed successfully!";
        await loadAttendance();
        await refreshGateStats();
    } catch (err) {
        if (msgEl) msgEl.innerText = "⚠️ " + err.message;
    }
}

async function refreshGateStats() {
    try {
        const unknowns = await apiFetch("/unknown_faces");
        const gateIntruderCount = document.getElementById("gate-intruder-count");
        const navUnknownCount = document.getElementById("nav-unknown-count");
        if (gateIntruderCount) gateIntruderCount.innerText = unknowns.length;
        if (navUnknownCount) navUnknownCount.innerText = unknowns.length;

        // Render Recent Intruder Snapshots strip
        const strip = document.getElementById("gate-recent-intruders");
        if (strip) {
            if (unknowns.length === 0) {
                strip.innerHTML = '<p style="font-size: 12px; color: var(--on-surface-variant); padding: 10px 0;">No unauthorized intruders detected today. 🎉</p>';
            } else {
                const recentSlice = unknowns.slice(0, 4);
                const fallbackThumb = getPlaceholderFaceSVG("Face");
                strip.innerHTML = recentSlice.map(face => `
                    <div class="intruder-strip-item" onclick="openLightbox('${face.url}', '${face.filename}', '${face.timestamp}', '${face.date}')">
                        <img src="${face.url}" alt="Intruder" onerror="this.onerror=null; this.src='${fallbackThumb}';">
                        <div>
                            <strong style="font-size: 12px; color: #dc2626;">⚠️ Alert: ${face.filename}</strong>
                            <div style="font-size: 11px; color: #64748b;">Time: ${face.timestamp}</div>
                        </div>
                    </div>
                `).join("");
            }
        }
    } catch (e) {
        // silent sync
    }
}

// ═════════════════════════════════════════════════════════════════
// TAB 2: WORKSTATION TRACKER & FROM-TO RANGE ALLOTMENT
// ═════════════════════════════════════════════════════════════════
async function loadPCStatus(silent = false) {
    try {
        const data = await apiFetch("/pc/status");
        pcDataList = data;
        
        // Save latest allotment to localStorage
        const syncTimeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        localStorage.setItem("lab_cached_master_pc_status", JSON.stringify(pcDataList));
        localStorage.setItem("lab_cached_master_sync_time", syncTimeStr);

        setOfflineStatus(false);

        renderPCGrid(data);
        populatePCSelect(data);

        // Update counts
        const freeCount = data.filter(p => p.status.toLowerCase() === "free").length;
        const occupiedCount = data.filter(p => p.status.toLowerCase() === "occupied").length;

        document.getElementById("free-pcs").innerText = freeCount;
        document.getElementById("occupied-pcs").innerText = occupiedCount;

        const gateActive = document.getElementById("gate-active-count");
        if (gateActive) gateActive.innerText = occupiedCount;
    } catch (e) {
        if (!silent) console.error("Error loading PC status:", e);

        // Backend down: restore last cached allotment state
        const cached = localStorage.getItem("lab_cached_master_pc_status");
        const syncTime = localStorage.getItem("lab_cached_master_sync_time") || "Previous Session";

        if (cached) {
            try {
                pcDataList = JSON.parse(cached);
                renderPCGrid(pcDataList);
                populatePCSelect(pcDataList);

                const freeCount = pcDataList.filter(p => p.status.toLowerCase() === "free").length;
                const occupiedCount = pcDataList.filter(p => p.status.toLowerCase() === "occupied").length;

                const fPcs = document.getElementById("free-pcs");
                const oPcs = document.getElementById("occupied-pcs");
                if (fPcs) fPcs.innerText = freeCount;
                if (oPcs) oPcs.innerText = occupiedCount;
            } catch (err) {
                console.error("Failed to parse cached master PCs", err);
            }
        }

        setOfflineStatus(true, syncTime);
    }
}

function renderPCGrid(pcs) {
    const grid = document.getElementById("pc-grid");
    if (!grid) return;

    grid.innerHTML = pcs.map(p => {
        const isBackend = p.pc_id === "BACKEND";
        const isFree = !isBackend && p.status.toLowerCase() === "free";
        const occupants = p.occupied_by ? p.occupied_by.split(",").map(s => s.trim()).filter(Boolean) : [];
        const isGroup = occupants.length > 1;

        const role = p.user_role || "Student";
        const roleClass = role.toLowerCase() === "faculty" ? "badge-role-faculty" : role.toLowerCase() === "guest" ? "badge-role-guest" : "badge-role-student";
        const displayTitle = isBackend ? "🖥️ BACKEND SERVER" : p.pc_id;

        return `
            <div class="pc-card ${isBackend ? 'pc-occupied' : isFree ? 'pc-free' : 'pc-occupied'}" 
                 style="${isBackend ? 'border: 2px solid #3b82f6; background: #f8fafc;' : ''}"
                 onclick="selectPCForManagement('${p.pc_id}')">
                <div class="pc-header">
                    <span class="pc-name" style="${isBackend ? 'color: #1d4ed8; font-weight: 800;' : ''}">${displayTitle}</span>
                    <span class="pc-status-pill ${isBackend ? 'pill-occupied' : isFree ? 'pill-free' : 'pill-occupied'}" style="${isBackend ? 'background: #2563eb; color: #fff;' : ''}">
                        ${isBackend ? '⚡ 24/7 Host' : isFree ? '🟢 Free' : '🔴 Occupied'}
                    </span>
                </div>
                <div class="pc-body">
                    ${isBackend ? `
                        <p class="pc-user" style="color: #1e40af; font-weight: 700; margin-bottom: 2px;">24/7 Dedicated Server Host</p>
                        <p style="font-size: 11px; color: #4338ca; font-weight: 600; margin: 3px 0; background: #eef2ff; padding: 2px 6px; border-radius: 4px; display: inline-block;">
                            💼 ${p.current_project || 'FastAPI Core & Ngrok Tunnel'}
                        </p>
                        <p style="font-size: 11px; color: #059669; font-weight: 600;">Status: Active & Serving Requests</p>
                    ` : isFree ? `
                        <p class="pc-user" style="color: #64748b;">Available for Allotment</p>
                        <small style="color: #94a3b8; font-size: 11px;">Click to assign slot</small>
                    ` : `
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                            ${isGroup ? `
                                <strong style="color: #0f172a; font-size: 13px;">👥 Group (${occupants.length})</strong>
                                <span class="role-badge" style="background: #e0e7ff; color: #3730a3;">Team</span>
                            ` : `
                                <strong style="color: #0f172a; font-size: 14px;">${p.occupied_by}</strong>
                                <span class="role-badge ${roleClass}">${role}</span>
                            `}
                        </div>
                        ${isGroup ? `
                            <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 4px;">
                                ${occupants.map(n => `<span style="background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; font-size: 11px; font-weight: 600; padding: 1px 6px; border-radius: 8px;">👤 ${n}</span>`).join("")}
                            </div>
                        ` : ''}
                        ${p.current_project ? `
                            <p style="font-size: 11px; color: #4338ca; font-weight: 600; margin: 3px 0; background: #eef2ff; padding: 2px 6px; border-radius: 4px; display: inline-block;">
                                💼 ${p.current_project}
                            </p>
                        ` : ''}
                        <p style="font-size: 11px; color: #475569; margin-bottom: 2px;">⏰ Started: ${p.since_time ? p.since_time.split(" ")[1] : 'N/A'}</p>
                        <p style="font-size: 11px; color: #dc2626; font-weight: 600;">⏳ Valid until: ${p.end_time ? p.end_time.split(" ")[1] : 'Open slot'}</p>
                    `}
                </div>
            </div>
        `;
    }).join("");
}

function populatePCSelect(pcs) {
    const select = document.getElementById("pc-select");
    if (!select) return;

    const currentVal = select.value;
    select.innerHTML = '<option value="">-- Choose Workstation --</option>';
    pcs.forEach(p => {
        const isBackend = p.is_backend || p.pc_id === "PC-1" || p.pc_id === "BACKEND";
        const opt = document.createElement("option");
        opt.value = p.pc_id;
        const nameLabel = isBackend ? `🖥️ BACKEND SERVER (${p.pc_id})` : p.pc_id;
        opt.innerText = `${nameLabel} (${p.status.toUpperCase()}${p.occupied_by ? ` - ${p.occupied_by}` : ''})`;
        select.appendChild(opt);
    });
    if (currentVal) select.value = currentVal;
}

function selectPCForManagement(pcId) {
    const select = document.getElementById("pc-select");
    if (select) {
        select.value = pcId;
        onPCSelectChanged();
        select.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function onPCSelectChanged() {
    const select = document.getElementById("pc-select");
    const pcId = select.value;
    if (!pcId) return;

    const pc = pcDataList.find(p => p.pc_id === pcId);
    if (pc && pc.status.toLowerCase() === "occupied") {
        document.getElementById("allot-name").value = pc.occupied_by || "";
        document.getElementById("allot-email").value = pc.user_email || "";
        selectAllotRole(pc.user_role || "Student");
    }
}

function selectAllotRole(role) {
    currentAllotRole = role || "Student";
    document.querySelectorAll("[data-allotrole]").forEach(btn => {
        if (btn.dataset.allotrole === currentAllotRole) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });

    const label = document.getElementById("allot-name-label");
    const input = document.getElementById("allot-name");
    if (currentAllotRole === "Student") {
        if (label) label.innerText = "Student Full Name:";
        if (input) input.placeholder = "e.g. Ayush, Priya (or select from list)";
    } else if (currentAllotRole === "Faculty") {
        if (label) label.innerText = "Faculty Name & Title:";
        if (input) input.placeholder = "e.g. Dr. Sharma, Prof. Verma";
    } else if (currentAllotRole === "Guest") {
        if (label) label.innerText = "Guest / Visitor Name:";
        if (input) input.placeholder = "e.g. Rahul (Visiting Scholar)";
    }
}

function initAllotDefaults() {
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];

    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');

    const future = new Date(now.getTime() + 30 * 60 * 1000);
    const futHh = String(future.getHours()).padStart(2, '0');
    const futMm = String(future.getMinutes()).padStart(2, '0');

    const dFrom = document.getElementById("allot-date-from");
    const dTo = document.getElementById("allot-date-to");
    const tFrom = document.getElementById("allot-time-from");
    const tTo = document.getElementById("allot-time-to");

    if (dFrom) dFrom.value = todayStr;
    if (dTo) dTo.value = todayStr;
    if (tFrom) tFrom.value = `${hh}:${mm}`;
    if (tTo) tTo.value = `${futHh}:${futMm}`;

    calcAllotRange();
}

function calcAllotRange() {
    const dFrom = document.getElementById("allot-date-from")?.value;
    const dTo = document.getElementById("allot-date-to")?.value;
    const tFrom = document.getElementById("allot-time-from")?.value;
    const tTo = document.getElementById("allot-time-to")?.value;

    const durBadge = document.getElementById("calc-duration-badge");
    const expBadge = document.getElementById("calc-expiry-badge");

    if (!dFrom || !dTo || !tFrom || !tTo) return;

    const start = new Date(`${dFrom}T${tFrom}:00`);
    const end = new Date(`${dTo}T${tTo}:00`);

    const diffMs = end - start;
    if (diffMs <= 0) {
        if (durBadge) {
            durBadge.innerText = "Invalid Range (End before Start)";
            durBadge.style.color = "#dc2626";
        }
        if (expBadge) expBadge.innerText = "End time must be after Start time";
        return;
    }

    const totalMins = Math.round(diffMs / 60000);
    const hrs = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    const durStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins} Mins`;

    if (durBadge) {
        durBadge.innerText = durStr;
        durBadge.style.color = "var(--primary)";
    }
    if (expBadge) {
        expBadge.innerText = `${dTo} at ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}`;
    }
}

function applyPreset(mins) {
    const dFrom = document.getElementById("allot-date-from")?.value || new Date().toISOString().split("T")[0];
    const tFrom = document.getElementById("allot-time-from")?.value || "12:00";
    const start = new Date(`${dFrom}T${tFrom}:00`);

    let target;
    if (mins === 'eod') {
        target = new Date(`${dFrom}T18:00:00`);
        if (target <= start) target.setDate(target.getDate() + 1);
    } else {
        target = new Date(start.getTime() + parseInt(mins) * 60 * 1000);
    }

    const dTo = document.getElementById("allot-date-to");
    const tTo = document.getElementById("allot-time-to");

    if (dTo) dTo.value = target.toISOString().split("T")[0];
    if (tTo) {
        const hh = String(target.getHours()).padStart(2, '0');
        const mm = String(target.getMinutes()).padStart(2, '0');
        tTo.value = `${hh}:${mm}`;
    }

    calcAllotRange();
}

async function submitWorkstationAllot() {
    const pcId = document.getElementById("pc-select").value;
    const name = document.getElementById("allot-name").value.trim();
    const email = document.getElementById("allot-email").value.trim();
    const sendEmail = document.getElementById("allot-send-email").checked;

    const dFrom = document.getElementById("allot-date-from").value;
    const dTo = document.getElementById("allot-date-to").value;
    const tFrom = document.getElementById("allot-time-from").value;
    const tTo = document.getElementById("allot-time-to").value;

    const msgEl = document.getElementById("allot-status-msg");

    if (!pcId) return alert("Please choose a Workstation (PC-1 to PC-10).");
    if (!name) return alert("Please enter the user/member name.");

    const startDt = new Date(`${dFrom}T${tFrom}:00`);
    const endDt = new Date(`${dTo}T${tTo}:00`);
    if (endDt <= startDt) return alert("End Time must be after Start Time.");

    const durationMins = Math.max(1, Math.round((endDt - startDt) / 60000));
    const startTimeStr = `${dFrom} ${tFrom}:00`;
    const endTimeStr = `${dTo} ${tTo}:00`;

    if (msgEl) msgEl.innerText = "Allocating workstation...";

    try {
        const res = await apiFetch("/pc/occupy", {
            method: "POST",
            body: JSON.stringify({
                pc_id: pcId,
                name: name,
                email: email,
                duration_mins: durationMins,
                start_time: startTimeStr,
                end_time: endTimeStr,
                send_email: sendEmail && !!email,
                user_role: currentAllotRole
            })
        });

        if (msgEl) msgEl.innerHTML = `<span style="color: #16a34a; font-weight: 700;">✅ ${pcId} assigned to ${name} (${currentAllotRole}) until ${tTo}!</span>`;
        await loadPCStatus();
    } catch (e) {
        if (msgEl) msgEl.innerHTML = `<span style="color: #dc2626; font-weight: 700;">❌ Allotment failed: ${e.message}</span>`;
    }
}

async function submitWorkstationFree() {
    const pcId = document.getElementById("pc-select").value;
    if (!pcId) return alert("Please choose a Workstation to mark Free.");

    if (!confirm(`Release and mark ${pcId} as FREE?`)) return;

    try {
        await apiFetch("/pc/free", {
            method: "POST",
            body: JSON.stringify({ pc_id: pcId })
        });
        alert(`${pcId} marked as FREE!`);
        await loadPCStatus();
    } catch (e) {
        alert("Error freeing PC: " + e.message);
    }
}

function copyTemplate(btn) {
    const body = btn.closest(".msg-template").querySelector(".msg-body").innerText;
    navigator.clipboard.writeText(body);
    btn.innerText = "✅ Copied!";
    setTimeout(() => btn.innerText = "📋 Copy", 2000);
}

// ═════════════════════════════════════════════════════════════════
// TAB 3: ATTENDANCE LOGS
// ═════════════════════════════════════════════════════════════════
async function loadAttendance() {
    const dateVal = document.getElementById("filter-date")?.value || "";
    const nameVal = document.getElementById("filter-name")?.value || "";
    const tbody = document.getElementById("attendance-tbody");

    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px;">Loading logs...</td></tr>';

    try {
        let url = "/attendance?";
        if (dateVal) url += `date=${encodeURIComponent(dateVal)}&`;
        if (nameVal) url += `name=${encodeURIComponent(nameVal)}`;

        const data = await apiFetch(url);
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--on-surface-variant); padding: 20px;">No attendance records found for this date.</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(log => `
            <tr>
                <td><strong>${log.name}</strong></td>
                <td>${log.is_known ? '<span style="color: #16a34a; font-weight: 700;">✓ Known Face</span>' : '<span style="color: #dc2626; font-weight: 700;">⚠ Unknown</span>'}</td>
                <td>${log.current_project ? `<span class="project-tag" style="background:#eef2ff; color:#4338ca; padding:3px 8px; border-radius:4px; font-weight:600; font-size:12px; display:inline-block; border:1px solid #c7d2fe;">🚀 ${log.current_project}</span>` : '<span style="color:#94a3b8; font-size:12px;">General AI/ML Research</span>'}</td>
                <td>${log.in_time ? log.in_time.split(" ")[1] : '-'}</td>
                <td>${log.out_time ? log.out_time.split(" ")[1] : '-'}</td>
                <td>${log.date}</td>
            </tr>
        `).join("");
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="6" style="color: red; text-align: center;">Error loading logs: ${e.message}</td></tr>`;
    }
}

function resetAttendanceFilter() {
    document.getElementById("filter-name").value = "";
    document.getElementById("filter-date").value = new Date().toISOString().split("T")[0];
    loadAttendance();
}

async function submitManualAttendance() {
    const name = document.getElementById("manual-name").value.trim();
    const action = document.getElementById("manual-action").value;
    const msg = document.getElementById("manual-message");

    if (!name) return alert("Please enter the attendee name.");

    try {
        await apiFetch("/attendance/manual", {
            method: "POST",
            body: JSON.stringify({ name, action })
        });
        if (msg) msg.innerHTML = `<span style="color: #16a34a; font-weight: 600;">Log recorded: ${name} marked ${action}.</span>`;
        document.getElementById("manual-name").value = "";
        await loadAttendance();
    } catch (e) {
        if (msg) msg.innerHTML = `<span style="color: #dc2626;">Error: ${e.message}</span>`;
    }
}

function exportAttendanceCSV() {
    window.open("/db/download/csv", "_blank");
}

// ═════════════════════════════════════════════════════════════════
// TAB 4: UNKNOWN FACES & INTRUDERS GALLERY
// ═════════════════════════════════════════════════════════════════
async function loadUnknownFaces() {
    const grid = document.getElementById("faces-grid");
    if (!grid) return;

    grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px;">Loading intruder captures...</div>';

    try {
        const data = await apiFetch("/unknown_faces");
        const countBadge = document.getElementById("nav-unknown-count");
        if (countBadge) countBadge.innerText = data.length;

        if (data.length === 0) {
            grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--on-surface-variant);">No unknown visitor faces detected. 🎉</div>';
            return;
        }

        grid.innerHTML = data.map(face => {
            const imgUrl = face.image_base64 || face.url;
            const fallbackSnapshot = getPlaceholderFaceSVG("No Photo");
            return `
            <div class="unknown-card">
                <div class="unknown-img-wrap" onclick="openLightbox('${imgUrl}', '${face.filename}', '${face.timestamp}', '${face.date}')">
                    <img src="${imgUrl}" alt="Intruder Snapshot" onerror="this.onerror=null; this.src='${fallbackSnapshot}';">
                </div>
                <div class="unknown-meta">
                    <strong>${face.filename}</strong><br>
                    <span>Time: ${face.timestamp} • Date: ${face.date}</span>
                </div>
                <div style="display: flex; gap: 6px; padding: 8px;">
                    <button class="btn btn-secondary" style="flex: 1; font-size: 11px; padding: 4px;" onclick="openLightbox('${face.url}', '${face.filename}', '${face.timestamp}', '${face.date}')">🔍 Zoom</button>
                    <button class="btn btn-danger" style="font-size: 11px; padding: 4px 8px;" onclick="deleteUnknownPhoto('${face.filename}')">🗑️</button>
                </div>
            </div>
            `;
        }).join("");
    } catch (e) {
        grid.innerHTML = `<p style="color: red; grid-column: 1/-1;">Error loading unknown faces: ${e.message}</p>`;
    }
}

function openLightbox(url, filename, timestamp, date) {
    currentLightboxFilename = filename;
    const modal = document.getElementById("lightbox-modal");
    if (!modal) return;

    document.getElementById("lightbox-img").src = url;
    document.getElementById("lightbox-meta").innerHTML = `<strong>Snapshot:</strong> ${filename} &bull; <strong>Captured:</strong> ${date} at ${timestamp}`;
    
    document.getElementById("lightbox-delete-btn").onclick = () => {
        deleteUnknownPhoto(filename);
        closeLightbox();
    };

    modal.style.display = "flex";
}

function closeLightbox() {
    const modal = document.getElementById("lightbox-modal");
    if (modal) modal.style.display = "none";
}

async function deleteUnknownPhoto(filename) {
    if (!confirm(`Delete snapshot ${filename}?`)) return;
    try {
        await apiFetch(`/unknown_faces/${encodeURIComponent(filename)}`, { method: "DELETE" });
        await loadUnknownFaces();
        await refreshGateStats();
    } catch (e) {
        alert("Delete failed: " + e.message);
    }
}

async function clearAllUnknownPhotos() {
    if (!confirm("Are you sure you want to clear ALL intruder face photos?")) return;
    try {
        await apiFetch("/api/unknown_faces/clear_all", { method: "DELETE" });
        alert("All unknown photos cleared.");
        await loadUnknownFaces();
        await refreshGateStats();
    } catch (e) {
        alert("Clear failed: " + e.message);
    }
}

// ═════════════════════════════════════════════════════════════════
// TAB 5: REGISTER MEMBER (FACE BIOMETRICS)
// ═════════════════════════════════════════════════════════════════
function selectRegRole(role) {
    currentRegRole = role || "Student";
    document.querySelectorAll("[data-regrole]").forEach(btn => {
        if (btn.dataset.regrole === currentRegRole) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });

    const nameLabel = document.getElementById("reg-name-label");
    const idLabel = document.getElementById("reg-id-label");
    const idInput = document.getElementById("enroll-roll-dept");

    if (currentRegRole === "Student") {
        if (nameLabel) nameLabel.innerText = "Student Full Name:";
        if (idLabel) idLabel.innerText = "Roll Number / Batch:";
        if (idInput) idInput.placeholder = "e.g. 21BCSE101";
    } else if (currentRegRole === "Faculty") {
        if (nameLabel) nameLabel.innerText = "Faculty Name & Title:";
        if (idLabel) idLabel.innerText = "Designation / Department:";
        if (idInput) idInput.placeholder = "e.g. Associate Professor (CSE)";
    } else if (currentRegRole === "Guest") {
        if (nameLabel) nameLabel.innerText = "Guest / Visitor Name:";
        if (idLabel) idLabel.innerText = "Organization / Purpose:";
        if (idInput) idInput.placeholder = "e.g. Visiting Researcher";
    }
}

async function captureWebcamPhoto() {
    const status = document.getElementById("capture-status");
    const previewWrap = document.getElementById("captured-preview-wrap");
    const previewImg = document.getElementById("captured-img-preview");

    if (status) status.innerText = "Capturing from webcam...";

    try {
        const res = await apiFetch("/api/capture_photo");
        capturedBase64ForEnroll = res.image_base64;
        if (status) status.innerText = "✅ Snapshot captured!";
        if (previewWrap && previewImg) {
            previewImg.src = capturedBase64ForEnroll;
            previewWrap.style.display = "block";
        }
    } catch (e) {
        if (status) {
            status.innerHTML = `<span style="color: #ef4444; font-weight: 600;">⚠️ Webcam busy or in use by Gate Monitor.<br>👉 Please use <strong>Method 2: Upload Member Photo File</strong> below.</span>`;
        }
    }
}

function handleFileUploadPreview(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        capturedBase64ForEnroll = e.target.result;
        const previewWrap = document.getElementById("captured-preview-wrap");
        const previewImg = document.getElementById("captured-img-preview");
        if (previewWrap && previewImg) {
            previewImg.src = capturedBase64ForEnroll;
            previewWrap.style.display = "block";
        }
    };
    reader.readAsDataURL(file);
}

async function submitEnrollment() {
    const name = document.getElementById("enroll-name").value.trim();
    const email = document.getElementById("enroll-email").value.trim();
    const rollNo = document.getElementById("enroll-roll-dept").value.trim();
    const msg = document.getElementById("enroll-message");

    if (!name) return alert("Please enter the member's full name.");

    if (msg) msg.innerText = "Processing biometric face embedding...";

    try {
        if (capturedBase64ForEnroll) {
            await apiFetch("/enroll", {
                method: "POST",
                body: JSON.stringify({
                    name: name,
                    email: email,
                    role: currentRegRole,
                    roll_no: rollNo,
                    department: rollNo,
                    image_base64: capturedBase64ForEnroll
                })
            });
            if (msg) msg.innerHTML = `<span style="color: #16a34a; font-weight: 700;">✅ ${currentRegRole} '${name}' registered with facial biometric encoding!</span>`;
        } else {
            await apiFetch("/api/registered_users", {
                method: "POST",
                body: JSON.stringify({
                    name: name,
                    email: email,
                    role: currentRegRole,
                    roll_no: rollNo,
                    department: rollNo
                })
            });
            if (msg) msg.innerHTML = `<span style="color: #16a34a; font-weight: 700;">✅ ${currentRegRole} '${name}' saved in directory.</span>`;
        }

        document.getElementById("enroll-name").value = "";
        document.getElementById("enroll-email").value = "";
        document.getElementById("enroll-roll-dept").value = "";
        capturedBase64ForEnroll = null;
        document.getElementById("captured-preview-wrap").style.display = "none";
        await loadRegisteredFaces();
    } catch (e) {
        if (msg) msg.innerHTML = `<span style="color: #dc2626; font-weight: 700;">❌ Registration failed: ${e.message}</span>`;
    }
}

// ═════════════════════════════════════════════════════════════════
// TAB 6: REGISTERED DIRECTORY
// ═════════════════════════════════════════════════════════════════
async function loadRegisteredFaces() {
    try {
        const data = await apiFetch("/api/registered_users");
        registeredUsersList = data.users || [];

        const navCount = document.getElementById("nav-reg-count");
        if (navCount) navCount.innerText = registeredUsersList.length;

        updateDirectoryCounts(registeredUsersList);
        renderRegisteredDirectory(registeredUsersList);
        populateAllotRegisteredDropdown(registeredUsersList);
    } catch (e) {
        console.error("Error loading registered users:", e);
    }
}

function updateDirectoryCounts(users) {
    const total = users.length;
    const studs = users.filter(u => (u.role || "Student").toLowerCase() === "student").length;
    const facs = users.filter(u => (u.role || "").toLowerCase() === "faculty").length;
    const gsts = users.filter(u => (u.role || "").toLowerCase() === "guest").length;

    const cAll = document.getElementById("dir-count-all");
    const cStud = document.getElementById("dir-count-students");
    const cFac = document.getElementById("dir-count-faculty");
    const cGst = document.getElementById("dir-count-guests");

    if (cAll) cAll.innerText = total;
    if (cStud) cStud.innerText = studs;
    if (cFac) cFac.innerText = facs;
    if (cGst) cGst.innerText = gsts;
}

function filterDirectoryCategory(cat) {
    currentDirCategory = cat;
    document.querySelectorAll(".cat-chip-btn").forEach(btn => {
        if (btn.dataset.cat === cat) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });
    filterRegisteredDirectory();
}

function filterRegisteredDirectory() {
    const q = (document.getElementById("search-reg-input")?.value || "").toLowerCase();
    const filtered = registeredUsersList.filter(u => {
        const matchesCat = currentDirCategory === "all" || (u.role || "Student").toLowerCase() === currentDirCategory.toLowerCase();
        const matchesQuery = u.name.toLowerCase().includes(q) || 
                             (u.email && u.email.toLowerCase().includes(q)) ||
                             (u.roll_no && u.roll_no.toLowerCase().includes(q));
        return matchesCat && matchesQuery;
    });
    renderRegisteredDirectory(filtered);
}

function renderRegisteredDirectory(users) {
    const container = document.getElementById("registered-faces-list");
    if (!container) return;

    if (users.length === 0) {
        container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--on-surface-variant);">No members found in this category.</div>';
        return;
    }

    container.innerHTML = users.map(user => {
        const role = user.role || "Student";
        const roleClass = role.toLowerCase() === "faculty" ? "badge-role-faculty" : role.toLowerCase() === "guest" ? "badge-role-guest" : "badge-role-student";
        const fallbackAvatar = getInitialsAvatarSVG(user.name, role);
        const avatarUrl = user.avatar_base64 || user.avatar_url || fallbackAvatar;

        return `
            <div class="user-card" style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: var(--radius-md); padding: 14px; display: flex; gap: 12px; align-items: center;">
                <img src="${avatarUrl}" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover; border: 2px solid #cbd5e1; flex-shrink: 0;" alt="${user.name}" onerror="this.onerror=null; this.src='${fallbackAvatar}';">
                <div style="flex: 1;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <h4 style="margin: 0; font-size: 14px;">${user.name}</h4>
                        <span class="role-badge ${roleClass}">${role}</span>
                    </div>
                    ${user.roll_no ? `<div style="font-size: 11px; color: #475569; font-weight: 600;">🆔 ${user.roll_no}</div>` : ''}
                    <div style="font-size: 11px; color: #64748b;">${user.email ? `✉️ ${user.email}` : 'No email'}</div>
                </div>
                <div>
                    <button class="btn btn-secondary" style="font-size: 11px; padding: 4px 8px; color: var(--error);" onclick="deleteRegisteredMember('${user.name}')" title="Unregister Member">🗑️</button>
                </div>
            </div>
        `;
    }).join("");
}

function populateAllotRegisteredDropdown(users) {
    const select = document.getElementById("allot-registered-select");
    if (!select) return;

    select.innerHTML = '<option value="">-- Choose Registered Member --</option>';
    users.forEach(u => {
        const opt = document.createElement("option");
        opt.value = u.name;
        opt.innerText = `[${u.role || 'Student'}] ${u.name}`;
        opt.dataset.email = u.email || "";
        opt.dataset.role = u.role || "Student";
        select.appendChild(opt);
    });
}

function onAllotRegisteredSelectChange() {
    const select = document.getElementById("allot-registered-select");
    const opt = select.options[select.selectedIndex];
    if (opt && opt.value) {
        document.getElementById("allot-name").value = opt.value;
        document.getElementById("allot-email").value = opt.dataset.email || "";
        selectAllotRole(opt.dataset.role || "Student");
    }
}

async function deleteRegisteredMember(name) {
    if (!confirm(`Are you sure you want to unregister '${name}'? This removes their facial biometric encoding as well.`)) return;

    try {
        await apiFetch(`/api/registered_users/${encodeURIComponent(name)}`, { method: "DELETE" });
        alert(`Member '${name}' unregistered.`);
        await loadRegisteredFaces();
    } catch (e) {
        alert("Delete failed: " + e.message);
    }
}

// ═════════════════════════════════════════════════════════════════
// TAB 7: DATABASE ADMIN & EMAIL SETTINGS
// ═════════════════════════════════════════════════════════════════
async function clearAttendanceDB() {
    if (!confirm("⚠️ WARNING: This will permanently delete ALL attendance logs. Continue?")) return;

    const msg = document.getElementById("db-message");
    try {
        await apiFetch("/db/clear", { method: "POST" });
        if (msg) msg.innerHTML = '<span style="color: #16a34a; font-weight: 700;">Database logs cleared successfully.</span>';
        await loadAttendance();
    } catch (e) {
        if (msg) msg.innerHTML = `<span style="color: #dc2626;">Error: ${e.message}</span>`;
    }
}

function toggleExportMenu() {
    const menu = document.getElementById("export-menu");
    if (menu) menu.classList.toggle("open");
}

function openEmailSettingsModal() {
    const modal = document.getElementById("email-settings-modal");
    if (modal) modal.style.display = "flex";
}

function closeEmailSettingsModal() {
    const modal = document.getElementById("email-settings-modal");
    if (modal) modal.style.display = "none";
}

async function saveEmailSettings() {
    const user = document.getElementById("smtp-user-input").value.trim();
    const pass = document.getElementById("smtp-pass-input").value.trim();
    const name = document.getElementById("smtp-sender-name-input").value.trim();

    if (!user || !pass) return alert("Please enter both Gmail address and 16-char App Password.");

    try {
        await apiFetch("/api/email_settings", {
            method: "POST",
            body: JSON.stringify({
                smtp_user: user,
                smtp_password: pass,
                sender_name: name,
                sender_email: user
            })
        });
        alert("Email settings saved successfully!");
        closeEmailSettingsModal();
    } catch (e) {
        alert("Failed to save email settings: " + e.message);
    }
}

// ═════════════════════════════════════════════════════════════════
// TAB: WEEKLY TIMETABLE SCHEDULER
// ═════════════════════════════════════════════════════════════════
let timetableSlots = [];
let timetableDays = [];
let timetableBookings = [];

async function loadTimetable() {
    try {
        // 1) Load slot definitions
        const slotData = await apiFetch("/api/timetable/slots");
        timetableSlots = slotData.slots || [];
        timetableDays = slotData.days || ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

        // 2) Load bookings
        const filterName = document.getElementById("tt-filter-name")?.value?.trim() || "";
        let url = "/api/timetable";
        if (filterName) url += `?name=${encodeURIComponent(filterName)}`;
        const bookData = await apiFetch(url);
        timetableBookings = bookData.bookings || [];

        // 3) Render timetable grid
        renderTimetableGrid();
    } catch (e) {
        console.error("Error loading timetable:", e);
        const body = document.getElementById("tt-grid-body");
        if (body) body.innerHTML = `<tr><td colspan="10" style="text-align: center; padding: 30px; color: var(--error);">Error loading schedule: ${e.message}</td></tr>`;
    }
}

function renderTimetableGrid() {
    const thead = document.querySelector("#tt-grid-table thead tr");
    const tbody = document.getElementById("tt-grid-body");
    const myName = (document.getElementById("tt-student-name")?.value || "").trim();
    const myBookingsList = document.getElementById("tt-my-bookings-list");
    const summaryBar = document.getElementById("tt-summary-bar");

    if (!thead || !tbody) return;

    // Build header
    let headerHTML = '<th class="tt-corner-cell">⏰ Time / Day</th>';
    timetableDays.forEach(day => {
        headerHTML += `<th>${day}</th>`;
    });
    thead.innerHTML = headerHTML;

    // Build body rows (one per slot)
    let bodyHTML = "";
    const myBookingChips = [];

    timetableSlots.forEach(slot => {
        bodyHTML += `<tr>`;
        bodyHTML += `<td class="tt-slot-label">${slot.label || 'L' + slot.slot}<span class="slot-time">${slot.start || ''} – ${slot.end || ''}</span></td>`;

        timetableDays.forEach(day => {
            // Find booking for this cell
            const booking = timetableBookings.find(b =>
                b.day_of_week === day && b.slot_number === slot.slot
            );

            if (booking) {
                const isMe = myName && booking.student_name.toLowerCase() === myName.toLowerCase();
                const cellClass = isMe ? "tt-cell-mine" : "tt-cell-others";
                bodyHTML += `<td class="${cellClass}" title="${booking.student_name}">${booking.student_name}</td>`;

                if (isMe) {
                    myBookingChips.push(`<span class="tt-booking-chip">📌 ${day} • ${slot.label || 'L' + slot.slot} (${slot.start || ''})</span>`);
                }
            } else {
                bodyHTML += `<td class="tt-cell-available" onclick="bookTimetableSlot('${day}', ${slot.slot})" title="Click to book">+ Book</td>`;
            }
        });

        bodyHTML += `</tr>`;
    });

    tbody.innerHTML = bodyHTML;

    // My bookings summary
    if (myBookingsList) {
        if (myBookingChips.length > 0) {
            myBookingsList.innerHTML = myBookingChips.join("");
        } else {
            myBookingsList.innerHTML = `<span style="font-size: 12px; color: var(--text-secondary);">No slots booked yet. Enter your name above and click cells to book.</span>`;
        }
    }

    // Summary bar
    if (summaryBar) {
        const totalBooked = timetableBookings.length;
        const totalSlots = timetableSlots.length * timetableDays.length;
        const available = totalSlots - totalBooked;
        summaryBar.innerHTML = `📊 <strong>${totalBooked}</strong> slots booked • <strong>${available}</strong> available out of ${totalSlots} total`;
    }
}

async function bookTimetableSlot(day, slotNumber) {
    const name = (document.getElementById("tt-student-name")?.value || "").trim();
    if (!name) {
        alert("Please enter your name in the booking bar before selecting a slot.");
        document.getElementById("tt-student-name")?.focus();
        return;
    }

    try {
        await apiFetch("/api/timetable", {
            method: "POST",
            body: JSON.stringify({
                student_name: name,
                day_of_week: day,
                slot_number: slotNumber,
                week_label: "recurring"
            })
        });
        await loadTimetable();
    } catch (e) {
        alert("Booking failed: " + e.message);
    }
}

async function clearMySchedule() {
    const name = (document.getElementById("tt-student-name")?.value || "").trim();
    if (!name) return alert("Enter your name first to clear your slots.");

    if (!confirm(`Clear all timetable bookings for "${name}"?`)) return;

    try {
        await apiFetch(`/api/timetable/clear?name=${encodeURIComponent(name)}`, { method: "DELETE" });
        await loadTimetable();
    } catch (e) {
        alert("Failed to clear schedule: " + e.message);
    }
}

// Close dropdown on outside click
document.addEventListener("click", (e) => {
    const dropdown = document.querySelector(".dropdown");
    const menu = document.getElementById("export-menu");
    if (dropdown && menu && !dropdown.contains(e.target)) {
        menu.classList.remove("open");
    }
});

// ═════════════════════════════════════════════════════════════════
// TAB: RESEARCH & CAPSTONE PROJECTS MANAGEMENT
// ═════════════════════════════════════════════════════════════════
let backendProjectsList = [];
let backendProjectFilterStatus = "all";

async function loadBackendProjects() {
    const grid = document.getElementById("backend-projects-grid");
    if (!grid) return;

    grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--on-surface-variant);">Loading projects...</div>';

    try {
        const data = await apiFetch("/api/projects");
        backendProjectsList = Array.isArray(data) ? data : [];
        applyBackendProjectFilters();
    } catch (e) {
        grid.innerHTML = `<div style="grid-column: 1/-1; color: var(--error); text-align: center; padding: 30px;">Error loading projects: ${e.message}</div>`;
    }
}

function filterBackendProjects(status, btn) {
    backendProjectFilterStatus = status;
    const parent = btn.parentElement;
    if (parent) {
        parent.querySelectorAll(".chip-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
    }
    applyBackendProjectFilters();
}

function onBackendProjectSearch() {
    applyBackendProjectFilters();
}

function applyBackendProjectFilters() {
    const searchVal = (document.getElementById("backend-project-search")?.value || "").toLowerCase().trim();
    let filtered = backendProjectsList;

    if (backendProjectFilterStatus !== "all") {
        filtered = filtered.filter(p => (p.status || "").toLowerCase() === backendProjectFilterStatus.toLowerCase());
    }

    if (searchVal) {
        filtered = filtered.filter(p => {
            const title = (p.title || "").toLowerCase();
            const students = (p.student_names || "").toLowerCase();
            const details = (p.student_details || "").toLowerCase();
            const tech = (p.technologies || "").toLowerCase();
            const desc = (p.description || "").toLowerCase();
            return title.includes(searchVal) || students.includes(searchVal) || details.includes(searchVal) || tech.includes(searchVal) || desc.includes(searchVal);
        });
    }

    renderBackendProjectsGrid(filtered);
}

function renderBackendProjectsGrid(projects) {
    const grid = document.getElementById("backend-projects-grid");
    if (!grid) return;

    if (projects.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--on-surface-variant); background: var(--surface); border-radius: 8px; border: 1px dashed var(--outline);">No research projects match current filters. Click "➕ Add New Project" above to create one.</div>';
        return;
    }

    grid.innerHTML = projects.map(p => {
        const statusClass = p.status === "Completed" ? "badge-free" : p.status === "Under Review" ? "badge-away" : "badge-occupied";
        const reportBadgeClass = p.report_status === "Filed" || p.report_status === "Approved" ? "style=\"background: #dcfce7; color: #15803d; border: 1px solid #86efac;\"" : "style=\"background: #fef3c7; color: #b45309; border: 1px solid #fde68a;\"";
        
        const techList = (p.technologies || "").split(",").map(t => t.trim()).filter(Boolean);
        const techChips = techList.map(t => `<span style="background: var(--surface-variant); color: var(--on-surface-variant); font-size: 11px; padding: 2px 7px; border-radius: 4px; font-weight: 500;">${t}</span>`).join(" ");

        return `
            <div class="pc-card" style="display: flex; flex-direction: column; justify-content: space-between; border-top: 4px solid var(--primary); padding: 16px;">
                <div>
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 8px;">
                        <h3 style="margin: 0; font-size: 15px; font-weight: 700; color: var(--on-surface); line-height: 1.3;">${p.title}</h3>
                        <span class="badge ${statusClass}" style="white-space: nowrap; font-size: 11px;">${p.status || 'Ongoing'}</span>
                    </div>

                    ${p.pc_assigned ? `<div style="font-size: 11px; font-weight: 600; color: var(--primary); margin-bottom: 6px;">💻 Workstation: ${p.pc_assigned}</div>` : ''}

                    <div style="background: var(--surface-variant); padding: 8px 10px; border-radius: 6px; margin: 8px 0; font-size: 12px;">
                        <div>👥 <strong>Researchers:</strong> ${p.student_names || 'Unassigned'}</div>
                        ${p.student_details ? `<div style="color: var(--on-surface-variant); margin-top: 2px; font-size: 11px;">📌 <em>${p.student_details}</em></div>` : ''}
                        ${p.duration ? `<div style="margin-top: 4px; color: #0284c7; font-weight: 600;">⏱️ ${p.duration}</div>` : ''}
                    </div>

                    ${p.description ? `<p style="font-size: 12px; color: var(--on-surface-variant); margin: 8px 0; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;">${p.description}</p>` : ''}

                    ${techChips ? `<div style="display: flex; flex-wrap: wrap; gap: 4px; margin: 8px 0;">${techChips}</div>` : ''}
                </div>

                <div style="margin-top: 14px; border-top: 1px solid var(--outline); padding-top: 10px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; font-size: 12px;">
                        <span ${reportBadgeClass} style="padding: 2px 7px; border-radius: 4px; font-size: 11px; font-weight: 600;">
                            📄 Report: ${p.report_status || 'Pending'}
                        </span>
                        <div style="display: flex; gap: 6px;">
                            ${p.deployment_url ? `<a href="${p.deployment_url}" target="_blank" class="btn btn-secondary" style="font-size: 11px; padding: 2px 8px; text-decoration: none;" title="Open Live Deployment">🌐 Live</a>` : ''}
                            ${p.github_url ? `<a href="${p.github_url}" target="_blank" class="btn btn-secondary" style="font-size: 11px; padding: 2px 8px; text-decoration: none;" title="View Source Code">💻 Code</a>` : ''}
                            ${p.report_url ? `<a href="${p.report_url}" target="_blank" class="btn btn-secondary" style="font-size: 11px; padding: 2px 8px; text-decoration: none;" title="Download Official Report">📑 PDF</a>` : ''}
                        </div>
                    </div>

                    <div style="display: flex; gap: 8px; justify-content: flex-end;">
                        <button class="btn btn-secondary" style="font-size: 11px; padding: 4px 10px;" onclick="openBackendProjectModal(${p.id})">✏️ Edit</button>
                        <button class="btn btn-danger" style="font-size: 11px; padding: 4px 10px;" onclick="deleteBackendProject(${p.id}, '${p.title.replace(/'/g, "\\'")}')">🗑️ Delete</button>
                    </div>
                </div>
            </div>
        `;
    }).join("");
}

function openBackendProjectModal(editId = null) {
    const modal = document.getElementById("backend-project-modal");
    const titleEl = document.getElementById("backend-project-modal-title");
    const editIdInput = document.getElementById("proj-edit-id");

    if (editId) {
        const proj = backendProjectsList.find(p => p.id === editId);
        if (!proj) return;
        if (titleEl) titleEl.innerText = "✏️ Edit Research Project";
        if (editIdInput) editIdInput.value = proj.id;

        document.getElementById("proj-title").value = proj.title || "";
        document.getElementById("proj-students").value = proj.student_names || "";
        document.getElementById("proj-details").value = proj.student_details || "";
        document.getElementById("proj-pc-assigned").value = proj.pc_assigned || "";
        document.getElementById("proj-status").value = proj.status || "Ongoing";
        document.getElementById("proj-duration").value = proj.duration || "";
        document.getElementById("proj-technologies").value = proj.technologies || "";
        document.getElementById("proj-description").value = proj.description || "";
        document.getElementById("proj-deployment-url").value = proj.deployment_url || "";
        document.getElementById("proj-github-url").value = proj.github_url || "";
        document.getElementById("proj-report-status").value = proj.report_status || "Pending";
        document.getElementById("proj-report-url").value = proj.report_url || "";
    } else {
        if (titleEl) titleEl.innerText = "🚀 Add New Research Project";
        if (editIdInput) editIdInput.value = "";
        document.getElementById("backend-project-form").reset();
    }

    if (modal) modal.style.display = "flex";
}

function closeBackendProjectModal() {
    const modal = document.getElementById("backend-project-modal");
    if (modal) modal.style.display = "none";
}

async function submitBackendProject(e) {
    e.preventDefault();
    const editId = document.getElementById("proj-edit-id")?.value;
    const saveBtn = document.getElementById("proj-save-btn");

    const payload = {
        title: document.getElementById("proj-title").value.trim(),
        student_names: document.getElementById("proj-students").value.trim(),
        student_details: document.getElementById("proj-details").value.trim(),
        pc_assigned: document.getElementById("proj-pc-assigned").value,
        status: document.getElementById("proj-status").value,
        duration: document.getElementById("proj-duration").value.trim(),
        technologies: document.getElementById("proj-technologies").value.trim(),
        description: document.getElementById("proj-description").value.trim(),
        deployment_url: document.getElementById("proj-deployment-url").value.trim(),
        github_url: document.getElementById("proj-github-url").value.trim(),
        report_status: document.getElementById("proj-report-status").value,
        report_url: document.getElementById("proj-report-url").value.trim()
    };

    if (!payload.title || !payload.student_names) {
        alert("Please enter project title and student names.");
        return;
    }

    if (saveBtn) saveBtn.innerText = "Saving...";

    try {
        if (editId) {
            await apiFetch(`/api/projects/${editId}`, {
                method: "PUT",
                body: JSON.stringify(payload)
            });
        } else {
            await apiFetch("/api/projects", {
                method: "POST",
                body: JSON.stringify(payload)
            });
        }
        closeBackendProjectModal();
        await loadBackendProjects();
    } catch (err) {
        alert("Error saving project: " + err.message);
    } finally {
        if (saveBtn) saveBtn.innerText = "💾 Save Project";
    }
}

async function deleteBackendProject(id, title) {
    if (!confirm(`Are you sure you want to delete the project "${title}"?`)) return;

    try {
        await apiFetch(`/api/projects/${id}`, { method: "DELETE" });
        await loadBackendProjects();
    } catch (e) {
        alert("Error deleting project: " + e.message);
    }
}

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
                    option.text = \[\] \;
                    datalist.appendChild(option);
                });
            }
        }
    } catch (e) {
        console.warn("Could not load datalist users:", e);
    }
}
