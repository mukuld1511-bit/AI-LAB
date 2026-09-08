import os
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional, List, Dict, Any
import base64
import cv2
import numpy as np
import face_recognition
import pickle
import csv
import io
import shutil

from fastapi import FastAPI, HTTPException, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import database
import camera
import mailer

# Root directory of lab attendance system
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UNKNOWN_FACES_DIR = os.path.join(BASE_DIR, "unknown_faces")
os.makedirs(UNKNOWN_FACES_DIR, exist_ok=True)
STATIC_DIR = os.path.join(BASE_DIR, "backend", "static")
AVATARS_DIR = os.path.join(STATIC_DIR, "avatars")
os.makedirs(AVATARS_DIR, exist_ok=True)
ENCODINGS_FILE = os.path.join(BASE_DIR, "face_recognition_module", "known_encodings.pkl")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database on startup."""
    database.init_db()
    yield


app = FastAPI(
    title="AI/ML Lab Attendance & PC Occupancy System",
    description="Backend API for Richa Mam's AI Lab Attendance & PC Tracker",
    version="2.0.0",
    lifespan=lifespan
)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount unknown faces and static directories
app.mount("/unknown_faces_static", StaticFiles(directory=UNKNOWN_FACES_DIR), name="unknown_faces_static")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static_dir")


# ── Pydantic Models ──

class OccupyRequest(BaseModel):
    pc_id: str
    name: str
    duration_mins: Optional[int] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    email: Optional[str] = None
    send_email: Optional[bool] = False
    notes: Optional[str] = None
    user_role: Optional[str] = "Student"


class FreeRequest(BaseModel):
    pc_id: str


class SendEmailRequest(BaseModel):
    to_email: str
    subject: str
    message: str
    recipient_name: Optional[str] = None


class RegisteredUserCreate(BaseModel):
    name: str
    email: Optional[str] = ""
    roll_no: Optional[str] = ""
    role: Optional[str] = "Student"
    department: Optional[str] = ""


class UpdateEmailRequest(BaseModel):
    email: str


class ManualAttendanceRequest(BaseModel):
    name: str
    action: str


class EnrollRequest(BaseModel):
    name: str
    email: Optional[str] = ""
    role: Optional[str] = "Student"
    roll_no: Optional[str] = ""
    department: Optional[str] = ""
    image_base64: str


# ── Health & Core Endpoints ──

@app.get("/health")
def health_check():
    """Simple health check endpoint for connectivity testing."""
    return {
        "status": "ok",
        "timestamp": datetime.now().isoformat(),
        "smtp_configured": mailer.is_smtp_configured()
    }


# ── PC Status & Time-based Allotment ──

@app.get("/pc/status")
def get_pc_status() -> List[Dict[str, Any]]:
    """
    Returns all PC status records.
    Automatically checks and expires any session whose end_time has lapsed.
    """
    return database.get_all_pc_status()


@app.post("/pc/occupy")
def occupy_pc_endpoint(payload: OccupyRequest, background_tasks: BackgroundTasks):
    """
    Allocates a PC with optional time range (start_time, end_time, duration), user role (Student/Faculty/Guest), and automated email.
    """
    pc_id = payload.pc_id.strip()
    name = payload.name.strip()
    email = payload.email.strip() if payload.email else None
    duration_mins = payload.duration_mins
    start_time_req = payload.start_time.strip() if payload.start_time else None
    end_time = payload.end_time.strip() if payload.end_time else None
    send_email_flag = payload.send_email
    user_role = payload.user_role or "Student"

    if not pc_id:
        raise HTTPException(status_code=400, detail="pc_id is required.")
    if not name:
        raise HTTPException(status_code=400, detail="Name is required to occupy a PC.")

    now_dt = datetime.now()
    now_str = now_dt.strftime("%Y-%m-%d %H:%M:%S")
    start_time_str = start_time_req if start_time_req else now_str

    # Calculate end_time if duration provided without explicit end_time
    if not end_time and duration_mins and duration_mins > 0:
        import datetime as dt_module
        try:
            parsed_start = datetime.strptime(start_time_str, "%Y-%m-%d %H:%M:%S")
        except Exception:
            parsed_start = now_dt
        end_dt = parsed_start + dt_module.timedelta(minutes=duration_mins)
        end_time = end_dt.strftime("%Y-%m-%d %H:%M:%S")

    # If both start and end time provided but not duration, compute duration
    if start_time_str and end_time and (not duration_mins or duration_mins <= 0):
        try:
            p_start = datetime.strptime(start_time_str, "%Y-%m-%d %H:%M:%S")
            p_end = datetime.strptime(end_time, "%Y-%m-%d %H:%M:%S")
            diff = (p_end - p_start).total_seconds()
            if diff > 0:
                duration_mins = int(diff // 60)
        except Exception:
            pass

    success = database.occupy_pc(
        pc_id=pc_id,
        name=name,
        duration_mins=duration_mins,
        end_time=end_time,
        user_email=email,
        user_role=user_role,
        start_time=start_time_str
    )

    if not success:
        raise HTTPException(status_code=404, detail=f"PC {pc_id} not found.")

    email_response = None
    if send_email_flag and email:
        try:
            email_response = mailer.send_allotment_email(
                to_email=email,
                student_name=name,
                pc_id=pc_id,
                start_time=start_time_str,
                end_time=end_time,
                duration_mins=duration_mins,
                notes=payload.notes,
                user_role=user_role
            )
        except Exception as e:
            email_response = {"success": False, "error": str(e)}

    return {
        "status": "success",
        "message": f"{pc_id} marked occupied by {name} ({user_role})",
        "pc_id": pc_id,
        "occupied_by": name,
        "user_role": user_role,
        "since_time": start_time_str,
        "end_time": end_time,
        "duration_mins": duration_mins,
        "email_result": email_response
    }


@app.post("/pc/free")
def free_pc_endpoint(payload: FreeRequest):
    """Marks a PC as free and clears student allocation."""
    pc_id = payload.pc_id.strip()
    if not pc_id:
        raise HTTPException(status_code=400, detail="pc_id is required.")

    success = database.free_pc(pc_id=pc_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"PC {pc_id} not found.")

    return {
        "status": "success",
        "message": f"{pc_id} marked as available",
        "pc_id": pc_id
    }


# ── Attendance Logs ──

@app.get("/attendance/logs")
def get_attendance_logs(
    date: Optional[str] = Query(None, description="Format YYYY-MM-DD"),
    name: Optional[str] = Query(None, description="Filter by person's name")
) -> List[Dict[str, Any]]:
    """Returns all matching rows from attendance_logs."""
    return database.get_attendance_logs(date=date, name=name)


@app.post("/api/manual_attendance")
def manual_attendance(payload: ManualAttendanceRequest):
    """Manually log IN or OUT for a person."""
    now_dt = datetime.now()
    today_str = now_dt.strftime("%Y-%m-%d")
    now_str = now_dt.strftime("%Y-%m-%d %H:%M:%S")
    name = payload.name.strip()
    
    if payload.action.upper() == "IN":
        recent_log = database.get_latest_log_today(name=name, today_date=today_str)
        if recent_log and recent_log.get("in_time") and not recent_log.get("out_time"):
            raise HTTPException(status_code=400, detail=f"'{name}' is already IN without an OUT time.")
        
        database.insert_attendance_log(
            name=name,
            is_known=True,
            in_time=now_str,
            date=today_str,
            image_path=None
        )
        return {"status": "success", "message": f"Manual IN logged for {name}"}
        
    elif payload.action.upper() == "OUT":
        recent_log = database.get_latest_log_today(name=name, today_date=today_str)
        if not recent_log or not recent_log.get("in_time"):
             raise HTTPException(status_code=400, detail=f"No IN record found for '{name}' today to mark OUT.")
        if recent_log.get("out_time"):
             raise HTTPException(status_code=400, detail=f"'{name}' is already marked OUT.")
             
        database.update_out_time(log_id=recent_log["id"], out_time=now_str)
        return {"status": "success", "message": f"Manual OUT logged for {name}"}
        
    raise HTTPException(status_code=400, detail="Invalid action. Must be IN or OUT.")


# ── Unknown Faces (Intruders / Unwanted Photos) ──

@app.get("/unknown_faces")
def get_unknown_faces() -> List[Dict[str, str]]:
    """
    Scans unknown_faces/ folder recursively, returns list of
    {image_path, url, date, timestamp, filename} for all saved images.
    """
    images_list = []
    if not os.path.exists(UNKNOWN_FACES_DIR):
        return []

    for root, _, files in os.walk(UNKNOWN_FACES_DIR):
        for file in sorted(files, reverse=True):
            if file.lower().endswith((".jpg", ".jpeg", ".png")):
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, BASE_DIR)
                static_rel = os.path.relpath(full_path, UNKNOWN_FACES_DIR).replace("\\", "/")
                
                parent_dir = os.path.basename(root)
                date_val = parent_dir if len(parent_dir) == 10 and parent_dir.count("-") == 2 else "Unknown"
                
                filename_no_ext = os.path.splitext(file)[0]
                timestamp_val = filename_no_ext.replace("_", " ").replace("-", ":")

                images_list.append({
                    "image_path": rel_path.replace("\\", "/"),
                    "url": f"/unknown_faces_static/{static_rel}",
                    "date": date_val,
                    "timestamp": timestamp_val,
                    "filename": file,
                    "rel_file": static_rel
                })

    return images_list


@app.delete("/unknown_faces/{filename}")
def delete_unknown_face(filename: str):
    """Deletes a specific unknown face image by filename or relative path."""
    deleted = False
    clean_filename = os.path.basename(filename)
    
    for root, _, files in os.walk(UNKNOWN_FACES_DIR):
        if clean_filename in files:
            target_path = os.path.join(root, clean_filename)
            try:
                os.remove(target_path)
                deleted = True
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Failed to delete photo: {str(e)}")

    if not deleted:
        raise HTTPException(status_code=404, detail=f"Image {filename} not found.")

    return {"status": "success", "message": f"Photo {clean_filename} deleted."}


@app.delete("/api/unknown_faces/clear_all")
def clear_all_unknown_faces():
    """Deletes all unknown face photos."""
    try:
        count = 0
        for root, dirs, files in os.walk(UNKNOWN_FACES_DIR, topdown=False):
            for file in files:
                if file.lower().endswith((".jpg", ".jpeg", ".png")):
                    os.remove(os.path.join(root, file))
                    count += 1
            for d in dirs:
                shutil.rmtree(os.path.join(root, d), ignore_errors=True)
        return {"status": "success", "message": f"Cleared {count} unwanted face captures."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to clear unknown faces: {str(e)}")


# ── Registered Users ──

@app.get("/api/registered_users")
def get_registered_users():
    """Returns complete list of enrolled students from database."""
    users = database.get_registered_users()
    return {"users": users, "count": len(users)}


@app.get("/api/registered_faces")
def get_registered_faces():
    """Legacy compatibility endpoint returning list of known face names."""
    known_data = camera.load_known_encodings()
    return {"faces": list(known_data.keys())}


@app.post("/api/registered_users")
def create_or_update_user(payload: RegisteredUserCreate):
    """Adds or updates a student, faculty, or guest record in registered_users."""
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="Name is required.")
    
    clean_name = payload.name.strip()
    safe_name = "".join([c for c in clean_name if c.isalnum() or c == " "]).rstrip().replace(" ", "_")
    avatar_url = f"/static/avatars/{safe_name}.jpg"

    database.add_or_update_registered_user(
        name=clean_name,
        email=payload.email.strip() if payload.email else "",
        roll_no=payload.roll_no.strip() if payload.roll_no else "",
        avatar_url=avatar_url,
        role=payload.role or "Student",
        department=payload.department or ""
    )
    return {"status": "success", "message": f"{payload.role or 'User'} '{clean_name}' saved."}


@app.put("/api/registered_users/{name}/email")
def update_student_email(name: str, payload: UpdateEmailRequest):
    """Updates a student's email address."""
    clean_name = name.strip()
    clean_email = payload.email.strip()
    success = database.update_user_email(name=clean_name, email=clean_email)
    if not success:
        raise HTTPException(status_code=404, detail=f"Student '{clean_name}' not found.")
    return {"status": "success", "message": f"Email updated for {clean_name}"}


