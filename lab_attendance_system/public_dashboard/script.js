// ═══════════════════════════════════════════════════
// AI/ML Lab Dashboard — Frontend JavaScript
// Calls FastAPI backend via ngrok URL stored in localStorage
// ═══════════════════════════════════════════════════

// ── State ──
let API_BASE = localStorage.getItem("lab_api_url") || "";
let pcData = [];
let autoRefreshInterval = null;

// ── DOM Ready ──
document.addEventListener("DOMContentLoaded", () => {
    initTabs();
    initSettings();
    initClaimForm();
    initFilters();

    // Set today's date in filter
    const today = new Date().toISOString().split("T")[0];
    document.getElementById("filter-date").value = today;

    // If no API URL saved, show settings modal
    if (!API_BASE) {
        openSettings();
    } else {
        connectAndLoad();
    }
});

// ═══════════════════════════════════════
// TAB NAVIGATION
// ═══════════════════════════════════════
function initTabs() {
    const tabs = document.querySelectorAll(".tab-btn");
    tabs.forEach(btn => {
        btn.addEventListener("click", () => {
            // Remove active from all
            tabs.forEach(t => t.classList.remove("active"));
            document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));

            // Activate clicked tab
            btn.classList.add("active");
            const tabId = "tab-" + btn.dataset.tab;
            document.getElementById(tabId).classList.add("active");

            // Load data for the tab
            if (btn.dataset.tab === "pc-status") loadPCStatus();
            else if (btn.dataset.tab === "attendance") loadAttendance();
            else if (btn.dataset.tab === "unknown-faces") loadUnknownFaces();
        });
    });
}

// ═══════════════════════════════════════
// SETTINGS MODAL
// ═══════════════════════════════════════
function initSettings() {
    const modal = document.getElementById("settings-modal");
    const input = document.getElementById("api-url-input");
    const saveBtn = document.getElementById("save-url-btn");
    const closeBtn = document.getElementById("close-modal-btn");
    const settingsBtn = document.getElementById("settings-btn");

    settingsBtn.addEventListener("click", openSettings);
    closeBtn.addEventListener("click", () => modal.classList.remove("open"));
    
    // Close on overlay click
    modal.addEventListener("click", (e) => {
        if (e.target === modal) modal.classList.remove("open");
    });

    saveBtn.addEventListener("click", async () => {
        let url = input.value.trim().replace(/\/+$/, "");
        if (!url) {
            showConnectionStatus("❌ Please enter a URL", "msg-error");
            return;
        }
        // Add http:// if missing
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            url = "https://" + url;
        }

        showConnectionStatus('<span class="spinner"></span> Testing connection...', "");
        
        try {
            const resp = await fetch(url + "/health", {
                method: "GET",
                headers: { "ngrok-skip-browser-warning": "true" }
            });
            if (resp.ok) {
                API_BASE = url;
                localStorage.setItem("lab_api_url", url);
                showConnectionStatus("✅ Connected successfully!", "msg-success");
                updateConnectionBadge(true);
                setTimeout(() => modal.classList.remove("open"), 800);
                connectAndLoad();
            } else {
                showConnectionStatus("❌ Server responded with status " + resp.status, "msg-error");
            }
        } catch (e) {
            showConnectionStatus("❌ Cannot reach server: " + e.message, "msg-error");
        }
    });

    // Pre-fill saved URL
    if (API_BASE) input.value = API_BASE;
}

function openSettings() {
    const modal = document.getElementById("settings-modal");
    modal.classList.add("open");
    document.getElementById("api-url-input").focus();
}

function showConnectionStatus(html, cls) {
    const el = document.getElementById("connection-status");
    el.innerHTML = html;
    el.className = cls;
}

function updateConnectionBadge(connected) {
    const badge = document.getElementById("connection-badge");
    if (connected) {
        badge.textContent = "● Connected";
        badge.className = "badge badge-connected";
    } else {
        badge.textContent = "● Disconnected";
        badge.className = "badge badge-disconnected";
    }
}

