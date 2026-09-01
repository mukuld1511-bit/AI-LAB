import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
from typing import Optional, Dict, Any
import database


def get_smtp_config() -> Dict[str, Any]:
    """
    Dynamically loads SMTP credentials from database system_settings
    with fallback to environment variables.
    """
    user = database.get_setting("SMTP_USER") or os.getenv("SMTP_USER", "")
    password = database.get_setting("SMTP_PASSWORD") or os.getenv("SMTP_PASSWORD", "")
    host = database.get_setting("SMTP_HOST") or os.getenv("SMTP_HOST", "smtp.gmail.com")
    
    port_val = database.get_setting("SMTP_PORT") or os.getenv("SMTP_PORT", "587")
    try:
        port = int(port_val)
    except Exception:
        port = 587
        
    sender_name = database.get_setting("SENDER_NAME") or os.getenv("SENDER_NAME", "Prof. Richa (AI/ML Lab In-Charge)")
    sender_email = database.get_setting("SENDER_EMAIL") or os.getenv("SENDER_EMAIL", user or "richamam.ailab@gmail.com")

    return {
        "user": user.strip(),
        "password": password.strip().replace(" ", ""),
        "host": host.strip(),
        "port": port,
        "sender_name": sender_name.strip(),
        "sender_email": sender_email.strip()
    }


def is_smtp_configured() -> bool:
    """Returns True if valid SMTP credentials are configured."""
    cfg = get_smtp_config()
    return bool(cfg["user"] and cfg["password"])


