import sqlite3
import os
import pickle
from datetime import datetime
from typing import List, Dict, Any, Optional

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(CURRENT_DIR)
DB_PATH = os.path.join(CURRENT_DIR, "lab_attendance.db")
ENCODINGS_FILE = os.path.join(PROJECT_ROOT, "face_recognition_module", "known_encodings.pkl")


def get_db_connection() -> sqlite3.Connection:
    """Returns a SQLite connection with row factory configured to return dict-like rows."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """Creates tables if they do not exist, runs migrations, and seeds initial data."""
    conn = get_db_connection()
    cursor = conn.cursor()

    # Table 1: attendance_logs
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS attendance_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            is_known BOOLEAN,
            image_path TEXT,
            in_time TEXT,
            out_time TEXT,
            date TEXT,
            current_project TEXT DEFAULT ''
        )
    """)

    # Table 2: pc_status
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS pc_status (
            pc_id TEXT PRIMARY KEY,
            status TEXT,
            occupied_by TEXT,
            since_time TEXT,
            end_time TEXT,
            duration_mins INTEGER,
            user_email TEXT,
            user_role TEXT DEFAULT 'Student',
            current_project TEXT DEFAULT ''
        )
    """)

    # Table 3: registered_users
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS registered_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE,
            email TEXT,
            roll_no TEXT,
            avatar_url TEXT,
            role TEXT DEFAULT 'Student',
            department TEXT DEFAULT '',
            current_project TEXT DEFAULT '',
            created_at TEXT
        )
    """)

    # Table 4: pc_allotment_history
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS pc_allotment_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pc_id TEXT,
            student_name TEXT,
            user_email TEXT,
            user_role TEXT,
            current_project TEXT DEFAULT '',
            start_time TEXT,
            end_time TEXT,
            duration_mins INTEGER,
            created_date TEXT
        )
    """)

    # Table 5: system_settings
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS system_settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    """)

    # Table 6: weekly_schedules (Flexible Timetable Bookings)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS weekly_schedules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_name TEXT,
            day_of_week TEXT,
            slot_number INTEGER,
            slot_start TEXT,
            slot_end TEXT,
            week_label TEXT DEFAULT 'recurring',
            created_at TEXT
        )
    """)

    # Table 7: student_projects (Ongoing Lab Projects)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS student_projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            student_names TEXT,
            description TEXT,
            status TEXT DEFAULT 'Ongoing',
            technologies TEXT,
            start_date TEXT,
            pc_assigned TEXT,
            created_at TEXT,
            updated_at TEXT
        )
    """)

    # Migrations for registered_users table
    cursor.execute("PRAGMA table_info(registered_users)")
    reg_columns = [row["name"] for row in cursor.fetchall()]
    if "role" not in reg_columns:
        cursor.execute("ALTER TABLE registered_users ADD COLUMN role TEXT DEFAULT 'Student'")
    if "department" not in reg_columns:
        cursor.execute("ALTER TABLE registered_users ADD COLUMN department TEXT DEFAULT ''")
    if "current_project" not in reg_columns:
        cursor.execute("ALTER TABLE registered_users ADD COLUMN current_project TEXT DEFAULT ''")

    # Migrations for existing pc_status table if missing columns
    cursor.execute("PRAGMA table_info(pc_status)")
    columns = [row["name"] for row in cursor.fetchall()]
    if "end_time" not in columns:
        cursor.execute("ALTER TABLE pc_status ADD COLUMN end_time TEXT")
    if "duration_mins" not in columns:
        cursor.execute("ALTER TABLE pc_status ADD COLUMN duration_mins INTEGER")
    if "user_email" not in columns:
        cursor.execute("ALTER TABLE pc_status ADD COLUMN user_email TEXT")
    if "user_role" not in columns:
        cursor.execute("ALTER TABLE pc_status ADD COLUMN user_role TEXT DEFAULT 'Student'")
    if "current_project" not in columns:
        cursor.execute("ALTER TABLE pc_status ADD COLUMN current_project TEXT DEFAULT ''")
    if "display_name" not in columns:
        cursor.execute("ALTER TABLE pc_status ADD COLUMN display_name TEXT DEFAULT ''")

    # Migrations for pc_allotment_history
    cursor.execute("PRAGMA table_info(pc_allotment_history)")
    hist_columns = [row["name"] for row in cursor.fetchall()]
    if "user_role" not in hist_columns:
        cursor.execute("ALTER TABLE pc_allotment_history ADD COLUMN user_role TEXT DEFAULT 'Student'")
    if "current_project" not in hist_columns:
        cursor.execute("ALTER TABLE pc_allotment_history ADD COLUMN current_project TEXT DEFAULT ''")

    # Migrations for attendance_logs
    cursor.execute("PRAGMA table_info(attendance_logs)")
    att_columns = [row["name"] for row in cursor.fetchall()]
    if "current_project" not in att_columns:
        cursor.execute("ALTER TABLE attendance_logs ADD COLUMN current_project TEXT DEFAULT ''")

    # Migrations for student_projects table
    cursor.execute("PRAGMA table_info(student_projects)")
    proj_columns = [row["name"] for row in cursor.fetchall()]
    if "deployment_url" not in proj_columns:
        cursor.execute("ALTER TABLE student_projects ADD COLUMN deployment_url TEXT DEFAULT ''")
    if "github_url" not in proj_columns:
        cursor.execute("ALTER TABLE student_projects ADD COLUMN github_url TEXT DEFAULT ''")
    if "duration" not in proj_columns:
        cursor.execute("ALTER TABLE student_projects ADD COLUMN duration TEXT DEFAULT ''")
    if "report_status" not in proj_columns:
        cursor.execute("ALTER TABLE student_projects ADD COLUMN report_status TEXT DEFAULT 'Pending'")
    if "report_url" not in proj_columns:
        cursor.execute("ALTER TABLE student_projects ADD COLUMN report_url TEXT DEFAULT ''")
    if "student_details" not in proj_columns:
        cursor.execute("ALTER TABLE student_projects ADD COLUMN student_details TEXT DEFAULT ''")

    # Seed PC-1 to PC-8 + BACKEND if table empty
    cursor.execute("SELECT COUNT(*) AS cnt FROM pc_status")
    row = cursor.fetchone()
    if row and row["cnt"] == 0:
        seed_pcs = [("BACKEND", "occupied", "24/7 Local Host Server", None, None, None, None)] + [(f"PC-{i}", "free", None, None, None, None, None) for i in range(1, 9)]
        cursor.executemany(
            "INSERT INTO pc_status (pc_id, status, occupied_by, since_time, end_time, duration_mins, user_email) VALUES (?, ?, ?, ?, ?, ?, ?)",
            seed_pcs
        )

    # Sync registered_users from known_encodings.pkl if available
    if os.path.exists(ENCODINGS_FILE):
        try:
            with open(ENCODINGS_FILE, "rb") as f:
                known_dict = pickle.load(f)
                if isinstance(known_dict, dict):
                    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    for name in known_dict.keys():
                        clean_name = name.strip()
                        safe_name = "".join([c for c in clean_name if c.isalnum() or c == " "]).rstrip().replace(" ", "_")
                        avatar_path = f"/static/avatars/{safe_name}.jpg"
                        cursor.execute("""
                            INSERT OR IGNORE INTO registered_users (name, email, roll_no, avatar_url, created_at)
                            VALUES (?, ?, ?, ?, ?)
                        """, (clean_name, "", "", avatar_path, now_str))
        except Exception as e:
            print(f"[WARN] Error syncing registered users from pkl: {e}")

    # Seed initial AI Lab student projects if table empty
    cursor.execute("SELECT COUNT(*) AS cnt FROM student_projects")
    proj_cnt_row = cursor.fetchone()
    if proj_cnt_row and proj_cnt_row["cnt"] == 0:
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        seed_projects = [
            (
                "Autonomous Drone Vision & Precision Landing",
                "Ritik Kumar, Harsh Vardhan",
                "Ritik (Lead Vision Researcher), Harsh (Flight Systems Integration)",
                "Edge-computed real-time visual odometry, ArUco fiducial marker tracking, and autonomous precision landing in GPS-denied indoor environments.",
                "Ongoing",
                "PyTorch, YOLOv10, ROS2, OpenCV, CUDA, TensorRT",
                "4 Months (Jan 2026 - May 2026)",
                "https://drone-vision.ailab.internal",
                "https://github.com/ailab/drone-precision-landing",
                "Filed",
                "/reports/drone_precision_landing_interim.pdf",
                "2026-01-15",
                "PC-6",
                now_str,
                now_str
            ),
            (
                "AI/ML Lab Digital Twin & Attendance Biometrics",
                "Mukul",
                "Mukul (Full-Stack AI Architect)",
                "Interactive 3D digital twin of AI/ML research lab, real-time facial recognition surveillance at entrance gate, automated multi-seat workstation allocation and reporting.",
                "Ongoing",
                "FastAPI, Three.js, Face Recognition, SQLite, WebRTC, Uvicorn",
                "3 Months (Jan 2026 - Present)",
                "https://amaretto-confess-subtract.ngrok-free.dev",
                "https://github.com/mukuld1511-bit/AI-LAB",
                "Filed",
                "/reports/ai_lab_digital_twin_system_v2.pdf",
                "2026-01-10",
                "PC-7",
                now_str,
                now_str
            ),
            (
                "Medical Imaging CT-Scan Lesion Segmentation",
                "Prateek Sharma, Aman Gupta",
                "Prateek (Lead Deep Learning), Aman (Dataset & Augmentation)",
                "Volumetric 3D CT scan segmentation for early detection of pulmonary nodules and ischemic stroke lesions using MONAI on high-memory DGX nodes.",
                "Ongoing",
                "MONAI, 3D U-Net, PyTorch, SimpleITK, CUDA",
                "6 Months (Nov 2025 - May 2026)",
                "https://med-vision.ailab.internal",
                "https://github.com/ailab/monai-ct-lesions",
                "Pending",
                "",
                "2025-11-20",
                "PC-4",
                now_str,
                now_str
            ),
            (
                "Local Agentic LLM Workbench & Document RAG",
                "Harsh Vardhan, Ritik Kumar",
                "Harsh (Agentic Orchestration), Ritik (Inference Engine & RAG)",
                "On-premise zero-data-leakage LLM agent workbench with multi-model local routing, vector document retrieval, and automated audit report generation.",
                "Ongoing",
                "Ollama, vLLM, LangChain, Qdrant, Electron, Python",
                "2 Months (Feb 2026 - Present)",
                "https://agentic-workbench.ailab.local",
                "https://github.com/ailab/local-agentic-workbench",
                "Filed",
                "/reports/local_agentic_workbench_audit.pdf",
                "2026-02-01",
                "PC-5",
                now_str,
                now_str
            )
        ]
        cursor.executemany("""
            INSERT INTO student_projects (
                title, student_names, student_details, description, status,
                technologies, duration, deployment_url, github_url, report_status,
                report_url, start_date, pc_assigned, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, seed_projects)

    conn.commit()
    conn.close()


def check_and_expire_pc_allocations() -> int:
    """
    Checks for any occupied PC whose end_time has passed.
    Automatically frees the workstation.
    Returns the number of slots auto-freed.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Find PCs that have passed end_time
    cursor.execute("""
        SELECT pc_id, occupied_by, end_time FROM pc_status 
        WHERE status = 'occupied' AND end_time IS NOT NULL AND end_time != '' AND end_time <= ?
    """, (now_str,))
    expired_pcs = cursor.fetchall()

    if expired_pcs:
        for p in expired_pcs:
            print(f"[AUTO-EXPIRE] Workstation {p['pc_id']} allotted to {p['occupied_by']} expired at {p['end_time']}. Marking FREE.")
            cursor.execute("""
                UPDATE pc_status 
                SET status = 'free', occupied_by = NULL, since_time = NULL, end_time = NULL, duration_mins = NULL, user_email = NULL, user_role = NULL, current_project = '' 
                WHERE UPPER(pc_id) = UPPER(?)
            """, (p["pc_id"],))
        conn.commit()

    freed_count = len(expired_pcs)
    conn.close()
    return freed_count


def get_all_pc_status() -> List[Dict[str, Any]]:
    """Fetch all PC status rows sorted by pc_id numerical order with auto-expiry check."""
    # First auto-expire any lapsed slots
    check_and_expire_pc_allocations()

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT pc_id, status, occupied_by, since_time, end_time, duration_mins, user_email, user_role, current_project, display_name FROM pc_status")
    rows = cursor.fetchall()
    conn.close()

    results = []
    for row in rows:
        item = dict(row)
        if item.get("pc_id", "").upper() == "BACKEND":
            item["display_name"] = "BACKEND"
            item["is_backend"] = True
        else:
            item["display_name"] = item.get("display_name") or item["pc_id"]
            item["is_backend"] = False
        results.append(item)

    def sort_key(item):
        pid = item.get("pc_id", "").upper()
        if pid == "BACKEND":
            return 0 # Place BACKEND first or as host
        try:
            return int(pid.replace("PC-", ""))
        except Exception:
            return 999
    results.sort(key=sort_key)
    return results


def occupy_pc(
    pc_id: str,
    name: str,
    duration_mins: Optional[int] = None,
    end_time: Optional[str] = None,
    user_email: Optional[str] = None,
    user_role: Optional[str] = "Student",
    start_time: Optional[str] = None,
    current_project: Optional[str] = ""
) -> bool:
    """Marks a PC as occupied with optional time duration, user email, role, explicit start_time, current project, and multi-occupant support."""
    conn = get_db_connection()
    cursor = conn.cursor()
    now_dt = datetime.now()
    now_str = now_dt.strftime("%Y-%m-%d %H:%M:%S")
    effective_start = start_time.strip() if (start_time and start_time.strip()) else now_str

    # If end_time is not explicitly passed but duration_mins is provided, calculate end_time
    if not end_time and duration_mins and duration_mins > 0:
        import datetime as dt_module
        try:
            parsed_start = datetime.strptime(effective_start, "%Y-%m-%d %H:%M:%S")
        except Exception:
            parsed_start = now_dt
        end_dt = parsed_start + dt_module.timedelta(minutes=duration_mins)
        end_time = end_dt.strftime("%Y-%m-%d %H:%M:%S")

    role_val = user_role.strip().capitalize() if user_role else "Student"
    proj_val = current_project.strip() if current_project else ""

    # Parse and clean student names (supports single student or comma-separated group of students)
    clean_names = [n.strip() for n in name.split(",") if n.strip()]
    occupants_str = ", ".join(clean_names) if clean_names else name.strip()

    cursor.execute("""
        UPDATE pc_status 
        SET status = 'occupied', 
            occupied_by = ?, 
            since_time = ?, 
            end_time = ?, 
            duration_mins = ?, 
            user_email = ?,
            user_role = ?,
            current_project = ? 
        WHERE UPPER(pc_id) = UPPER(?)
    """, (occupants_str, effective_start, end_time, duration_mins, user_email, role_val, proj_val, pc_id.strip()))
    affected = cursor.rowcount > 0
    
    # Log each student into pc_allotment_history
    names_to_log = clean_names if clean_names else [name.strip()]
    for student in names_to_log:
        cursor.execute("""
            INSERT INTO pc_allotment_history 
            (pc_id, student_name, user_email, user_role, current_project, start_time, end_time, duration_mins, created_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (pc_id.strip(), student, user_email, role_val, proj_val, effective_start, end_time, duration_mins, now_dt.strftime("%Y-%m-%d")))

        # Update registered user's email and project if student
        if student and role_val.lower() == "student":
            if user_email and proj_val:
                cursor.execute("UPDATE registered_users SET email = ?, current_project = ? WHERE UPPER(name) = UPPER(?)", (user_email.strip(), proj_val, student))
            elif user_email:
                cursor.execute("UPDATE registered_users SET email = ? WHERE UPPER(name) = UPPER(?)", (user_email.strip(), student))
            elif proj_val:
                cursor.execute("UPDATE registered_users SET current_project = ? WHERE UPPER(name) = UPPER(?)", (proj_val, student))

    conn.commit()
    conn.close()
    return affected


def add_occupant_to_pc(pc_id: str, new_name: str, new_email: Optional[str] = None) -> Dict[str, Any]:
    """Adds an additional student/teammate to an already occupied workstation."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT pc_id, status, occupied_by, user_email, since_time, end_time, duration_mins, user_role, current_project FROM pc_status WHERE UPPER(pc_id) = UPPER(?)", (pc_id.strip(),))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return {"success": False, "message": f"PC {pc_id} not found."}

    cleaned_new = new_name.strip()
    if not cleaned_new:
        conn.close()
        return {"success": False, "message": "Partner/Student name is required."}

    existing_occupants = [n.strip() for n in (row["occupied_by"] or "").split(",") if n.strip()]
    if cleaned_new in existing_occupants:
        conn.close()
        return {"success": False, "message": f"'{cleaned_new}' is already assigned to {pc_id}."}

    existing_occupants.append(cleaned_new)
    updated_occupants_str = ", ".join(existing_occupants)

    existing_emails = [e.strip() for e in (row["user_email"] or "").split(",") if e.strip()]
    if new_email and new_email.strip() and new_email.strip() not in existing_emails:
        existing_emails.append(new_email.strip())
    updated_emails_str = ", ".join(existing_emails)

    now_dt = datetime.now()
    cursor.execute("""
        UPDATE pc_status 
        SET status = 'occupied', 
            occupied_by = ?, 
            user_email = ? 
        WHERE UPPER(pc_id) = UPPER(?)
    """, (updated_occupants_str, updated_emails_str, pc_id.strip()))

    # Log new occupant to allotment history
    cursor.execute("""
        INSERT INTO pc_allotment_history 
        (pc_id, student_name, user_email, user_role, current_project, start_time, end_time, duration_mins, created_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (pc_id.strip(), cleaned_new, new_email or "", row["user_role"] or "Student", row["current_project"] or "", row["since_time"] or now_dt.strftime("%Y-%m-%d %H:%M:%S"), row["end_time"], row["duration_mins"], now_dt.strftime("%Y-%m-%d")))

    conn.commit()
    conn.close()
    return {"success": True, "message": f"Added {cleaned_new} to {pc_id}", "all_occupants": updated_occupants_str}


def remove_occupant_from_pc(pc_id: str, student_name: str) -> Dict[str, Any]:
    """Removes one student from a workstation with multiple occupants."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT pc_id, status, occupied_by FROM pc_status WHERE UPPER(pc_id) = UPPER(?)", (pc_id.strip(),))
    row = cursor.fetchone()
    if not row or not row["occupied_by"]:
        conn.close()
        return {"success": False, "message": f"PC {pc_id} has no active occupants."}

    existing = [n.strip() for n in row["occupied_by"].split(",") if n.strip()]
    target = student_name.strip()
    remaining = [n for n in existing if n.lower() != target.lower()]

    if not remaining:
        conn.close()
        free_pc(pc_id)
        return {"success": True, "message": f"Removed {target}. PC is now free.", "is_free": True}

    new_str = ", ".join(remaining)
    cursor.execute("UPDATE pc_status SET occupied_by = ? WHERE UPPER(pc_id) = UPPER(?)", (new_str, pc_id.strip()))
    conn.commit()
    conn.close()
    return {"success": True, "message": f"Removed {target} from {pc_id}.", "remaining_occupants": new_str, "is_free": False}


def update_pc_project(pc_id: str, current_project: str) -> bool:
    """Updates the project being worked on for a specific workstation in real-time."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE pc_status 
        SET current_project = ? 
        WHERE UPPER(pc_id) = UPPER(?)
    """, (current_project.strip(), pc_id.strip()))
    affected = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return affected


