/* ═══════════════════════════════════════════════════════════════════════════
   PIET AIML DEPARTMENT — SMART LAB SUPERVISION APPLICATION LOGIC
   ═══════════════════════════════════════════════════════════════════════════ */

let currentLab = "LAB-414";
let allPCs = [];
let currentFilter = "all";
let searchQuery = "";
let pollInterval = null;
let currentModalPcId = null;

// ── DOM Initialization ──
document.addEventListener("DOMContentLoaded", () => {
    initClock();
    loadLabData();

    // Start 4-second real-time polling
    pollInterval = setInterval(loadLabData, 4000);
});

// ── Live Header Clock ──
function initClock() {
    const clockEl = document.getElementById("live-clock");
    const update = () => {
        if (clockEl) {
            const now = new Date();
            clockEl.innerText = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        }
    };
    update();
    setInterval(update, 1000);
}

// ── Lab Switching ──
function switchLab(labId) {
    currentLab = labId;

    // Update switcher pills
    const pills = document.querySelectorAll(".lab-pill");
    pills.forEach(p => {
        if (p.getAttribute("onclick")?.includes(labId)) {
            p.classList.add("active");
        } else {
            p.classList.remove("active");
        }
    });

    showToast(`Switched to ${labId}`, "info");
    loadLabData();
}

