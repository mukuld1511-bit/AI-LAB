# 🖥️ AI/ML Lab Attendance System — Run Instructions

## Architecture

```
┌─── LAB PC (start.bat) ───────────────┐       ┌─── VERCEL (public) ──────────┐
│                                       │       │                              │
│  FastAPI Backend (:8000)              │       │  Static HTML/JS Dashboard    │
│  Face Recognition Camera (webcam)     │──────▶│  PC Status + Attendance +    │
│  ngrok tunnel (public URL)            │ ngrok │  Unknown Faces Gallery       │
│                                       │       │                              │
│  + Optional: Streamlit admin (:8501)  │       │  Accessible EVERYWHERE       │
└───────────────────────────────────────┘       └──────────────────────────────┘
```

---

## Prerequisites

- **Python 3.11** installed and on PATH
- **ngrok** installed — download from https://ngrok.com/download
  - After installing, sign up free at https://ngrok.com and run:
    ```
    ngrok config add-authtoken YOUR_TOKEN_HERE
    ```
- **CMake + Visual Studio Build Tools** (for dlib/face_recognition)

---

## Step 1: Enroll Faces (One-Time Setup)

```powershell
cd "d:\AI LAB\lab_attendance_system"
python face_recognition_module\enroll_faces.py
```

Type a name → press SPACE to capture face → repeat for each person.

---

## Step 2: Start Everything (One Command)

Double-click **`start.bat`** in `lab_attendance_system\` folder.

This opens 3 windows:
1. **Lab Backend** — FastAPI server on port 8000
2. **ngrok Tunnel** — gives you a public URL like `https://abc123.ngrok-free.app`
3. **Lab Camera** — webcam face recognition (press Q to stop)

---

## Step 3: Deploy Dashboard to Vercel

1. Go to https://vercel.com and sign in (GitHub login works)
2. Click **"Add New" → "Project"**
3. Import your GitHub repo OR drag-drop the `public_dashboard/` folder
4. Set **Root Directory** to `lab_attendance_system/public_dashboard`
5. Click **Deploy** — Vercel gives you a URL like `https://your-lab.vercel.app`

---

## Step 4: Connect Dashboard to Backend

1. Open your Vercel dashboard URL on any browser/phone
2. A settings popup appears — paste your **ngrok URL** (from Step 2)
   - Example: `https://abc123.ngrok-free.app`
3. Click **Save & Connect** — dashboard loads live data!

---

## Everyday Workflow

| Step | Action |
|------|--------|
| 1 | Double-click `start.bat` on the lab PC |
| 2 | Copy the ngrok URL from the "ngrok Tunnel" window |
| 3 | Open Vercel dashboard → click ⚙️ Settings → paste ngrok URL |
| 4 | Done! Faculty can use the dashboard from their phones |

---

## Local Access (Same WiFi)

If you just want LAN access without Vercel:
- Dashboard: `http://localhost:8501` (Streamlit — run separately)
- Backend: `http://localhost:8000`
- Phone access: `http://192.168.168.187:8501`

To run Streamlit separately:
```powershell
cd "d:\AI LAB\lab_attendance_system\dashboard"
streamlit run app.py --server.address 0.0.0.0 --server.port 8501
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `dlib` won't install | Use precompiled wheel from GitHub |
| ngrok says "authtoken required" | Run `ngrok config add-authtoken YOUR_TOKEN` |
| Vercel dashboard says "Disconnected" | Click ⚙️ and paste the latest ngrok URL |
| Webcam not detected | Check USB, close other camera apps |
| `start.bat` doesn't work | Run each command manually in separate terminals |