def free_pc(pc_id: str) -> bool:
    """Marks a PC as free and clears occupied_by, since_time, end_time, user_role, current_project, etc."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE pc_status 
        SET status = 'free', 
            occupied_by = NULL, 
            since_time = NULL, 
            end_time = NULL, 
            duration_mins = NULL, 
            user_email = NULL,
            user_role = NULL,
            current_project = '' 
        WHERE UPPER(pc_id) = UPPER(?)
    """, (pc_id.strip(),))
    conn.commit()
    affected = cursor.rowcount > 0
    conn.close()
    return affected


def get_attendance_logs(date: Optional[str] = None, name: Optional[str] = None) -> List[Dict[str, Any]]:
    """Fetch attendance logs with optional date and name filters."""
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
    return [dict(row) for row in rows]


def get_latest_log_today(name: str, today_date: str) -> Optional[Dict[str, Any]]:
    """Fetch the most recent attendance log for a person today."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, name, is_known, image_path, in_time, out_time, date FROM attendance_logs WHERE name = ? AND date = ? ORDER BY id DESC LIMIT 1",
        (name, today_date)
    )
    row = cursor.fetchone()
    conn.close()
    if row:
        d = dict(row)
        d["is_known"] = bool(d["is_known"])
        return d
    return None


def insert_attendance_log(name: str, is_known: bool, in_time: str, date: str, image_path: Optional[str] = None) -> int:
    """Inserts a new attendance log entry."""
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
    """Updates the out_time of an existing attendance log entry."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE attendance_logs SET out_time = ? WHERE id = ?",
        (out_time, log_id)
    )
    conn.commit()
    affected = cursor.rowcount > 0
    conn.close()
    return affected


