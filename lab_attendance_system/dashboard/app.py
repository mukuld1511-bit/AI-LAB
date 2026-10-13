import streamlit as st
import requests
import os
import time
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
# Default is localhost:8000; can be overridden if hosting on different IP
API_BASE_URL = os.environ.get("API_BASE_URL", "http://127.0.0.1:8000")

# Custom CSS for high-contrast, clean Academic Utility theme
st.markdown("""
<style>
    /* Clean container cards */
    .pc-card-free {
        background-color: #f0fdf4;
        border: 2px solid #22c55e;
        border-radius: 12px;
        padding: 16px;
        margin-bottom: 12px;
        text-align: center;
        box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .pc-card-occupied {
        background-color: #fef2f2;
        border: 2px solid #ef4444;
        border-radius: 12px;
        padding: 16px;
        margin-bottom: 12px;
        text-align: center;
        box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .pc-title {
        font-size: 28px;
        font-weight: 800;
        margin: 0;
        color: #111c2d;
    }
    .status-badge-free {
        display: inline-block;
        background-color: #16a34a;
        color: #ffffff;
        font-weight: 700;
        font-size: 13px;
        padding: 4px 12px;
        border-radius: 9999px;
        margin-top: 6px;
    }
    .status-badge-occupied {
        display: inline-block;
        background-color: #dc2626;
        color: #ffffff;
        font-weight: 700;
        font-size: 13px;
        padding: 4px 12px;
        border-radius: 9999px;
        margin-top: 6px;
    }
    .pc-meta {
        font-size: 14px;
        color: #4b5563;
        margin-top: 8px;
    }
    .stCodeBlock {
        margin-bottom: 16px !important;
    }
</style>
""", unsafe_allow_html=True)


# Sidebar Navigation
st.sidebar.title("AI/ML Lab Monitor")
st.sidebar.caption("In-Charge: Richa Mam")

page = st.sidebar.radio(
    "Navigation",
    ["PC Status", "Attendance Logs", "Unknown Faces"]
)

st.sidebar.markdown("---")
# Backend connectivity helper in sidebar
with st.sidebar.expander("⚙️ Connection Settings"):
    api_url_input = st.text_input("Backend API URL", value=API_BASE_URL)
    if api_url_input:
        API_BASE_URL = api_url_input.rstrip("/")
    # Health check button
    if st.button("🔍 Test Connection", use_container_width=True):
        try:
            r = requests.get(f"{API_BASE_URL}/health", timeout=3)
            if r.status_code == 200:
                st.success("✅ Backend connected!")
            else:
                st.error(f"❌ Status {r.status_code}")
        except Exception as e:
            st.error(f"❌ Cannot reach backend: {e}")

# Auto-refresh control in sidebar for Page 1
auto_refresh_enabled = False
if page == "PC Status":
    auto_refresh_enabled = st.sidebar.checkbox("🔄 Live Auto-Refresh (10s)", value=True)


