"""
PIET AIML Department - Modern Desktop Academic Alert HUD
Displays a high-impact, institutional alert modal on the student's active desktop screen.
"""

import sys
import os

def display_academic_alert(message="Please focus on your assigned lab experiment.", faculty="Dr. Richa Choudhary, Assistant Professor"):
    try:
        import winsound
        winsound.MessageBeep(winsound.MB_ICONEXCLAMATION)
    except Exception:
        pass

    try:
        import tkinter as tk
        from tkinter import ttk

        root = tk.Tk()
        root.title("PIET AIML Lab - Official Academic Alert")
        
        # Dimensions & Screen Center
        w = 580
        h = 360
        ws = root.winfo_screenwidth()
        hs = root.winfo_screenheight()
        x = (ws // 2) - (w // 2)
        y = (hs // 2) - (h // 2) - 30
        root.geometry(f"{w}x{h}+{x}+{y}")
        root.configure(bg="#0f172a")
        root.resizable(False, False)

        # Always on Top & Grab Focus
        root.attributes("-topmost", True)
        root.lift()
        root.focus_force()

        # Try to set modern window style
        try:
            root.attributes("-alpha", 0.98)
        except Exception:
            pass

        # Main Outer Container with Accent Border
        outer = tk.Frame(root, bg="#1e293b", padx=2, pady=2)
        outer.pack(fill="both", expand=True, padx=8, pady=8)

        inner = tk.Frame(outer, bg="#0f172a", padx=20, pady=18)
        inner.pack(fill="both", expand=True)

        # Header: Official Department Banner
        hdr_frame = tk.Frame(inner, bg="#0f172a")
        hdr_frame.pack(fill="x", pady=(0, 10))

        univ_lbl = tk.Label(
            hdr_frame,
            text="PANIPAT INSTITUTE OF ENGINEERING & TECHNOLOGY",
            font=("Segoe UI", 9, "bold"),
            fg="#22c55e",
            bg="#0f172a"
        )
        univ_lbl.pack(anchor="w")

        dept_lbl = tk.Label(
            hdr_frame,
            text="DEPARTMENT OF ARTIFICIAL INTELLIGENCE & MACHINE LEARNING",
            font=("Segoe UI", 8, "bold"),
            fg="#94a3b8",
            bg="#0f172a"
        )
        dept_lbl.pack(anchor="w")

        # Divider Line
        div = tk.Frame(inner, height=2, bg="#334155")
        div.pack(fill="x", pady=(4, 12))

        # Alert Badge
        badge_frame = tk.Frame(inner, bg="#451a03", padx=10, pady=4)
        badge_frame.pack(fill="x", pady=(0, 12))

        badge_lbl = tk.Label(
            badge_frame,
            text="⚠️  OFFICIAL ACADEMIC SUPERVISION NOTICE",
            font=("Segoe UI", 11, "bold"),
            fg="#fbbf24",
            bg="#451a03"
        )
        badge_lbl.pack(anchor="w")

        # Teacher's Message Box
        msg_frame = tk.Frame(inner, bg="#1e293b", padx=16, pady=14, relief="flat")
        msg_frame.pack(fill="both", expand=True, pady=(0, 12))

        msg_lbl = tk.Label(
            msg_frame,
            text=message,
            font=("Segoe UI", 12, "bold"),
            fg="#f8fafc",
            bg="#1e293b",
            wraplength=500,
            justify="left"
        )
        msg_lbl.pack(anchor="w", fill="x")

        # Footer Meta (Faculty In-Charge)
        meta_frame = tk.Frame(inner, bg="#0f172a")
        meta_frame.pack(fill="x", pady=(0, 12))

        fac_lbl = tk.Label(
            meta_frame,
            text=f"👨‍🏫 Dispatched by: {faculty}",
            font=("Segoe UI", 9, "italic"),
            fg="#94a3b8",
            bg="#0f172a"
        )
        fac_lbl.pack(side="left")

        time_now = ""
        try:
            from datetime import datetime
            time_now = datetime.now().strftime("%I:%M %p")
        except Exception:
            pass

        time_lbl = tk.Label(
            meta_frame,
            text=f"🕒 {time_now}",
            font=("Segoe UI", 9),
            fg="#64748b",
            bg="#0f172a"
        )
        time_lbl.pack(side="right")

        # Acknowledge Button
        def on_ack():
            root.destroy()

        btn = tk.Button(
            inner,
            text="✅ Understood — Return to Work",
            font=("Segoe UI", 11, "bold"),
            bg="#008b38",
            fg="#ffffff",
            activebackground="#00732e",
            activeforeground="#ffffff",
            relief="flat",
            cursor="hand2",
            padx=20,
            pady=8,
            command=on_ack
        )
        btn.pack(fill="x")
        root.bind("<Return>", lambda e: on_ack())
        root.bind("<Escape>", lambda e: on_ack())
        root.bind("<space>", lambda e: on_ack())

        # Auto-dismiss after 60 seconds if student is away
        root.after(60000, lambda: root.destroy())

        root.mainloop()
        return True

    except Exception as e:
        # Fallback to Win32 MessageBox with MB_TOPMOST and MB_SETFOREGROUND
        try:
            import ctypes
            ctypes.windll.user32.MessageBoxW(0, message, "PIET AIML Lab Alert Notice", 0x30 | 0x40000 | 0x10000)
            return True
        except Exception:
            return False

if __name__ == "__main__":
    msg = sys.argv[1] if len(sys.argv) > 1 else "Please focus on your assigned lab experiment."
    fac = sys.argv[2] if len(sys.argv) > 2 else "Dr. Richa Choudhary, Assistant Professor"
    display_academic_alert(msg, fac)
