// ── HARDCODE YOUR PERMANENT NGROK DOMAIN HERE ──
let BASE_URL = "https://amaretto-confess-subtract.ngrok-free.dev"; // CHANGE THIS to your actual static Ngrok domain

// Fallback to localStorage if not hardcoded
if (!BASE_URL || BASE_URL === "https://upright-lion.ngrok.app") {
    BASE_URL = localStorage.getItem("ngrok_url") || "";
}

document.addEventListener("DOMContentLoaded", () => {
    // UI Init
    initTabs();
    
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
});

// API Helper
async function apiFetch(endpoint) {
    if (!BASE_URL) throw new Error("Not connected");
    const response = await fetch(`${BASE_URL}${endpoint}`, {
        headers: {
            "ngrok-skip-browser-warning": "true"
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
            
            if (btn.dataset.tab === 'pc-status') loadPCStatus();
            if (btn.dataset.tab === 'attendance') loadAttendance();
            if (btn.dataset.tab === 'registered-faces') loadRegisteredFaces();
            if (btn.dataset.tab === 'unknown-faces') loadUnknownFaces();
        });
    });

    document.getElementById('refresh-unknown-btn')?.addEventListener('click', loadUnknownFaces);
}

// PC Status
async function loadPCStatus() {
    if (!BASE_URL) return;
    try {
        const pcs = await apiFetch("/pc/status");
        const freePCs = pcs.filter(p => p.status.toLowerCase() === "free");
        
        document.getElementById("stat-free").innerText = freePCs.length;
        document.getElementById("stat-occupied").innerText = pcs.length - freePCs.length;
        document.getElementById("stat-total").innerText = pcs.length;

        const grid = document.getElementById("pc-grid");
        grid.innerHTML = pcs.map(pc => {
            const isFree = pc.status.toLowerCase() === "free";
            const cardClass = isFree ? "pc-card-free" : "pc-card-occupied";
            const badgeClass = isFree ? "badge-free" : "badge-occupied";
            const badgeText = isFree ? "🟢 AVAILABLE" : "🔴 IN USE";
            
            return `
                <div class="pc-card ${cardClass}">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div class="pc-title">💻 ${pc.pc_id}</div>
                        <div class="status-badge ${badgeClass}">${badgeText}</div>
                    </div>
                    ${!isFree && pc.occupied_by ? `
                        <div class="pc-meta">
                            <strong>👤 ${pc.occupied_by}</strong><br>
                            Started: ${pc.since_time ? pc.since_time.split(" ")[1] : "N/A"}
                        </div>
                    ` : ""}
                </div>
            `;
        }).join("");
    } catch(e) {
        console.error("PC load failed", e);
    }
}

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
