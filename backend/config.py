import os
from backend.database import get_setting

class Config:
    @property
    def hf_token(self):
        return get_setting("hf_token", os.getenv("HF_TOKEN", ""))
        
    @property
    def github_token(self):
        return get_setting("github_token", os.getenv("GITHUB_TOKEN", ""))
        
    @property
    def google_client_id(self):
        return get_setting("google_client_id", os.getenv("GOOGLE_CLIENT_ID", ""))
        
    @property
    def google_client_secret(self):
        return get_setting("google_client_secret", os.getenv("GOOGLE_CLIENT_SECRET", ""))
        
    @property
    def google_redirect_uri(self):
        return get_setting("google_redirect_uri", "http://localhost:8000/api/google/callback")
        
    @property
    def smtp_host(self):
        return get_setting("smtp_host", "smtp.gmail.com").strip()
        
    @property
    def smtp_port(self):
        val = get_setting("smtp_port", "587")
        if not val or not str(val).strip():
            return 587
        try:
            return int(str(val).strip())
        except ValueError:
            return 587
        
    @property
    def smtp_user(self):
        return get_setting("smtp_user", "").strip()
        
    @property
    def smtp_pass(self):
        return get_setting("smtp_pass", "").strip()
        
    @property
    def smtp_from(self):
        return get_setting("smtp_from", "").strip()
        
    @property
    def email_mode(self):
        mode = get_setting("email_mode", "")
        if not mode:
            return "mock" if get_setting("use_mock_email", "true").lower() == "true" else "smtp"
        return mode

    @property
    def resend_api_key(self):
        return get_setting("resend_api_key", "")

    @property
    def recruiter_email(self):
        return get_setting("recruiter_email", "")

    @property
    def company_name(self):
        return get_setting("company_name", "GTM Engineering")

    @property
    def use_mock_email(self):
        return self.email_mode == "mock"
        
    @property
    def use_mock_calendar(self):
        return get_setting("use_mock_calendar", "true").lower() == "true"

settings = Config()