@app.delete("/api/registered_users/{name}")
def delete_registered_user_endpoint(name: str):
    """Removes a registered user from both database and facial recognition pickle."""
    clean_name = name.strip()
    
    # 1. Remove from SQLite
    database.delete_registered_user(clean_name)
    
    # 2. Remove from known_encodings.pkl
    if os.path.exists(ENCODINGS_FILE):
        try:
            with open(ENCODINGS_FILE, "rb") as f:
                data = pickle.load(f)
            if isinstance(data, dict) and clean_name in data:
                del data[clean_name]
                with open(ENCODINGS_FILE, "wb") as f:
                    pickle.dump(data, f)
        except Exception as e:
            print(f"[WARN] Failed to delete encoding for {clean_name}: {e}")

    # 3. Remove avatar file if exists
    safe_name = "".join([c for c in clean_name if c.isalnum() or c == " "]).rstrip().replace(" ", "_")
    avatar_file = os.path.join(AVATARS_DIR, f"{safe_name}.jpg")
    if os.path.exists(avatar_file):
        try:
            os.remove(avatar_file)
        except Exception:
            pass

    return {"status": "success", "message": f"Student '{clean_name}' unregistered successfully."}


# ── Face Recognition & Enrollment ──

@app.get("/video_feed")
def video_feed():
    """Live MJPEG video feed from lab gate camera with intruder and face detection overlay."""
    return StreamingResponse(
        camera.generate_live_stream_frames(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )


@app.post("/api/scan_entry")
def scan_entry():
    """Opens camera, scans face, and logs IN."""
    result = camera.scan_face_for_entry()
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["message"])
    return result


