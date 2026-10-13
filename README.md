<div align="center">
  <img width="1200" height="475" alt="AI Lab Banner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
  <h1>?? Sovereign Industrial AI Workbench & 3D Lab Monitor</h1>
  <p><i>A 100% self-hosted, air-gapped operating intelligence system and real-time 3D Digital Twin for AI/ML Laboratories.</i></p>
</div>

---

## ?? Overview

The **AI/ML Lab Monitor** is an advanced, full-stack laboratory management system designed for high-performance computing environments. It features a real-time **3D Digital Twin** of the lab workstations, live attendance tracking via facial recognition, and a robust project management portal for students and faculty.

Built with a focus on **zero-trust compliance** and **air-gapped network capabilities**, this system ensures that sensitive research data and workstation telemetry remain securely within the local network infrastructure.

### ????? Mentorship & Faculty
This project was developed under the expert guidance and mentorship of:
- **Dr. Devendra Prasad**
- **Dr. Richa Choudhary**

---

## ? Key Features

- **?? Real-Time 3D Digital Twin (Three.js WebGL):** Live, interactive 3D spatial layout of the AI Lab with real-time workstation status (free, occupied, rendering, etc.).
- **?? Sovereign Local LLM Orchestration:** Runs entirely on local infrastructure without external cloud APIs, ensuring maximum privacy and compliance for research.
- **??? Vision-Based Attendance & Security:** Integrated Face Enrollment Module and Camera Simulator for tracking registered users, intruders, and workstation usage.
- **????? Student Project Hub (MAMS Portal):** A dedicated portal for students to submit and track their research projects, deployment URLs, and codebase links.
- **?? Auto-Tunneling System:** Self-healing Cloudflare/ngrok tunnels managed by a 24/7 Python Watchdog for remote access without complex firewall configurations.
- **?? Interactive Dashboards:** Built with React, Vite, and Tailwind CSS, featuring rich dark/light modes and dynamic data tables.

---

## ??? Technology Stack

| Category | Technologies |
|----------|-------------|
| **Frontend** | React, Vite, TypeScript, Three.js, Tailwind CSS |
| **Backend** | FastAPI, Python, SQLite |
| **Tunneling** | Cloudflared, ngrok |
| **Automation** | Python Watchdog Scripts |

---

## ?? Getting Started

### Prerequisites
- **Node.js** (v16+)
- **Python** (3.9+)

### Local Development Setup

1. **Clone the repository:**
   `ash
   git clone https://github.com/mukuld1511-bit/AI-LAB.git
   cd AI-LAB
   `

2. **Start the Frontend Dashboard:**
   `ash
   npm install
   npm run dev
   `

3. **Start the Backend & Watchdog:**
   `ash
   cd lab_attendance_system
   .\venv\Scripts\python.exe watchdog_24_7.py
   `
   > *The watchdog will automatically start the FastAPI server, launch the Cloudflare tunnel, and synchronize the Vercel-hosted MAMS portal with the new remote URL.*

---

## ?? License

This project is intended for internal use within the AI/ML Laboratory. All rights reserved.
