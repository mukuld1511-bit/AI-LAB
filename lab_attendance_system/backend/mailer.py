import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.utils import formataddr, make_msgid, formatdate
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
        
    sender_name = database.get_setting("SENDER_NAME") or os.getenv("SENDER_NAME", "Prof. Richa Choudhary - AI Lab")
    sender_email = database.get_setting("SENDER_EMAIL") or os.getenv("SENDER_EMAIL", user or "nvidea.lab.piet@gmail.com")

    # Clean sender name to prevent RFC header issues
    clean_name = sender_name.replace("(", "-").replace(")", "").strip()

    return {
        "user": user.strip(),
        "password": password.strip().replace(" ", ""),
        "host": host.strip(),
        "port": port,
        "sender_name": clean_name,
        "sender_email": sender_email.strip()
    }


def is_smtp_configured() -> bool:
    """Returns True if valid SMTP credentials are configured."""
    cfg = get_smtp_config()
    return bool(cfg["user"] and cfg["password"])


def format_datetime_pretty(dt_str: Optional[str]) -> str:
    if not dt_str:
        return "Until released by Lab In-Charge"
    try:
        clean = dt_str.replace("T", " ").split(".")[0].strip()
        dt = datetime.strptime(clean, "%Y-%m-%d %H:%M:%S")
        return dt.strftime("%d %b %Y at %I:%M %p")
    except Exception:
        return dt_str


def format_date_pretty(dt_str: Optional[str]) -> str:
    if not dt_str:
        return datetime.now().strftime("%d %b %Y")
    try:
        clean = dt_str.replace("T", " ").split(".")[0].strip()
        dt = datetime.strptime(clean, "%Y-%m-%d %H:%M:%S")
        return dt.strftime("%d %b %Y")
    except Exception:
        return dt_str.split(" ")[0] if " " in dt_str else dt_str


def format_time_pretty(dt_str: Optional[str]) -> str:
    if not dt_str:
        return datetime.now().strftime("%I:%M %p")
    try:
        clean = dt_str.replace("T", " ").split(".")[0].strip()
        dt = datetime.strptime(clean, "%Y-%m-%d %H:%M:%S")
        return dt.strftime("%I:%M %p")
    except Exception:
        return dt_str.split(" ")[1] if " " in dt_str else dt_str


def format_duration_text(mins: Optional[int]) -> str:
    if not mins or mins <= 0:
        return "Session Duration"
    if mins < 60:
        return f"{mins} Minutes"
    hours = mins // 60
    rem = mins % 60
    if rem == 0:
        return f"{hours} Hour{'s' if hours > 1 else ''}"
    return f"{hours} hr {rem} min"


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
    Adheres strictly to Google Gmail SPF/DKIM/RFC guidelines.
    """
    if not to_email or "@" not in to_email:
        return {"success": False, "message": "Invalid recipient email address."}

    cfg = get_smtp_config()
    role_clean = (user_role or "Student").strip().capitalize()
    
    # Formatted Date & Time Strings
    allot_date_pretty = format_date_pretty(start_time)
    start_time_pretty = format_time_pretty(start_time)
    expiry_pretty = format_datetime_pretty(end_time)
    duration_text = format_duration_text(duration_mins)

    if role_clean == "Faculty":
        greeting = f"Respected {student_name},"
        role_label = "Faculty Member"
        allot_desc = f"Workstation {pc_id} in the AI/ML Lab has been reserved for your session by Prof. Richa Choudhary."
        subject = f"Workstation Reservation: {pc_id} Reserved for Faculty"
    elif role_clean == "Guest":
        greeting = f"Dear Guest {student_name},"
        role_label = "Visiting Guest"
        allot_desc = f"Workstation {pc_id} in the AI/ML Lab has been allocated for your visit by Prof. Richa Choudhary."
        subject = f"Workstation Allotment: {pc_id} Allocated"
    else:
        greeting = f"Hello {student_name},"
        role_label = "Student"
        allot_desc = f"You have been allocated a dedicated workstation in the AI/ML Lab by Prof. Richa Choudhary."
        subject = f"Workstation Allotment: {pc_id} Assigned to You"

    # Clean plain-text fallback (Crucial for Gmail spam filter score)
    plain_content = f"""{subject}

{greeting}

{allot_desc}

Allotment Details:
• Workstation ID: {pc_id}
• Assigned User: {student_name} ({role_label})
• Allotment Date: {allot_date_pretty}
• Start Time: {start_time_pretty}
• Allocated Duration: {duration_text}
• VALID UNTIL: {expiry_pretty}

{f'Note: {notes}' if notes else ''}

Lab Guidelines:
1. Please occupy your assigned workstation promptly.
2. System session automatically releases after your time expires ({expiry_pretty}).
3. For extensions, contact Prof. Richa Choudhary.