@app.get("/api/capture_photo")
def capture_photo():
    """Captures a photo from webcam for registration."""
    result = camera.capture_face_photo()
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["message"])
    return result


@app.post("/enroll")
def enroll_face(payload: EnrollRequest):
    """Enroll a new face via base64 encoded image."""
    try:
        image_data = payload.image_base64
        if "," in image_data:
            image_data = image_data.split(",")[1]
            
        img_bytes = base64.b64decode(image_data)
        np_arr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if img is None:
            raise HTTPException(status_code=400, detail="Invalid image data")
        
        rgb_frame = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        face_locations = face_recognition.face_locations(rgb_frame, model="hog")
        
        if len(face_locations) == 0:
            raise HTTPException(status_code=400, detail="No face detected in the photo.")
        
        if len(face_locations) > 1:
            raise HTTPException(status_code=400, detail="Multiple faces detected. Please ensure only one person is in the frame.")
        
        encodings = face_recognition.face_encodings(rgb_frame, face_locations)
        if len(encodings) == 0:
            raise HTTPException(status_code=400, detail="Could not extract face encoding.")
            
        new_encoding = encodings[0]
        
        # Save cropped avatar image
        top, right, bottom, left = face_locations[0]
        h, w, _ = img.shape
        pad = 30
        pad_top = max(0, top - pad)
        pad_bottom = min(h, bottom + pad)
        pad_left = max(0, left - pad)
        pad_right = min(w, right + pad)
        face_crop = img[pad_top:pad_bottom, pad_left:pad_right]
        
        safe_name = "".join([c for c in payload.name if c.isalpha() or c.isdigit() or c == " "]).rstrip()
        avatar_filename = f"{safe_name.replace(' ', '_')}.jpg"
        cv2.imwrite(os.path.join(AVATARS_DIR, avatar_filename), face_crop)
        
        # Save to known_encodings.pkl
        known_data = {}
        if os.path.exists(ENCODINGS_FILE):
            try:
                with open(ENCODINGS_FILE, "rb") as f:
                    known_data = pickle.load(f)
            except Exception:
                pass
                
        known_data[payload.name.strip()] = new_encoding
        with open(ENCODINGS_FILE, "wb") as f:
            pickle.dump(known_data, f)

        # Save to SQLite registered_users with role and roll_no
        database.add_or_update_registered_user(
            name=payload.name.strip(),
            email=payload.email.strip() if payload.email else "",
            roll_no=payload.roll_no.strip() if payload.roll_no else "",
            avatar_url=f"/static/avatars/{avatar_filename}",
            role=payload.role or "Student",
            department=payload.department or ""
        )
            
        return {"status": "success", "message": f"Successfully registered {payload.role or 'Member'} '{payload.name}'"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Standalone Email Notification & Settings ──

class EmailSettingsUpdate(BaseModel):
    smtp_user: str
    smtp_password: str
    smtp_host: Optional[str] = "smtp.gmail.com"
    smtp_port: Optional[int] = 587
    sender_name: Optional[str] = "Prof. Richa (AI/ML Lab)"
    sender_email: Optional[str] = ""


class TestEmailRequest(BaseModel):
    test_email: str


@app.get("/api/email_settings")
def get_email_settings():
    """Returns current SMTP configuration status (with password masked)."""
    cfg = mailer.get_smtp_config()
    is_conf = mailer.is_smtp_configured()
    return {
        "smtp_user": cfg["user"],
        "smtp_host": cfg["host"],
        "smtp_port": cfg["port"],
        "sender_name": cfg["sender_name"],
        "sender_email": cfg["sender_email"],
        "is_configured": is_conf,
        "password_masked": "••••••••••••" if is_conf else ""
    }


@app.post("/api/email_settings")
def save_email_settings(payload: EmailSettingsUpdate):
    """Saves SMTP credentials into database."""
    database.set_setting("SMTP_USER", payload.smtp_user.strip())
    database.set_setting("SMTP_PASSWORD", payload.smtp_password.strip().replace(" ", ""))
    database.set_setting("SMTP_HOST", payload.smtp_host.strip() if payload.smtp_host else "smtp.gmail.com")
    database.set_setting("SMTP_PORT", str(payload.smtp_port or 587))
    database.set_setting("SENDER_NAME", payload.sender_name.strip() if payload.sender_name else "Prof. Richa (AI/ML Lab)")
    database.set_setting("SENDER_EMAIL", payload.sender_email.strip() if payload.sender_email else payload.smtp_user.strip())
    return {"status": "success", "message": "Email settings saved successfully!"}


@app.post("/api/email_settings/test")
def test_email_endpoint(payload: TestEmailRequest):
    """Sends a live test email to verify credentials."""
    if not payload.test_email.strip() or "@" not in payload.test_email:
        raise HTTPException(status_code=400, detail="Invalid email address.")
    
    result = mailer.send_custom_email(
        to_email=payload.test_email.strip(),
        subject="AI/ML Lab System - SMTP Email Verification",
        message="This is a test notification confirming that live email dispatch from Prof. Richa Mam's AI/ML Lab Management System is configured and working perfectly!",
        recipient_name="Faculty / Admin"
    )
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result.get("message", "Test email failed."))
    return result


