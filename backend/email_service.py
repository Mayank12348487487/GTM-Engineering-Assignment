import smtplib
import httpx
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from backend.config import settings
from backend.database import get_db_connection

def log_email_to_db(email: str, subject: str, body: str, status: str):
    conn = get_db_connection()
    conn.execute(
        "INSERT INTO email_logs (candidate_email, subject, body, status) VALUES (?, ?, ?, ?)",
        (email, subject, body, status)
    )
    conn.commit()
    conn.close()

def send_via_resend(to_email: str, subject: str, body: str) -> bool:
    """
    Sends an email using the Resend REST API.
    """
    api_key = settings.resend_api_key
    if not api_key:
        print("[EMAIL WARNING] Resend API Key is missing. Falling back to Mock Log.")
        return False
        
    company = settings.company_name or "GTM Engineering"
    recruiter = settings.recruiter_email
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    # In Resend's free sandbox tier, emails must be sent from onboarding@resend.dev.
    # So we format the display name as the recruiter's company, but sender as onboarding@resend.dev.
    # We add Reply-To so that candidates can reply directly to the recruiter's email.
    from_header = f"{company} Recruitment <onboarding@resend.dev>"
    
    payload = {
        "from": from_header,
        "to": [to_email],
        "subject": subject,
        "text": body
    }
    
    if recruiter:
        payload["reply_to"] = recruiter
        
    try:
        response = httpx.post("https://api.resend.com/emails", json=payload, headers=headers)
        if response.status_code in (200, 201, 202):
            return True
        else:
            print(f"Resend API error ({response.status_code}): {response.text}")
            return False
    except Exception as e:
        print(f"Exception sending via Resend: {e}")
        return False

def send_via_smtp(to_email: str, subject: str, body: str):
    """
    Sends an email using the SMTP protocol.
    Automatically handles port 465 (SSL) vs port 587/25 (TLS with STARTTLS),
    and enforces a timeout. Raises Exception on failure.
    """
    if not settings.smtp_user or not settings.smtp_pass:
        raise ValueError("SMTP credentials are not configured.")

    company = settings.company_name or "GTM Engineering"
    msg = MIMEMultipart()
    from_name = f"{company} Recruitment"
    msg['From'] = f"{from_name} <{settings.smtp_from or settings.smtp_user}>"
    msg['To'] = to_email
    msg['Subject'] = subject

    if settings.recruiter_email:
        msg['Reply-To'] = settings.recruiter_email

    msg.attach(MIMEText(body, 'plain'))

    port = settings.smtp_port
    host = settings.smtp_host

    # Port 465 requires implicit SSL from the beginning
    if port == 465:
        server = smtplib.SMTP_SSL(host, port, timeout=10)
    else:
        server = smtplib.SMTP(host, port, timeout=10)
        server.starttls()

    server.login(settings.smtp_user, settings.smtp_pass)
    server.sendmail(msg['From'], [to_email], msg.as_string())
    server.quit()

def send_test_invitation_email(email: str, name: str, test_link: str) -> bool:
    """
    Sends an automated email to a candidate with a test link.
    Supports SMTP, Resend API, and Mock modes.
    """
    company = settings.company_name or "GTM Engineering"
    subject = f"{company} - Candidate Shortlisting & Technical Test"
    body = f"""Dear {name},

Congratulations! Based on our AI screening of your resume and GitHub profile, you have been shortlisted for the next round of {company}'s hiring process.

Please complete our online assessment using the following link:
{test_link}

The assessment consists of logical aptitude and coding exercises and must be completed within 48 hours.

Best regards,
{company} Recruitment Team
"""

    mode = settings.email_mode

    if mode == "mock":
        print(f"[MOCK EMAIL] To: {email} | Subject: {subject} | Test Link: {test_link}")
        log_email_to_db(email, subject, body, "Logged (Mock Mode)")
        return True
        
    elif mode == "resend":
        success = send_via_resend(email, subject, body)
        if success:
            log_email_to_db(email, subject, body, "Sent via Resend")
            return True
        else:
            log_email_to_db(email, subject, body, "Failed (Resend API Error)")
            return False

    else: # smtp mode
        try:
            if not settings.smtp_user or not settings.smtp_pass:
                print("[EMAIL WARNING] SMTP credentials are not configured. Falling back to Mock Log.")
                log_email_to_db(email, subject, body, "Logged (Credentials Missing)")
                return True
                
            send_via_smtp(email, subject, body)
            log_email_to_db(email, subject, body, "Sent via SMTP")
            return True
        except Exception as e:
            print(f"Error sending SMTP email to {email}: {e}")
            log_email_to_db(email, subject, body, f"Failed: {str(e)}")
            raise e

def send_interview_schedule_email(email: str, name: str, scheduled_time: str, meet_link: str) -> bool:
    """
    Sends an automated email scheduling an interview.
    """
    company = settings.company_name or "GTM Engineering"
    subject = f"{company} - Technical Interview Scheduled"
    body = f"""Dear {name},

We are pleased to invite you for a technical interview at {company}.

Interview Details:
- Date & Time: {scheduled_time}
- Google Meet Link: {meet_link}

Please join the meeting link on time. We look forward to speaking with you!

Best regards,
{company} Recruitment Team
"""

    mode = settings.email_mode

    if mode == "mock":
        print(f"[MOCK EMAIL] To: {email} | Subject: {subject} | Meet Link: {meet_link}")
        log_email_to_db(email, subject, body, "Logged (Mock Mode)")
        return True
        
    elif mode == "resend":
        success = send_via_resend(email, subject, body)
        if success:
            log_email_to_db(email, subject, body, "Sent via Resend")
            return True
        else:
            log_email_to_db(email, subject, body, "Failed (Resend API Error)")
            return False

    else: # smtp mode
        try:
            if not settings.smtp_user or not settings.smtp_pass:
                print("[EMAIL WARNING] SMTP credentials are not configured. Falling back to Mock Log.")
                log_email_to_db(email, subject, body, "Logged (Credentials Missing)")
                return True
                
            send_via_smtp(email, subject, body)
            log_email_to_db(email, subject, body, "Sent via SMTP")
            return True
        except Exception as e:
            print(f"Error sending SMTP interview email to {email}: {e}")
            log_email_to_db(email, subject, body, f"Failed: {str(e)}")
            raise e