def get_unknown_counter(today_date: str) -> int:
    """Returns the next incrementing counter for unknown faces on a given date."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT COUNT(*) AS cnt FROM attendance_logs WHERE is_known = 0 AND date = ?",
        (today_date,)
    )
    row = cursor.fetchone()
    conn.close()
    return (row["cnt"] if row else 0) + 1


# ── Registered Users Helpers ──

def get_registered_users() -> List[Dict[str, Any]]:
    """Returns all registered users sorted by name, including role and department."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, name, email, roll_no, avatar_url, 
               COALESCE(role, 'Student') AS role, 
               COALESCE(department, '') AS department, 
               created_at 
        FROM registered_users 
        ORDER BY name ASC
    """)
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def add_or_update_registered_user(
    name: str, 
    email: Optional[str] = "", 
    roll_no: Optional[str] = "", 
    avatar_url: Optional[str] = "",
    role: Optional[str] = "Student",
    department: Optional[str] = ""
) -> bool:
    """Adds a new registered user or updates existing user's details including role and department."""
    conn = get_db_connection()
    cursor = conn.cursor()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    clean_role = (role or "Student").strip().capitalize()
    if clean_role not in ["Student", "Faculty", "Guest"]:
        clean_role = "Student"

    cursor.execute("""
        INSERT INTO registered_users (name, email, roll_no, avatar_url, role, department, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(name) DO UPDATE SET 
            email = COALESCE(NULLIF(excluded.email, ''), registered_users.email),
            roll_no = COALESCE(NULLIF(excluded.roll_no, ''), registered_users.roll_no),
            avatar_url = COALESCE(NULLIF(excluded.avatar_url, ''), registered_users.avatar_url),
            role = COALESCE(NULLIF(excluded.role, ''), registered_users.role),
            department = COALESCE(NULLIF(excluded.department, ''), registered_users.department)
    """, (name.strip(), email.strip() if email else "", roll_no.strip() if roll_no else "", avatar_url or "", clean_role, department.strip() if department else "", now_str))
    conn.commit()
    affected = cursor.rowcount > 0
    conn.close()
    return affected