@app.post("/api/send_email")
def send_email_endpoint(payload: SendEmailRequest):
    """Allows Prof. Richa Mam to send an email notice directly from the portal."""
    result = mailer.send_custom_email(
        to_email=payload.to_email,
        subject=payload.subject,
        message=payload.message,
        recipient_name=payload.recipient_name
    )
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result.get("message", "Failed to send email."))
    return result


# ── Database Export & Download ──

@app.get("/db/download")
@app.get("/db/download/csv")
def download_attendance_csv():
    """Download attendance logs as a styled CSV report."""
    conn = database.get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM attendance_logs ORDER BY id DESC")
    rows = cursor.fetchall()
    conn.close()

    output = io.StringIO()
    writer = csv.writer(output)
    
    writer.writerow([
        "Log ID", 
        "Student Name", 
        "User Type", 
        "Entry Time", 
        "Exit Time", 
        "Date",
        "Image Snapshot Path"
    ])
    
    for row in rows:
        user_type = "Registered User" if row["is_known"] else "Unknown Face"
        writer.writerow([
            row["id"],
            row["name"],
            user_type,
            row["in_time"] or "N/A",
            row["out_time"] or "Still in Lab",
            row["date"],
            row["image_path"] or "None"
        ])
        
    csv_data = output.getvalue()
    today_str = datetime.now().strftime("%Y%m%d_%H%M")
    
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=AI_Lab_Attendance_{today_str}.csv"}
    )