Regards,
Prof. Richa Choudhary
AI/ML Research Laboratory
"""

    notes_html = ""
    if notes:
        notes_html = f"""
        <div style="background-color: #f8fafc; border-left: 4px solid #4f46e5; padding: 12px 16px; margin: 16px 0; font-size: 13px; color: #334155;">
            <strong>Instructions from Faculty:</strong><br>{notes}
        </div>
        """

    # Clean inline-styled HTML (Gmail safe without head style blocks)
    html_content = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0; padding:20px; font-family:Arial, sans-serif; background-color:#f8fafc; color:#1e293b;">
    <table align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; overflow:hidden;">
        <tr>
            <td style="background:#3730a3; padding:24px; text-align:center; color:#ffffff;">
                <h2 style="margin:0; font-size:20px; font-weight:bold;">AI/ML Research Laboratory</h2>
                <p style="margin:6px 0 0 0; font-size:13px; opacity:0.9;">Workstation Allotment Notification</p>
            </td>
        </tr>
        <tr>
            <td style="padding:28px 24px;">
                <p style="font-size:16px; font-weight:bold; margin-top:0; color:#0f172a;">{greeting}</p>
                <p style="font-size:14px; line-height:1.5; color:#334155;">{allot_desc}</p>
                
                <div style="text-align:center; margin:20px 0;">
                    <span style="display:inline-block; background-color:#e0e7ff; color:#3730a3; font-size:20px; font-weight:bold; padding:8px 24px; border-radius:8px; border:1px solid #c7d2fe;">
                        💻 {pc_id}
                    </span>
                </div>

                <table width="100%" cellpadding="10" cellspacing="0" style="margin:16px 0; font-size:14px; border-top:1px solid #f1f5f9; border-bottom:1px solid #f1f5f9;">
                    <tr>
                        <td style="color:#64748b; font-weight:bold; width:40%;">Assigned User:</td>
                        <td style="color:#0f172a; font-weight:bold;">{student_name} ({role_label})</td>
                    </tr>
                    <tr style="background-color:#fcfcfd;">
                        <td style="color:#64748b; font-weight:bold;">Workstation:</td>
                        <td style="color:#0f172a; font-weight:bold;">{pc_id}</td>
                    </tr>
                    <tr>
                        <td style="color:#64748b; font-weight:bold;">📅 Allotment Date:</td>
                        <td style="color:#0f172a; font-weight:bold;">{allot_date_pretty}</td>
                    </tr>
                    <tr style="background-color:#fcfcfd;">
                        <td style="color:#64748b; font-weight:bold;">⏰ Start Time:</td>
                        <td style="color:#0f172a;">{start_time_pretty}</td>
                    </tr>
                    <tr>
                        <td style="color:#64748b; font-weight:bold;">⏳ Duration:</td>
                        <td style="color:#0f172a;">{duration_text}</td>
                    </tr>
                    <tr style="background-color:#eff6ff;">
                        <td style="color:#1e40af; font-weight:bold;">Valid Until:</td>
                        <td style="color:#1d4ed8; font-weight:bold; font-size:15px;">{expiry_pretty}</td>
                    </tr>
                </table>

                {notes_html}

                <div style="background-color:#fffbeb; border:1px solid #fef3c7; border-radius:8px; padding:12px; margin-top:20px; font-size:12px; color:#92400e;">
                    <strong>Lab Notice:</strong>
                    <ul style="margin:6px 0 0 0; padding-left:20px;">
                        <li>Workstation automatically releases after time expires (<strong>{expiry_pretty}</strong>).</li>
                        <li>Please save your files and leave the system clean.</li>
                    </ul>
                </div>
            </td>
        </tr>
        <tr>
            <td style="background-color:#f8fafc; padding:16px; text-align:center; font-size:12px; color:#94a3b8; border-top:1px solid #e2e8f0;">
                AI/ML Lab Management System • Prof. Richa Choudhary
            </td>
        </tr>
    </table>
</body>
</html>"""

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
        msg["From"] = formataddr((cfg["sender_name"], cfg["sender_email"]))
        msg["To"] = to_email
        msg["Subject"] = subject
        msg["Date"] = formatdate(localtime=True)
        msg["Message-ID"] = make_msgid(domain="gmail.com")
        msg["MIME-Version"] = "1.0"

        # Attach Plain Text first, then HTML (RFC Standard)
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
    
    plain_content = f"""{subject}

Hello {name},

{message}

Best regards,
Prof. Richa Choudhary
AI/ML Research Laboratory
"""

    html_content = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0; padding:20px; font-family:Arial, sans-serif; background-color:#f8fafc; color:#1e293b;">
    <table align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; overflow:hidden;">
        <tr>
            <td style="background:#3730a3; padding:20px; text-align:center; color:#ffffff;">
                <h2 style="margin:0; font-size:20px;">AI/ML Lab Notice</h2>
                <p style="margin:4px 0 0 0; font-size:12px; opacity:0.85;">Prof. Richa Choudhary Laboratory</p>
            </td>
        </tr>
        <tr>
            <td style="padding:24px; font-size:14px; line-height:1.6;">
                <p>Hello <strong>{name}</strong>,</p>
                <div style="background:#f1f5f9; padding:16px; border-radius:8px; margin:15px 0; white-space:pre-wrap;">
{message}
                </div>
                <p style="margin-top:20px; font-size:13px; color:#64748b;">
                    Best regards,<br>
                    <strong>Prof. Richa Choudhary</strong><br>
                    AI/ML Lab In-Charge
                </p>
            </td>
        </tr>
    </table>
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
        msg["From"] = formataddr((cfg["sender_name"], cfg["sender_email"]))
        msg["To"] = to_email
        msg["Subject"] = subject
        msg["Date"] = formatdate(localtime=True)
        msg["Message-ID"] = make_msgid(domain="gmail.com")
        msg["MIME-Version"] = "1.0"

        msg.attach(MIMEText(plain_content, "plain", "utf-8"))
        msg.attach(MIMEText(html_content, "html", "utf-8"))

        with smtplib.SMTP(cfg["host"], cfg["port"], timeout=12) as server:
            server.starttls()
            server.login(cfg["user"], cfg["password"])
            server.sendmail(cfg["sender_email"], [to_email], msg.as_string())

        return {"success": True, "simulated": False, "message": f"Live email successfully sent to {to_email}!"}
    except Exception as e:
        return {"success": False, "error": str(e), "message": f"SMTP Error: {str(e)}"}