def update_user_email(name: str, email: str) -> bool:
    """Updates only the email for a registered student."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE registered_users SET email = ? WHERE UPPER(name) = UPPER(?)", (email.strip(), name.strip()))
    conn.commit()
    affected = cursor.rowcount > 0
    conn.close()
    return affected


def delete_registered_user(name: str) -> bool:
    """Deletes a registered user from SQLite registered_users table."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM registered_users WHERE UPPER(name) = UPPER(?)", (name.strip(),))
    conn.commit()
    affected = cursor.rowcount > 0
    conn.close()
    return affected


def get_allotment_history() -> List[Dict[str, Any]]:
    """Returns workstation allotment history logs."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, pc_id, student_name, user_email, user_role, current_project, start_time, end_time, duration_mins, created_date FROM pc_allotment_history ORDER BY id DESC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


# ── System Settings (SMTP / Email Config) ──

def get_setting(key: str, default: str = "") -> str:
    """Fetches a setting value from SQLite system_settings."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT value FROM system_settings WHERE key = ?", (key,))
        row = cursor.fetchone()
        conn.close()
        if row and row["value"]:
            return row["value"]
    except Exception:
        pass
    return default


def set_setting(key: str, value: str) -> bool:
    """Saves a setting value into SQLite system_settings."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO system_settings (key, value) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
        """, (key, value))
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"[ERROR] Failed to save setting {key}: {e}")
        return False


