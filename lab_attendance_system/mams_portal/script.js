// ── DYNAMIC BACKEND URL (DGX Spark / Remote / Localhost) ──
let BASE_URL = localStorage.getItem("lab_backend_url") || "";
if (!BASE_URL) {
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
        BASE_URL = "http://localhost:8000";
    } else if (window.location.protocol.startsWith("http") && !window.location.hostname.includes("vercel.app")) {
        BASE_URL = window.location.origin;
    } else {
        BASE_URL = "https://amaretto-confess-subtract.ngrok-free.dev";
    }
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

document.addEventListener("DOMContentLoaded", () => {
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
        loadAttendance();
        loadUnknownFaces();
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
        const allowedPCIds = ["PC-1", "PC-2", "PC-3", "PC-4", "PC-5", "PC-6", "PC-7", "PC-8"];
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
        const isFree = pc.status.toLowerCase() === "free";
        const cardClass = isFree ? "pc-card-free" : "pc-card-occupied";
        const badgeClass = isFree ? "badge-free" : "badge-occupied";
        const badgeText = isFree ? "🟢 AVAILABLE" : "🔴 IN USE";
        
        let countdownHtml = "";
        let timeRemainingStr = "";

        if (!isFree) {
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

        let roleBadge = "";
        if (!isFree && pc.occupied_by) {
            const role = (pc.user_role || "Student").toLowerCase();
            if (role === "faculty") {
                roleBadge = `<span class="role-badge role-badge-faculty">👨‍🏫 Faculty</span>`;
            } else if (role === "guest") {
                roleBadge = `<span class="role-badge role-badge-guest">👤 Guest</span>`;
            } else {
                roleBadge = `<span class="role-badge role-badge-student">🎓 Student</span>`;
            }
        }

        return `
            <div class="pc-card ${cardClass}" 
                 id="grid-pc-${pc.pc_id}"
                 onclick="handlePCClick('${pc.pc_id}', ${isFree})"
                 onmouseenter="if (typeof highlightPC === 'function') highlightPC('${pc.pc_id}', true)"
                 onmouseleave="if (typeof highlightPC === 'function') highlightPC('${pc.pc_id}', false)">
                
                <div class="pc-header-row">
                    <div class="pc-title">💻 ${pc.pc_id}</div>
                    <div style="display: flex; gap: 4px; align-items: center;">
                        ${roleBadge}
                        <div class="status-badge ${badgeClass}">${badgeText}</div>
                    </div>
                </div>

                <div class="pc-body">
                    ${!isFree && pc.occupied_by ? `
                        <div class="pc-user-info">
                            <span>👤</span> <strong>${pc.occupied_by}</strong>
                        </div>
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

                ${countdownHtml}

                <div class="pc-actions" onclick="event.stopPropagation()">
                    ${isFree ? `
                        <button class="btn btn-primary" style="width: 100%; font-size: 12px; padding: 6px 10px;" onclick="handlePCClick('${pc.pc_id}', true)">
                            ⚡ Assign PC
                        </button>
                    ` : `
                        <button class="btn btn-secondary" style="flex: 1; font-size: 12px; padding: 5px 8px;" onclick="handlePCClick('${pc.pc_id}', true)">
                            🔄 Extend / Edit
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

        // If any PC session expired, reload status from backend to auto-free
        if (hasExpired) {
            loadPCStatus(true);
        }
    }, 1000);
}

// ── Modal Handling for PC Allotment ──

function handlePCClick(pcId, isFree) {
    if (!BASE_URL) {
        showToast("Please connect to the backend first.", "error");
        return;
    }

    currentPCId = (pcId || "").toUpperCase().trim();
    const pcData = allPCsState.find(p => p.pc_id.toUpperCase() === currentPCId);
    const modal = document.getElementById("pc-modal");
    const title = document.getElementById("modal-title");
    const desc = document.getElementById("modal-desc");
    const occupyForm = document.getElementById("modal-occupy-form");
    const freeSection = document.getElementById("modal-free-section");
    const actionBtn = document.getElementById("modal-action-btn");

    if (!modal) return;
    modal.style.display = "flex";

    // Populate registered students select
    populateStudentSelect();

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
function populateStudentSelect() {
    const select = document.getElementById("modal-student-select");
    if (!select) return;

    select.innerHTML = '<option value="">-- Choose Registered Lab Member --</option>';
    registeredUsersList.forEach(user => {
        const opt = document.createElement("option");
        opt.value = user.name;
        const role = user.role || "Student";
        const icon = role.toLowerCase() === "faculty" ? "👨‍🏫" : role.toLowerCase() === "guest" ? "👤" : "🎓";
        opt.innerText = `${icon} [${role}] ${user.name}${user.email ? ` (${user.email})` : ''}`;
        opt.dataset.email = user.email || "";
        opt.dataset.role = role;
        select.appendChild(opt);
    });
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
                    user_role: selectedUserRole
                })
            });

            let toastMsg = `💻 ${currentPCId} assigned to ${name} (${selectedUserRole}) until ${timeTo}`;
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

// ── Attendance Logs Tab ──

async function loadAttendance() {
    if (!BASE_URL) return;
    const tbody = document.getElementById("attendance-tbody");
    if (!tbody) return;
    
    const date = document.getElementById("filter-date")?.value || "";
    const name = document.getElementById("filter-name")?.value.trim() || "";
    
    let params = new URLSearchParams();
    if (date) params.set("date", date);
    if (name) params.set("name", name);

    try {
        const logs = await apiFetch("/attendance/logs?" + params.toString());
        if (logs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--on-surface-variant); padding: 30px;">No attendance logs found.</td></tr>`;
            return;
        }

        tbody.innerHTML = logs.map(row => `
            <tr>
                <td><strong>${row.name || "-"}</strong></td>
                <td>${row.is_known ? '<span class="badge badge-connected">✅ Registered</span>' : '<span class="badge badge-disconnected">❓ Unknown</span>'}</td>
                <td>${row.in_time || "-"}</td>
                <td>${row.out_time || "<span style='color: #15803d; font-weight: bold;'>🟢 Inside Lab</span>"}</td>
                <td>${row.date || "-"}</td>
            </tr>
        `).join("");
    } catch(e) {
        tbody.innerHTML = `<tr><td colspan="5" style="color:red">Error: ${e.message}</td></tr>`;
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
        filtered = users.filter(u => (u.role || "Student").toLowerCase() === currentCategoryFilter.toLowerCase());
    }

    if (filtered.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--on-surface-variant);">No ${currentCategoryFilter === 'all' ? 'members' : currentCategoryFilter + 's'} enrolled yet. Click "Register Member" to add!</div>`;
        return;
    }

    grid.innerHTML = filtered.map(user => {
        const avatarUrl = user.avatar_url ? `${BASE_URL}${user.avatar_url}` : `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=4f46e5&color=fff`;
        const role = (user.role || "Student").capitalize ? user.role.capitalize() : user.role || "Student";
        const roleBadgeClass = role.toLowerCase() === "faculty" ? "badge-role-faculty" : role.toLowerCase() === "guest" ? "badge-role-guest" : "badge-role-student";
        const roleIcon = role.toLowerCase() === "faculty" ? "👨‍🏫" : role.toLowerCase() === "guest" ? "👤" : "🎓";

        return `
            <div class="student-card">
                <div class="student-card-top">
                    <img src="${avatarUrl}" class="student-avatar" alt="${user.name}" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=4f46e5&color=fff'">
                    <div class="student-info">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 6px;">
                            <h4 style="margin: 0; font-size: 15px;">${user.name}</h4>
                            <span class="role-badge ${roleBadgeClass}">${roleIcon} ${role}</span>
                        </div>
                        ${user.roll_no ? `<p style="font-weight: 600; color: #475569; font-size: 11px; margin-top: 2px;">🆔 ${user.roll_no}</p>` : ''}
                        <p style="margin-top: 2px;">${user.email ? `✉️ ${user.email}` : '<span style="color: #94a3b8;">No email saved</span>'}</p>
                        <small style="color: #94a3b8; font-size: 11px;">Enrolled: ${user.created_at ? user.created_at.split(" ")[0] : 'Yes'}</small>
                    </div>
                </div>
                
                <div class="student-actions">
                    <button class="btn btn-primary" style="flex: 1; font-size: 12px; padding: 6px 8px;" onclick="allotPCToStudent('${user.name}', '${user.email || ''}', '${role}')">
                        💻 Allot PC
                    </button>
                    ${user.email ? `
                        <button class="btn btn-secondary" style="font-size: 12px; padding: 6px 10px;" onclick="openDirectEmailModal('${user.email}', '${user.name}')" title="Email Member">
                            ✉️
                        </button>
                    ` : ''}
                    <button class="btn btn-secondary" style="font-size: 12px; padding: 6px 8px; color: var(--error);" onclick="deleteStudent('${user.name}')" title="Unregister Member">
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
        const matchesQuery = u.name.toLowerCase().includes(q) || 
                             (u.email && u.email.toLowerCase().includes(q)) ||
                             (u.roll_no && u.roll_no.toLowerCase().includes(q)) ||
                             (u.role && u.role.toLowerCase().includes(q));
        return matchesQuery;
    });
    renderRegisteredUsersGrid(filtered);
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
            const imgUrl = `${BASE_URL}${face.url}`;
            return `
                <div class="unknown-card">
                    <div class="unknown-img-wrap" onclick="openLightbox('${imgUrl}', '${face.filename}', '${face.timestamp}', '${face.date}')">
                        <img src="${imgUrl}" alt="Intruder Snapshot" onerror="this.src='https://placehold.co/300x200?text=No+Photo'">
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
                    department: rollNo,
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
                    department: rollNo
                })
            });
            showToast(`✅ ${selectedRegRole} '${name}' registered in directory.`, "success");
        }

        closeAddUserModal();
        await loadRegisteredFaces();
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
