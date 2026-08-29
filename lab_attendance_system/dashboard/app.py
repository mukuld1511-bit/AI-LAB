import streamlit as st
import requests
import os
from datetime import datetime
from streamlit_autorefresh import st_autorefresh

# Streamlit Page Config - Mobile friendly and clean title
st.set_page_config(
    page_title="AI/ML Lab - PC & Attendance Tracker",
    page_icon="🖥️",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Backend API Configuration
# Default is localhost:8000; can be overridden via env var or sidebar input
API_BASE_URL = os.environ.get("API_BASE_URL", "http://127.0.0.1:8000")

# ──────────────────────────────────────────────────────────────────────────────
# PREMIUM CSS — Stitch-Inspired Dark Glassmorphism Theme
# ──────────────────────────────────────────────────────────────────────────────
st.markdown("""
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
    /* ── Global Theme ── */
    :root {
        --bg-primary: #0f1117;
        --bg-card: rgba(25, 28, 40, 0.85);
        --bg-glass: rgba(255, 255, 255, 0.04);
        --border-glass: rgba(255, 255, 255, 0.08);
        --accent-green: #22c55e;
        --accent-green-glow: rgba(34, 197, 94, 0.25);
        --accent-red: #ef4444;
        --accent-red-glow: rgba(239, 68, 68, 0.25);
        --accent-blue: #3b82f6;
        --accent-purple: #a855f7;
        --text-primary: #f1f5f9;
        --text-secondary: #94a3b8;
        --text-muted: #64748b;
        --radius: 16px;
        --radius-sm: 10px;
    }

    html, body, [data-testid="stAppViewContainer"] {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif !important;
    }

    /* ── Header Branding ── */
    .lab-header {
        background: linear-gradient(135deg, #1e1b4b 0%, #312e81 40%, #4338ca 100%);
        border-radius: var(--radius);
        padding: 28px 32px;
        margin-bottom: 24px;
        border: 1px solid rgba(99, 102, 241, 0.3);
        box-shadow: 0 8px 32px rgba(99, 102, 241, 0.15);
        position: relative;
        overflow: hidden;
    }
    .lab-header::before {
        content: '';
        position: absolute;
        top: -50%;
        right: -20%;
        width: 300px;
        height: 300px;
        background: radial-gradient(circle, rgba(139, 92, 246, 0.2) 0%, transparent 70%);
        border-radius: 50%;
    }
    .lab-header h1 {
        margin: 0;
        font-size: 26px;
        font-weight: 800;
        color: #fff;
        letter-spacing: -0.5px;
        position: relative;
        z-index: 1;
    }
    .lab-header p {
        margin: 6px 0 0;
        font-size: 14px;
        color: rgba(199, 210, 254, 0.8);
        position: relative;
        z-index: 1;
    }

    /* ── Metric Cards (Summary Row) ── */
    .metric-row {
        display: flex;
        gap: 16px;
        margin-bottom: 24px;
        flex-wrap: wrap;
    }
    .metric-card {
        flex: 1;
        min-width: 140px;
        background: var(--bg-card);
        backdrop-filter: blur(12px);
        border: 1px solid var(--border-glass);
        border-radius: var(--radius-sm);
        padding: 20px;
        text-align: center;
        transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    .metric-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 24px rgba(0,0,0,0.3);
    }
    .metric-card .metric-value {
        font-size: 36px;
        font-weight: 800;
        color: var(--text-primary);
        line-height: 1;
    }
    .metric-card .metric-label {
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: var(--text-muted);
        margin-top: 6px;
    }
    .metric-card.green .metric-value { color: var(--accent-green); }
    .metric-card.red .metric-value { color: var(--accent-red); }
    .metric-card.blue .metric-value { color: var(--accent-blue); }

    /* ── PC Status Grid Cards ── */
    .pc-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
        gap: 14px;
        margin-bottom: 28px;
    }
    @media (max-width: 640px) {
        .pc-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 10px;
        }
    }

    .pc-card {
        border-radius: var(--radius-sm);
        padding: 20px 16px;
        text-align: center;
        transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        position: relative;
        overflow: hidden;
    }
    .pc-card::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 3px;
    }
    .pc-card:hover {
        transform: translateY(-3px);
    }

    /* Free PC Card */
    .pc-card-free {
        background: rgba(34, 197, 94, 0.08);
        border: 1.5px solid rgba(34, 197, 94, 0.25);
        box-shadow: 0 2px 12px rgba(34, 197, 94, 0.08);
    }
    .pc-card-free::before {
        background: linear-gradient(90deg, var(--accent-green), #4ade80);
    }
    .pc-card-free:hover {
        box-shadow: 0 6px 24px var(--accent-green-glow);
        border-color: rgba(34, 197, 94, 0.45);
    }

    /* Occupied PC Card */
    .pc-card-occupied {
        background: rgba(239, 68, 68, 0.08);
        border: 1.5px solid rgba(239, 68, 68, 0.25);
        box-shadow: 0 2px 12px rgba(239, 68, 68, 0.08);
    }
    .pc-card-occupied::before {
        background: linear-gradient(90deg, var(--accent-red), #f87171);
    }
    .pc-card-occupied:hover {
        box-shadow: 0 6px 24px var(--accent-red-glow);
        border-color: rgba(239, 68, 68, 0.45);
    }

    .pc-card .pc-id {
        font-size: 22px;
        font-weight: 800;
        color: var(--text-primary);
        margin-bottom: 8px;
    }

    .status-pill {
        display: inline-block;
        font-weight: 700;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 1.2px;
        padding: 4px 14px;
        border-radius: 9999px;
    }
    .pill-free {
        background: rgba(34, 197, 94, 0.2);
        color: #4ade80;
        border: 1px solid rgba(34, 197, 94, 0.3);
    }
    .pill-occupied {
        background: rgba(239, 68, 68, 0.2);
        color: #f87171;
        border: 1px solid rgba(239, 68, 68, 0.3);
    }

    .pc-meta {
        font-size: 12px;
        color: var(--text-secondary);
        margin-top: 8px;
        line-height: 1.5;
    }

    /* ── Section headers ── */
    .section-title {
        font-size: 18px;
        font-weight: 700;
        color: var(--text-primary);
        margin: 24px 0 14px;
        display: flex;
        align-items: center;
        gap: 8px;
    }

    /* ── Unknown face image cards ── */
    .face-card {
        background: var(--bg-card);
        border: 1px solid var(--border-glass);
        border-radius: var(--radius-sm);
        padding: 12px;
        text-align: center;
        margin-bottom: 12px;
        transition: transform 0.2s ease;
    }
    .face-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(0,0,0,0.3);
    }
    .face-card img {
        border-radius: 8px;
        width: 100%;
    }
    .face-card .face-meta {
        font-size: 12px;
        color: var(--text-secondary);
        margin-top: 8px;
    }

    /* ── Divider ── */
    .section-divider {
        border: none;
        border-top: 1px solid var(--border-glass);
        margin: 24px 0;
    }

    /* ── Quick Message blocks ── */
    .stCodeBlock {
        margin-bottom: 14px !important;
    }

    /* ── Sidebar polish ── */
    [data-testid="stSidebar"] {
        border-right: 1px solid var(--border-glass);
    }
    [data-testid="stSidebar"] [data-testid="stMarkdownContainer"] p {
        font-family: 'Inter', sans-serif !important;
    }
</style>
""", unsafe_allow_html=True)


# ──────────────────────────────────────────────────────────────────────────────
# SIDEBAR NAVIGATION
# ──────────────────────────────────────────────────────────────────────────────
st.sidebar.title("🖥️ AI/ML Lab Monitor")
st.sidebar.caption("In-Charge: Richa Mam")

page = st.sidebar.radio(
    "Navigation",
    ["PC Status", "Attendance Logs", "Unknown Faces"],
    label_visibility="collapsed"
)

st.sidebar.markdown("---")

# Backend connectivity settings
with st.sidebar.expander("⚙️ Connection Settings"):
    api_url_input = st.text_input("Backend API URL", value=API_BASE_URL, key="api_url")
    if api_url_input:
        API_BASE_URL = api_url_input.rstrip("/")
    # Health check
    if st.button("🔍 Test Connection", use_container_width=True):
        try:
            r = requests.get(f"{API_BASE_URL}/health", timeout=3)
            if r.status_code == 200:
                st.success("✅ Backend connected!")
            else:
                st.error(f"❌ Status {r.status_code}")
        except Exception as e:
            st.error(f"❌ Cannot reach backend: {e}")

# Auto-refresh control for PC Status page
auto_refresh_enabled = False
if page == "PC Status":
    auto_refresh_enabled = st.sidebar.checkbox("🔄 Live Auto-Refresh (10s)", value=True)

st.sidebar.markdown("---")
st.sidebar.markdown(
    "<div style='font-size:11px;color:#64748b;text-align:center;'>"
    "Built for Richa Mam's AI/ML Lab<br>"
    "Face Recognition + PC Tracker"
    "</div>",
    unsafe_allow_html=True
)


# ══════════════════════════════════════════════════════════════════════════════
# PAGE 1: PC STATUS (Default / Landing Page)
# ══════════════════════════════════════════════════════════════════════════════
if page == "PC Status":
    # Auto-refresh (non-blocking) — only fires when checkbox is on
    if auto_refresh_enabled:
        st_autorefresh(interval=10_000, limit=None, key="pc_autorefresh")

    # Header
    st.markdown("""
    <div class="lab-header">
        <h1>🖥️ AI/ML Lab — PC Occupancy Tracker</h1>
        <p>Live system status for Faculty & Students • Richa Mam's AI Lab</p>
    </div>
    """, unsafe_allow_html=True)

    # Fetch live PC status from FastAPI
    pc_data = []
    fetch_error = None
    try:
        resp = requests.get(f"{API_BASE_URL}/pc/status", timeout=4)
        if resp.status_code == 200:
            pc_data = resp.json()
        else:
            fetch_error = f"API returned status {resp.status_code}: {resp.text}"
    except Exception as e:
        fetch_error = f"Could not connect to backend at {API_BASE_URL}. Error: {e}"

    if fetch_error:
        st.warning(f"⚠️ {fetch_error}")
        # Fallback dummy display so UI structure is previewable
        pc_data = [
            {"pc_id": f"PC-{i}", "status": "free", "occupied_by": None, "since_time": None}
            for i in range(1, 11)
        ]

    # Summary metrics
    free_count = sum(1 for p in pc_data if p.get("status") == "free")
    occupied_count = len(pc_data) - free_count

    st.markdown(f"""
    <div class="metric-row">
        <div class="metric-card blue">
            <div class="metric-value">{len(pc_data)}</div>
            <div class="metric-label">Total PCs</div>
        </div>
        <div class="metric-card green">
            <div class="metric-value">{free_count}</div>
            <div class="metric-label">Available</div>
        </div>
        <div class="metric-card red">
            <div class="metric-value">{occupied_count}</div>
            <div class="metric-label">Occupied</div>
        </div>
    </div>
    """, unsafe_allow_html=True)

    # PC Grid (responsive — CSS grid handles 2-col mobile, 5-col desktop)
    st.markdown('<div class="section-title">📊 Lab Systems Overview</div>', unsafe_allow_html=True)

    grid_html = '<div class="pc-grid">'
    for pc in pc_data:
        is_free = pc.get("status") == "free"
        pc_id = pc.get("pc_id", "?")
        user = pc.get("occupied_by") or ""
        since = pc.get("since_time") or ""
        card_class = "pc-card pc-card-free" if is_free else "pc-card pc-card-occupied"
        pill_class = "status-pill pill-free" if is_free else "status-pill pill-occupied"
        pill_text = "AVAILABLE" if is_free else "OCCUPIED"
        meta = "Ready for use" if is_free else f"<strong>{user}</strong><br><small>Since: {since}</small>"

        grid_html += f"""
        <div class="{card_class}">
            <div class="pc-id">{pc_id}</div>
            <span class="{pill_class}">{pill_text}</span>
            <div class="pc-meta">{meta}</div>
        </div>
        """
    grid_html += '</div>'
    st.markdown(grid_html, unsafe_allow_html=True)

    # Action buttons for occupied PCs (Streamlit buttons need to be outside raw HTML)
    occupied_pcs = [p for p in pc_data if p.get("status") != "free"]
    if occupied_pcs:
        st.markdown('<div class="section-title">🔓 Quick Free Controls</div>', unsafe_allow_html=True)
        btn_cols = st.columns(min(len(occupied_pcs), 5))
        for idx, pc in enumerate(occupied_pcs):
            with btn_cols[idx % min(len(occupied_pcs), 5)]:
                pc_id = pc.get("pc_id")
                user = pc.get("occupied_by", "")
                if st.button(f"Free {pc_id}", key=f"free_btn_{pc_id}", use_container_width=True, help=f"Currently used by {user}"):
                    try:
                        res = requests.post(f"{API_BASE_URL}/pc/free", json={"pc_id": pc_id}, timeout=3)
                        if res.status_code == 200:
                            st.success(f"✅ {pc_id} is now FREE!")
                            st.rerun()
                        else:
                            st.error(f"Error: {res.text}")
                    except Exception as err:
                        st.error(f"Failed to free PC: {err}")

    st.markdown('<hr class="section-divider">', unsafe_allow_html=True)

    # Claim a PC form
    st.markdown('<div class="section-title">📝 Claim a PC (Mark as Occupied)</div>', unsafe_allow_html=True)
    free_pcs = [p["pc_id"] for p in pc_data if p.get("status") == "free"]

    if free_pcs:
        with st.form("occupy_form"):
            col1, col2 = st.columns([1, 2])
            with col1:
                selected_pc = st.selectbox("Select Free PC", free_pcs)
            with col2:
                student_name = st.text_input("Your Name / Faculty Name", placeholder="e.g. Ayush, Dr. Sharma")

            submit_claim = st.form_submit_button("✅ Mark Occupied", use_container_width=True)

            if submit_claim:
                if not student_name.strip():
                    st.error("Please enter your name before claiming the PC.")
                else:
                    try:
                        res = requests.post(
                            f"{API_BASE_URL}/pc/occupy",
                            json={"pc_id": selected_pc, "name": student_name.strip()},
                            timeout=3
                        )
                        if res.status_code == 200:
                            st.success(f"Successfully claimed {selected_pc} for {student_name.strip()}!")
                            st.rerun()
                        else:
                            st.error(f"Failed to claim PC: {res.text}")
                    except Exception as err:
                        st.error(f"API Error: {err}")
    else:
        st.info("ℹ️ All PCs are currently occupied. Check back later or wait for a system to be freed.")

    st.markdown('<hr class="section-divider">', unsafe_allow_html=True)

    # Quick Message Templates
    st.markdown('<div class="section-title">📋 Quick Messages</div>', unsafe_allow_html=True)
    st.caption("One-click copy templates for WhatsApp / SMS announcements:")

    st.markdown("**Template 1: Available PCs**")
    st.code("""Lab PC Availability Update:
The following PCs are currently free — [EDIT: PC LIST]
Please come to the AI Lab if you'd like to use one.

- Richa Mam""", language="text")

    st.markdown("**Template 2: All Occupied**")
    st.code("""Lab PC Availability Update:
All PCs in the AI Lab are currently occupied.
Will update once a system is free.

- Richa Mam""", language="text")

    st.markdown("**Template 3: Assign Specific PC**")
    st.code("""Hi [EDIT: Faculty Name],
PC-[EDIT: X] is currently free in the AI Lab. You can come and use it.

- Richa Mam""", language="text")

    st.markdown("**Template 4: Reminder to Free PC**")
    st.code("""Reminder: If you're done using your PC in the AI Lab,
please mark it as "Free" on the tracker so others can use it.

- Richa Mam""", language="text")


# ══════════════════════════════════════════════════════════════════════════════
# PAGE 2: ATTENDANCE LOGS
# ══════════════════════════════════════════════════════════════════════════════
elif page == "Attendance Logs":
    # Header
    st.markdown("""
    <div class="lab-header">
        <h1>📋 Lab Attendance Logs</h1>
        <p>Real-time face recognition in/out event history • AI/ML Lab</p>
    </div>
    """, unsafe_allow_html=True)

    # Filter controls
    col_f1, col_f2, col_f3 = st.columns([1, 1, 1])
    with col_f1:
        filter_date = st.date_input("Filter by Date", value=datetime.today())
    with col_f2:
        filter_name = st.text_input("Filter by Name", placeholder="Search by name...")
    with col_f3:
        st.write("")
        st.write("")
        clear_filters = st.button("🗑️ Reset Filters")

    # Prepare query params
    params = {}
    if filter_date and not clear_filters:
        params["date"] = filter_date.strftime("%Y-%m-%d")
    if filter_name and not clear_filters:
        params["name"] = filter_name.strip()

    # Call FastAPI GET /attendance/logs
    try:
        resp = requests.get(f"{API_BASE_URL}/attendance/logs", params=params, timeout=4)
        if resp.status_code == 200:
            logs = resp.json()
            if logs:
                st.success(f"Found {len(logs)} attendance record(s).")
                # Format into table
                table_data = []
                for row in logs:
                    table_data.append({
                        "Name": row.get("name"),
                        "Known Face": "✅ Yes" if row.get("is_known") else "❓ Unknown",
                        "IN Time": row.get("in_time") or "-",
                        "OUT Time": row.get("out_time") or "🟢 Currently in Lab",
                        "Date": row.get("date")
                    })
                st.dataframe(table_data, use_container_width=True, hide_index=True)
            else:
                st.info("No attendance records found for the selected criteria.")
        else:
            st.error(f"Error fetching logs from API: {resp.status_code}")
    except Exception as e:
        st.warning(f"Could not connect to FastAPI backend: {e}")


# ══════════════════════════════════════════════════════════════════════════════
# PAGE 3: UNKNOWN FACES GALLERY
# ══════════════════════════════════════════════════════════════════════════════
elif page == "Unknown Faces":
    # Header
    st.markdown("""
    <div class="lab-header">
        <h1>📸 Unknown Visitors & Face Snapshots</h1>
        <p>Gallery of unrecognized individuals detected by the AI Lab webcam</p>
    </div>
    """, unsafe_allow_html=True)

    try:
        resp = requests.get(f"{API_BASE_URL}/unknown_faces", timeout=4)
        if resp.status_code == 200:
            images = resp.json()
            if images:
                st.info(f"Total {len(images)} unknown face snapshot(s) captured.")

                # Display in grid of 4 columns
                cols = st.columns(4)
                for i, img_item in enumerate(images):
                    col = cols[i % 4]
                    with col:
                        # Use the backend static URL to load images over HTTP
                        img_url_path = img_item.get("url", "")
                        date_str = img_item.get("date", "Unknown Date")
                        ts_str = img_item.get("timestamp", "Unknown Time")
                        filename = img_item.get("filename", "")
                        caption = f"📅 {date_str}  •  ⏰ {ts_str}"

                        if img_url_path:
                            full_img_url = f"{API_BASE_URL}{img_url_path}"
                            st.image(full_img_url, caption=caption, use_container_width=True)
                        else:
                            st.markdown(
                                f'<div class="face-card">'
                                f'<div style="padding:20px;color:var(--text-muted);">🖼️ {filename}</div>'
                                f'<div class="face-meta">{caption}</div>'
                                f'</div>',
                                unsafe_allow_html=True
                            )
            else:
                st.info("No unknown faces recorded yet. When an unrecognized face appears in front of the camera, snapshots are automatically cataloged here.")
        else:
            st.error(f"Error from API: {resp.status_code}")
    except Exception as e:
        st.warning(f"Could not connect to FastAPI backend: {e}")