// ── Load Real-time Lab Data ──
async function loadLabData() {
    try {
        const resp = await fetch(`/api/lab/${currentLab}/grid`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();

        allPCs = data.pcs || [];
        updateSessionBanner(data);
        renderWorkstationsGrid();

        // If briefing modal is open for a PC, refresh its view
        if (currentModalPcId) {
            const pc = allPCs.find(p => p.pc_id === currentModalPcId);
            if (pc) populateModalData(pc);
        }
    } catch (e) {
        console.warn("Polling error:", e);
    }
}

// ── Update Active Session & KPI Header Banner ──
function updateSessionBanner(data) {
    const slot = data.active_slot;
    const subEl = document.getElementById("slot-subject");
    const facEl = document.getElementById("slot-faculty");
    const batEl = document.getElementById("slot-batch");
    const timEl = document.getElementById("slot-time");

    if (slot) {
        if (subEl) subEl.innerText = slot.subject || "Lab Practical Session";
        if (facEl) facEl.innerText = `👨‍🏫 Faculty: ${slot.faculty || 'Dept. Mentor'}`;
        if (batEl) batEl.innerText = `🎓 Batch: ${slot.batch || 'AIML'}`;
        if (timEl) timEl.innerText = `⏱️ Slot: ${slot.start_time} - ${slot.end_time}`;
    } else {
        if (subEl) subEl.innerText = "No Scheduled Class Right Now (Self-Study / Open Lab)";
        if (facEl) facEl.innerText = "👨‍🏫 In-Charge: AIML Faculty Panel";
        if (batEl) batEl.innerText = "🎓 Open Access Session";
        if (timEl) timEl.innerText = "⏱️ Regular Lab Hours";
    }

    // KPIs
    const tot = data.total_pcs || (allPCs ? allPCs.length : 20);
    const onl = data.online_count || 0;
    const off = Math.max(0, tot - onl);
    if (document.getElementById("kpi-total")) document.getElementById("kpi-total").innerText = tot;
    if (document.getElementById("kpi-online")) document.getElementById("kpi-online").innerText = onl;
    if (document.getElementById("kpi-fruitful")) document.getElementById("kpi-fruitful").innerText = data.fruitful_count || 0;
    if (document.getElementById("kpi-idle")) document.getElementById("kpi-idle").innerText = data.idle_count || 0;
    if (document.getElementById("kpi-offline")) document.getElementById("kpi-offline").innerText = off;
}

// ── Render Workstation Cards Grid ──
function renderWorkstationsGrid() {
    const container = document.getElementById("workstations-container");
    if (!container) return;

    let filtered = allPCs.slice();

    // Filter by type
    if (currentFilter === "online") {
        filtered = filtered.filter(p => p.is_online);
    } else if (currentFilter === "fruitful") {
        filtered = filtered.filter(p => p.is_online && p.activity_type === "fruitful");
    } else if (currentFilter === "idle") {
        filtered = filtered.filter(p => p.is_online && p.activity_type === "idle");
    } else if (currentFilter === "offline") {
        filtered = filtered.filter(p => !p.is_online);
    } else if (currentFilter === "warning") {
        filtered = filtered.filter(p => p.is_online && p.has_warning);
    }

    // Filter by search query
    if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter(p => 
            p.pc_id.toLowerCase().includes(q) || 
            (p.active_window || "").toLowerCase().includes(q) ||
            (p.active_app || "").toLowerCase().includes(q) ||
            (p.ip_address || "").includes(q)
        );
    }

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="grid-loader">
                <p>No workstations found matching filter in ${currentLab}.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = filtered.map(pc => {
        const isOnline = pc.is_online === 1 || pc.is_online === true;
        const isWarn = isOnline && pc.has_warning;
        const actType = (pc.activity_type || "neutral").toLowerCase();

        let cardClass = "pc-card";
        if (!isOnline) cardClass += " card-offline";
        if (isWarn) cardClass += " card-warning";

        let badgeHtml = "";
        if (isWarn) {
            badgeHtml = `<span class="activity-badge distracted">⚠️ Distracted</span>`;
        } else if (actType === "fruitful") {
            badgeHtml = `<span class="activity-badge fruitful">🎯 ${pc.fruitful_ratio || 0}% Fruitful</span>`;
        } else if (actType === "idle") {
            badgeHtml = `<span class="activity-badge idle">💤 Idle</span>`;
        } else {
            badgeHtml = `<span class="activity-badge neutral">⚪ Normal</span>`;
        }

        const appName = pc.active_app || (isOnline ? "Active Desktop" : "Offline");
        const activeWin = pc.active_window || (isOnline ? "Desktop / Idle" : "System Offline");

        // Screenshot resolution
        let snapUrl = pc.screenshot_url ? pc.screenshot_url.replace('/static/screenshots/', '/screenshots/') : null;
        if (!snapUrl && pc.last_screenshot_at) {
            snapUrl = `/screenshots/${pc.pc_id.toLowerCase()}.jpg?t=${Date.now()}`;
        }

        let screenBlockHtml = "";
        if (snapUrl) {
            screenBlockHtml = `
                <div class="card-screenshot-wrap" onclick="openBriefingModal('${pc.pc_id}')" title="Click to view full screen">
                    <img class="card-screenshot-img" src="${snapUrl}" alt="${pc.pc_id} Desktop" onerror="this.onerror=null; this.src='/screenshots/${pc.pc_id.toLowerCase()}.jpg'">
                    <div class="card-screenshot-overlay">🔍 Click to enlarge • ${pc.last_screenshot_at || 'Captured'}</div>
                </div>
            `;
        } else if (isOnline) {
            screenBlockHtml = `
                <div class="card-screenshot-wrap empty-screen" onclick="requestSingleScreen('${pc.pc_id}', null)" title="Click to take fresh screenshot">
                    <div class="empty-screen-inner">
                        <span class="camera-icon">📸</span>
                        <strong style="color: #0f172a; font-size: 13px;">No Screenshot Taken Yet</strong>
                        <span class="click-hint">👉 Click to Snap Screen Now</span>
                    </div>
                </div>
            `;
        } else {
            screenBlockHtml = `
                <div class="card-screenshot-wrap empty-screen" style="opacity: 0.7; cursor: default;">
                    <div class="empty-screen-inner">
                        <span style="font-size: 26px; filter: grayscale(1);">🖥️</span>
                        <span style="font-size: 12px; color: #64748b;">PC is currently powered off</span>
                    </div>
                </div>
            `;
        }

        return `
            <div class="${cardClass}" id="card-${pc.pc_id}">
                <div class="card-top">
                    <div class="card-title-group">
                        <span class="pc-name">🖥️ ${escapeHtml(pc.pc_id)}</span>
                        <div class="status-indicator ${isOnline ? 'online' : 'offline'}">
                            <span class="dot ${isOnline ? 'live' : ''}"></span>
                            ${isOnline ? 'ONLINE' : 'OFFLINE'}
                        </div>
                    </div>
                    ${badgeHtml}
                </div>

                <!-- Prominent Live Desktop Screenshot Area -->
                ${screenBlockHtml}

                <!-- Active App & Window Title -->
                <div class="active-win-strip" title="${escapeHtml(activeWin)}">
                    <span style="background: #e0f2fe; color: #0284c7; padding: 2px 7px; border-radius: 4px; font-weight: 700; font-size: 11px;">${escapeHtml(appName)}</span>
                    <span style="font-weight: 600; color: #0f172a; margin-left: 4px;">${escapeHtml(activeWin)}</span>
                </div>

                <!-- Hardware & Resource Gauges -->
                <div class="card-gauges">
                    <span>CPU: <strong>${pc.cpu_percent || 0}%</strong></span>
                    <span>RAM: <strong>${pc.ram_percent || 0}%</strong></span>
                    <span>IP: <strong>${pc.ip_address || 'LAN'}</strong></span>
                </div>

                <!-- Time Metrics Row -->
                <div class="time-metrics-row">
                    <div class="time-item">
                        <span class="time-val text-cyan">${formatDuration(pc.uptime_seconds)}</span>
                        <span class="time-lbl">Uptime</span>
                    </div>
                    <div class="time-item">
                        <span class="time-val text-success">${formatDuration(pc.fruitful_seconds)}</span>
                        <span class="time-lbl">Coding Work</span>
                    </div>
                    <div class="time-item">
                        <span class="time-val text-amber">${formatDuration(pc.idle_seconds)}</span>
                        <span class="time-lbl">Idle</span>
                    </div>
                </div>

                <!-- Card Actions -->
                <div class="card-footer">
                    <button class="btn btn-primary" onclick="requestSingleScreen('${pc.pc_id}', this)" ${!isOnline ? 'disabled' : ''}>
                        📸 Snap Screen
                    </button>
                    <button class="btn btn-outline" onclick="openBriefingModal('${pc.pc_id}')">
                        👁️ Full Details
                    </button>
                </div>
            </div>
        `;
    }).join("");
}