def get_all_settings() -> Dict[str, str]:
    """Returns all settings as a key-value dictionary."""
    settings = {}
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT key, value FROM system_settings")
        rows = cursor.fetchall()
        conn.close()
        for r in rows:
            settings[r["key"]] = r["value"]
    except Exception:
        pass
    return settings


# ── Weekly Schedule (Timetable) Helpers ──

TIMETABLE_SLOTS = [
    {"slot": 1, "start": "09:00", "end": "09:55", "label": "L1"},
    {"slot": 2, "start": "09:55", "end": "10:50", "label": "L2"},
    {"slot": 3, "start": "10:50", "end": "11:45", "label": "L3"},
    {"slot": 4, "start": "11:45", "end": "12:40", "label": "L4"},
    {"slot": 5, "start": "12:40", "end": "13:35", "label": "L5"},
    {"slot": 6, "start": "13:35", "end": "14:30", "label": "L6"},
    {"slot": 7, "start": "14:30", "end": "15:25", "label": "L7"},
    {"slot": 8, "start": "15:30", "end": "16:25", "label": "L8"},
]

DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]


def get_timetable_slots() -> List[Dict[str, Any]]:
    """Returns the fixed slot definitions for the lab timetable."""
    return TIMETABLE_SLOTS


def get_weekly_schedules(student_name: Optional[str] = None, week_label: Optional[str] = None) -> List[Dict[str, Any]]:
    """Fetches all timetable bookings, optionally filtered by student name or week."""
    conn = get_db_connection()
    cursor = conn.cursor()
    query = "SELECT id, student_name, day_of_week, slot_number, slot_start, slot_end, week_label, created_at FROM weekly_schedules WHERE 1=1"
    params = []
    if student_name:
        query += " AND UPPER(student_name) = UPPER(?)"
        params.append(student_name.strip())
    if week_label:
        query += " AND week_label = ?"
        params.append(week_label)
    query += " ORDER BY CASE day_of_week WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3 WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 WHEN 'Saturday' THEN 6 ELSE 7 END, slot_number ASC"
    cursor.execute(query, tuple(params))
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def book_timetable_slot(student_name: str, day_of_week: str, slot_number: int, week_label: str = "recurring") -> Dict[str, Any]:
    """Books a single timetable slot for a student. Returns the booking or raises error if duplicate."""
    if day_of_week not in DAYS_OF_WEEK:
        return {"success": False, "message": f"Invalid day: {day_of_week}"}
    slot_info = next((s for s in TIMETABLE_SLOTS if s["slot"] == slot_number), None)
    if not slot_info:
        return {"success": False, "message": f"Invalid slot number: {slot_number}"}

    conn = get_db_connection()
    cursor = conn.cursor()

    # Check for duplicate booking by same student
    cursor.execute(
        "SELECT id FROM weekly_schedules WHERE UPPER(student_name) = UPPER(?) AND day_of_week = ? AND slot_number = ? AND week_label = ?",
        (student_name.strip(), day_of_week, slot_number, week_label)
    )
    if cursor.fetchone():
        conn.close()
        return {"success": False, "message": f"{student_name} already has slot {slot_info['label']} booked on {day_of_week}"}

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cursor.execute(
        "INSERT INTO weekly_schedules (student_name, day_of_week, slot_number, slot_start, slot_end, week_label, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (student_name.strip(), day_of_week, slot_number, slot_info["start"], slot_info["end"], week_label, now_str)
    )
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()
    return {"success": True, "message": f"Booked {slot_info['label']} ({slot_info['start']}–{slot_info['end']}) on {day_of_week}", "id": new_id}


