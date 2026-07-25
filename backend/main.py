import csv
import json
import io
import openpyxl
from typing import List, Optional

def parse_uploaded_file(file, file_contents: bytes) -> list[dict]:
    filename = file.filename.lower()
    if filename.endswith(".csv"):
        buffer = io.StringIO(file_contents.decode("utf-8-sig"))
        reader = csv.DictReader(buffer)
        rows = []
        for r in reader:
            if r:
                rows.append({k.strip() if k else "": v.strip() if v else "" for k, v in r.items()})
        return rows
    elif filename.endswith(".xlsx") or filename.endswith(".xls"):
        wb = openpyxl.load_workbook(io.BytesIO(file_contents), data_only=True)
        sheet = wb.active
        sheet_rows = list(sheet.rows)
        if not sheet_rows:
            return []
        
        # Read header row
        headers = [cell.value for cell in sheet_rows[0]]
        headers = [str(h).strip() if h is not None else "" for h in headers]
        
        rows = []
        for r in sheet_rows[1:]:
            row_dict = {}
            for col_idx, cell in enumerate(r):
                if col_idx < len(headers) and headers[col_idx]:
                    val = cell.value
                    row_dict[headers[col_idx]] = str(val).strip() if val is not None else ""
            if any(row_dict.values()): # Skip completely empty rows
                rows.append(row_dict)
        return rows
    else:
        raise ValueError("Unsupported file format. Please upload CSV or Excel (.xlsx).")

def map_headers(file_headers: list[str]) -> dict[str, str]:
    """
    Maps uploaded file headers to standard internal database column keys.
    Supports loose, case-insensitive matching, ignoring spaces and underscores.
    """
    def normalize(s: str) -> str:
        return "".join(c for c in s.lower() if c.isalnum())
        
    mapping_rules = {
        "name": ["name", "fullname", "candidatename"],
        "email": ["email", "emailaddress", "emailid"],
        "college": ["college", "university", "school", "institution"],
        "branch": ["branch", "department", "stream", "specialization"],
        "cgpa": ["cgpa", "gpa", "percentage", "marks"],
        "best_ai_project": ["bestaiproject", "project", "bestproject", "aiproject", "projectdetails"],
        "research_work": ["researchwork", "research", "researchpaper", "publications", "researchdetails"],
        "github_profile": ["githubprofile", "github", "githublink", "git", "githubhandle"],
        "resume_link": ["resumelink", "resume", "resumepath", "cv", "cvlink"],
        "test_la": ["testla", "logicalaptitude", "logicalaptitudescore", "aptitude", "aptitudescore"],
        "test_code": ["testcode", "codingscore", "coding", "codingtestscore"]
    }
    
    mapped = {}
    for rule_key, rule_aliases in mapping_rules.items():
        # Look for a header that matches any of the aliases when normalized
        for header in file_headers:
            norm_header = normalize(header)
            if norm_header in rule_aliases or any(alias in norm_header for alias in rule_aliases):
                mapped[rule_key] = header
                break
    return mapped

def map_test_headers(file_headers: list[str]) -> dict[str, str]:
    """
    Maps test results headers to internal keys loosely.
    """
    def normalize(s: str) -> str:
        return "".join(c for c in s.lower() if c.isalnum())
        
    rules = {
        "name": ["name", "fullname", "candidatename"],
        "email": ["email", "emailaddress", "emailid"],
        "test_la": ["testla", "logicalaptitude", "logicalaptitudescore", "aptitude", "aptitudescore"],
        "test_code": ["testcode", "codingscore", "coding", "codingtestscore"]
    }
    
    mapped = {}
    for rule_key, rule_aliases in rules.items():
        for header in file_headers:
            norm = normalize(header)
            if norm in rule_aliases or any(alias in norm for alias in rule_aliases):
                mapped[rule_key] = header
                break
    return mapped