// ── Search & Filter Functions ──
function filterPCs(filterType) {
    currentFilter = filterType;
    document.querySelectorAll(".filter-btn").forEach(b => {
        if (b.getAttribute("onclick")?.includes(filterType)) b.classList.add("active");
        else b.classList.remove("active");
    });
    renderWorkstationsGrid();
}

function searchPCs() {
    searchQuery = (document.getElementById("pc-search-input")?.value || "").trim();
    renderWorkstationsGrid();
}

// ── View Subtab Switching ──
function switchView(viewName) {
    document.querySelectorAll(".subtab").forEach(t => {
        if (t.getAttribute("onclick")?.includes(viewName)) t.classList.add("active");
        else t.classList.remove("active");
    });

    document.querySelectorAll(".view-panel").forEach(p => p.classList.remove("active"));
    const activePanel = document.getElementById(`view-${viewName}`);
    if (activePanel) activePanel.classList.add("active");

    if (viewName === "timetable") loadTimetableView();
    if (viewName === "analytics") loadAnalyticsView();
}

// ── Single Screen Grab from Card ──
async function requestSingleScreen(pcId, btn) {
    if (btn) {
        btn.innerText = "⏳ Requesting...";
        btn.disabled = true;
    }
    showToast(`📸 Requesting live screen from ${pcId}...`, "info");

    try {
        const resp = await fetch("/api/command", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pc_id: pcId, command: "capture_screen" })
        });
        if (!resp.ok) throw new Error("Command failed");

        let attempts = 0;
        const checkPoll = setInterval(async () => {
            attempts++;
            await loadLabData();
            const pc = allPCs.find(p => p.pc_id === pcId);
            if (pc && pc.screenshot_url) {
                clearInterval(checkPoll);
                if (btn) {
                    btn.innerText = "📸 Snap";
                    btn.disabled = false;
                }
                showToast(`✅ Fresh screenshot ready for ${pcId}!`, "success");
            } else if (attempts >= 4) {
                clearInterval(checkPoll);
                if (btn) {
                    btn.innerText = "📸 Snap";
                    btn.disabled = false;
                }
            }
        }, 1500);
    } catch (e) {
        showToast(`Failed: ${e.message}`, "error");
        if (btn) {
            btn.innerText = "📸 Snap";
            btn.disabled = false;
        }
    }
}

// ── Snap All Workstations ──
async function requestAllScreenshots() {
    showToast("📸 Dispatched stealth screenshot request to all online PCs...", "info");
    const onlinePcs = allPCs.filter(p => p.is_online);
    for (const pc of onlinePcs) {
        fetch("/api/command", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pc_id: pc.pc_id, command: "capture_screen" })
        }).catch(() => {});
    }
}

// ── Briefing Modal Logic ──
function openBriefingModal(pcId) {
    currentModalPcId = pcId;
    const pc = allPCs.find(p => p.pc_id === pcId);
    if (!pc) return;

    populateModalData(pc);
    const modal = document.getElementById("briefing-modal");
    if (modal) {
        modal.classList.add("active");
        modal.classList.add("show");
        modal.style.display = "flex";
    }
}

