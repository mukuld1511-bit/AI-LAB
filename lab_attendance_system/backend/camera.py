import cv2
import numpy as np
try:
    import face_recognition
    HAS_FACE_RECOGNITION = True
except (ImportError, ModuleNotFoundError):
    face_recognition = None
    HAS_FACE_RECOGNITION = False
import pickle
import os
import time
import base64
import threading
from datetime import datetime
import database

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(CURRENT_DIR)
ENCODINGS_FILE = os.path.join(PROJECT_ROOT, "face_recognition_module", "known_encodings.pkl")
UNKNOWN_FACES_ROOT = os.path.join(PROJECT_ROOT, "unknown_faces")

# Global In-Memory Cache for Known Encodings with Mtime Invalidation
_ENCODINGS_CACHE = {}
_ENCODINGS_CACHE_MTIME = 0.0
_CACHE_LOCK = threading.Lock()


def load_known_encodings():
    """Thread-safe, in-memory cached loader for known face encodings."""
    global _ENCODINGS_CACHE, _ENCODINGS_CACHE_MTIME
    if not os.path.exists(ENCODINGS_FILE):
        return {}
    try:
        mtime = os.path.getmtime(ENCODINGS_FILE)
        with _CACHE_LOCK:
            if mtime != _ENCODINGS_CACHE_MTIME or not _ENCODINGS_CACHE:
                with open(ENCODINGS_FILE, "rb") as f:
                    data = pickle.load(f)
                    if isinstance(data, dict):
                        _ENCODINGS_CACHE = data
                        _ENCODINGS_CACHE_MTIME = mtime
            return _ENCODINGS_CACHE
    except Exception:
        return _ENCODINGS_CACHE or {}


