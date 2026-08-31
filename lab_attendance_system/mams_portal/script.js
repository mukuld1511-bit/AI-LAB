// ── HARDCODE YOUR PERMANENT NGROK DOMAIN OR BACKEND URL HERE ──
let BASE_URL = "https://amaretto-confess-subtract.ngrok-free.dev";

// Fallback to localStorage or localhost
if (!BASE_URL || BASE_URL.includes("ngrok-free.dev") && !localStorage.getItem("ngrok_url")) {
    BASE_URL = localStorage.getItem("ngrok_url") || "http://localhost:8000";
}

// Global cached states
let registeredUsersList = [];
let allPCsState = [];
let currentSelectedDuration = 30; // default 30 mins
let currentPCId = null;
let currentAction = "occupy"; // "occupy" | "free"
let countdownInterval = null;

document.addEventListener("DOMContentLoaded", () => {
    initTabs();
    initDropdowns();

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
        localStorage.setItem("ngrok_url", BASE_URL);
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

// ── Check Backend Connection ──
async function checkConnection() {
    const status = document.getElementById("connection-status");
    const connUI = document.getElementById("connection-ui");
    
    status.className = "badge";
    status.innerHTML = "Connecting...";
    status.style.backgroundColor = "#fbbf24";

    try {
        await apiFetch("/health");
        status.innerHTML = "🟢 Connected to AI Lab";
        status.className = "badge badge-connected";
        status.style.backgroundColor = "";
        if (connUI) connUI.style.display = "none";
        
        // Load data for all components
        await loadRegisteredFaces();
        await loadPCStatus();
        loadAttendance();
        loadUnknownFaces();
    } catch (e) {
        status.innerHTML = "🔴 Disconnected";
        status.className = "badge badge-disconnected";
        status.style.backgroundColor = "";
        if (connUI) connUI.style.display = "flex";
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
                countdownHtml = `
                    <div class="countdown-box" id="timer-${pc.pc_id}">
                        <span>⏳ Time Left:</span>
                        <strong style="color: #b91c1c;">${timeRemainingStr}</strong>
                    </div>
                    <div style="font-size: 11px; color: var(--on-surface-variant); margin-top: 4px;">
                        Valid Until: <strong>${pc.end_time.split(" ")[1] || pc.end_time}</strong>
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
                            <span>📅 ${pc.since_time ? pc.since_time.split(" ")[0] : "Today"}</span>
                            <span>⏰ Since: ${pc.since_time ? pc.since_time.split(" ")[1] : "N/A"}</span>
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
        
        const dateInput = document.getElementById("modal-allotment-date");
        if (dateInput) {
            const todayStr = new Date().toISOString().split("T")[0];
            dateInput.value = todayStr;
        }
        
        // Select 30 mins by default
        selectDurationChip(30);
    } else {
        // PC is occupied - Allow Free or Extend
        currentAction = "free";
        title.innerText = `Manage ${currentPCId} (Occupied)`;
        desc.innerText = `Workstation is currently occupied by ${pcData.occupied_by || "Student"}`;
        
        occupyForm.style.display = "none";
        freeSection.style.display = "block";

        document.getElementById("modal-free-pc-title").innerText = `${currentPCId} is Allocated to ${pcData.occupied_by}`;
        document.getElementById("modal-free-pc-desc").innerText = `Started at: ${pcData.since_time || 'N/A'}. Valid until: ${pcData.end_time || 'Manual Release'}`;
        
        actionBtn.innerText = "❌ Free / Deselect Workstation";
        actionBtn.className = "btn btn-danger";
    }
}

function closePCModal() {
    const modal = document.getElementById("pc-modal");
    if (modal) modal.style.display = "none";
    currentPCId = null;
}

// Duration Chip Selection
function selectDurationChip(mins) {
    currentSelectedDuration = mins;
    const chips = document.querySelectorAll(".chip-btn");
    chips.forEach(c => {
        if (c.dataset.mins == mins) {
            c.classList.add("active");
        } else {
            c.classList.remove("active");
        }
    });

    const customWrap = document.getElementById("custom-time-wrap");
    const previewSpan = document.getElementById("preview-expiry-time");
    
    const now = new Date();

    if (mins === "custom") {
        if (customWrap) customWrap.style.display = "block";
        const customInput = document.getElementById("modal-custom-time");
        if (customInput && !customInput.value) {
            // Default 1 hour ahead
            const future = new Date(now.getTime() + 60 * 60 * 1000);
            const hh = String(future.getHours()).padStart(2, '0');
            const mm = String(future.getMinutes()).padStart(2, '0');
            customInput.value = `${hh}:${mm}`;
        }
        updateCustomExpiryPreview();
        customInput?.addEventListener("input", updateCustomExpiryPreview);
    } else {
        if (customWrap) customWrap.style.display = "none";
        const target = new Date(now.getTime() + parseInt(mins) * 60 * 1000);
        const timeStr = target.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
        const dateStr = document.getElementById("modal-allotment-date")?.value || "Today";
        if (previewSpan) previewSpan.innerText = `${dateStr} at ${timeStr} (${mins} Minutes from now)`;
    }
}

function updateCustomExpiryPreview() {
    const customInput = document.getElementById("modal-custom-time");
    const previewSpan = document.getElementById("preview-expiry-time");
    const dateStr = document.getElementById("modal-allotment-date")?.value || "Today";
    if (customInput && previewSpan && customInput.value) {
        previewSpan.innerText = `${dateStr} at ${customInput.value}`;
    }
}

// Populate Registered Students Dropdown
function populateStudentSelect() {
    const select = document.getElementById("modal-student-select");
    if (!select) return;

    select.innerHTML = '<option value="">-- Choose Registered Student --</option>';
    registeredUsersList.forEach(user => {
        const opt = document.createElement("option");
        opt.value = user.name;
        opt.innerText = `${user.name}${user.email ? ` (${user.email})` : ''}`;
        opt.dataset.email = user.email || "";
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
        if (nameLabel) nameLabel.innerText = "Student Name:";
        if (nameInput) nameInput.placeholder = "e.g. Ayush, Priya (or pick from above list)";
    } else if (selectedUserRole === "Faculty") {
        if (regGroup) regGroup.style.display = "none";
        if (nameLabel) nameLabel.innerText = "Faculty Member Name & Title:";
        if (nameInput) nameInput.placeholder = "e.g. Dr. Sharma, Prof. Verma";
    } else if (selectedUserRole === "Guest") {
        if (regGroup) regGroup.style.display = "none";
        if (nameLabel) nameLabel.innerText = "Guest / Unregistered User Name:";
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

            let durationMins = null;
            let explicitEndTime = null;

            const selectedDateVal = document.getElementById("modal-allotment-date")?.value || new Date().toISOString().split("T")[0];

            if (currentSelectedDuration === "custom") {
                const timeVal = document.getElementById("modal-custom-time").value;
                if (!timeVal) {
                    showToast("Please select a valid custom time.", "error");
                    actionBtn.disabled = false;
                    actionBtn.innerText = "Confirm & Assign Slot";
                    return;
                }
                const now = new Date();
                const [yyyy, MM, dd] = selectedDateVal.split("-");
                const [hh, mm] = timeVal.split(":");
                const target = new Date(parseInt(yyyy), parseInt(MM) - 1, parseInt(dd), parseInt(hh), parseInt(mm), 0);
                
                const HH = String(target.getHours()).padStart(2, '0');
                const MIN = String(target.getMinutes()).padStart(2, '0');
                const SS = "00";
                
                explicitEndTime = `${yyyy}-${MM}-${dd} ${HH}:${MIN}:${SS}`;
                durationMins = Math.max(1, Math.round((target - now) / 60000));
            } else {
                durationMins = parseInt(currentSelectedDuration) || 30;
            }

            const response = await apiFetch("/pc/occupy", {
                method: "POST",
                body: JSON.stringify({
                    pc_id: currentPCId,
                    name: name,
                    email: email,
                    duration_mins: durationMins,
                    end_time: explicitEndTime,
                    send_email: sendEmail && !!email,
                    notes: notes,
                    user_role: selectedUserRole
                })
            });

            let toastMsg = `💻 ${currentPCId} assigned to ${name} (${selectedUserRole}) for ${durationMins} mins`;
            if (sendEmail && email) {
                toastMsg += ` • ✉️ Email Sent`;
            }
            showToast(toastMsg, "success");

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

// ── Registered Users Tab ──

async function loadRegisteredFaces() {
    if (!BASE_URL) return;
    const grid = document.getElementById("registered-grid");
    const countBadge = document.getElementById("nav-reg-count");

    try {
        const data = await apiFetch("/api/registered_users");
        registeredUsersList = data.users || [];
        
        if (countBadge) countBadge.innerText = registeredUsersList.length;

        if (!grid) return;
        renderRegisteredUsersGrid(registeredUsersList);
    } catch(e) {
        console.error("Failed to load registered users", e);
    }
}

function renderRegisteredUsersGrid(users) {
    const grid = document.getElementById("registered-grid");
    if (!grid) return;

    if (users.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--on-surface-variant);">No students registered yet. Click "Add Student" to register!</div>`;
        return;
    }

    grid.innerHTML = users.map(user => {
        const avatarUrl = user.avatar_url ? `${BASE_URL}${user.avatar_url}` : `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=4f46e5&color=fff`;

        return `
            <div class="student-card">
                <div class="student-card-top">
                    <img src="${avatarUrl}" class="student-avatar" alt="${user.name}" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=4f46e5&color=fff'">
                    <div class="student-info">
                        <h4>${user.name}</h4>
                        <p>${user.email ? `✉️ ${user.email}` : '<span style="color: #94a3b8;">No email saved</span>'}</p>
                        <small style="color: #94a3b8; font-size: 11px;">Enrolled: ${user.created_at ? user.created_at.split(" ")[0] : 'Yes'}</small>
                    </div>
                </div>
                
                <div class="student-actions">
                    <button class="btn btn-primary" style="flex: 1; font-size: 12px; padding: 6px 8px;" onclick="allotPCToStudent('${user.name}', '${user.email || ''}')">
                        💻 Allot PC
                    </button>
                    ${user.email ? `
                        <button class="btn btn-secondary" style="font-size: 12px; padding: 6px 10px;" onclick="openDirectEmailModal('${user.email}', '${user.name}')" title="Email Student">
                            ✉️
                        </button>
                    ` : ''}
                    <button class="btn btn-secondary" style="font-size: 12px; padding: 6px 8px; color: var(--error);" onclick="deleteStudent('${user.name}')" title="Unregister Student">
                        🗑️
                    </button>
                </div>
            </div>
        `;
    }).join("");
}

function filterRegisteredUsers() {
    const q = (document.getElementById("search-reg-input")?.value || "").toLowerCase();
    const filtered = registeredUsersList.filter(u => u.name.toLowerCase().includes(q) || (u.email && u.email.toLowerCase().includes(q)));
    renderRegisteredUsersGrid(filtered);
}

function allotPCToStudent(name, email) {
    // Find first available PC
    const firstFree = allPCsState.find(p => p.status.toLowerCase() === "free");
    const targetPC = firstFree ? firstFree.pc_id : "PC-1";
    
    handlePCClick(targetPC, true);
    
    // Auto-fill student info
    setTimeout(() => {
        const nameInput = document.getElementById("modal-student-name");
        const emailInput = document.getElementById("modal-student-email");
        if (nameInput) nameInput.value = name;
        if (emailInput) emailInput.value = email;
    }, 50);
}

async function deleteStudent(name) {
    if (!confirm(`Are you sure you want to unregister ${name}? This will remove facial encodings as well.`)) return;
    try {
        await apiFetch(`/api/registered_users/${encodeURIComponent(name)}`, { method: "DELETE" });
        showToast(`Student '${name}' unregistered.`, "success");
        await loadRegisteredFaces();
    } catch (e) {
        showToast("Error deleting student: " + e.message, "error");
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

// ── Add Student Modal ──

function openAddStudentModal() {
    const modal = document.getElementById("add-student-modal");
    if (modal) modal.style.display = "flex";
}

function closeAddStudentModal() {
    const modal = document.getElementById("add-student-modal");
    if (modal) modal.style.display = "none";
}

async function submitNewStudent() {
    const name = document.getElementById("new-student-name").value.trim();
    const email = document.getElementById("new-student-email").value.trim();
    const fileInput = document.getElementById("new-student-photo");
    const btn = document.getElementById("save-student-btn");

    if (!name) {
        showToast("Please enter student name.", "error");
        return;
    }

    btn.disabled = true;
    btn.innerText = "Registering...";

    try {
        if (fileInput && fileInput.files && fileInput.files[0]) {
            const reader = new FileReader();
            reader.onload = async function(e) {
                const b64 = e.target.result;
                try {
                    await apiFetch("/enroll", {
                        method: "POST",
                        body: JSON.stringify({
                            name: name,
                            email: email,
                            image_base64: b64
                        })
                    });
                    showToast(`Student '${name}' registered with facial profile!`, "success");
                    closeAddStudentModal();
                    await loadRegisteredFaces();
                } catch(err) {
                    showToast("Enrollment failed: " + err.message, "error");
                } finally {
                    btn.disabled = false;
                    btn.innerText = "Save Student";
                }
            };
            reader.readAsDataURL(fileInput.files[0]);
        } else {
            // Register student record without photo
            await apiFetch("/api/registered_users", {
                method: "POST",
                body: JSON.stringify({ name, email })
            });
            showToast(`Student '${name}' registered.`, "success");
            closeAddStudentModal();
            await loadRegisteredFaces();
            btn.disabled = false;
            btn.innerText = "Save Student";
        }
    } catch (e) {
        showToast("Failed to add student: " + e.message, "error");
        btn.disabled = false;
        btn.innerText = "Save Student";
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