function populateModalData(pc) {
    const titleEl = document.getElementById("modal-pc-title");
    if (titleEl) titleEl.innerText = `${pc.pc_id} — Comprehensive Workstation Briefing`;
    
    const badge = document.getElementById("modal-status-badge");
    if (badge) {
        const isOnline = pc.is_online === 1 || pc.is_online === true;
        badge.innerText = isOnline ? "🟢 ONLINE" : "⚪ OFFLINE";
        badge.style.color = isOnline ? "#15803d" : "#64748b";
        badge.style.background = isOnline ? "#dcfce7" : "#f1f5f9";
    }

    // Image preview
    const img = document.getElementById("modal-screen-img");
    const placeholder = document.getElementById("modal-screen-placeholder");
    const fullBtn = document.getElementById("modal-full-img-btn");

    let snapSrc = pc.screenshot_url ? pc.screenshot_url.replace('/static/screenshots/', '/screenshots/') : null;
    if (!snapSrc && pc.last_screenshot_at) {
        snapSrc = `/screenshots/${pc.pc_id.toLowerCase()}.jpg?t=${Date.now()}`;
    }

    if (snapSrc) {
        if (img) {
            img.src = snapSrc;
            img.style.display = "block";
        }
        if (placeholder) placeholder.style.display = "none";
        if (fullBtn) {
            fullBtn.href = snapSrc;
            fullBtn.style.display = "inline-flex";
        }
    } else {
        if (img) img.style.display = "none";
        if (placeholder) placeholder.style.display = "flex";
        if (fullBtn) fullBtn.style.display = "none";
    }

    // Productivity metrics
    const totalSecs = (pc.fruitful_seconds + pc.idle_seconds + pc.distracted_seconds) || 1;
    const fruitfulPct = Math.round((pc.fruitful_seconds / totalSecs) * 100);
    document.getElementById("modal-prod-fill").style.width = `${fruitfulPct}%`;

    document.getElementById("modal-uptime").innerText = formatDuration(pc.uptime_seconds);
    document.getElementById("modal-fruitful").innerText = formatDuration(pc.fruitful_seconds);
    document.getElementById("modal-idle").innerText = formatDuration(pc.idle_seconds);
    document.getElementById("modal-distracted").innerText = formatDuration(pc.distracted_seconds);

    // Active app & hardware
    document.getElementById("modal-active-app").innerText = pc.active_window || "Active Desktop / Idle";
    document.getElementById("modal-cpu").innerText = `${pc.cpu_percent || 0}%`;
    document.getElementById("modal-ram").innerText = `${pc.ram_percent || 0}% (${pc.ram_used_gb || 0}/${pc.ram_total_gb || 0}G)`;
    document.getElementById("modal-gpu").innerText = `${pc.gpu_percent || 0}% (${pc.gpu_name || 'N/A'})`;
    document.getElementById("modal-ip").innerText = pc.ip_address || "LAN";

    const snapTimeEl = document.getElementById("modal-snap-time");
    if (snapTimeEl) {
        snapTimeEl.innerText = pc.last_screenshot_at ? `Captured: ${pc.last_screenshot_at}` : "No snap captured yet";
    }

    // Top processes
    const listCont = document.getElementById("modal-tasks-list");
    const procs = pc.top_processes || [];
    document.getElementById("modal-tasks-count").innerText = `${procs.length} reported`;
    if (listCont) {
        if (procs.length === 0) {
            listCont.innerHTML = `<div style="color: #64748b; font-size: 11px; padding: 8px;">No process telemetry reported yet.</div>`;
        } else {
            listCont.innerHTML = procs.map(pr => `
                <div class="task-item">
                    <span><strong>${escapeHtml(pr.name)}</strong> (PID: ${pr.pid})</span>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span class="text-cyan">${pr.cpu}% C</span>
                        <span class="text-secondary">${pr.ram}% M</span>
                        <button class="task-kill-btn" title="Kill PID ${pr.pid}" onclick="killTask('${pc.pc_id}', ${pr.pid}, '${escapeHtml(pr.name)}')">✖</button>
                    </div>
                </div>
            `).join("");
        }
    }
}

async function requestModalScreenGrab() {
    if (!currentModalPcId) return;
    const btn = document.getElementById("modal-grab-btn");
    await requestSingleScreen(currentModalPcId, btn);
}

async function killTask(pcId, pid, procName) {
    if (!confirm(`Are you sure you want to terminate '${procName}' (PID: ${pid}) on ${pcId}?`)) return;
    try {
        await fetch("/api/command", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pc_id: pcId, command: `kill:${pid}` })
        });
        showToast(`Dispatched kill signal for PID ${pid} to ${pcId}`, "success");
    } catch (e) {
        showToast(`Failed: ${e.message}`, "error");
    }
}

function closeModal() {
    currentModalPcId = null;
    const modal = document.getElementById("briefing-modal");
    if (modal) {
        modal.classList.remove("show");
        modal.classList.remove("active");
        modal.style.display = "none";
    }
}

