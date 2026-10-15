import sqlite3, os

db_paths = [
    r"C:\Users\serverroom\AI-LAB\lab_attendance_system\backend\lab_attendance.db",
    r"C:\Users\serverroom\AI-LAB\piet_system\raspberry_pi_hub\piet_labs.db",
    r"C:\Users\serverroom\AI-LAB\piet_system\sd_card_package\COPY_TO_SD_CARD_BOOT\piet_hub\piet_labs.db"
]

for p in db_paths:
    if os.path.exists(p):
        conn = sqlite3.connect(p)
        c = conn.cursor()
        c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='timetable'")
        if c.fetchone():
            c.execute("UPDATE timetable SET faculty = 'Dr. Richa Choudhary, Assistant Professor' WHERE faculty LIKE '%Richa%'")
            conn.commit()
            print(f"Updated {p}: {c.rowcount} rows updated")
        conn.close()
