# 🖥️ AI/ML Lab Attendance System — Run Instructions

## Prerequisites

- **Python 3.11** installed and on PATH
- **CMake** installed (required for dlib/face_recognition compilation on Windows)  
  Download: https://cmake.org/download/ — install with "Add to PATH" checked
- **Visual Studio Build Tools** (C++ workload) — needed to compile dlib  
  Download: https://visualstudio.microsoft.com/visual-cpp-build-tools/

> **Alternative (if dlib won't compile):** Download a precompiled dlib wheel from  
> https://github.com/z-mahmud22/Dlib_Windows_Python3.x and install with:  
> `pip install dlib-19.xx.xx-cpXX-cpXX-win_amd64.whl`

---

## 1. Install Dependencies

Open a terminal in `lab_attendance_system/`:

```powershell
# Create virtual environment (one-time)
python -m venv venv
.\venv\Scripts\Activate.ps1

# Install all packages
pip install -r requirements.txt
```

---

## 2. Test Webcam (Optional but Recommended)

```powershell
python test_webcam.py
```

A preview window should appear. Press **Q** to close. If it fails, check your USB webcam connection.

---

## 3. Enroll Faces (One-Time Setup)

Before the recognizer can identify anyone, you must enroll at least one face:

```powershell
python face_recognition_module\enroll_faces.py
```

Follow the prompts: type a name, then press **SPACE** to capture your face. Repeat for each person.

---

## 4. Start the System (3 Terminals)

Open **3 separate PowerShell terminals**, all activated with the venv, and run:

### Terminal 1 — FastAPI Backend
```powershell
cd lab_attendance_system\backend
python main.py
```
> Backend runs at `http://0.0.0.0:8000`

### Terminal 2 — Face Recognition Camera
```powershell
cd lab_attendance_system
python face_recognition_module\recognizer.py
```
> Opens webcam window. Press **Q** to stop.

### Terminal 3 — Streamlit Dashboard
```powershell
cd lab_attendance_system\dashboard
streamlit run app.py --server.address 0.0.0.0 --server.port 8501
```
> Dashboard runs at `http://0.0.0.0:8501`

---

## 5. Access from Phone / Other Devices (Same WiFi)

1. **Find your PC's local IP** — open a terminal and run:
   ```powershell
   ipconfig
   ```
   Look for `IPv4 Address` under your active WiFi/Ethernet adapter (e.g., `192.168.1.42`).

2. **Open on phone browser:**
   ```
   http://192.168.1.42:8501
   ```
   Replace `192.168.1.42` with your actual IP.

3. **If it doesn't load**, allow ports through Windows Firewall:
   ```powershell
   # Run as Administrator
   netsh advfirewall firewall add rule name="Lab Backend 8000" dir=in action=allow protocol=TCP localport=8000
   netsh advfirewall firewall add rule name="Lab Dashboard 8501" dir=in action=allow protocol=TCP localport=8501
   ```

---

## Architecture Summary

```
┌──────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Face Recognizer │────▶│   FastAPI Backend │◀────│    Streamlit    │
│  (recognizer.py) │     │   (main.py:8000)  │     │  (app.py:8501)  │
│   USB Webcam     │     │   SQLite DB       │     │   Dashboard     │
└──────────────────┘     └──────────────────┘     └─────────────────┘
       │                        │                        │
       │  Writes to DB          │  Serves API            │  HTTP calls only
       │  (attendance_logs)     │  (pc_status +           │  (never touches DB)
       │                        │   attendance_logs)      │
       ▼                        ▼                        ▼
  unknown_faces/          lab_attendance.db          Phone/Desktop
  (saved images)                                    Browser Access
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `dlib` won't install | Use precompiled wheel (see Prerequisites) |
| Webcam not detected | Check USB, close other camera apps, try index 1 |
| Dashboard says "Could not connect" | Ensure Terminal 1 (backend) is running first |
| Phone can't access dashboard | Check firewall rules & same WiFi network |
| `ModuleNotFoundError` | Activate venv: `.\venv\Scripts\Activate.ps1` |