// ═══════════════════════════════════════
// API HELPER
// ═══════════════════════════════════════
async function apiFetch(endpoint, options = {}) {
    if (!API_BASE) {
        openSettings();
        throw new Error("No API URL configured");
    }
    const defaultHeaders = { "ngrok-skip-browser-warning": "true" };
    if (options.body) defaultHeaders["Content-Type"] = "application/json";
    
    const resp = await fetch(API_BASE + endpoint, {
        ...options,
        headers: { ...defaultHeaders, ...(options.headers || {}) }
    });
    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`API error ${resp.status}: ${text}`);
    }
    return resp.json();
}

// ═══════════════════════════════════════
// CONNECT & LOAD
// ═══════════════════════════════════════
async function connectAndLoad() {
    try {
        await apiFetch("/health");
        updateConnectionBadge(true);
        loadPCStatus();

        // Auto-refresh PC status every 10 seconds
        if (autoRefreshInterval) clearInterval(autoRefreshInterval);
        autoRefreshInterval = setInterval(() => {
            const activeTab = document.querySelector(".tab-btn.active");
            if (activeTab && activeTab.dataset.tab === "pc-status") {
                loadPCStatus();
            }
        }, 10000);
    } catch (e) {
        updateConnectionBadge(false);
        showFallbackPCs();
    }
}

// ═══════════════════════════════════════
// PAGE 1: PC STATUS
// ═══════════════════════════════════════
async function loadPCStatus() {
    try {
        pcData = await apiFetch("/pc/status");
        renderPCGrid(pcData);
        updateConnectionBadge(true);
    } catch (e) {
        showFallbackPCs();
    }
}

function showFallbackPCs() {
    pcData = [];
    for (let i = 1; i <= 10; i++) {
        pcData.push({ pc_id: "PC-" + i, status: "free", occupied_by: null, since_time: null });
    }
    renderPCGrid(pcData);
}

function renderPCGrid(pcs) {
    const grid = document.getElementById("pc-grid");
    const freeCount = pcs.filter(p => p.status === "free").length;
    const occCount = pcs.length - freeCount;

    document.getElementById("total-pcs").textContent = pcs.length;
    document.getElementById("free-pcs").textContent = freeCount;
    document.getElementById("occupied-pcs").textContent = occCount;

    let html = "";
    pcs.forEach(pc => {
        const isFree = pc.status === "free";
        const cardClass = isFree ? "pc-card pc-card-free" : "pc-card pc-card-occupied";
        const badgeClass = isFree ? "status-badge badge-free" : "status-badge badge-occupied-red";
        const badgeText = isFree ? "AVAILABLE" : "OCCUPIED";
        const meta = isFree
            ? "Ready for use"
            : `<strong>${pc.occupied_by || "User"}</strong><br><small>Since: ${pc.since_time || "N/A"}</small>`;
        const freeBtn = isFree
            ? ""
            : `<button class="btn-free-pc" onclick="freePC('${pc.pc_id}')">Mark Free</button>`;

        html += `
            <div class="${cardClass}">
                <div class="pc-title">${pc.pc_id}</div>
                <span class="${badgeClass}">${badgeText}</span>
                <div class="pc-meta">${meta}</div>
                ${freeBtn}
            </div>
        `;
    });
    grid.innerHTML = html;

    // Update dropdown
    const select = document.getElementById("pc-select");
    const freePCs = pcs.filter(p => p.status === "free");
    if (freePCs.length > 0) {
        select.innerHTML = freePCs.map(p => `<option value="${p.pc_id}">${p.pc_id}</option>`).join("");
        document.getElementById("claim-section").style.display = "block";
    } else {
        select.innerHTML = '<option value="">All PCs occupied</option>';
        document.getElementById("claim-section").style.display = "block";
    }
}

async function freePC(pcId) {
    try {
        await apiFetch("/pc/free", {
            method: "POST",
            body: JSON.stringify({ pc_id: pcId })
        });
        loadPCStatus();
    } catch (e) {
        alert("Failed to free PC: " + e.message);
    }
}