# ==============================================================================
# PAGE 1: PC Status (Default/Landing Page)
# ==============================================================================
if page == "PC Status":
    # Non-blocking auto-refresh via streamlit-autorefresh (replaces time.sleep)
    if auto_refresh_enabled:
        st_autorefresh(interval=10_000, limit=None, key="pc_autorefresh")

    st.title("🖥️ AI/ML Lab - PC Occupancy Tracker")
    st.caption("Live system status for Faculty & Students | Richa Mam's AI Lab")

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
        fetch_error = f"Could not connect to FastAPI server at {API_BASE_URL}. Ensure backend/main.py is running. Error: {e}"

    if fetch_error:
        st.warning(f"⚠️ {fetch_error}")
        # Fallback dummy display if backend is offline so UI structure is previewable
        pc_data = [
            {"pc_id": f"PC-{i}", "status": "free", "occupied_by": None, "since_time": None}
            for i in range(1, 11)
        ]

    # Summary metrics header
    free_count = sum(1 for p in pc_data if p.get("status") == "free")
    occupied_count = len(pc_data) - free_count

    col_m1, col_m2, col_m3 = st.columns(3)
    col_m1.metric("Total Lab PCs", len(pc_data))
    col_m2.metric("🟢 Free Systems", free_count)
    col_m3.metric("🔴 Occupied Systems", occupied_count)

    st.markdown("---")

    # a) PC Grid Display (Responsive 2 to 5 columns)
    st.subheader("Lab Systems Overview")
    
    # Render in 5 columns on desktop / responsive flow
    cols = st.columns(5)
    for idx, pc in enumerate(pc_data):
        col = cols[idx % 5]
        is_free = pc.get("status") == "free"
        pc_id = pc.get("pc_id")
        user = pc.get("occupied_by")
        since = pc.get("since_time")

        with col:
            if is_free:
                st.markdown(f"""
                <div class="pc-card-free">
                    <div class="pc-title">{pc_id}</div>
                    <div class="status-badge-free">AVAILABLE</div>
                    <div class="pc-meta">Ready for use</div>
                </div>
                """, unsafe_allow_html=True)
            else:
                st.markdown(f"""
                <div class="pc-card-occupied">
                    <div class="pc-title">{pc_id}</div>
                    <div class="status-badge-occupied">OCCUPIED</div>
                    <div class="pc-meta"><strong>{user or 'User'}</strong><br><small>Since: {since or 'N/A'}</small></div>
                </div>
                """, unsafe_allow_html=True)
                
                # Mark Free Button
                if st.button(f"Mark {pc_id} Free", key=f"free_btn_{pc_id}", use_container_width=True):
                    try:
                        res = requests.post(f"{API_BASE_URL}/pc/free", json={"pc_id": pc_id}, timeout=3)
                        if res.status_code == 200:
                            st.success(f"{pc_id} is now FREE!")
                            st.rerun()
                        else:
                            st.error(f"Error: {res.text}")
                    except Exception as err:
                        st.error(f"Failed to free PC: {err}")

    st.markdown("---")

    # b) Manual Occupancy Controls
    st.subheader("📝 Claim a PC (Mark as Occupied)")
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
        st.info("ℹ️ All PCs are currently occupied. Please check back later or wait for a system to be freed.")

    st.markdown("---")

    # c) Quick Message Templates Section
    st.subheader("📋 Quick Messages")
    st.caption("One-click copy templates for WhatsApp / SMS announcements to faculty members:")

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

    st.markdown("**Template 3: Assign Specific PC to Faculty**")
    st.code("""Hi [EDIT: Faculty Name],
PC-[EDIT: X] is currently free in the AI Lab. You can come and use it.

- Richa Mam""", language="text")

    st.markdown("**Template 4: Reminder to Free PC**")
    st.code("""Reminder: If you're done using your PC in the AI Lab,
please mark it as "Free" on the tracker so others can use it.

- Richa Mam""", language="text")


# ==============================================================================
# PAGE 2: Attendance Logs
# ==============================================================================
elif page == "Attendance Logs":
    st.title("📋 Lab Attendance Logs (Face Recognition)")
    st.caption("Real-time camera in/out event history | AI/ML Lab")

    # Filter controls
    col_f1, col_f2, col_f3 = st.columns([1, 1, 1])
    with col_f1:
        filter_date = st.date_input("Filter by Date", value=datetime.today())
    with col_f2:
        filter_name = st.text_input("Filter by Name", placeholder="Search by name...")
    with col_f3:
        st.write("")
        st.write("")
        clear_filters = st.button("Reset Filters")

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
                        "OUT Time": row.get("out_time") or "Currently in Lab",
                        "Date": row.get("date")
                    })
                st.dataframe(table_data, use_container_width=True)
            else:
                st.info("No attendance records found for the selected criteria.")
        else:
            st.error(f"Error fetching logs from API: {resp.status_code}")
    except Exception as e:
        st.warning(f"Could not connect to FastAPI backend: {e}")


# ==============================================================================
# PAGE 3: Unknown Faces
# ==============================================================================
elif page == "Unknown Faces":
    st.title("📸 Unknown Visitors & Face Snapshots")
    st.caption("Gallery of unrecognized individuals detected by the AI Lab webcam | Review and enroll known members")

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
                        # Load images via the backend's static URL (fixes broken local path issue)
                        img_url_path = img_item.get("url", "")
                        date_str = img_item.get("date", "Unknown Date")
                        ts_str = img_item.get("timestamp", "Unknown Time")
                        filename = img_item.get("filename", "")
                        caption = f"📅 {date_str}\n⏰ {ts_str}"

                        if img_url_path:
                            full_img_url = f"{API_BASE_URL}{img_url_path}"
                            st.image(full_img_url, caption=caption, use_container_width=True)
                        else:
                            st.write(f"🖼️ `{filename}`")
                            st.caption(caption)
            else:
                st.info("No unknown faces recorded yet. When an unrecognized face appears in front of the camera, snapshots are automatically cataloged here.")
        else:
            st.error(f"Error from API: {resp.status_code}")
    except Exception as e:
        st.warning(f"Could not connect to FastAPI backend: {e}")
