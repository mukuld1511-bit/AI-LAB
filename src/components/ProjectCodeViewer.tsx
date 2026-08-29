import React, { useState } from 'react';
import { Code2, Copy, Check, Terminal, FolderTree, FileCode, Play, Cpu, CheckCircle } from 'lucide-react';

export const ProjectCodeViewer: React.FC = () => {
  const [activeFile, setActiveFile] = useState<string>('recognizer.py');
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  const filesContent: Record<string, { path: string; language: string; content: string; desc: string }> = {
    'recognizer.py': {
      path: 'lab_attendance_system/face_recognition_module/recognizer.py',
      language: 'python',
      desc: 'Main loop: Webcam capture (index 0), face detection (HOG CPU), known/unknown matching, logs IN/OUT to attendance_logs every ~2s.',
      content: `import cv2
import face_recognition
import pickle
import os
import sys
import time
from datetime import datetime

# Setup paths
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(CURRENT_DIR)
ENCODINGS_FILE = os.path.join(CURRENT_DIR, "known_encodings.pkl")
UNKNOWN_FACES_ROOT = os.path.join(PROJECT_ROOT, "unknown_faces")
BACKEND_DIR = os.path.join(PROJECT_ROOT, "backend")

# Import database module from backend
sys.path.insert(0, BACKEND_DIR)
import database


def load_known_encodings():
    """Loads known faces dictionary {name: encoding} from pickle file."""
    if not os.path.exists(ENCODINGS_FILE):
        return {}
    try:
        with open(ENCODINGS_FILE, "rb") as f:
            data = pickle.load(f)
            if isinstance(data, dict):
                return data
    except Exception as e:
        print(f"[WARNING] Could not load {ENCODINGS_FILE}: {e}")
    return {}


def main():
    print("=" * 65)
    print("    AI/ML LAB - REAL-TIME FACE RECOGNITION ATTENDANCE SYSTEM")
    print("    Hardware Mode: CPU-Only (HOG Model) | 2.0s Interval Throttling")
    print("=" * 65)

    # Initialize database
    database.init_db()

    # Open webcam index 0
    print("[INFO] Initializing USB Webcam (Index 0)...")
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("[FATAL] Unable to access camera at index 0. Ensure no other app is using it.")
        sys.exit(1)

    print("[INFO] Camera initialized successfully. Press 'q' in video window to exit.")
    
    last_process_time = 0.0
    PROCESS_INTERVAL = 2.0  # seconds between face recognition runs to conserve CPU
    last_logged_time = {}
    EVENT_COOLDOWN = 10.0  # seconds cooldown

    while True:
        ret, frame = cap.read()
        if not ret:
            print("[ERROR] Camera frame capture failed. Retrying...")
            time.sleep(0.5)
            continue

        current_time = time.time()

        # Run detection only once every ~2 seconds
        if current_time - last_process_time >= PROCESS_INTERVAL:
            last_process_time = current_time
            now_dt = datetime.now()
            today_str = now_dt.strftime("%Y-%m-%d")
            now_str = now_dt.strftime("%Y-%m-%d %H:%M:%S")

            known_dict = load_known_encodings()
            known_names = list(known_dict.keys())
            known_encodings = list(known_dict.values())

            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            face_locations = face_recognition.face_locations(rgb_frame, model="hog")

            if len(face_locations) > 0:
                face_encodings = face_recognition.face_encodings(rgb_frame, face_locations)

                for (top, right, bottom, left), face_encoding in zip(face_locations, face_encodings):
                    matched_name = None

                    if len(known_encodings) > 0:
                        matches = face_recognition.compare_faces(known_encodings, face_encoding, tolerance=0.55)
                        if True in matches:
                            first_match_index = matches.index(True)
                            matched_name = known_names[first_match_index]

                    if matched_name is not None:
                        last_time = last_logged_time.get(matched_name, 0)
                        if (current_time - last_time) < EVENT_COOLDOWN:
                            continue
                        last_logged_time[matched_name] = current_time

                        # Check attendance_logs for that name's most recent row today
                        recent_log = database.get_latest_log_today(name=matched_name, today_date=today_str)

                        if recent_log and recent_log.get("in_time") and not recent_log.get("out_time"):
                            database.update_out_time(log_id=recent_log["id"], out_time=now_str)
                            print(f"[{now_str}] MATCH: {matched_name} | Action: OUT | Status: Out-time logged ({now_str})")
                        else:
                            database.insert_attendance_log(
                                name=matched_name,
                                is_known=True,
                                in_time=now_str,
                                date=today_str,
                                image_path=None
                            )
                            print(f"[{now_str}] MATCH: {matched_name} | Action: IN  | Status: In-time logged ({now_str})")

                    else:
                        # Unknown face
                        h, w, _ = frame.shape
                        pad_top = max(0, top - 20)
                        pad_bottom = min(h, bottom + 20)
                        pad_left = max(0, left - 20)
                        pad_right = min(w, right + 20)
                        face_crop = frame[pad_top:pad_bottom, pad_left:pad_right]

                        date_folder = os.path.join(UNKNOWN_FACES_ROOT, today_str)
                        os.makedirs(date_folder, exist_ok=True)

                        timestamp_file = now_dt.strftime("%H-%M-%S")
                        image_filename = f"{timestamp_file}.jpg"
                        full_img_path = os.path.join(date_folder, image_filename)
                        rel_img_path = os.path.relpath(full_img_path, PROJECT_ROOT).replace("\\\\", "/")
                        
                        cv2.imwrite(full_img_path, face_crop)

                        counter = database.get_unknown_counter(today_date=today_str)
                        unknown_label = f"Unknown_{counter}"

                        database.insert_attendance_log(
                            name=unknown_label,
                            is_known=False,
                            in_time=now_str,
                            date=today_str,
                            image_path=rel_img_path
                        )
                        print(f"[{now_str}] UNKNOWN FACE DETECTED | Action: IN  | Name: {unknown_label} | Image: {rel_img_path}")

        display_frame = frame.copy()
        cv2.putText(display_frame, "AI Lab Attendance Camera (Active - 2s Cycle)", (15, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 200, 0), 2)
        cv2.imshow("AI Lab Face Recognition Attendance", display_frame)

        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    main()`,
    },
    'enroll_faces.py': {
      path: 'lab_attendance_system/face_recognition_module/enroll_faces.py',
      language: 'python',
      desc: 'CLI script to register a known person: prompts name, captures webcam photo, computes 128-d encoding (HOG), and writes to known_encodings.pkl.',
      content: `import cv2
import face_recognition
import pickle
import os
import sys

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
ENCODINGS_FILE = os.path.join(CURRENT_DIR, "known_encodings.pkl")

def enroll():
    print("=" * 60)
    print("    AI/ML LAB - FACE ENROLLMENT MODULE (RICHA MAM)")
    print("=" * 60)

    name = input("Enter person's name to register (e.g., Richa Mam, Ayush): ").strip()
    if not name:
        print("[ERROR] Name cannot be empty.")
        return

    print("\\n[INFO] Opening webcam (index 0)...")
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("[ERROR] Could not open webcam (index 0).")
        return

    print("Press SPACE or 's' to capture photo, or 'q' to cancel.")
    captured_frame = None

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        display_frame = frame.copy()
        cv2.putText(display_frame, f"Enrolling: {name}", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 255, 0), 2)
        cv2.putText(display_frame, "Press SPACE or 'S' to capture | 'Q' to quit", (20, 80), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
        cv2.imshow("Enroll Face - AI Lab", display_frame)
        key = cv2.waitKey(1) & 0xFF

        if key == ord('q') or key == 27:
            break
        elif key == ord(' ') or key == ord('s') or key == ord('S'):
            captured_frame = frame
            break

    cap.release()
    cv2.destroyAllWindows()

    if captured_frame is None:
        return

    print("[INFO] Processing image and generating face encoding (CPU hog model)...")
    rgb_frame = cv2.cvtColor(captured_frame, cv2.COLOR_BGR2RGB)
    face_locations = face_recognition.face_locations(rgb_frame, model="hog")

    if len(face_locations) == 0:
        print("[ERROR] No face detected. Try with better lighting.")
        return

    encodings = face_recognition.face_encodings(rgb_frame, face_locations)
    if len(encodings) == 0:
        print("[ERROR] Could not extract face encodings.")
        return

    new_encoding = encodings[0]

    known_data = {}
    if os.path.exists(ENCODINGS_FILE):
        try:
            with open(ENCODINGS_FILE, "rb") as f:
                known_data = pickle.load(f)
                if not isinstance(known_data, dict):
                    known_data = {}
        except Exception:
            known_data = {}

    known_data[name] = new_encoding

    with open(ENCODINGS_FILE, "wb") as f:
        pickle.dump(known_data, f)
    print(f"\\n[SUCCESS] Successfully registered and saved encoding for '{name}'!")

if __name__ == "__main__":
    enroll()`,
    },
    'main.py': {
      path: 'lab_attendance_system/backend/main.py',
      language: 'python',
      desc: 'FastAPI server bound to 0.0.0.0:8000 for WiFi network access: provides /attendance/logs, /pc/status, /pc/occupy, /pc/free, /unknown_faces.',
      content: `import os
from datetime import datetime
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import database

app = FastAPI(
    title="AI/ML Lab Attendance & PC Occupancy System",
    description="Backend API for Richa Mam's AI Lab Attendance & PC Tracker",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UNKNOWN_FACES_DIR = os.path.join(BASE_DIR, "unknown_faces")
os.makedirs(UNKNOWN_FACES_DIR, exist_ok=True)
app.mount("/unknown_faces_static", StaticFiles(directory=UNKNOWN_FACES_DIR), name="unknown_faces_static")

class OccupyRequest(BaseModel):
    pc_id: str
    name: str

class FreeRequest(BaseModel):
    pc_id: str

@app.on_event("startup")
def startup_event():
    database.init_db()

@app.get("/attendance/logs")
def get_attendance_logs(
    date: Optional[str] = Query(None, description="Format YYYY-MM-DD"),
    name: Optional[str] = Query(None, description="Filter by person's name")
) -> List[Dict[str, Any]]:
    return database.get_attendance_logs(date=date, name=name)

@app.get("/pc/status")
def get_pc_status() -> List[Dict[str, Any]]:
    return database.get_all_pc_status()

@app.post("/pc/occupy")
def occupy_pc_endpoint(payload: OccupyRequest):
    pc_id = payload.pc_id.strip()
    name = payload.name.strip()
    if not pc_id or not name:
        raise HTTPException(status_code=400, detail="pc_id and name required.")
    success = database.occupy_pc(pc_id=pc_id, name=name)
    if not success:
        raise HTTPException(status_code=404, detail=f"PC {pc_id} not found.")
    return {"status": "success", "message": f"{pc_id} marked occupied by {name}"}

@app.post("/pc/free")
def free_pc_endpoint(payload: FreeRequest):
    pc_id = payload.pc_id.strip()
    success = database.free_pc(pc_id=pc_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"PC {pc_id} not found.")
    return {"status": "success", "message": f"{pc_id} marked as free"}

@app.get("/unknown_faces")
def get_unknown_faces() -> List[Dict[str, str]]:
    images_list = []
    if not os.path.exists(UNKNOWN_FACES_DIR):
        return []
    for root, _, files in os.walk(UNKNOWN_FACES_DIR):
        for file in sorted(files, reverse=True):
            if file.lower().endswith((".jpg", ".jpeg", ".png")):
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, BASE_DIR)
                parent_dir = os.path.basename(root)
                date_val = parent_dir if len(parent_dir) == 10 else "Unknown"
                images_list.append({
                    "image_path": rel_path.replace("\\\\", "/"),
                    "date": date_val,
                    "timestamp": os.path.splitext(file)[0].replace("_", " "),
                    "filename": file
                })
    return images_list

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)`,
    },
    'database.py': {
      path: 'lab_attendance_system/backend/database.py',
      language: 'python',
      desc: 'Raw SQLite operations via built-in sqlite3. Creates attendance_logs and pc_status tables and seeds PC-1 through PC-10 as free.',
      content: `import sqlite3
import os
from datetime import datetime
from typing import List, Dict, Any, Optional

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "lab_attendance.db")

def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db() -> None:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS attendance_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            is_known BOOLEAN,
            image_path TEXT,
            in_time TEXT,
            out_time TEXT,
            date TEXT
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS pc_status (
            pc_id TEXT PRIMARY KEY,
            status TEXT,
            occupied_by TEXT,
            since_time TEXT
        )
    """)
    cursor.execute("SELECT COUNT(*) AS cnt FROM pc_status")
    row = cursor.fetchone()
    if row and row["cnt"] == 0:
        seed_pcs = [(f"PC-{i}", "free", None, None) for i in range(1, 11)]
        cursor.executemany(
            "INSERT INTO pc_status (pc_id, status, occupied_by, since_time) VALUES (?, ?, ?, ?)",
            seed_pcs
        )
        conn.commit()
    conn.commit()
    conn.close()

def get_all_pc_status() -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT pc_id, status, occupied_by, since_time FROM pc_status")
    rows = cursor.fetchall()
    conn.close()
    results = [dict(row) for row in rows]
    results.sort(key=lambda x: int(x["pc_id"].replace("PC-", "")) if "PC-" in x["pc_id"] else 999)
    return results

def occupy_pc(pc_id: str, name: str) -> bool:
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE pc_status SET status = 'occupied', occupied_by = ?, since_time = ? WHERE pc_id = ?",
        (name, now_str, pc_id)
    )
    conn.commit()
    affected = cursor.rowcount > 0
    conn.close()
    return affected

def free_pc(pc_id: str) -> bool:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE pc_status SET status = 'free', occupied_by = NULL, since_time = NULL WHERE pc_id = ?",
        (pc_id,)
    )
    conn.commit()
    affected = cursor.rowcount > 0
    conn.close()
    return affected

def get_attendance_logs(date: Optional[str] = None, name: Optional[str] = None) -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    query = "SELECT id, name, is_known, image_path, in_time, out_time, date FROM attendance_logs WHERE 1=1"
    params = []
    if date:
        query += " AND date = ?"
        params.append(date)
    if name:
        query += " AND name LIKE ?"
        params.append(f"%{name}%")
    query += " ORDER BY id DESC"
    cursor.execute(query, tuple(params))
    rows = cursor.fetchall()
    conn.close()
    results = []
    for r in rows:
        d = dict(r)
        d["is_known"] = bool(d["is_known"])
        results.append(d)
    return results

def get_latest_log_today(name: str, today_date: str) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, name, is_known, image_path, in_time, out_time, date FROM attendance_logs WHERE name = ? AND date = ? ORDER BY id DESC LIMIT 1",
        (name, today_date)
    )
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def insert_attendance_log(name: str, is_known: bool, in_time: str, date: str, image_path: Optional[str] = None) -> int:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO attendance_logs (name, is_known, image_path, in_time, out_time, date) VALUES (?, ?, ?, ?, NULL, ?)",
        (name, 1 if is_known else 0, image_path, in_time, date)
    )
    conn.commit()
    inserted_id = cursor.lastrowid
    conn.close()
    return inserted_id

def update_out_time(log_id: int, out_time: str) -> bool:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE attendance_logs SET out_time = ? WHERE id = ?", (out_time, log_id))
    conn.commit()
    affected = cursor.rowcount > 0
    conn.close()
    return affected

def get_unknown_counter(today_date: str) -> int:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) AS cnt FROM attendance_logs WHERE is_known = 0 AND date = ?", (today_date,))
    row = cursor.fetchone()
    conn.close()
    return (row["cnt"] if row else 0) + 1

init_db()`,
    },
    'app.py': {
      path: 'lab_attendance_system/dashboard/app.py',
      language: 'python',
      desc: 'Streamlit dashboard running on 0.0.0.0 with 3 pages (PC Status, Attendance Logs, Unknown Faces) and 4 static Quick Message templates with one-click copy.',
      content: `import streamlit as st
import requests
import os
import time
from datetime import datetime

st.set_page_config(page_title="AI/ML Lab - PC & Attendance Tracker", page_icon="🖥️", layout="wide")
API_BASE_URL = os.environ.get("API_BASE_URL", "http://127.0.0.1:8000")

st.sidebar.title("AI/ML Lab Monitor")
st.sidebar.caption("In-Charge: Richa Mam")
page = st.sidebar.radio("Navigation", ["PC Status", "Attendance Logs", "Unknown Faces"])

if page == "PC Status":
    st.title("🖥️ AI/ML Lab - PC Occupancy Tracker")
    resp = requests.get(f"{API_BASE_URL}/pc/status", timeout=4)
    pc_data = resp.json() if resp.status_code == 200 else []
    
    cols = st.columns(5)
    for idx, pc in enumerate(pc_data):
        col = cols[idx % 5]
        is_free = pc.get("status") == "free"
        with col:
            st.metric(pc["pc_id"], "AVAILABLE" if is_free else "OCCUPIED", pc.get("occupied_by") or "Free")
            if not is_free and st.button(f"Mark {pc['pc_id']} Free", key=f"free_{pc['pc_id']}"):
                requests.post(f"{API_BASE_URL}/pc/free", json={"pc_id": pc["pc_id"]})
                st.rerun()

    st.markdown("---")
    st.subheader("📋 Quick Messages")
    st.code("""Lab PC Availability Update:
The following PCs are currently free — [EDIT: PC LIST]
Please come to the AI Lab if you'd like to use one.

- Richa Mam""", language="text")

    st.code("""Lab PC Availability Update:
All PCs in the AI Lab are currently occupied.
Will update once a system is free.

- Richa Mam""", language="text")

    st.code("""Hi [EDIT: Faculty Name],
PC-[EDIT: X] is currently free in the AI Lab. You can come and use it.

- Richa Mam""", language="text")

    st.code("""Reminder: If you're done using your PC in the AI Lab,
please mark it as "Free" on the tracker so others can use it.

- Richa Mam""", language="text")

elif page == "Attendance Logs":
    st.title("📋 Lab Attendance Logs (Face Recognition)")
    date_val = st.date_input("Filter Date", value=datetime.today())
    logs = requests.get(f"{API_BASE_URL}/attendance/logs", params={"date": str(date_val)}).json()
    st.dataframe(logs, use_container_width=True)

elif page == "Unknown Faces":
    st.title("📸 Unknown Visitors & Face Snapshots")
    images = requests.get(f"{API_BASE_URL}/unknown_faces").json()
    cols = st.columns(4)
    for i, img_item in enumerate(images):
        with cols[i % 4]:
            st.write(img_item.get("filename"))`,
    },
    'requirements.txt': {
      path: 'lab_attendance_system/requirements.txt',
      language: 'text',
      desc: 'Mandatory Python dependencies: face_recognition, opencv-python, fastapi, uvicorn, streamlit, requests, python-multipart.',
      content: `face_recognition
opencv-python
fastapi
uvicorn
streamlit
requests
python-multipart`,
    },
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(filesContent[activeFile].content);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyCommand = (cmd: string, key: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(key);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Run Guide Banner */}
      <div className="bg-white rounded-xl p-5 sm:p-6 border border-[#c7c4d8]/40 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 bg-[#f0f3ff] rounded-lg text-[#3525cd]">
                <Terminal className="w-6 h-6" />
              </span>
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-[#111c2d]">
                  Windows Execution Guide & Terminal Commands
                </h2>
                <p className="text-xs sm:text-sm text-[#464555]">
                  Intel i7-14700HX CPU Setup | 3 Independent Background Processes
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-[#f0f3ff] px-3 py-1.5 rounded-lg border border-[#c7c4d8]/40 text-xs font-semibold text-[#111c2d]">
            <Cpu className="w-4 h-4 text-[#3525cd]" />
            <span>Hardware: CPU-only HOG model (No GPU needed)</span>
          </div>
        </div>

        {/* 3 Process Commands */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-6">
          <div className="bg-[#111c2d] rounded-xl p-4 text-slate-100 font-mono text-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2 text-emerald-400 font-bold">
                <span>Terminal 1: Backend API</span>
                <span className="text-[10px] bg-emerald-950 px-1.5 py-0.5 rounded border border-emerald-700">Port 8000</span>
              </div>
              <p className="text-slate-400 text-[11px] mb-2 font-sans">
                Starts FastAPI bound to 0.0.0.0:8000 for WiFi mobile access
              </p>
              <pre className="bg-black/50 p-2.5 rounded text-emerald-300 overflow-x-auto text-[11px]">
                uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
              </pre>
            </div>
            <button
              onClick={() => handleCopyCommand('uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload', 'cmd1')}
              className="mt-3 w-full py-1.5 bg-slate-800 hover:bg-slate-700 rounded text-[11px] font-sans font-bold flex items-center justify-center gap-1 text-slate-200"
            >
              {copiedCmd === 'cmd1' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copiedCmd === 'cmd1' ? 'Copied Command!' : 'Copy Command'}</span>
            </button>
          </div>

          <div className="bg-[#111c2d] rounded-xl p-4 text-slate-100 font-mono text-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2 text-indigo-300 font-bold">
                <span>Terminal 2: Streamlit Dashboard</span>
                <span className="text-[10px] bg-indigo-950 px-1.5 py-0.5 rounded border border-indigo-700">Port 8501</span>
              </div>
              <p className="text-slate-400 text-[11px] mb-2 font-sans">
                Mobile-friendly dashboard for Richa Mam and faculty phones
              </p>
              <pre className="bg-black/50 p-2.5 rounded text-indigo-300 overflow-x-auto text-[11px]">
                streamlit run dashboard/app.py --server.address 0.0.0.0
              </pre>
            </div>
            <button
              onClick={() => handleCopyCommand('streamlit run dashboard/app.py --server.address 0.0.0.0', 'cmd2')}
              className="mt-3 w-full py-1.5 bg-slate-800 hover:bg-slate-700 rounded text-[11px] font-sans font-bold flex items-center justify-center gap-1 text-slate-200"
            >
              {copiedCmd === 'cmd2' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copiedCmd === 'cmd2' ? 'Copied Command!' : 'Copy Command'}</span>
            </button>
          </div>

          <div className="bg-[#111c2d] rounded-xl p-4 text-slate-100 font-mono text-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2 text-amber-300 font-bold">
                <span>Terminal 3: Face Recognizer</span>
                <span className="text-[10px] bg-amber-950 px-1.5 py-0.5 rounded border border-amber-700">Webcam 0</span>
              </div>
              <p className="text-slate-400 text-[11px] mb-2 font-sans">
                Continuous webcam background loop (2s CPU throttle)
              </p>
              <pre className="bg-black/50 p-2.5 rounded text-amber-300 overflow-x-auto text-[11px]">
                python face_recognition_module/recognizer.py
              </pre>
            </div>
            <button
              onClick={() => handleCopyCommand('python face_recognition_module/recognizer.py', 'cmd3')}
              className="mt-3 w-full py-1.5 bg-slate-800 hover:bg-slate-700 rounded text-[11px] font-sans font-bold flex items-center justify-center gap-1 text-slate-200"
            >
              {copiedCmd === 'cmd3' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copiedCmd === 'cmd3' ? 'Copied Command!' : 'Copy Command'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Code Browser Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Sidebar: File Tree */}
        <div className="lg:col-span-4 space-y-3">
          <div className="bg-white rounded-xl p-4 border border-[#c7c4d8]/40 shadow-xs">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#464555] mb-3 flex items-center gap-1.5">
              <FolderTree className="w-4 h-4 text-[#3525cd]" />
              <span>Project Structure (lab_attendance_system/)</span>
            </h3>

            <div className="space-y-1">
              {Object.keys(filesContent).map((fileName) => {
                const item = filesContent[fileName];
                const isSelected = activeFile === fileName;
                return (
                  <button
                    key={fileName}
                    onClick={() => setActiveFile(fileName)}
                    className={`w-full text-left p-2.5 rounded-lg text-xs font-mono transition-all flex items-center justify-between min-h-[40px] ${
                      isSelected
                        ? 'bg-[#3525cd] text-white font-bold shadow-xs'
                        : 'text-[#111c2d] hover:bg-[#f0f3ff]'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <FileCode className={`w-4 h-4 shrink-0 ${isSelected ? 'text-white' : 'text-[#3525cd]'}`} />
                      <span className="truncate">{fileName}</span>
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>
                      {item.language}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-[#f0f3ff] rounded-xl p-4 border border-[#c7c4d8]/40 text-xs text-[#111c2d] space-y-2">
            <p className="font-bold flex items-center gap-1.5 text-[#3525cd]">
              <CheckCircle className="w-4 h-4" />
              <span>Strict Separation of Concerns</span>
            </p>
            <ul className="list-disc list-inside space-y-1 text-[#464555]">
              <li>Face Recognizer only updates <code className="text-[#3525cd]">attendance_logs</code>.</li>
              <li>PC Occupancy is strictly manual via Streamlit / Web buttons.</li>
              <li>Zero GPU dependency: HOG model runs smoothly on Intel i7 CPU.</li>
            </ul>
          </div>
        </div>

        {/* Right Code Display */}
        <div className="lg:col-span-8">
          <div className="bg-white rounded-xl border border-[#c7c4d8]/40 shadow-xs overflow-hidden flex flex-col">
            {/* File Path Header */}
            <div className="bg-[#f0f3ff] px-4 py-3 border-b border-[#c7c4d8]/40 flex items-center justify-between">
              <div>
                <span className="text-xs font-mono font-bold text-[#111c2d]">
                  {filesContent[activeFile].path}
                </span>
                <p className="text-[11px] text-[#464555] mt-0.5">
                  {filesContent[activeFile].desc}
                </p>
              </div>

              <button
                onClick={handleCopyCode}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white text-[#111c2d] font-bold text-xs rounded-lg border border-[#c7c4d8] hover:bg-slate-50 transition-colors shadow-2xs min-h-[36px]"
              >
                {copiedCode ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-[#3525cd]" />
                    <span>Copy Code</span>
                  </>
                )}
              </button>
            </div>

            {/* Code Body */}
            <div className="p-4 bg-[#111c2d] overflow-x-auto text-slate-100 font-mono text-xs max-h-[520px]">
              <pre className="whitespace-pre leading-relaxed select-all">
                {filesContent[activeFile].content}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
