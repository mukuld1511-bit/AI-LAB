// ── HARDCODE YOUR PERMANENT NGROK DOMAIN HERE ──
let BASE_URL = "https://amaretto-confess-subtract.ngrok-free.dev"; // CHANGE THIS to your actual static Ngrok domain

// Fallback to localStorage if not hardcoded
if (!BASE_URL || BASE_URL === "https://upright-lion.ngrok.app") {
    BASE_URL = localStorage.getItem("ngrok_url") || "";
}

document.addEventListener("DOMContentLoaded", () => {
    // UI Init
    initTabs();

    // Init 3D Lab Scene
    if (typeof init3DLabScene === "function") {
        init3DLabScene();
    }
    
    // Ngrok Connection
    const urlInput = document.getElementById("ngrok-url");
    if (BASE_URL) {
        urlInput.value = BASE_URL;
        checkConnection();
    } else {
        // Show input UI if no URL is provided at all
        document.getElementById("connection-ui").style.display = "block";
        document.getElementById("connection-status").innerHTML = "Waiting for URL...";
    }

    document.getElementById("connect-btn").addEventListener("click", () => {
        let url = urlInput.value.trim();
        if (url.endsWith("/")) url = url.slice(0, -1);
        BASE_URL = url;
        localStorage.setItem("ngrok_url", BASE_URL);
        checkConnection();
    });

    document.getElementById("apply-filter-btn").addEventListener("click", loadAttendance);

    // Auto-poll PC status every 8 seconds for live 3D mirror
    setInterval(() => {
        if (BASE_URL) loadPCStatus();
    }, 8000);
});

// API Helper
async function apiFetch(endpoint, options = {}) {
    if (!BASE_URL) throw new Error("Not connected");
    const response = await fetch(`${BASE_URL}${endpoint}`, {
        ...options,
        headers: {
            "ngrok-skip-browser-warning": "true",
            "Content-Type": "application/json",
            ...(options.headers || {})
        },
        cache: "no-store" // Force browser to fetch fresh data every time
    });
    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || `HTTP error ${response.status}`);
    }
    return response.json();
}

// Check Connection
async function checkConnection() {
    const status = document.getElementById("connection-status");
    status.className = "badge";
    status.innerHTML = "Connecting...";
    status.style.backgroundColor = "#fbbf24";

    try {
        await apiFetch("/pc/status");
        status.innerHTML = "Connected to Lab";
        status.className = "badge badge-connected";
        status.style.backgroundColor = ""; // reset
        
        // Hide the manual input UI since connection was successful!
        document.getElementById("connection-ui").style.display = "none";
        
        // Load data for all tabs
        loadPCStatus();
        loadAttendance();
        loadRegisteredFaces();
        loadUnknownFaces();
    } catch (e) {
        status.innerHTML = "Disconnected";
        status.className = "badge badge-disconnected";
        status.style.backgroundColor = "";
        
        // Show the manual input UI because automatic connection failed
        document.getElementById("connection-ui").style.display = "block";
    }
}