// ── Claim Form ──
function initClaimForm() {
    document.getElementById("claim-btn").addEventListener("click", async () => {
        const pcId = document.getElementById("pc-select").value;
        const name = document.getElementById("claim-name").value.trim();
        const msgEl = document.getElementById("claim-message");

        if (!pcId) {
            msgEl.innerHTML = "❌ No free PC available.";
            msgEl.className = "msg-error";
            return;
        }
        if (!name) {
            msgEl.innerHTML = "❌ Please enter your name.";
            msgEl.className = "msg-error";
            return;
        }

        try {
            await apiFetch("/pc/occupy", {
                method: "POST",
                body: JSON.stringify({ pc_id: pcId, name: name })
            });
            msgEl.innerHTML = `✅ Successfully claimed ${pcId} for ${name}!`;
            msgEl.className = "msg-success";
            document.getElementById("claim-name").value = "";
            loadPCStatus();
        } catch (e) {
            msgEl.innerHTML = "❌ " + e.message;
            msgEl.className = "msg-error";
        }
    });
}

// ═══════════════════════════════════════
// PAGE 2: ATTENDANCE LOGS
// ═══════════════════════════════════════
function initFilters() {
    document.getElementById("apply-filter-btn").addEventListener("click", loadAttendance);
    document.getElementById("reset-filter-btn").addEventListener("click", () => {
        document.getElementById("filter-date").value = new Date().toISOString().split("T")[0];
        document.getElementById("filter-name").value = "";
        loadAttendance();
    });
}

async function loadAttendance() {
    const statusEl = document.getElementById("attendance-status");
    const tbody = document.getElementById("attendance-tbody");
    
    const date = document.getElementById("filter-date").value;
    const name = document.getElementById("filter-name").value.trim();

    let params = new URLSearchParams();
    if (date) params.set("date", date);
    if (name) params.set("name", name);

    statusEl.innerHTML = '<span class="spinner"></span> Loading...';
    
    try {
        const logs = await apiFetch("/attendance/logs?" + params.toString());
        
        if (logs.length > 0) {
            statusEl.innerHTML = `<span class="success-box">Found ${logs.length} attendance record(s).</span>`;
            tbody.innerHTML = logs.map(row => `
                <tr>
                    <td>${row.name || "-"}</td>
                    <td>${row.is_known ? "✅ Yes" : "❓ Unknown"}</td>
                    <td>${row.in_time || "-"}</td>
                    <td>${row.out_time || "🟢 Currently in Lab"}</td>
                    <td>${row.date || "-"}</td>
                </tr>
            `).join("");
            document.getElementById("attendance-table-wrap").style.display = "block";
        } else {
            statusEl.innerHTML = '<span class="info-box">ℹ️ No attendance records found for the selected criteria.</span>';
            tbody.innerHTML = "";
        }
    } catch (e) {
        statusEl.innerHTML = `<span class="warning-box">⚠️ Could not fetch attendance logs: ${e.message}</span>`;
        tbody.innerHTML = "";
    }
}

// ═══════════════════════════════════════
// PAGE 3: UNKNOWN FACES
// ═══════════════════════════════════════
async function loadUnknownFaces() {
    const statusEl = document.getElementById("faces-status");
    const grid = document.getElementById("faces-grid");

    statusEl.innerHTML = '<span class="spinner"></span> Loading...';

    try {
        const images = await apiFetch("/unknown_faces");

        if (images.length > 0) {
            statusEl.innerHTML = `<span class="info-box">📸 Total ${images.length} unknown face snapshot(s) captured.</span>`;
            grid.innerHTML = images.map(img => {
                const imgUrl = API_BASE + (img.url || "");
                return `
                    <div class="face-card">
                        <img src="${imgUrl}" alt="Unknown face" onerror="this.style.display='none'" loading="lazy">
                        <div class="face-info">
                            📅 ${img.date || "Unknown"}<br>
                            ⏰ ${img.timestamp || "Unknown"}
                        </div>
                    </div>
                `;
            }).join("");
        } else {
            statusEl.innerHTML = '<span class="info-box">ℹ️ No unknown faces recorded yet. When an unrecognized face appears in front of the camera, snapshots are automatically cataloged here.</span>';
            grid.innerHTML = "";
        }
    } catch (e) {
        statusEl.innerHTML = `<span class="warning-box">⚠️ Could not fetch unknown faces: ${e.message}</span>`;
        grid.innerHTML = "";
    }
}

// ═══════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════
function copyTemplate(btn) {
    const pre = btn.closest(".msg-template").querySelector(".msg-body");
    navigator.clipboard.writeText(pre.textContent).then(() => {
        const orig = btn.textContent;
        btn.textContent = "✅ Copied!";
        setTimeout(() => btn.textContent = orig, 1500);
    });
}
