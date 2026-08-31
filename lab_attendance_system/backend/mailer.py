import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
from typing import Optional, Dict, Any

# Load SMTP configuration from environment or fallback
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SENDER_NAME = os.getenv("SENDER_NAME", "Prof. Richa (AI/ML Lab In-Charge)")
SENDER_EMAIL = os.getenv("SENDER_EMAIL", SMTP_USER or "richamam.ailab@gmail.com")


def is_smtp_configured() -> bool:
    """Returns True if valid SMTP credentials are configured in the environment."""
    return bool(SMTP_USER and SMTP_PASSWORD)


def send_allotment_email(
    to_email: str,
    student_name: str,
    pc_id: str,
    start_time: str,
    end_time: Optional[str] = None,
    duration_mins: Optional[int] = None,
    notes: Optional[str] = None
) -> Dict[str, Any]:
    """
    Sends an automated workstation allotment email to the student.
    If SMTP credentials are not configured, safely simulates/logs the dispatch.
    """
    if not to_email or "@" not in to_email:
        return {"success": False, "message": "Invalid recipient email address."}

    duration_text = f"{duration_mins} Minutes" if duration_mins else "Allocated Session"
    expiry_text = end_time if end_time else "Until released by Lab Admin"

    subject = f"🔬 AI/ML Lab Workstation Allotment: {pc_id} Assigned to You"

    html_content = f"""
    <!DOCTYPE html>
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
                <h1>🔬 AI/ML Research Laboratory</h1>
                <p>Digital Twin Workstation Allotment Notification</p>
            </div>
            <div class="content">
                <div class="greeting">Hello {student_name},</div>
                <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0;">
                    You have been allocated a dedicated workstation in the AI/ML Lab by <strong>Prof. Richa Mam</strong>.
                </p>
                
                <div style="text-align: center;">
                    <div class="badge-pc">💻 {pc_id}</div>
                </div>

                <table class="details-table">
                    <tr>
                        <td class="label">Assigned Student:</td>
                        <td class="value">{student_name}</td>
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

                {f'<div class="notes-box"><strong>Note from Faculty:</strong><br>{notes}</div>' if notes else ''}

                <div class="rules">
                    <strong>⚠️ Lab Guidelines:</strong>
                    <ul style="margin: 6px 0 0 0; padding-left: 18px;">
                        <li>Please occupy your allotted workstation promptly.</li>
                        <li>After your time expires ({expiry_text}), the workstation will automatically release for other students.</li>
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
    </html>
    """

    plain_content = f"""
AI/ML Lab Workstation Allotment Notice

Hello {student_name},

You have been allocated {pc_id} in the AI/ML Lab.

Details:
- Workstation: {pc_id}
- Start Time: {start_time}
- Valid Until: {expiry_text} ({duration_text})

{f'Note from Faculty: {notes}' if notes else ''}

Please report to the lab on time. After {expiry_text}, the PC will automatically return to available status.

Regards,
Prof. Richa (AI/ML Lab In-Charge)
    """

    if not is_smtp_configured():
        # Simulated mode: Log to console and return success
        safe_subj = subject.encode('ascii', 'ignore').decode('ascii')
        print(f"[MAILER SIMULATION] To: {to_email} | Subject: {safe_subj}")
        return {
            "success": True,
            "simulated": True,
            "recipient": to_email,
            "message": f"Email simulated successfully to {to_email} (Configure SMTP in .env for live dispatch)."
        }

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{SENDER_NAME} <{SENDER_EMAIL}>"
        msg["To"] = to_email

        msg.attach(MIMEText(plain_content, "plain"))
        msg.attach(MIMEText(html_content, "html"))

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(SENDER_EMAIL, [to_email], msg.as_string())

        return {
            "success": True,
            "simulated": False,
            "recipient": to_email,
            "message": f"Allotment email successfully sent to {to_email}."
        }
    except Exception as e:
        print(f"[MAILER ERROR] Failed to send email to {to_email}: {str(e)}")
        return {
            "success": False,
            "error": str(e),
            "message": f"Failed to send live email: {str(e)}"
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

    name = recipient_name or "Student"
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: Arial, sans-serif; background: #f8fafc; padding: 20px;">
        <div style="max-width: 560px; margin: 0 auto; background: #fff; border-radius: 10px; border: 1px solid #e2e8f0; overflow: hidden;">
            <div style="background: #3730a3; color: #fff; padding: 20px; text-align: center;">
                <h2 style="margin: 0; font-size: 20px;">🔬 AI/ML Lab Notice</h2>
                <p style="margin: 4px 0 0 0; font-size: 12px; opacity: 0.85;">Prof. Richa Mam's Laboratory</p>
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
    </html>
    """

    if not is_smtp_configured():
        safe_subj = subject.encode('ascii', 'ignore').decode('ascii')
        print(f"[MAILER SIMULATION] To: {to_email} | Subject: {safe_subj}")
        return {
            "success": True,
            "simulated": True,
            "message": f"Message simulated to {to_email} (Configure SMTP in .env for live emails)."
        }

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{SENDER_NAME} <{SENDER_EMAIL}>"
        msg["To"] = to_email

        msg.attach(MIMEText(message, "plain"))
        msg.attach(html_content, "html")

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(SENDER_EMAIL, [to_email], msg.as_string())

        return {"success": True, "simulated": False, "message": f"Email sent successfully to {to_email}."}
    except Exception as e:
        return {"success": False, "error": str(e), "message": f"SMTP Error: {str(e)}"}