def send_allotment_email(
    to_email: str,
    student_name: str,
    pc_id: str,
    start_time: str,
    end_time: Optional[str] = None,
    duration_mins: Optional[int] = None,
    notes: Optional[str] = None,
    user_role: Optional[str] = "Student"
) -> Dict[str, Any]:
    """
    Sends an automated workstation allotment email to student, faculty, or guest.
    """
    if not to_email or "@" not in to_email:
        return {"success": False, "message": "Invalid recipient email address."}

    cfg = get_smtp_config()
    role_clean = (user_role or "Student").strip().capitalize()
    duration_text = f"{duration_mins} Minutes" if duration_mins else "Allocated Session"
    expiry_text = end_time if end_time else "Until released by Lab Admin"

    if role_clean == "Faculty":
        greeting = f"Respected {student_name},"
        role_label = "Faculty Member"
        allot_desc = f"Workstation <strong>{pc_id}</strong> in the AI/ML Lab has been reserved for your research / teaching session by <strong>Prof. Richa Mam</strong>."
        subject = f"AI/ML Lab Workstation Reservation: {pc_id} Reserved for Faculty"
    elif role_clean == "Guest":
        greeting = f"Dear Guest {student_name},"
        role_label = "Visiting Guest / Researcher"
        allot_desc = f"Workstation <strong>{pc_id}</strong> in the AI/ML Lab has been allocated for your visit by <strong>Prof. Richa Mam</strong>."
        subject = f"AI/ML Lab Workstation Allotment: {pc_id} Allocated"
    else:
        greeting = f"Hello {student_name},"
        role_label = "Student"
        allot_desc = f"You have been allocated a dedicated workstation in the AI/ML Lab by <strong>Prof. Richa Mam</strong>."
        subject = f"AI/ML Lab Workstation Allotment: {pc_id} Assigned to You"

    faculty_notes_block = ""
    if notes:
        faculty_notes_block = f'<div class="notes-box"><strong>Note from Faculty:</strong><br>{notes}</div>'

    html_content = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body {{
            font-family: 'Segoe UI', Arial, sans-serif;
            background-color: #f4f6fb;
            margin: 0;
            padding: 20px;
            color: #1e293b;
        }}
        .card {{
            max-width: 580px;
            margin: 0 auto;
            background: #ffffff;
            border-radius: 12px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.06);
            overflow: hidden;
            border: 1px solid #e2e8f0;
        }}
        .header {{
            background: linear-gradient(135deg, #3730a3, #4f46e5);
            color: #ffffff;
            padding: 28px 24px;
            text-align: center;
        }}
        .header h1 {{
            margin: 0;
            font-size: 22px;
            font-weight: 800;
            letter-spacing: -0.5px;
        }}
        .header p {{
            margin: 6px 0 0 0;
            font-size: 13px;
            opacity: 0.9;
        }}
        .content {{
            padding: 28px 24px;
        }}
        .greeting {{
            font-size: 16px;
            font-weight: 600;
            color: #0f172a;
            margin-bottom: 12px;
        }}
        .badge-pc {{
            display: inline-block;
            background: #e0e7ff;
            color: #3730a3;
            font-size: 20px;
            font-weight: 800;
            padding: 6px 18px;
            border-radius: 8px;
            margin: 12px 0;
            border: 1px solid #c7d2fe;
        }}
        .details-table {{
            width: 100%;
            border-collapse: collapse;
            margin: 18px 0;
        }}
        .details-table td {{
            padding: 10px 12px;
            border-bottom: 1px solid #f1f5f9;
            font-size: 14px;
        }}
        .details-table td.label {{
            font-weight: 600;
            color: #64748b;
            width: 40%;
        }}
        .details-table td.value {{
            color: #0f172a;
            font-weight: 700;
        }}
        .notes-box {{
            background: #f8fafc;
            border-left: 4px solid #4f46e5;
            padding: 12px 16px;
            margin: 16px 0;
            font-size: 13px;
            color: #475569;
            border-radius: 0 8px 8px 0;
        }}
        .rules {{
            background: #fffbeb;
            border: 1px solid #fef3c7;
            border-radius: 8px;
            padding: 14px;
            margin-top: 20px;
            font-size: 12px;
            color: #92400e;
        }}
        .footer {{
            background: #f8fafc;
            padding: 16px 24px;
            text-align: center;
            font-size: 12px;
            color: #94a3b8;
            border-top: 1px solid #e2e8f0;
        }}
    </style>
</head>
<body>
    <div class="card">
        <div class="header">
            <h1>AI/ML Research Laboratory</h1>
            <p>Digital Twin Workstation Allotment Notification</p>
        </div>
        <div class="content">
            <div class="greeting">{greeting}</div>
            <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0;">
                {allot_desc}
            </p>
            
            <div style="text-align: center;">
                <div class="badge-pc">💻 {pc_id}</div>
            </div>

            <table class="details-table">
                <tr>
                    <td class="label">Assigned User:</td>
                    <td class="value">{student_name} ({role_label})</td>
                </tr>
                <tr>
                    <td class="label">Workstation ID:</td>
                    <td class="value">{pc_id}</td>
                </tr>
                <tr>
                    <td class="label">Start Time:</td>
                    <td class="value">{start_time}</td>
                </tr>
                <tr>
                    <td class="label">Allocated Duration:</td>
                    <td class="value">{duration_text}</td>
                </tr>
                <tr>
                    <td class="label">Valid Until:</td>
                    <td class="value" style="color: #dc2626;">{expiry_text}</td>
                </tr>
            </table>

            {faculty_notes_block}

            <div class="rules">
                <strong>Lab Guidelines:</strong>
                <ul style="margin: 6px 0 0 0; padding-left: 18px;">
                    <li>Please occupy your allotted workstation promptly.</li>
                    <li>After your time expires ({expiry_text}), the workstation will automatically release.</li>
                    <li>Do not change system settings or disconnect lab peripherals.</li>
                </ul>
            </div>
        </div>
        <div class="footer">
            This is an automated system notification from the <strong>AI/ML Lab Management System</strong>.<br>
            For extensions, please contact Prof. Richa Mam.
        </div>
    </div>
</body>
</html>"""

    plain_content = f"""AI/ML Lab Workstation Allotment Notice

{greeting}

Workstation {pc_id} in the AI/ML Lab has been allocated for {student_name} ({role_label}).

Details:
- Workstation: {pc_id}
- Role: {role_label}
- Start Time: {start_time}
- Valid Until: {expiry_text} ({duration_text})

{f'Note: {notes}' if notes else ''}

Regards,
Prof. Richa (AI/ML Lab In-Charge)"""

    if not is_smtp_configured():
        safe_subj = subject.encode('ascii', 'ignore').decode('ascii')
        print(f"[MAILER SIMULATION] To: {to_email} | Subject: {safe_subj}")
        return {
            "success": True,
            "simulated": True,
            "recipient": to_email,
            "message": f"Email simulated to {to_email}. (To send live emails, configure Gmail in Settings)."
        }

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{cfg['sender_name']} <{cfg['sender_email']}>"
        msg["To"] = to_email

        msg.attach(MIMEText(plain_content, "plain", "utf-8"))
        msg.attach(MIMEText(html_content, "html", "utf-8"))

        with smtplib.SMTP(cfg["host"], cfg["port"], timeout=12) as server:
            server.starttls()
            server.login(cfg["user"], cfg["password"])
            server.sendmail(cfg["sender_email"], [to_email], msg.as_string())

        return {
            "success": True,
            "simulated": False,
            "recipient": to_email,
            "message": f"Live email successfully delivered to {to_email}!"
        }
    except Exception as e:
        print(f"[MAILER ERROR] Failed to send email to {to_email}: {str(e)}")
        return {
            "success": False,
            "error": str(e),
            "message": f"SMTP Error: {str(e)}"
        }


def send_custom_email(
    to_email: str,
    subject: str,
    message: str,
    recipient_name: Optional[str] = None
) -> Dict[str, Any]:
    """Sends a general custom email/notice from Prof. Richa Mam."""
    if not to_email or "@" not in to_email:
        return {"success": False, "message": "Invalid recipient email address."}

    cfg = get_smtp_config()
    name = recipient_name or "Student"
    
    html_content = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; background: #f8fafc; padding: 20px;">
    <div style="max-width: 560px; margin: 0 auto; background: #fff; border-radius: 10px; border: 1px solid #e2e8f0; overflow: hidden;">
        <div style="background: #3730a3; color: #fff; padding: 20px; text-align: center;">
            <h2 style="margin: 0; font-size: 20px;">AI/ML Lab Notice</h2>
            <p style="margin: 4px 0 0 0; font-size: 12px; opacity: 0.85;">Prof. Richa Lab Notification</p>
        </div>
        <div style="padding: 24px; color: #1e293b; font-size: 14px; line-height: 1.6;">
            <p>Hello <strong>{name}</strong>,</p>
            <div style="background: #f1f5f9; padding: 16px; border-radius: 8px; margin: 15px 0; white-space: pre-wrap;">
{message}
            </div>
            <p style="margin-top: 20px; font-size: 13px; color: #64748b;">
                Best regards,<br>
                <strong>Prof. Richa</strong><br>
                AI/ML Lab In-Charge
            </p>
        </div>
    </div>
</body>
</html>"""

    if not is_smtp_configured():
        safe_subj = subject.encode('ascii', 'ignore').decode('ascii')
        print(f"[MAILER SIMULATION] To: {to_email} | Subject: {safe_subj}")
        return {
            "success": True,
            "simulated": True,
            "message": f"Message simulated to {to_email}. (To send live emails, configure Gmail in Settings)."
        }

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{cfg['sender_name']} <{cfg['sender_email']}>"
        msg["To"] = to_email

        msg.attach(MIMEText(message, "plain", "utf-8"))
        msg.attach(MIMEText(html_content, "html", "utf-8"))

        with smtplib.SMTP(cfg["host"], cfg["port"], timeout=12) as server:
            server.starttls()
            server.login(cfg["user"], cfg["password"])
            server.sendmail(cfg["sender_email"], [to_email], msg.as_string())

        return {"success": True, "simulated": False, "message": f"Live email successfully sent to {to_email}!"}
    except Exception as e:
        return {"success": False, "error": str(e), "message": f"SMTP Error: {str(e)}"}