def auto_progress_after_test_scores(email: str):
    """
    Automatically checks a candidate's test scores and shortlists or rejects them.
    If shortlisted, it schedules an interview and emails the invitation.
    """
    from datetime import datetime, timedelta
    
    conn = get_db_connection()
    row = conn.execute("SELECT * FROM candidates WHERE email = ?", (email,)).fetchone()
    if not row:
        conn.close()
        return
        
    candidate = dict(row)
    conn.close()
    
    # Read settings
    la_threshold = float(get_setting("la_threshold", "60"))
    code_threshold = float(get_setting("code_threshold", "60"))
    
    la_score = candidate["test_la_score"]
    code_score = candidate["test_code_score"]
    
    if la_score == -1 or code_score == -1:
        return # Scores not completely updated yet
        
    conn = get_db_connection()
    
    if la_score >= la_threshold and code_score >= code_threshold:
        # Candidate has passed! Progress to Shortlisted
        conn.execute("UPDATE candidates SET status = 'Shortlisted' WHERE id = ?", (candidate["id"],))
        conn.commit()
        
        # Automatically schedule interview (tomorrow at 10:00 AM UTC)
        start_time = datetime.utcnow() + timedelta(days=2)
        start_time = start_time.replace(hour=10, minute=0, second=0, microsecond=0)
        start_time_iso = start_time.isoformat() + "Z"
        
        try:
            # Create Google Calendar Meet event
            evt_details = create_interview_event(
                candidate_id=candidate["id"],
                candidate_name=candidate["name"],
                candidate_email=candidate["email"],
                start_time_iso=start_time_iso
            )
            
            # Save interview record
            conn.execute("""
                INSERT INTO interviews (candidate_id, candidate_name, candidate_email, event_id, meet_link, scheduled_time)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (
                candidate["id"],
                candidate["name"],
                candidate["email"],
                evt_details["event_id"],
                evt_details["meet_link"],
                evt_details["scheduled_time"]
            ))
            
            # Update status to Interview Scheduled
            conn.execute("""
                UPDATE candidates 
                SET status = 'Interview Scheduled',
                    interview_time = ?,
                    interview_meet_link = ?,
                    interview_event_id = ?
                WHERE id = ?
            """, (
                evt_details["scheduled_time"],
                evt_details["meet_link"],
                evt_details["event_id"],
                candidate["id"]
            ))
            conn.commit()
            
            # Auto send schedule email
            send_interview_schedule_email(
                candidate["email"],
                candidate["name"],
                evt_details["scheduled_time"],
                evt_details["meet_link"]
            )
            print(f"[AUTO] Scheduled interview for {candidate['name']}")
        except Exception as e:
            print(f"[AUTO ERROR] Failed to schedule interview: {e}")
            
    else:
        # Candidate failed. Progress to Rejected
        conn.execute("UPDATE candidates SET status = 'Rejected' WHERE id = ?", (candidate["id"],))
        conn.commit()
        print(f"[AUTO] Candidate {candidate['name']} rejected.")
        
    conn.close()

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from backend.database import (
    get_db_connection, get_all_settings, update_settings, get_setting
)
from backend.graph import run_candidate_screening
from backend.email_service import send_test_invitation_email, send_interview_schedule_email
from backend.google_calendar import (
    get_google_auth_url, exchange_code_for_token, get_google_credentials, create_interview_event
)

app = FastAPI(title="GTM Engineering Candidate Screening API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict to React app origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic Schemas
class SettingsUpdate(BaseModel):
    hf_token: Optional[str] = None
    github_token: Optional[str] = None
    google_client_id: Optional[str] = None
    google_client_secret: Optional[str] = None
    smtp_host: Optional[str] = None
    smtp_port: Optional[str] = None
    smtp_user: Optional[str] = None
    smtp_pass: Optional[str] = None
    smtp_from: Optional[str] = None
    use_mock_email: Optional[str] = None
    use_mock_calendar: Optional[str] = None
    la_threshold: Optional[str] = None
    code_threshold: Optional[str] = None
    email_mode: Optional[str] = None
    resend_api_key: Optional[str] = None
    recruiter_email: Optional[str] = None
    company_name: Optional[str] = None

class ScreenRequest(BaseModel):
    job_description: str

class ScheduleRequest(BaseModel):
    scheduled_time: str # ISO string

class TestSubmission(BaseModel):
    la_score: float
    code_score: float

# API Home
@app.get("/")
def read_root():
    return {"message": "Welcome to the GTM Engineering Candidate Screening API"}

# Candidates Endpoints
@app.get("/api/candidates")
def list_candidates(status: Optional[str] = None, email: Optional[str] = None):
    conn = get_db_connection()
    if email:
        rows = conn.execute("SELECT * FROM candidates WHERE email = ?", (email,)).fetchall()
    elif status:
        rows = conn.execute("SELECT * FROM candidates WHERE status = ?", (status,)).fetchall()
    else:
        rows = conn.execute("SELECT * FROM candidates").fetchall()
    conn.close()
    
    candidates = []
    for row in rows:
        c = dict(row)
        # Parse JSON fields
        if c.get("github_repos_data"):
            try:
                c["github_repos_data"] = json.loads(c["github_repos_data"])
            except:
                c["github_repos_data"] = {}
        candidates.append(c)
    return candidates

@app.get("/api/candidates/{candidate_id}")
def get_candidate(candidate_id: int):
    conn = get_db_connection()
    row = conn.execute("SELECT * FROM candidates WHERE id = ?", (candidate_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Candidate not found")
        
    c = dict(row)
    if c.get("github_repos_data"):
        try:
            c["github_repos_data"] = json.loads(c["github_repos_data"])
        except:
            c["github_repos_data"] = {}
    return c

@app.post("/api/candidates/upload")
async def upload_candidates_csv(file: UploadFile = File(...)):
    filename = file.filename.lower()
    if not (filename.endswith(".csv") or filename.endswith(".xlsx") or filename.endswith(".xls")):
        raise HTTPException(status_code=400, detail="Only CSV or Excel (.xlsx) files are allowed")
        
    contents = await file.read()
    try:
        reader = parse_uploaded_file(file, contents)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {str(e)}")
        
    if not reader:
        raise HTTPException(status_code=400, detail="The uploaded file is empty")
        
    # Check headers loosely
    file_headers = list(reader[0].keys())
    mapped_headers = map_headers(file_headers)
    required_keys = {"name", "email", "college", "branch", "cgpa", "best_ai_project", "research_work", "github_profile", "resume_link"}
    
    missing = required_keys - set(mapped_headers.keys())
    if missing:
        friendly = {
            "name": "Name", "email": "Email", "college": "College", "branch": "Branch",
            "cgpa": "CGPA", "best_ai_project": "Best AI Project", "research_work": "Research Work",
            "github_profile": "GitHub Profile", "resume_link": "Resume Link"
        }
        missing_friendly = [friendly[k] for k in missing]
        raise HTTPException(
            status_code=400, 
            detail=f"Missing columns: {', '.join(missing_friendly)}. Headers present: {', '.join(file_headers)}"
        )
        
    # Standardize column mapping to database keys
    conn = get_db_connection()
    cursor = conn.cursor()
    
    imported_count = 0
    skipped_count = 0
    
    name_key = mapped_headers["name"]
    email_key = mapped_headers["email"]
    college_key = mapped_headers["college"]
    branch_key = mapped_headers["branch"]
    cgpa_key = mapped_headers["cgpa"]
    project_key = mapped_headers["best_ai_project"]
    research_key = mapped_headers["research_work"]
    github_key = mapped_headers["github_profile"]
    resume_key = mapped_headers["resume_link"]
    la_key = mapped_headers.get("test_la")
    code_key = mapped_headers.get("test_code")
    
    seen_emails = set()
    for row in reader:
        # Strip keys and values
        row = {k.strip(): v.strip() for k, v in row.items() if k}
        
        name = row.get(name_key)
        email = row.get(email_key)
        
        if not name or not email:
            skipped_count += 1
            continue
            
        if "@" in email:
            # If multiple rows share the same email, create unique plus-addressing suffixes (e.g. user+1@domain.com)
            if email in seen_emails:
                username, domain = email.split("@", 1)
                base_username = username.split("+", 1)[0]
                counter = 1
                while True:
                    candidate_email = f"{base_username}+{counter}@{domain}"
                    if candidate_email not in seen_emails:
                        email = candidate_email
                        break
                    counter += 1
            seen_emails.add(email)
            
        college = row.get(college_key)
        branch = row.get(branch_key)
        cgpa_str = row.get(cgpa_key)
        best_project = row.get(project_key)
        research = row.get(research_key)
        github = row.get(github_key)
        resume = row.get(resume_key)
            
        la_val = row.get(la_key) if la_key else None
        code_val = row.get(code_key) if code_key else None
        
        la_score = -1.0
        code_score = -1.0
        test_status = 'Not Sent'
        
        try:
            cgpa = float(cgpa_str) if cgpa_str else 0.0
        except ValueError:
            cgpa = 0.0
            
        if la_val or code_val:
            try:
                la_score = float(la_val) if la_val else -1.0
                code_score = float(code_val) if code_val else -1.0
                if la_score != -1.0 or code_score != -1.0:
                    test_status = 'Completed'
            except ValueError:
                pass
                
        try:
            cursor.execute("""
                INSERT INTO candidates 
                (name, email, college, branch, cgpa, best_ai_project, research_work, github_profile, resume_link, test_la_score, test_code_score, test_status, status) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Applied')
                ON CONFLICT(email) DO UPDATE SET
                    name=excluded.name,
                    college=excluded.college,
                    branch=excluded.branch,
                    cgpa=excluded.cgpa,
                    best_ai_project=excluded.best_ai_project,
                    research_work=excluded.research_work,
                    github_profile=excluded.github_profile,
                    resume_link=excluded.resume_link,
                    test_la_score=excluded.test_la_score,
                    test_code_score=excluded.test_code_score,
                    test_status=excluded.test_status,
                    status='Applied'
            """, (name, email, college, branch, cgpa, best_project, research, github, resume, la_score, code_score, test_status))
            imported_count += 1
        except Exception as e:
            print(f"Skipped row: {e}")
            skipped_count += 1
            
    conn.commit()
    conn.close()
    
    return {"message": "CSV upload completed", "imported": imported_count, "skipped": skipped_count}

@app.post("/api/candidates/{candidate_id}/screen")
def screen_candidate(candidate_id: int, request: ScreenRequest):
    try:
        final_state = run_candidate_screening(candidate_id, request.job_description)
        
        score = final_state["screening_score"]
        status = final_state["status"] # 'Screening Passed' or 'Screening Failed'
        
        conn = get_db_connection()
        
        if status == "Screening Passed":
            # Check if this candidate already has test scores (e.g. from loaded dataset)
            row = conn.execute("SELECT test_status, test_la_score, test_code_score, email FROM candidates WHERE id = ?", (candidate_id,)).fetchone()
            if row and row["test_status"] == "Completed":
                conn.close()
                auto_progress_after_test_scores(row["email"])
                # Retrieve the newly progressed status
                conn2 = get_db_connection()
                status = conn2.execute("SELECT status FROM candidates WHERE id = ?", (candidate_id,)).fetchone()["status"]
                conn2.close()
            else:
                # Standard flow: auto-invite to test
                test_link = f"http://localhost:5173/test?email={final_state['email']}"
                try:
                    email_success = send_test_invitation_email(final_state["email"], final_state["name"], test_link)
                except Exception as e:
                    print(f"Failed to auto-send invitation email: {e}")
                    email_success = False
                if email_success:
                    conn.execute(
                        "UPDATE candidates SET status = 'Test Pending', test_status = 'Sent' WHERE id = ?",
                        (candidate_id,)
                    )
                    conn.commit()
                    status = "Test Pending"
                conn.close()
        else:
            # Screening Failed -> auto-reject
            conn.execute(
                "UPDATE candidates SET status = 'Rejected' WHERE id = ?",
                (candidate_id,)
            )
            conn.commit()
            conn.close()
            status = "Rejected"
            
        return {
            "candidate_id": candidate_id,
            "status": status,
            "screening_score": score,
            "screening_feedback": final_state["screening_feedback"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/candidates/{candidate_id}/send-test")
def send_test_to_candidate(candidate_id: int):
    conn = get_db_connection()
    row = conn.execute("SELECT * FROM candidates WHERE id = ?", (candidate_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Candidate not found")
        
    candidate = dict(row)
    
    # Generate test link
    test_link = f"http://localhost:5173/test?email={candidate['email']}"
    
    # Send email
    try:
        success = send_test_invitation_email(candidate["email"], candidate["name"], test_link)
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")
    
    if success:
        conn.execute(
            "UPDATE candidates SET status = 'Test Pending', test_status = 'Sent' WHERE id = ?",
            (candidate_id,)
        )
        conn.commit()
        conn.close()
        return {"message": f"Test invitation email sent to {candidate['name']}"}
    else:
        conn.close()
        raise HTTPException(status_code=500, detail="Failed to send test invitation email")

# Test Results Upload Endpoints
@app.post("/api/candidates/upload-test-results")
async def upload_test_results_csv(file: UploadFile = File(...)):
    filename = file.filename.lower()
    if not (filename.endswith(".csv") or filename.endswith(".xlsx") or filename.endswith(".xls")):
        raise HTTPException(status_code=400, detail="Only CSV or Excel (.xlsx) files are allowed")
        
    contents = await file.read()
    try:
        reader = parse_uploaded_file(file, contents)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {str(e)}")
        
    if not reader:
        raise HTTPException(status_code=400, detail="The uploaded file is empty")
        
    # Expected headers: Email, test_la, test_code (resolved loosely)
    file_headers = list(reader[0].keys())
    mapped_headers = map_test_headers(file_headers)
    
    missing = {"email", "test_la", "test_code"} - set(mapped_headers.keys())
    if missing:
        friendly = {"email": "Email", "test_la": "Logical Aptitude (test_la)", "test_code": "Coding Score (test_code)"}
        missing_friendly = [friendly[k] for k in missing]
        raise HTTPException(
            status_code=400, 
            detail=f"Missing columns: {', '.join(missing_friendly)}. Headers present: {', '.join(file_headers)}"
        )

    conn = get_db_connection()
    cursor = conn.cursor()
    updated_count = 0
    
    name_key = mapped_headers.get("name")
    email_key = mapped_headers["email"]
    la_key = mapped_headers["test_la"]
    code_key = mapped_headers["test_code"]
    
    updated_emails = []
    for row in reader:
        row = {k.strip(): v.strip() for k, v in row.items() if k}
        email = row.get(email_key)
        la_val = row.get(la_key)
        code_val = row.get(code_key)
        
        if not email:
            continue
            
        try:
            la_score = float(la_val) if la_val else 0.0
            code_score = float(code_val) if code_val else 0.0
        except ValueError:
            continue
            
        # Verify candidate exists by name and base email to handle de-duplicated test emails correctly
        name_val = row.get(name_key) if name_key else None
        candidate_id = None
        matched_email = None
        
        if name_val:
            # Find candidate by name
            db_cands = cursor.execute(
                "SELECT id, email FROM candidates WHERE LOWER(name) = LOWER(?)",
                (name_val.strip(),)
            ).fetchall()
            
            # Match the one that has the same base email
            input_base = email.split("+", 1)[0] + "@" + email.split("@", 1)[1] if "@" in email else email
            
            for c in db_cands:
                db_email = c["email"]
                db_base = db_email.split("+", 1)[0] + "@" + db_email.split("@", 1)[1] if "@" in db_email else db_email
                
                if db_base.lower() == input_base.lower():
                    candidate_id = c["id"]
                    matched_email = db_email
                    break
        
        # Fallback to direct email match if name match fails or name key not found
        if not candidate_id:
            c_row = cursor.execute("SELECT id, email FROM candidates WHERE email = ?", (email,)).fetchone()
            if c_row:
                candidate_id = c_row["id"]
                matched_email = c_row["email"]
                
        if candidate_id:
            cursor.execute("""
                UPDATE candidates 
                SET test_la_score = ?, 
                    test_code_score = ?, 
                    test_status = 'Completed',
                    status = 'Test Completed'
                WHERE id = ?
            """, (la_score, code_score, candidate_id))
            updated_count += 1
            updated_emails.append(matched_email)
            
    conn.commit()
    conn.close()
    
    # Auto evaluate and shortlist/schedule candidates
    for email in updated_emails:
        try:
            auto_progress_after_test_scores(email)
        except Exception as e:
            print(f"[AUTO ERROR] Failed to auto-progress {email}: {e}")
            
    return {"message": "Test results CSV uploaded", "updated": updated_count}

@app.post("/api/candidates/shortlist-test-performance")
def shortlist_test_performance():
    la_threshold = float(get_setting("la_threshold", "60"))
    code_threshold = float(get_setting("code_threshold", "60"))
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Shortlist candidates whose scores are above thresholds
    cursor.execute("""
        UPDATE candidates 
        SET status = 'Shortlisted' 
        WHERE status = 'Test Completed' 
          AND test_la_score >= ? 
          AND test_code_score >= ?
    """, (la_threshold, code_threshold))
    
    # Reject candidates who completed test but didn't pass
    cursor.execute("""
        UPDATE candidates 
        SET status = 'Rejected' 
        WHERE status = 'Test Completed' 
          AND (test_la_score < ? OR test_code_score < ?)
    """, (la_threshold, code_threshold))
    
    conn.commit()
    conn.close()
    
    return {"message": "Shortlisting complete based on test thresholds", "la_threshold": la_threshold, "code_threshold": code_threshold}

@app.post("/api/candidates/{candidate_id}/schedule-interview")
def schedule_interview(candidate_id: int, request: ScheduleRequest):
    conn = get_db_connection()
    row = conn.execute("SELECT * FROM candidates WHERE id = ?", (candidate_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Candidate not found")
        
    candidate = dict(row)
    conn.close()
    
    try:
        # Schedule Google Meet event
        evt_details = create_interview_event(
            candidate_id=candidate["id"],
            candidate_name=candidate["name"],
            candidate_email=candidate["email"],
            start_time_iso=request.scheduled_time
        )
        
        # Save interview to DB
        conn = get_db_connection()
        conn.execute("""
            INSERT INTO interviews (candidate_id, candidate_name, candidate_email, event_id, meet_link, scheduled_time)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            candidate["id"],
            candidate["name"],
            candidate["email"],
            evt_details["event_id"],
            evt_details["meet_link"],
            evt_details["scheduled_time"]
        ))
        
        # Update candidate status
        conn.execute("""
            UPDATE candidates 
            SET status = 'Interview Scheduled',
                interview_time = ?,
                interview_meet_link = ?,
                interview_event_id = ?
            WHERE id = ?
        """, (
            evt_details["scheduled_time"],
            evt_details["meet_link"],
            evt_details["event_id"],
            candidate_id
        ))
        conn.commit()
        conn.close()
        
        # Send interview invitation email
        send_interview_schedule_email(
            candidate["email"],
            candidate["name"],
            evt_details["scheduled_time"],
            evt_details["meet_link"]
        )
        
        return {
            "message": "Interview scheduled and invitation sent",
            "meet_link": evt_details["meet_link"],
            "scheduled_time": evt_details["scheduled_time"]
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Scheduling failed: {str(e)}")

@app.post("/api/candidates/{candidate_id}/submit-test")
def submit_candidate_test(candidate_id: int, req: TestSubmission):
    conn = get_db_connection()
    row = conn.execute("SELECT * FROM candidates WHERE id = ?", (candidate_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Candidate not found")
    candidate = dict(row)
    
    conn.execute("""
        UPDATE candidates
        SET test_la_score = ?,
            test_code_score = ?,
            test_status = 'Completed',
            status = 'Test Completed'
        WHERE id = ?
    """, (req.la_score, req.code_score, candidate_id))
    conn.commit()
    conn.close()
    
    try:
        # Automatically check scores and shortlist/schedule interview
        auto_progress_after_test_scores(candidate["email"])
    except Exception as e:
        print(f"[AUTO ERROR] Failed to auto-progress {candidate['email']}: {e}")
        
    return {"message": "Test submitted successfully and candidate evaluated"}

# Settings Endpoints
@app.get("/api/settings")
def get_settings():
    return get_all_settings()

@app.post("/api/settings")
def update_system_settings(req: SettingsUpdate):
    settings_dict = {k: v for k, v in req.dict().items() if v is not None}
    update_settings(settings_dict)
    return {"message": "Settings updated successfully"}

# Email Logs
@app.get("/api/emails")
def get_emails():
    conn = get_db_connection()
    rows = conn.execute("SELECT * FROM email_logs ORDER BY sent_at DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

# Google Calendar Integration Endpoints
@app.get("/api/google/login")
def google_login():
    try:
        auth_url = get_google_auth_url()
        return {"url": auth_url}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/google/callback")
def google_callback(code: Optional[str] = None, error: Optional[str] = None):
    if error:
        return RedirectResponse(url=f"http://localhost:5173/settings?google_error={error}")
    if not code:
        return RedirectResponse(url="http://localhost:5173/settings?google_error=Missing+authorization+code")
    try:
        exchange_code_for_token(code)
        # Redirect back to the settings page on the React frontend
        return RedirectResponse(url="http://localhost:5173/settings?google_connected=true")
    except Exception as e:
        # Redirect with error parameter
        return RedirectResponse(url=f"http://localhost:5173/settings?google_error={str(e)}")

@app.get("/api/google/status")
def google_status():
    credentials = get_google_credentials()
    is_connected = credentials is not None
    return {
        "connected": is_connected,
        "email": credentials.account if is_connected and hasattr(credentials, "account") else None
    }
