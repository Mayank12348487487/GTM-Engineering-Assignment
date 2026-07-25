import sqlite3
import json
import os

DB_PATH = os.getenv("SQLITE_DB_PATH", os.path.join(os.path.dirname(os.path.abspath(__file__)), "screening.db"))

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Create candidates table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS candidates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        college TEXT,
        branch TEXT,
        cgpa REAL,
        best_ai_project TEXT,
        research_work TEXT,
        github_profile TEXT,
        resume_link TEXT,
        resume_text TEXT,
        github_repos_data TEXT, -- JSON string
        github_analysis TEXT,
        screening_score INTEGER DEFAULT -1,
        screening_feedback TEXT,
        status TEXT DEFAULT 'Applied', -- 'Applied', 'Screening Failed', 'Screening Passed', 'Test Pending', 'Test Completed', 'Interview Scheduled', 'Rejected'
        test_la_score REAL DEFAULT -1,
        test_code_score REAL DEFAULT -1,
        test_status TEXT DEFAULT 'Not Sent', -- 'Not Sent', 'Sent', 'Completed'
        interview_time TEXT,
        interview_meet_link TEXT,
        interview_event_id TEXT
    )
    """)
    
    # Create settings table (single row or key-value)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )
    """)
    
    # Create email_logs table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS email_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        candidate_email TEXT NOT NULL,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'Logged' -- 'Logged', 'Sent'
    )
    """)
    
    # Create interviews table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS interviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        candidate_id INTEGER NOT NULL,
        candidate_name TEXT NOT NULL,
        candidate_email TEXT NOT NULL,
        event_id TEXT,
        meet_link TEXT,
        scheduled_time TEXT,
        FOREIGN KEY(candidate_id) REFERENCES candidates(id)
    )
    """)
    
    # Initialize default settings if not exists
    default_settings = {
        "hf_token": "",
        "github_token": "",
        "google_client_id": "",
        "google_client_secret": "",
        "google_redirect_uri": "http://localhost:8000/api/google/callback",
        "google_token_data": "", # OAuth JSON credentials
        "smtp_host": "smtp.gmail.com",
        "smtp_port": "587",
        "smtp_user": "",
        "smtp_pass": "",
        "smtp_from": "",
        "use_mock_email": "true",
        "use_mock_calendar": "true",
        "la_threshold": "60",
        "code_threshold": "60",
        "email_mode": "mock",
        "resend_api_key": "",
        "recruiter_email": "",
        "company_name": "GTM Engineering"
    }
    
    for key, val in default_settings.items():
        cursor.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (key, val))
        
    conn.commit()
    conn.close()

# Helper functions to manage settings
def get_setting(key, default=""):
    conn = get_db_connection()
    row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    conn.close()
    if row:
        return row["value"]
    return default

def get_all_settings():
    conn = get_db_connection()
    rows = conn.execute("SELECT key, value FROM settings").fetchall()
    conn.close()
    return {row["key"]: row["value"] for row in rows}

def update_settings(settings_dict):
    conn = get_db_connection()
    cursor = conn.cursor()
    for key, val in settings_dict.items():
        cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (key, str(val)))
    conn.commit()
    conn.close()

# Initialize DB when this file is imported
init_db()
