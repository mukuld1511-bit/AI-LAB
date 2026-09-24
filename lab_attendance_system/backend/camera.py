import cv2
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


def load_known_encodings():
    if not os.path.exists(ENCODINGS_FILE):
        return {}
    try:
        with open(ENCODINGS_FILE, "rb") as f:
            data = pickle.load(f)
            if isinstance(data, dict):
                return data
    except Exception:
        pass
    return {}


def create_standby_frame(message="GATE CAMERA STANDBY"):
    """Generates an aesthetic standby canvas frame if camera is busy or initializing."""
    import numpy as np
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
    Thread-safe Singleton Camera Streamer.
    Avoids Windows DirectShow/MSMF device locks by having a single continuous worker thread.
    Multiple clients can consume the stream simultaneously without collisions.
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
        self.latest_jpeg = create_standby_frame("INITIALIZING CAMERA...")
        self.latest_raw_frame = None
        self.subscribers = 0
        self.thread = None
        self.frame_lock = threading.Lock()

    def start(self):
        with self.frame_lock:
            self.subscribers += 1
            if not self.running or self.thread is None or not self.thread.is_alive():
                self.running = True
                self.thread = threading.Thread(target=self._worker, daemon=True)
                self.thread.start()

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
        return cap

    def _worker(self):
        cap = self._open_capture()
        last_detect_time = 0.0
        cached_face_locations = []
        cached_face_names = []
        last_unknown_logged_time = 0.0
        fail_count = 0

        while self.running:
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
                time.sleep(0.04)
                continue

            fail_count = 0
            current_time = time.time()
            now_dt = datetime.now()
            today_str = now_dt.strftime("%Y-%m-%d")
            now_str = now_dt.strftime("%Y-%m-%d %H:%M:%S")

            with self.frame_lock:
                self.latest_raw_frame = frame.copy()

            # Face recognition inference every ~0.4s
            if HAS_FACE_RECOGNITION and face_recognition and (current_time - last_detect_time >= 0.4):
                last_detect_time = current_time
                try:
                    small_frame = cv2.resize(frame, (0, 0), fx=0.5, fy=0.5)
                    rgb_small = cv2.cvtColor(small_frame, cv2.COLOR_BGR2RGB)
                    face_locs_small = face_recognition.face_locations(rgb_small, model="hog")
                    cached_face_locations = [(t * 2, r * 2, b * 2, l * 2) for (t, r, b, l) in face_locs_small]
                    cached_face_names = []

                    if len(face_locs_small) > 0:
                        known_dict = load_known_encodings()
                        known_names = list(known_dict.keys())
                        known_encodings = list(known_dict.values())
                        encodings = face_recognition.face_encodings(rgb_small, face_locs_small)

                        for idx, enc in enumerate(encodings):
                            matched_name = "UNKNOWN / INTRUDER"
                            if len(known_encodings) > 0:
                                matches = face_recognition.compare_faces(known_encodings, enc, tolerance=0.52)
                                if True in matches:
                                    first_idx = matches.index(True)
                                    matched_name = known_names[first_idx]
                            cached_face_names.append(matched_name)

                            if matched_name == "UNKNOWN / INTRUDER" and (current_time - last_unknown_logged_time >= 8.0):
                                last_unknown_logged_time = current_time
                                top, right, bottom, left = cached_face_locations[idx]
                                h, w, _ = frame.shape
                                pad = 25
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
                except Exception:
                    pass

            # Annotate stream frame
            annotated_frame = frame.copy()
            for (top, right, bottom, left), name in zip(cached_face_locations, cached_face_names):
                is_intruder = "UNKNOWN" in name
                box_color = (0, 0, 255) if is_intruder else (0, 255, 127)
                label_bg = (0, 0, 200) if is_intruder else (0, 160, 60)
                cv2.rectangle(annotated_frame, (left, top), (right, bottom), box_color, 2)
                label_text = f" ! {name}" if is_intruder else f" OK {name}"
                (tw, th), _ = cv2.getTextSize(label_text, cv2.FONT_HERSHEY_DUPLEX, 0.6, 1)
                cv2.rectangle(annotated_frame, (left, top - 26), (left + tw + 10, top), label_bg, -1)
                cv2.putText(annotated_frame, label_text, (left + 5, top - 8), cv2.FONT_HERSHEY_DUPLEX, 0.55, (255, 255, 255), 1)

            cv2.rectangle(annotated_frame, (0, 0), (640, 36), (15, 23, 42), -1)
            cv2.putText(annotated_frame, "LIVE GATE SECURITY CAM", (12, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2)
            cv2.putText(annotated_frame, now_str, (460, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (148, 163, 184), 1)

            ret, buffer = cv2.imencode('.jpg', annotated_frame, [int(cv2.IMWRITE_JPEG_QUALITY), 75])
            if ret:
                with self.frame_lock:
                    self.latest_jpeg = buffer.tobytes()

            time.sleep(0.04)

        cap.release()


def generate_live_stream_frames():
    """Generator for streaming live MJPEG frames to browser clients."""
    mgr = GateCameraManager()
    mgr.start()
    try:
        while True:
            jpeg = mgr.get_jpeg()
            if jpeg is None:
                jpeg = create_standby_frame("INITIALIZING...")
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + jpeg + b'\r\n')
            time.sleep(0.04)
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
        time.sleep(0.1)
    cap.release()
    return frame


def scan_face_for_entry():
    """Captures a photo from camera, recognizes face, logs IN, returns message."""
    database.init_db()
    mgr = GateCameraManager()
    mgr.start()
    time.sleep(0.3)
    frame = mgr.get_raw_frame() or capture_frame(retries=5)
    if frame is None:
        return {"success": False, "message": "Failed to access camera."}

    now_dt = datetime.now()
    today_str = now_dt.strftime("%Y-%m-%d")
    now_str = now_dt.strftime("%Y-%m-%d %H:%M:%S")

    known_dict = load_known_encodings()
    known_names = list(known_dict.keys())
    known_encodings = list(known_dict.values())

    if not HAS_FACE_RECOGNITION or face_recognition is None:
        return {"success": False, "message": "Biometric face_recognition module not installed. Please use Manual Attendance or install dlib."}

    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    face_locations = face_recognition.face_locations(rgb_frame, model="hog")

    if len(face_locations) == 0:
        return {"success": False, "message": "No face detected in camera view."}

    face_encodings = face_recognition.face_encodings(rgb_frame, face_locations)
    face_encoding = face_encodings[0]

    matched_name = None
    if len(known_encodings) > 0:
        matches = face_recognition.compare_faces(known_encodings, face_encoding, tolerance=0.55)
        if True in matches:
            first_match_index = matches.index(True)
            matched_name = known_names[first_match_index]

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
        time.sleep(0.3)
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