@app.get("/db/download/sqlite")
def download_sqlite_file():
    """Download the complete raw SQLite database file."""
    if not os.path.exists(database.DB_PATH):
        raise HTTPException(status_code=404, detail="Database file not found.")
    
    today_str = datetime.now().strftime("%Y%m%d_%H%M")
    return FileResponse(
        path=database.DB_PATH,
        filename=f"lab_attendance_backup_{today_str}.db",
        media_type="application/x-sqlite3"
    )


@app.get("/db/download/allotments")
def download_allotments_csv():
    """Download workstation allotment history as CSV."""
    allotments = database.get_allotment_history()
    output = io.StringIO()
    writer = csv.writer(output)
    
    writer.writerow([
        "ID",
        "Workstation",
        "Student Name",
        "Student Email",
        "Start Time",
        "End Time",
        "Duration (Mins)",
        "Date"
    ])
    
    for a in allotments:
        writer.writerow([
            a["id"],
            a["pc_id"],
            a["student_name"],
            a["user_email"] or "N/A",
            a["start_time"],
            a["end_time"] or "N/A",
            a["duration_mins"] or "N/A",
            a["created_date"]
        ])
        
    today_str = datetime.now().strftime("%Y%m%d_%H%M")
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=AI_Lab_PC_Allotments_{today_str}.csv"}
    )


@app.post("/db/clear")
def clear_db():
    """Clear all attendance logs."""
    try:
        conn = database.get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM attendance_logs")
        conn.commit()
        conn.close()
        return {"status": "success", "message": "All attendance logs cleared successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to clear database: {str(e)}")


# Mount static frontend
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static_frontend")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
