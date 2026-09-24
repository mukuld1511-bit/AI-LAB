import sqlite3
from datetime import datetime, timedelta

conn = sqlite3.connect('backend/lab_attendance.db')
c = conn.cursor()
now = datetime.now()
now_str = now.strftime('%Y-%m-%d %H:%M:%S')
end_str = (now + timedelta(hours=8)).strftime('%Y-%m-%d %H:%M:%S')

# Ensure display_name column exists
c.execute("PRAGMA table_info(pc_status)")
cols = [r[1] for r in c.fetchall()]
if "display_name" not in cols:
    c.execute("ALTER TABLE pc_status ADD COLUMN display_name TEXT DEFAULT ''")

# Move Ritik to PC-6
c.execute("""
    UPDATE pc_status 
    SET status='occupied', occupied_by='Ritik', user_role='Student', 
        current_project='AI Lab Research & Vision', since_time=?, end_time=?, duration_mins=480, display_name='PC-6'
    WHERE UPPER(pc_id)='PC-6'
""", (now_str, end_str))

# Mark PC-1 as BACKEND Server
c.execute("""
    UPDATE pc_status 
    SET status='occupied', occupied_by='24/7 Local Host Server', user_role='Backend', 
        current_project='AI Lab Attendance Core & Ngrok Tunnel', since_time=?, end_time=NULL, duration_mins=NULL, display_name='BACKEND'
    WHERE UPPER(pc_id)='PC-1'
""", (now_str,))

conn.commit()
rows = c.execute("SELECT pc_id, display_name, status, occupied_by, current_project FROM pc_status").fetchall()
for r in rows:
    print(r)
conn.close()
