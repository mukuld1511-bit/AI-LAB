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
            date TEXT
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
            user_role TEXT DEFAULT 'Student'
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

    # Migrations for registered_users table
    cursor.execute("PRAGMA table_info(registered_users)")
    reg_columns = [row["name"] for row in cursor.fetchall()]
    if "role" not in reg_columns:
        cursor.execute("ALTER TABLE registered_users ADD COLUMN role TEXT DEFAULT 'Student'")
    if "department" not in reg_columns:
        cursor.execute("ALTER TABLE registered_users ADD COLUMN department TEXT DEFAULT ''")

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

    # Migrations for pc_allotment_history
    cursor.execute("PRAGMA table_info(pc_allotment_history)")
    hist_columns = [row["name"] for row in cursor.fetchall()]
    if "user_role" not in hist_columns:
        cursor.execute("ALTER TABLE pc_allotment_history ADD COLUMN user_role TEXT DEFAULT 'Student'")

    # Seed PC-1 to PC-10 if table empty
    cursor.execute("SELECT COUNT(*) AS cnt FROM pc_status")
    row = cursor.fetchone()
    if row and row["cnt"] == 0:
        seed_pcs = [(f"PC-{i}", "free", None, None, None, None, None) for i in range(1, 11)]
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
                SET status = 'free', occupied_by = NULL, since_time = NULL, end_time = NULL, duration_mins = NULL, user_email = NULL, user_role = NULL 
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
    cursor.execute("SELECT pc_id, status, occupied_by, since_time, end_time, duration_mins, user_email, user_role FROM pc_status")
    rows = cursor.fetchall()
    conn.close()

    results = [dict(row) for row in rows]
    def sort_key(item):
        try:
            return int(item["pc_id"].replace("PC-", ""))
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
    start_time: Optional[str] = None
) -> bool:
    """Marks a PC as occupied with optional time duration, user email, role, and explicit start_time."""
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

    cursor.execute("""
        UPDATE pc_status 
        SET status = 'occupied', 
            occupied_by = ?, 
            since_time = ?, 
            end_time = ?, 
            duration_mins = ?, 
            user_email = ?,
            user_role = ? 
        WHERE UPPER(pc_id) = UPPER(?)
    """, (name.strip(), effective_start, end_time, duration_mins, user_email, role_val, pc_id.strip()))
    affected = cursor.rowcount > 0
    
    # Also log into pc_allotment_history
    cursor.execute("""
        INSERT INTO pc_allotment_history 
        (pc_id, student_name, user_email, user_role, start_time, end_time, duration_mins, created_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (pc_id.strip(), name.strip(), user_email, role_val, effective_start, end_time, duration_mins, now_dt.strftime("%Y-%m-%d")))

    # Update or add registered user's email if provided
    if user_email and name.strip() and role_val.lower() == "student":
        cursor.execute("UPDATE registered_users SET email = ? WHERE UPPER(name) = UPPER(?)", (user_email.strip(), name.strip()))

    conn.commit()
    conn.close()
    return affected


def free_pc(pc_id: str) -> bool:
    """Marks a PC as free and clears occupied_by, since_time, end_time, user_role, etc."""
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
            user_role = NULL 
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
    cursor.execute("SELECT id, pc_id, student_name, user_email, start_time, end_time, duration_mins, created_date FROM pc_allotment_history ORDER BY id DESC")
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


# Auto-initialize on import
init_db()
