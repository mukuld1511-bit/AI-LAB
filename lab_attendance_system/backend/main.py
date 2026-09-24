import os
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional, List, Dict, Any
import base64
import cv2
import numpy as np
try:
    import face_recognition
    HAS_FACE_RECOGNITION = True
except (ImportError, ModuleNotFoundError):
    face_recognition = None
    HAS_FACE_RECOGNITION = False
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

# Avatar dynamic handler with fallback SVG to prevent broken photo icons
@app.get("/static/avatars/{filename}")
def get_avatar_image(filename: str):
    """Serves enrolled avatar photo or generates an elegant SVG avatar with initials."""
    file_path = os.path.join(AVATARS_DIR, filename)
    if os.path.exists(file_path):
        return FileResponse(file_path)
    
    clean_name = os.path.splitext(filename)[0].replace("_", " ").strip()
    parts = clean_name.split()
    initials = (parts[0][0] + (parts[1][0] if len(parts) > 1 else clean_name[1:2])).upper() if clean_name else "AI"
    
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
        <defs>
            <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#4f46e5"/>
                <stop offset="100%" stop-color="#7c3aed"/>
            </linearGradient>
        </defs>
        <circle cx="60" cy="60" r="58" fill="url(#g)"/>
        <text x="60" y="72" font-size="44" font-weight="700" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif" fill="#ffffff" text-anchor="middle">{initials}</text>
    </svg>"""
    return Response(content=svg, media_type="image/svg+xml")


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
    current_project: Optional[str] = ""


class UpdatePCProjectRequest(BaseModel):
    pc_id: Optional[str] = None
    current_project: str


class AddOccupantRequest(BaseModel):
    pc_id: Optional[str] = None
    student_name: str
    email: Optional[str] = None


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
    """Comprehensive health check endpoint for connectivity, 24/7 monitoring, and diagnostic testing."""
    all_pcs = database.get_all_pc_status()
    occupied_count = sum(1 for p in all_pcs if p.get("status") == "occupied")
    free_count = len(all_pcs) - occupied_count

    # Check active ngrok tunnel file
    tunnel_url = None
    tunnel_file = os.path.join(BASE_DIR, "tunnel_url.txt")
    if os.path.exists(tunnel_file):
        try:
            with open(tunnel_file, "r", encoding="utf-8") as f:
                tunnel_url = f.read().strip()
        except Exception:
            pass

    return {
        "status": "ok",
        "service": "AI/ML Lab Attendance & PC Tracking System",
        "version": "2.1.0",
        "timestamp": datetime.now().isoformat(),
        "smtp_configured": mailer.is_smtp_configured(),
        "permanent_domain": "amaretto-confess-subtract.ngrok-free.dev",
        "current_tunnel_url": tunnel_url or "https://amaretto-confess-subtract.ngrok-free.dev",
        "workstations": {
            "total": len(all_pcs),
            "free": free_count,
            "occupied": occupied_count
        }
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
    current_project = payload.current_project.strip() if payload.current_project else ""

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
        start_time=start_time_str,
        current_project=current_project
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
                user_role=user_role,
                current_project=current_project
            )
        except Exception as e:
            email_response = {"success": False, "error": str(e)}

    return {
        "status": "success",
        "message": f"{pc_id} marked occupied by {name} ({user_role})" + (f" for project '{current_project}'" if current_project else ""),
        "pc_id": pc_id,
        "occupied_by": name,
        "user_role": user_role,
        "current_project": current_project,
        "since_time": start_time_str,
        "end_time": end_time,
        "duration_mins": duration_mins,
        "email_result": email_response
    }


@app.post("/pc/project")
@app.patch("/pc/{pc_id}/project")
def update_pc_project_endpoint(payload: UpdatePCProjectRequest, pc_id: Optional[str] = None):
    """Updates the project a student is actively working on for a workstation."""
    target_pc = (pc_id or payload.pc_id or "").strip()
    if not target_pc:
        raise HTTPException(status_code=400, detail="pc_id is required.")

    proj_text = payload.current_project.strip() if payload.current_project else ""
    success = database.update_pc_project(pc_id=target_pc, current_project=proj_text)
    if not success:
        raise HTTPException(status_code=404, detail=f"PC {target_pc} not found.")

    return {
        "status": "success",
        "message": f"Updated active project for {target_pc} to '{proj_text}'",
        "pc_id": target_pc,
        "current_project": proj_text
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


@app.post("/pc/add_occupant")
@app.post("/pc/{pc_id}/add_occupant")
def add_occupant_endpoint(payload: AddOccupantRequest, pc_id: Optional[str] = None):
    """Allows multiple students/teammates on a single PC by adding a group partner."""
    target_pc = (pc_id or payload.pc_id or "").strip()
    target_name = (payload.student_name or "").strip()
    if not target_pc:
        raise HTTPException(status_code=400, detail="pc_id is required.")
    if not target_name:
        raise HTTPException(status_code=400, detail="student_name is required.")

    result = database.add_occupant_to_pc(pc_id=target_pc, new_name=target_name, new_email=payload.email)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result


@app.delete("/pc/{pc_id}/occupant/{student_name}")
def remove_occupant_endpoint(pc_id: str, student_name: str):
    """Removes a specific student from a workstation with multiple occupants."""
    result = database.remove_occupant_from_pc(pc_id=pc_id, student_name=student_name)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result


# ── Attendance Logs ──

@app.get("/attendance/logs")
@app.get("/attendance")
def get_attendance_logs(
    date: Optional[str] = Query(None, description="Format YYYY-MM-DD"),
    name: Optional[str] = Query(None, description="Filter by person's name")
) -> List[Dict[str, Any]]:
    """Returns all matching rows from attendance_logs."""
    return database.get_attendance_logs(date=date, name=name)


@app.post("/api/manual_attendance")
@app.post("/attendance/manual")
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


@app.get("/api/camera/status")
def get_camera_status():
    """Returns current power and running status of gate camera."""
    mgr = camera.GateCameraManager()
    return mgr.get_status()


@app.post("/api/camera/toggle")
def toggle_camera_power():
    """Toggles gate camera power ON or OFF."""
    mgr = camera.GateCameraManager()
    new_state = mgr.toggle_power()
    state_str = "ON" if new_state else "OFF"
    return {"status": "success", "enabled": new_state, "message": f"Gate Camera turned {state_str}"}


@app.post("/api/camera/power")
def set_camera_power(payload: dict = Body(...)):
    """Sets gate camera power state explicitly: {'enabled': true/false}."""
    mgr = camera.GateCameraManager()
    enabled = payload.get("enabled", True)
    new_state = mgr.set_power(enabled)
    state_str = "ON" if new_state else "OFF"
    return {"status": "success", "enabled": new_state, "message": f"Gate Camera turned {state_str}"}


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
    try:
        result = camera.capture_face_photo()
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("message", "Webcam is unavailable. Please use Method 2 to upload photo."))
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Webcam access error ({str(e)}). Please use Method 2 to upload photo.")


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
        
        if not HAS_FACE_RECOGNITION or face_recognition is None:
            # Fallback when dlib/face_recognition not installed: save avatar image directly
            safe_name = "".join([c for c in payload.name if c.isalpha() or c.isdigit() or c == " "]).rstrip()
            avatar_filename = f"{safe_name.replace(' ', '_')}.jpg"
            cv2.imwrite(os.path.join(AVATARS_DIR, avatar_filename), img)
            database.add_or_update_registered_user(
                name=payload.name.strip(),
                email=payload.email.strip() if payload.email else "",
                roll_no=payload.roll_no.strip() if payload.roll_no else "",
                avatar_url=f"/static/avatars/{avatar_filename}",
                role=payload.role or "Student",
                department=payload.department or ""
            )
            return {"status": "success", "message": f"Successfully registered {payload.role or 'Member'} '{payload.name}' in directory."}

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
        "Student / User Name",
        "Role",
        "Project Working On",
        "User Email",
        "Start Time",
        "End Time",
        "Duration (Mins)",
        "Date"
    ])
    
    for a in allotments:
        writer.writerow([
            a.get("id"),
            a.get("pc_id"),
            a.get("student_name"),
            a.get("user_role") or "Student",
            a.get("current_project") or "General Lab Work",
            a.get("user_email") or "N/A",
            a.get("start_time"),
            a.get("end_time") or "N/A",
            a.get("duration_mins") or "N/A",
            a.get("created_date")
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


# ── Weekly Timetable / Schedule Endpoints ──

class TimetableBookRequest(BaseModel):
    student_name: str
    day_of_week: str
    slot_number: int
    week_label: Optional[str] = "recurring"


@app.get("/api/timetable/slots")
def get_slot_definitions():
    """Returns the fixed 8-slot timetable definitions (L1–L8, 09:00–16:25)."""
    return {
        "slots": database.get_timetable_slots(),
        "days": database.DAYS_OF_WEEK
    }


@app.get("/api/timetable")
def get_timetable(
    name: Optional[str] = Query(None, description="Filter by student name"),
    week: Optional[str] = Query(None, description="Filter by week label (e.g. 'recurring' or '2026-W37')")
):
    """Returns all timetable bookings with optional filters."""
    bookings = database.get_weekly_schedules(student_name=name, week_label=week)
    return {"bookings": bookings, "count": len(bookings)}


@app.post("/api/timetable")
def book_timetable(payload: TimetableBookRequest):
    """Books a single timetable slot for a student."""
    if not payload.student_name.strip():
        raise HTTPException(status_code=400, detail="Student name is required.")
    
    result = database.book_timetable_slot(
        student_name=payload.student_name,
        day_of_week=payload.day_of_week,
        slot_number=payload.slot_number,
        week_label=payload.week_label or "recurring"
    )
    
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["message"])
    return result


@app.delete("/api/timetable/{slot_id}")
def delete_timetable_booking(slot_id: int):
    """Deletes a specific timetable booking by ID."""
    success = database.delete_timetable_slot(slot_id)
    if not success:
        raise HTTPException(status_code=404, detail="Booking not found.")
    return {"status": "success", "message": "Booking removed."}


@app.delete("/api/timetable/clear/{student_name}")
def clear_student_schedule(student_name: str, week: Optional[str] = Query("recurring")):
    """Clears all timetable bookings for a student."""
    count = database.clear_student_timetable(student_name, week_label=week or "recurring")
    return {"status": "success", "message": f"Cleared {count} booking(s) for {student_name}."}


# ── Student Projects Endpoints ──

class ProjectCreateRequest(BaseModel):
    title: str
    student_names: str
    description: Optional[str] = ""
    status: Optional[str] = "Ongoing"
    technologies: Optional[str] = ""
    start_date: Optional[str] = ""
    pc_assigned: Optional[str] = ""


class ProjectUpdateRequest(BaseModel):
    title: Optional[str] = None
    student_names: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    technologies: Optional[str] = None
    start_date: Optional[str] = None
    pc_assigned: Optional[str] = None


@app.get("/api/projects")
def get_projects(status: Optional[str] = Query(None, description="Filter by status: Ongoing, Completed, Paused")):
    """Returns all student projects."""
    projects = database.get_student_projects(status=status)
    return {"projects": projects, "count": len(projects)}


@app.post("/api/projects")
def create_project(payload: ProjectCreateRequest):
    """Adds a new student project."""
    if not payload.title.strip():
        raise HTTPException(status_code=400, detail="Project title is required.")
    if not payload.student_names.strip():
        raise HTTPException(status_code=400, detail="Student name(s) required.")
    
    new_id = database.add_student_project(
        title=payload.title,
        student_names=payload.student_names,
        description=payload.description or "",
        status=payload.status or "Ongoing",
        technologies=payload.technologies or "",
        start_date=payload.start_date or "",
        pc_assigned=payload.pc_assigned or ""
    )
    return {"status": "success", "message": f"Project '{payload.title}' created.", "id": new_id}


@app.put("/api/projects/{project_id}")
def update_project(project_id: int, payload: ProjectUpdateRequest):
    """Updates an existing student project."""
    success = database.update_student_project(
        project_id=project_id,
        title=payload.title,
        student_names=payload.student_names,
        description=payload.description,
        status=payload.status,
        technologies=payload.technologies,
        start_date=payload.start_date,
        pc_assigned=payload.pc_assigned
    )
    if not success:
        raise HTTPException(status_code=404, detail="Project not found.")
    return {"status": "success", "message": "Project updated."}


@app.delete("/api/projects/{project_id}")
def delete_project(project_id: int):
    """Deletes a student project."""
    success = database.delete_student_project(project_id)
    if not success:
        raise HTTPException(status_code=404, detail="Project not found.")
    return {"status": "success", "message": "Project deleted."}


# ── Unknown Face Alert Polling Endpoint ──

@app.get("/api/unknown_faces/latest")
def get_latest_unknown_alerts(since: Optional[str] = Query(None, description="Timestamp to check from (YYYY-MM-DD HH:MM:SS)")):
    """Returns recent unknown face detections since a given timestamp for real-time alerts."""
    faces = database.get_latest_unknown_faces_since(since_timestamp=since)
    # Attach image URLs
    for face in faces:
        if face.get("image_path"):
            rel_path = face["image_path"].replace("\\", "/")
            if rel_path.startswith("unknown_faces/"):
                face["image_url"] = f"/unknown_faces_static/{rel_path.replace('unknown_faces/', '')}"
            else:
                face["image_url"] = f"/unknown_faces_static/{rel_path}"
        else:
            face["image_url"] = None
    return {"faces": faces, "count": len(faces)}


# Mount static frontend
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static_frontend")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