// Tabs
function initTabs() {
    const btns = document.querySelectorAll('.tab-btn');
    const contents = document.querySelectorAll('.tab-content');

    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            btns.forEach(b => b.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
            
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

    document.getElementById('refresh-unknown-btn')?.addEventListener('click', loadUnknownFaces);
}

// PC Status (Strictly 8 PCs: PC-1 to PC-8)
async function loadPCStatus() {
    if (!BASE_URL) return;
    try {
        const rawPcs = await apiFetch("/pc/status");
        
        // Filter strictly to the 8 PCs (PC-1 to PC-8)
        const allowedPCIds = ["PC-1", "PC-2", "PC-3", "PC-4", "PC-5", "PC-6", "PC-7", "PC-8"];
        const pcs = rawPcs.filter(p => allowedPCIds.includes(p.pc_id.toUpperCase()));
        
        const freePCs = pcs.filter(p => p.status.toLowerCase() === "free");
        
        document.getElementById("stat-free").innerText = freePCs.length;
        document.getElementById("stat-occupied").innerText = pcs.length - freePCs.length;
        document.getElementById("stat-total").innerText = pcs.length; // 8

        // 1. Update the 3D Three.js Digital Twin Lab Scene
        if (typeof updatePCStatusIn3D === "function") {
            updatePCStatusIn3D(pcs);
        }

        // 2. Render the 2D Workstation Grid (8 PCs in 4x2 Layout)
        const grid = document.getElementById("pc-grid");
        if (grid) {
            grid.innerHTML = pcs.map(pc => {
                const isFree = pc.status.toLowerCase() === "free";
                const cardClass = isFree ? "pc-card-free" : "pc-card-occupied";
                const badgeClass = isFree ? "badge-free" : "badge-occupied";
                const badgeText = isFree ? "🟢 AVAILABLE" : "🔴 IN USE";
                
                return `
                    <div class="pc-card ${cardClass}" 
                         id="grid-pc-${pc.pc_id}"
                         onclick="handlePCClick('${pc.pc_id}', ${isFree})"
                         onmouseenter="if (typeof highlightPC === 'function') highlightPC('${pc.pc_id}', true)"
                         onmouseleave="if (typeof highlightPC === 'function') highlightPC('${pc.pc_id}', false)">
                        <div class="status-badge ${badgeClass}" style="position: absolute; top: 10px; right: 10px;">${badgeText}</div>
                        <div style="font-size: 32px; margin-bottom: 6px; margin-top: 10px;">💻</div>
                        <div class="pc-title">${pc.pc_id}</div>
                        ${!isFree && pc.occupied_by ? `
                            <div class="pc-meta">
                                <strong>👤 ${pc.occupied_by}</strong><br>
                                <span style="font-size: 11px; color: #6b7280;">Since: ${pc.since_time ? pc.since_time.split(" ")[1] : "N/A"}</span>
                            </div>
                        ` : `
                            <div class="pc-meta" style="color: #059669; font-weight: 500; font-size: 12px; margin-top: 8px;">
                                Ready for Assignment
                            </div>
                        `}
                    </div>
                `;
            }).join("");
        }
    } catch(e) {
        console.error("PC load failed", e);
    }
}

// Modal State
let currentAction = null;
let currentPCId = null;

function closePCModal() {
    const modal = document.getElementById("pc-modal");
    if (modal) modal.style.display = "none";
    
    const input = document.getElementById("modal-student-name");
    if (input) input.value = "";

    const actionBtn = document.getElementById("modal-action-btn");
    if (actionBtn) actionBtn.disabled = false;
}

// Handle PC Click (From 3D Scene or 2D Grid)
function handlePCClick(pcId, isFree) {
    if (!BASE_URL) return;
    
    currentPCId = (pcId || "").toUpperCase().trim();
    const modal = document.getElementById("pc-modal");
    const title = document.getElementById("modal-title");
    const desc = document.getElementById("modal-desc");
    const inputGroup = document.getElementById("modal-input-group");
    const actionBtn = document.getElementById("modal-action-btn");
    
    if (!modal || !actionBtn) return;

    modal.style.display = "flex";
    actionBtn.disabled = false;
    
    if (isFree) {
        currentAction = "occupy";
        title.innerText = `Assign ${currentPCId}`;
        desc.innerText = `Enter the name of the student using ${currentPCId}`;
        inputGroup.style.display = "block";
        actionBtn.innerText = "Assign PC";
        actionBtn.className = "btn btn-primary";
        actionBtn.style.background = ""; // Reset custom styles
        
        setTimeout(() => {
            const input = document.getElementById("modal-student-name");
            if (input) input.focus();
        }, 50);
    } else {
        currentAction = "free";
        title.innerText = `Free ${currentPCId}`;
        desc.innerText = `Are you sure you want to mark ${currentPCId} as available?`;
        inputGroup.style.display = "none";
        actionBtn.innerText = "Mark Free";
        actionBtn.className = "btn btn-primary";
        actionBtn.style.background = "#dc2626";
    }
}

document.getElementById("modal-action-btn")?.addEventListener("click", async () => {
    if (!currentPCId) return;
    
    const actionBtn = document.getElementById("modal-action-btn");
    actionBtn.disabled = true;
    actionBtn.innerText = "Processing...";
    
    try {
        if (currentAction === "occupy") {
            const nameInput = document.getElementById("modal-student-name");
            const name = (nameInput ? nameInput.value : "").trim();
            if (!name) {
                alert("Please enter a name.");
                actionBtn.disabled = false;
                actionBtn.innerText = "Assign PC";
                return;
            }
            await apiFetch("/pc/occupy", {
                method: "POST",
                body: JSON.stringify({ pc_id: currentPCId, name: name })
            });
            if (typeof showToast === "function") {
                showToast(`💻 ${currentPCId} Assigned to ${name}`);
            }
        } else if (currentAction === "free") {
            await apiFetch("/pc/free", {
                method: "POST",
                body: JSON.stringify({ pc_id: currentPCId })
            });
            if (typeof showToast === "function") {
                showToast(`🟢 ${currentPCId} Marked Available`);
            }
        }
        
        closePCModal();
        await loadPCStatus();
    } catch(e) {
        alert("Error: " + e.message);
        actionBtn.disabled = false;
        actionBtn.innerText = currentAction === "free" ? "Mark Free" : "Assign PC";
    }
});

// Attendance
async function loadAttendance() {
    if (!BASE_URL) return;
    const tbody = document.getElementById("attendance-tbody");
    
    const date = document.getElementById("filter-date").value;
    const name = document.getElementById("filter-name").value.trim();
    let params = new URLSearchParams();
    if (date) params.set("date", date);
    if (name) params.set("name", name);

    try {
        const logs = await apiFetch("/attendance/logs?" + params.toString());
        tbody.innerHTML = logs.map(row => `
            <tr>
                <td><strong>${row.name || "-"}</strong></td>
                <td>${row.is_known ? "✅ Yes" : "❓ Unknown"}</td>
                <td>${row.in_time || "-"}</td>
                <td>${row.out_time || "<span style='color:green;font-weight:bold;'>🟢 Inside Lab</span>"}</td>
                <td>${row.date || "-"}</td>
            </tr>
        `).join("");
    } catch(e) {
        tbody.innerHTML = `<tr><td colspan="5">Error: ${e.message}</td></tr>`;
    }
}

// Registered Faces
async function loadRegisteredFaces() {
    if (!BASE_URL) return;
    const grid = document.getElementById("registered-grid");
    grid.innerHTML = '<span class="spinner"></span> Loading enrolled users...';

    try {
        const data = await apiFetch("/api/registered_faces");
        const faces = data.faces;
        
        if (faces.length === 0) {
            grid.innerHTML = '<p>No users registered yet.</p>';
            return;
        }

        grid.innerHTML = faces.map(name => {
            // Reconstruct the avatar URL based on the name format from Python
            const safeName = name.replace(/[^a-zA-Z0-9 ]/g, "").trim().replace(/ /g, "_");
            const avatarUrl = `${BASE_URL}/static/avatars/${safeName}.jpg`;
            
            return `
                <div class="avatar-card">
                    <img src="${avatarUrl}" alt="${name}" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random'">
                    <div class="avatar-name">${name}</div>
                </div>
            `;
        }).join("");
    } catch(e) {
        grid.innerHTML = `<p style="color:red">Error: ${e.message}</p>`;
    }
}

// Unknown Faces
async function loadUnknownFaces() {
    if (!BASE_URL) return;
    const grid = document.getElementById("unknown-grid");
    if (!grid) return;
    
    grid.innerHTML = '<span class="spinner"></span> Checking for intruders...';
    
    try {
        const data = await apiFetch("/unknown_faces");
        
        if (data.length === 0) {
            grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--on-surface-variant);">No unknown faces detected today! 🎉</div>';
            return;
        }

        grid.innerHTML = data.map(face => `
            <div class="unknown-card">
                <div class="img-wrapper">
                    <img src="${BASE_URL}${face.url}" alt="Unknown face" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22><rect width=%22100%22 height=%22100%22 fill=%22%23eee%22/><text x=%2250%22 y=%2250%22 font-family=%22Arial%22 font-size=%2214%22 fill=%22%23999%22 text-anchor=%22middle%22 dominant-baseline=%22middle%22>No Image</text></svg>'">
                </div>
                <div class="unknown-meta">
                    <strong>Time:</strong> ${face.timestamp}<br>
                    <strong>Date:</strong> ${face.date}
                </div>
            </div>
        `).join("");
    } catch(e) {
        grid.innerHTML = `<p style="color:red">Error loading intruders: ${e.message}</p>`;
        console.error("Unknown faces load failed", e);
    }
}