def create_standby_frame(message="GATE CAMERA STANDBY"):
    """Generates an aesthetic standby canvas frame if camera is busy or initializing."""
    canvas = np.zeros((480, 640, 3), dtype=np.uint8)
    canvas[:] = (18, 24, 38) # Deep slate navy

    # Draw cyber grid lines
    for y in range(0, 480, 40):
        cv2.line(canvas, (0, y), (640, y), (30, 41, 59), 1)
    for x in range(0, 640, 40):
        cv2.line(canvas, (x, 0), (x, 480), (30, 41, 59), 1)

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cv2.putText(canvas, "AI/ML LAB GATE MONITORING SYSTEM", (40, 70), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (99, 102, 241), 2)
    cv2.putText(canvas, f"STATUS: {message}", (40, 240), cv2.FONT_HERSHEY_SIMPLEX, 0.85, (239, 68, 68) if "OFFLINE" in message else (245, 158, 11), 2)
    cv2.putText(canvas, "Gate Webcam index 0 auto-reconnecting...", (40, 290), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (148, 163, 184), 1)
    cv2.putText(canvas, f"LIVE CLOCK: {now_str}", (40, 430), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (100, 116, 139), 1)

    ret, buffer = cv2.imencode('.jpg', canvas, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
    return buffer.tobytes() if ret else b""


class GateCameraManager:
    """
    High-Performance Decoupled Camera Streamer & Face Recognizer.
    - Worker Thread 1 (Capture): Reads webcam frames at a rock-solid 25-30 FPS. Never stalls.
    - Worker Thread 2 (AI Inference): Asynchronously runs face detection and recognition on 
      0.25x downscaled frames using in-memory encoding vectors.
    """
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
                cls._instance._init()
            return cls._instance

    def _init(self):
        self.running = False
        self.is_enabled = True # Hardware camera power switch
        self.latest_jpeg = create_standby_frame("INITIALIZING CAMERA...")
        self.latest_raw_frame = None
        self.subscribers = 0
        self.capture_thread = None
        self.ai_thread = None
        self.frame_lock = threading.Lock()
        
        # Thread-safe detected face boxes: list of ((top, right, bottom, left), name, is_intruder)
        self.detected_faces = []
        self.detect_lock = threading.Lock()

    def toggle_power(self) -> bool:
        """Toggles hardware camera capture between ON and OFF."""
        with self.frame_lock:
            self.is_enabled = not self.is_enabled
            if not self.is_enabled:
                self.latest_jpeg = create_standby_frame("GATE CAMERA TURNED OFF (PAUSED)")
                with self.detect_lock:
                    self.detected_faces = []
            return self.is_enabled

    def set_power(self, enabled: bool) -> bool:
        """Explicitly sets hardware camera capture power state."""
        with self.frame_lock:
            self.is_enabled = bool(enabled)
            if not self.is_enabled:
                self.latest_jpeg = create_standby_frame("GATE CAMERA TURNED OFF (PAUSED)")
                with self.detect_lock:
                    self.detected_faces = []
            return self.is_enabled

    def get_status(self) -> dict:
        """Returns power and operational status."""
        with self.frame_lock:
            return {
                "enabled": self.is_enabled,
                "running": self.running,
                "has_face_recognition": HAS_FACE_RECOGNITION and (face_recognition is not None)
            }

    def start(self):
        with self.frame_lock:
            self.subscribers += 1
            if not self.running:
                self.running = True
                self.capture_thread = threading.Thread(target=self._capture_worker, daemon=True)
                self.capture_thread.start()
                if HAS_FACE_RECOGNITION and face_recognition:
                    self.ai_thread = threading.Thread(target=self._ai_worker, daemon=True)
                    self.ai_thread.start()

    def stop(self):
        with self.frame_lock:
            self.subscribers = max(0, self.subscribers - 1)

    def get_jpeg(self):
        with self.frame_lock:
            return self.latest_jpeg

    def get_raw_frame(self):
        with self.frame_lock:
            if self.latest_raw_frame is not None:
                return self.latest_raw_frame.copy()
            return None

    def _open_capture(self):
        # Prefer DirectShow on Windows to avoid MSMF -1072873821 error
        cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
        if not cap.isOpened():
            cap = cv2.VideoCapture(0)
        if cap.isOpened():
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1) # Lowest latency
        return cap

    def _capture_worker(self):
        """Thread 1: Smooth 30 FPS video grabber and MJPEG stream generator."""
        cap = self._open_capture()
        fail_count = 0

        while self.running:
            # If camera is powered OFF, release hardware device and idle with standby screen
            if not self.is_enabled:
                if cap and cap.isOpened():
                    cap.release()
                standby = create_standby_frame("GATE CAMERA TURNED OFF (PAUSED)")
                with self.frame_lock:
                    self.latest_jpeg = standby
                time.sleep(0.3)
                continue

            if not cap.isOpened():
                standby = create_standby_frame("CAMERA OFFLINE / DEVICE BUSY")
                with self.frame_lock:
                    self.latest_jpeg = standby
                time.sleep(1.0)
                cap = self._open_capture()
                continue

            ret, frame = cap.read()
            if not ret or frame is None:
                fail_count += 1
                if fail_count > 10:
                    standby = create_standby_frame("RECONNECTING WEBCAM...")
                    with self.frame_lock:
                        self.latest_jpeg = standby
                    cap.release()
                    time.sleep(1.0)
                    cap = self._open_capture()
                    fail_count = 0
                time.sleep(0.03)
                continue

            fail_count = 0
            with self.frame_lock:
                self.latest_raw_frame = frame.copy()

            # Copy current detected faces from AI worker
            with self.detect_lock:
                current_detections = list(self.detected_faces)

            now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

            # Annotate stream frame with cached bounding boxes (ultra fast)
            annotated_frame = frame.copy()
            for (top, right, bottom, left), name, is_intruder in current_detections:
                box_color = (0, 0, 255) if is_intruder else (0, 255, 127)
                label_bg = (0, 0, 200) if is_intruder else (0, 160, 60)
                cv2.rectangle(annotated_frame, (left, top), (right, bottom), box_color, 2)
                label_text = f" ! {name}" if is_intruder else f" OK {name}"
                (tw, th), _ = cv2.getTextSize(label_text, cv2.FONT_HERSHEY_DUPLEX, 0.55, 1)
                cv2.rectangle(annotated_frame, (left, top - 24), (left + tw + 8, top), label_bg, -1)
                cv2.putText(annotated_frame, label_text, (left + 4, top - 7), cv2.FONT_HERSHEY_DUPLEX, 0.52, (255, 255, 255), 1)

            # Security Banner Header
            cv2.rectangle(annotated_frame, (0, 0), (640, 32), (15, 23, 42), -1)
            cv2.putText(annotated_frame, "LIVE GATE SECURITY CAM (OPTIMIZED AI)", (12, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (99, 102, 241), 2)
            cv2.putText(annotated_frame, now_str, (460, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (148, 163, 184), 1)

            ret, buffer = cv2.imencode('.jpg', annotated_frame, [int(cv2.IMWRITE_JPEG_QUALITY), 75])
            if ret:
                with self.frame_lock:
                    self.latest_jpeg = buffer.tobytes()

            # Target ~25-30 FPS
            time.sleep(0.03)

        cap.release()

    def _ai_worker(self):
        """Thread 2: Asynchronous 0.25x downscaled AI Face Detection & Recognition."""
        last_unknown_logged_time = 0.0
        last_recognized_logged_time = {} # {name: timestamp}

        while self.running:
            if not self.is_enabled:
                time.sleep(0.4)
                continue

            # Pull latest frame safely
            frame_to_process = None
            with self.frame_lock:
                if self.latest_raw_frame is not None:
                    frame_to_process = self.latest_raw_frame.copy()

            if frame_to_process is None:
                time.sleep(0.1)
                continue

            current_time = time.time()
            now_dt = datetime.now()
            today_str = now_dt.strftime("%Y-%m-%d")
            now_str = now_dt.strftime("%Y-%m-%d %H:%M:%S")

            try:
                # ── CRITICAL OPTIMIZATION: 0.25x downscale (16x faster than full resolution) ──
                # 640x480 -> 160x120 pixels for instantaneous HOG evaluation
                small_frame = cv2.resize(frame_to_process, (0, 0), fx=0.25, fy=0.25)
                # Fast contiguous RGB conversion via numpy slice
                rgb_small = np.ascontiguousarray(small_frame[:, :, ::-1])

                face_locations_small = face_recognition.face_locations(rgb_small, model="hog")
                new_detections = []

                if len(face_locations_small) > 0:
                    # Scale coordinates back up by 4x
                    face_locations = [(t * 4, r * 4, b * 4, l * 4) for (t, r, b, l) in face_locations_small]

                    # Load encodings from memory cache
                    known_dict = load_known_encodings()
                    known_names = list(known_dict.keys())
                    known_encodings = list(known_dict.values())

                    encodings = face_recognition.face_encodings(rgb_small, face_locations_small)

                    for idx, enc in enumerate(encodings):
                        matched_name = "UNKNOWN / INTRUDER"
                        is_intruder = True

                        if len(known_encodings) > 0:
                            # Vectorized face distance computation
                            face_distances = face_recognition.face_distance(known_encodings, enc)
                            best_match_idx = int(np.argmin(face_distances))
                            if face_distances[best_match_idx] < 0.52:
                                matched_name = known_names[best_match_idx]
                                is_intruder = False

                        new_detections.append((face_locations[idx], matched_name, is_intruder))

                        # Log known student attendance (with 10-second debounce)
                        if not is_intruder:
                            last_log = last_recognized_logged_time.get(matched_name, 0.0)
                            if (current_time - last_log) >= 10.0:
                                last_recognized_logged_time[matched_name] = current_time
                                recent_log = database.get_latest_log_today(name=matched_name, today_date=today_str)
                                if recent_log and recent_log.get("in_time") and not recent_log.get("out_time"):
                                    database.update_out_time(log_id=recent_log["id"], out_time=now_str)
                                else:
                                    database.insert_attendance_log(name=matched_name, is_known=True, in_time=now_str, date=today_str, image_path=None)

                        # Log unknown / intruder face (with 8-second debounce)
                        elif is_intruder and (current_time - last_unknown_logged_time >= 8.0):
                            last_unknown_logged_time = current_time
                            top, right, bottom, left = face_locations[idx]
                            h, w, _ = frame_to_process.shape
                            pad = 25
                            face_crop = frame_to_process[max(0, top-pad):min(h, bottom+pad), max(0, left-pad):min(w, right+pad)]
                            date_folder = os.path.join(UNKNOWN_FACES_ROOT, today_str)
                            os.makedirs(date_folder, exist_ok=True)
                            timestamp_file = now_dt.strftime("%H-%M-%S")
                            image_filename = f"{timestamp_file}.jpg"
                            full_img_path = os.path.join(date_folder, image_filename)
                            rel_img_path = os.path.relpath(full_img_path, PROJECT_ROOT).replace("\\", "/")
                            cv2.imwrite(full_img_path, face_crop)
                            counter = database.get_unknown_counter(today_date=today_str)
                            unknown_label = f"Unknown_{counter}"
                            database.insert_attendance_log(name=unknown_label, is_known=False, in_time=now_str, date=today_str, image_path=rel_img_path)

                # Thread-safe update of detections for the video streamer
                with self.detect_lock:
                    self.detected_faces = new_detections

            except Exception as e:
                pass

            # Throttle AI loop to ~5-8 Hz (plenty fast for gate attendance while consuming almost 0 CPU)
            time.sleep(0.12)


async def generate_live_stream_frames():
    """Generator for streaming live MJPEG frames to browser clients."""
    import asyncio
    mgr = GateCameraManager()
    mgr.start()
    try:
        while True:
            jpeg = mgr.get_jpeg()
            if jpeg is None:
                jpeg = create_standby_frame("INITIALIZING...")
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + jpeg + b'\r\n')
            await asyncio.sleep(0.035)
    finally:
        mgr.stop()


def capture_frame(retries=5):
    """Safely retrieves a fresh frame from the camera manager or opens temporary capture."""
    mgr = GateCameraManager()
    frame = mgr.get_raw_frame()
    if frame is not None:
        return frame

    # Fallback to direct read
    cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
    if not cap.isOpened():
        cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        return None

    frame = None
    for _ in range(retries):
        ret, f = cap.read()
        if ret:
            frame = f
        time.sleep(0.08)
    cap.release()
    return frame


def scan_face_for_entry():
    """Captures a photo from camera, recognizes face with 0.25x acceleration, logs IN, returns message."""
    database.init_db()
    mgr = GateCameraManager()
    mgr.start()
    time.sleep(0.2)
    frame = mgr.get_raw_frame() or capture_frame(retries=4)
    if frame is None:
        return {"success": False, "message": "Failed to access camera hardware."}

    now_dt = datetime.now()
    today_str = now_dt.strftime("%Y-%m-%d")
    now_str = now_dt.strftime("%Y-%m-%d %H:%M:%S")

    known_dict = load_known_encodings()
    known_names = list(known_dict.keys())
    known_encodings = list(known_dict.values())

    if not HAS_FACE_RECOGNITION or face_recognition is None:
        return {"success": False, "message": "Biometric face_recognition module not installed. Please use Manual Attendance or install dlib."}

    # Accelerated 0.25x downscaling
    small = cv2.resize(frame, (0, 0), fx=0.25, fy=0.25)
    rgb_small = np.ascontiguousarray(small[:, :, ::-1])
    face_locations_small = face_recognition.face_locations(rgb_small, model="hog")

    if len(face_locations_small) == 0:
        return {"success": False, "message": "No face detected in camera view."}

    face_locations = [(t * 4, r * 4, b * 4, l * 4) for (t, r, b, l) in face_locations_small]
    face_encodings = face_recognition.face_encodings(rgb_small, face_locations_small)
    face_encoding = face_encodings[0]

    matched_name = None
    if len(known_encodings) > 0:
        face_distances = face_recognition.face_distance(known_encodings, face_encoding)
        best_match_idx = int(np.argmin(face_distances))
        if face_distances[best_match_idx] < 0.52:
            matched_name = known_names[best_match_idx]

    if matched_name:
        recent_log = database.get_latest_log_today(name=matched_name, today_date=today_str)
        if recent_log and recent_log.get("in_time") and not recent_log.get("out_time"):
            return {"success": False, "message": f"{matched_name} is already logged IN!"}

        database.insert_attendance_log(name=matched_name, is_known=True, in_time=now_str, date=today_str, image_path=None)
        return {"success": True, "message": f"Welcome, {matched_name}! Logged IN."}
    else:
        top, right, bottom, left = face_locations[0]
        h, w, _ = frame.shape
        pad = 20
        face_crop = frame[max(0, top-pad):min(h, bottom+pad), max(0, left-pad):min(w, right+pad)]

        date_folder = os.path.join(UNKNOWN_FACES_ROOT, today_str)
        os.makedirs(date_folder, exist_ok=True)
        timestamp_file = now_dt.strftime("%H-%M-%S")
        image_filename = f"{timestamp_file}.jpg"
        full_img_path = os.path.join(date_folder, image_filename)
        rel_img_path = os.path.relpath(full_img_path, PROJECT_ROOT).replace("\\", "/")
        cv2.imwrite(full_img_path, face_crop)

        counter = database.get_unknown_counter(today_date=today_str)
        unknown_label = f"Unknown_{counter}"
        database.insert_attendance_log(name=unknown_label, is_known=False, in_time=now_str, date=today_str, image_path=rel_img_path)
        return {"success": True, "message": f"Unrecognized face logged as {unknown_label}"}


def capture_face_photo():
    """Captures a frame and returns it as a base64 string for enrollment."""
    try:
        mgr = GateCameraManager()
        mgr.start()
        time.sleep(0.2)
        frame = mgr.get_raw_frame() or capture_frame(retries=3)
        if frame is None:
            return {"success": False, "message": "Camera is currently busy or unavailable. Please upload a photo file using Method 2 below."}

        ret, buffer = cv2.imencode('.jpg', frame)
        if not ret:
            return {"success": False, "message": "Failed to encode camera snapshot."}

        b64 = base64.b64encode(buffer).decode('utf-8')
        return {"success": True, "image_base64": f"data:image/jpeg;base64,{b64}"}
    except Exception as e:
        return {"success": False, "message": f"Camera access error ({str(e)}). Please use Method 2 to upload photo."}