def delete_timetable_slot(slot_id: int) -> bool:
    """Deletes a timetable booking by its ID."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM weekly_schedules WHERE id = ?", (slot_id,))
    conn.commit()
    affected = cursor.rowcount > 0
    conn.close()
    return affected


def clear_student_timetable(student_name: str, week_label: str = "recurring") -> int:
    """Clears all timetable bookings for a specific student."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM weekly_schedules WHERE UPPER(student_name) = UPPER(?) AND week_label = ?", (student_name.strip(), week_label))
    conn.commit()
    count = cursor.rowcount
    conn.c# ── Student Projects Helpers ──

def get_student_projects(status: Optional[str] = None) -> List[Dict[str, Any]]:
    """Returns all student projects, optionally filtered by status."""
    conn = get_db_connection()
    cursor = conn.cursor()
    query = """
        SELECT id, title, student_names, student_details, description, status, 
               technologies, duration, deployment_url, github_url, report_status, 
               report_url, start_date, pc_assigned, created_at, updated_at 
        FROM student_projects WHERE 1=1
    """
    params = []
    if status:
        query += " AND UPPER(status) = UPPER(?)"
        params.append(status.strip())
    query += " ORDER BY id DESC"
    cursor.execute(query, tuple(params))
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def add_student_project(title: str, student_names: str, student_details: str = "",
                        description: str = "", status: str = "Ongoing",
                        technologies: str = "", duration: str = "",
                        deployment_url: str = "", github_url: str = "",
                        report_status: str = "Pending", report_url: str = "",
                        start_date: str = "", pc_assigned: str = "") -> int:
    """Adds a new student project. Returns the new project ID."""
    conn = get_db_connection()
    cursor = conn.cursor()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    if not start_date:
        start_date = datetime.now().strftime("%Y-%m-%d")
    cursor.execute("""
        INSERT INTO student_projects (
            title, student_names, student_details, description, status,
            technologies, duration, deployment_url, github_url, report_status,
            report_url, start_date, pc_assigned, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        title.strip(), student_names.strip(), (student_details or "").strip(),
        (description or "").strip(), (status or "Ongoing").strip(),
        (technologies or "").strip(), (duration or "").strip(),
        (deployment_url or "").strip(), (github_url or "").strip(),
        (report_status or "Pending").strip(), (report_url or "").strip(),
        start_date, (pc_assigned or "").strip(), now_str, now_str
    ))
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()
    return new_id


def update_student_project(project_id: int, title: Optional[str] = None,
                            student_names: Optional[str] = None,
                            student_details: Optional[str] = None,
                            description: Optional[str] = None,
                            status: Optional[str] = None,
                            technologies: Optional[str] = None,
                            duration: Optional[str] = None,
                            deployment_url: Optional[str] = None,
                            github_url: Optional[str] = None,
                            report_status: Optional[str] = None,
                            report_url: Optional[str] = None,
                            start_date: Optional[str] = None,
                            pc_assigned: Optional[str] = None) -> bool:
    """Updates an existing student project's fields."""
    conn = get_db_connection()
    cursor = conn.cursor()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    updates = []
    params = []
    if title is not None:
        updates.append("title = ?")
        params.append(title.strip())
    if student_names is not None:
        updates.append("student_names = ?")
        params.append(student_names.strip())
    if student_details is not None:
        updates.append("student_details = ?")
        params.append(student_details.strip())
    if description is not None:
        updates.append("description = ?")
        params.append(description.strip())
    if status is not None:
        updates.append("status = ?")
        params.append(status.strip())
    if technologies is not None:
        updates.append("technologies = ?")
        params.append(technologies.strip())
    if duration is not None:
        updates.append("duration = ?")
        params.append(duration.strip())
    if deployment_url is not None:
        updates.append("deployment_url = ?")
        params.append(deployment_url.strip())
    if github_url is not None:
        updates.append("github_url = ?")
        params.append(github_url.strip())
    if report_status is not None:
        updates.append("report_status = ?")
        params.append(report_status.strip())
    if report_url is not None:
        updates.append("report_url = ?")
        params.append(report_url.strip())
    if start_date is not None:
        updates.append("start_date = ?")
        params.append(start_date)
    if pc_assigned is not None:
        updates.append("pc_assigned = ?")
        params.append(pc_assigned.strip())

    if not updates:
        conn.close()
        return False

    updates.append("updated_at = ?")
    params.append(now_str)
    params.append(project_id)

    cursor.execute(f"UPDATE student_projects SET {', '.join(updates)} WHERE id = ?", tuple(params))
    conn.commit()
    affected = cursor.rowcount > 0
    conn.close()
    return affected  conn.close()
    return affected


def delete_student_project(project_id: int) -> bool:
    """Deletes a student project by ID."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM student_projects WHERE id = ?", (project_id,))
    conn.commit()
    affected = cursor.rowcount > 0
    conn.close()
    return affected


# ── Unknown Face Alert Helper ──

def get_latest_unknown_faces_since(since_timestamp: Optional[str] = None) -> List[Dict[str, Any]]:
    """Returns unknown face attendance logs since a given timestamp for alert polling."""
    conn = get_db_connection()
    cursor = conn.cursor()
    if since_timestamp:
        cursor.execute(
            "SELECT id, name, image_path, in_time, date FROM attendance_logs WHERE is_known = 0 AND in_time > ? ORDER BY id DESC LIMIT 10",
            (since_timestamp,)
        )
    else:
        cursor.execute(
            "SELECT id, name, image_path, in_time, date FROM attendance_logs WHERE is_known = 0 ORDER BY id DESC LIMIT 5"
        )
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


# Auto-initialize on import
init_db()