// ── Timetable View ──
async function loadTimetableView() {
    const tbody = document.getElementById("timetable-body");
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #64748b;">Loading Lab 414 schedule...</td></tr>`;

    try {
        const resp = await fetch(`/api/timetable/${currentLab}`);
        const data = await resp.json();
        const sched = data.weekly_schedule || [];

        if (sched.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #64748b;">No schedule entries configured for ${currentLab}.</td></tr>`;
            return;
        }

        const now = new Date();
        const todayName = now.toLocaleDateString("en-US", { weekday: "long" });

        tbody.innerHTML = sched.map(s => {
            const isToday = s.day_of_week === todayName;
            return `
                <tr style="${isToday ? 'background: rgba(0, 139, 56, 0.06);' : ''}">
                    <td><strong>${escapeHtml(s.day_of_week)}</strong></td>
                    <td class="mono">${escapeHtml(s.start_time)} - ${escapeHtml(s.end_time)}</td>
                    <td><strong style="color: #0f172a;">${escapeHtml(s.subject)}</strong></td>
                    <td>${escapeHtml(s.faculty)}</td>
                    <td>${escapeHtml(s.batch)}</td>
                    <td>${isToday ? '<span class="status-indicator online">Today</span>' : '<span style="color: #64748b;">Scheduled</span>'}</td>
                </tr>
            `;
        }).join("");
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="6" style="color: #f43f5e;">Failed to load timetable: ${e.message}</td></tr>`;
    }
}

// ── Daily Analytics & Reports View ──
async function loadAnalyticsView() {
    const tbody = document.getElementById("analytics-body");
    const summaryBar = document.getElementById("report-summary-bar");
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #64748b;">Generating daily analytics for ${currentLab}...</td></tr>`;

    try {
        const resp = await fetch(`/api/reports/daily?lab_id=${currentLab}`);
        const rep = await resp.json();

        if (summaryBar) {
            summaryBar.innerHTML = `
                <div class="report-summary-boxes">
                    <div class="summary-box">
                        <span class="lbl">REPORT DATE</span>
                        <span class="val">${rep.report_date}</span>
                    </div>
                    <div class="summary-box">
                        <span class="lbl">WORKSTATIONS</span>
                        <span class="val">${rep.total_workstations} PCs</span>
                    </div>
                    <div class="summary-box">
                        <span class="lbl">TOTAL UPTIME</span>
                        <span class="val text-cyan">${rep.total_uptime}</span>
                    </div>
                    <div class="summary-box">
                        <span class="lbl">CODING (FRUITFUL)</span>
                        <span class="val text-success">${rep.total_fruitful_work}</span>
                    </div>
                    <div class="summary-box highlight-box">
                        <span class="lbl">PRODUCTIVITY RATE</span>
                        <span class="val">${rep.overall_fruitful_rate}</span>
                    </div>
                    <div class="summary-box">
                        <span class="lbl">IDLE TIME</span>
                        <span class="val text-amber">${rep.total_idle_time}</span>
                    </div>
                </div>
            `;
        }

        const pcs = rep.pcs || [];
        if (pcs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #64748b;">No utilization data recorded for today yet.</td></tr>`;
            return;
        }

        tbody.innerHTML = pcs.map(p => `
            <tr>
                <td><strong class="mono" style="color: #0f172a;">${p.pc_id}</strong></td>
                <td class="mono">${p.uptime}</td>
                <td class="mono text-success"><strong>${p.fruitful_time}</strong></td>
                <td class="mono text-amber">${p.idle_time}</td>
                <td class="mono text-rose">${p.distracted_time}</td>
                <td><strong class="text-cyan">${p.fruitful_percent}</strong></td>
                <td>${escapeHtml(p.last_active_app)}</td>
                <td>${p.has_warning ? `<span class="activity-badge distracted" title="${escapeHtml(p.warning_reason)}">⚠️ Warning</span>` : '<span class="activity-badge fruitful">🟢 Compliant</span>'}</td>
            </tr>
        `).join("");
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="8" style="color: #f43f5e;">Failed to generate report: ${e.message}</td></tr>`;
    }
}

function exportDailyReport() {
    switchView('analytics');
    setTimeout(() => {
        window.print();
    }, 500);
}

// ── Utilities ──
function formatDuration(seconds) {
    if (!seconds || seconds <= 0) return "0m";
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins}m`;
}

function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    })[m]);
}

function showToast(message, type = "info") {
    const hub = document.getElementById("toast-container");
    if (!hub) return;

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.innerText = message;
    hub.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = "0";
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}
