import json
import os
from datetime import datetime, timedelta
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from backend.config import settings
from backend.database import get_setting, update_settings

# Allow HTTP for OAuth callback in local development
os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"

SCOPES = ["https://www.googleapis.com/auth/calendar"]

def get_google_auth_url(state: str = None) -> str:
    """Generates the authorization URL for Google OAuth."""
    client_id = settings.google_client_id
    client_secret = settings.google_client_secret
    
    if not client_id or not client_secret:
        raise ValueError("Google Client ID or Client Secret not configured in Settings.")
        
    client_config = {
        "web": {
            "client_id": client_id,
            "project_id": "gtm-screening",
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
            "client_secret": client_secret,
            "redirect_uris": [settings.google_redirect_uri]
        }
    }
    
    flow = Flow.from_client_config(
        client_config,
        scopes=SCOPES,
        redirect_uri=settings.google_redirect_uri,
        autogenerate_code_verifier=False
    )
    
    authorization_url, state_out = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
        state=state
    )
    
    # We can save state if needed, but for simplicity we return the url
    return authorization_url

def exchange_code_for_token(code: str) -> dict:
    """Exchanges authorization code for credentials and saves them to settings."""
    client_id = settings.google_client_id
    client_secret = settings.google_client_secret
    
    client_config = {
        "web": {
            "client_id": client_id,
            "project_id": "gtm-screening",
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
            "client_secret": client_secret,
            "redirect_uris": [settings.google_redirect_uri]
        }
    }
    
    flow = Flow.from_client_config(
        client_config,
        scopes=SCOPES,
        redirect_uri=settings.google_redirect_uri,
        autogenerate_code_verifier=False
    )
    
    flow.fetch_token(code=code)
    credentials = flow.credentials
    
    token_dict = {
        "token": credentials.token,
        "refresh_token": credentials.refresh_token,
        "token_uri": credentials.token_uri,
        "client_id": credentials.client_id,
        "client_secret": credentials.client_secret,
        "scopes": credentials.scopes
    }
    
    # Save to SQLite database
    update_settings({"google_token_data": json.dumps(token_dict)})
    return token_dict

def get_google_credentials() -> Credentials:
    """Loads and refreshes Google OAuth credentials from database."""
    token_json = get_setting("google_token_data")
    if not token_json:
        return None
        
    try:
        token_data = json.loads(token_json)
        return Credentials(
            token=token_data.get("token"),
            refresh_token=token_data.get("refresh_token"),
            token_uri=token_data.get("token_uri"),
            client_id=token_data.get("client_id"),
            client_secret=token_data.get("client_secret"),
            scopes=token_data.get("scopes")
        )
    except Exception as e:
        print(f"Error loading credentials from DB: {e}")
        return None

def create_interview_event(candidate_id: int, candidate_name: str, candidate_email: str, start_time_iso: str) -> dict:
    """
    Schedules an interview in Google Calendar with Google Meet link.
    Supports Mock and Real calendar modes.
    """
    # Parse start time
    try:
        start_time = datetime.fromisoformat(start_time_iso.replace("Z", "+00:00"))
    except ValueError:
        # Fallback if invalid format
        start_time = datetime.utcnow() + timedelta(days=1)
        
    end_time = start_time + timedelta(minutes=45)
    
    # If Mock mode is enabled or credentials missing
    if settings.use_mock_calendar:
        mock_event_id = f"mock_evt_{candidate_id}_{int(start_time.timestamp())}"
        mock_meet_link = f"https://meet.google.com/gtm-{candidate_id:03d}-meet"
        print(f"[MOCK CALENDAR] Scheduled interview with {candidate_name} ({candidate_email}) at {start_time_iso}")
        return {
            "event_id": mock_event_id,
            "meet_link": mock_meet_link,
            "scheduled_time": start_time.isoformat()
        }
        
    # Real Google Calendar API Call
    credentials = get_google_credentials()
    if not credentials:
        print("[CALENDAR WARNING] Google OAuth Credentials not found or invalid. Falling back to Mock.")
        # Fallback to mock (return mock event details directly to avoid infinite recursion)
        mock_event_id = f"mock_evt_{candidate_id}_{int(start_time.timestamp())}"
        mock_meet_link = f"https://meet.google.com/gtm-{candidate_id:03d}-meet"
        return {
            "event_id": mock_event_id,
            "meet_link": mock_meet_link,
            "scheduled_time": start_time.isoformat()
        }
        
    try:
        service = build("calendar", "v3", credentials=credentials)
        
        event = {
            "summary": f"Technical Interview - {candidate_name} (GTM Engineering)",
            "description": f"AI-assisted technical interview evaluation for candidate {candidate_name}.",
            "start": {
                "dateTime": start_time.isoformat(),
                "timeZone": "UTC",
            },
            "end": {
                "dateTime": end_time.isoformat(),
                "timeZone": "UTC",
            },
            "attendees": [
                {"email": candidate_email}
            ],
            "conferenceData": {
                "createRequest": {
                    "requestId": f"gtm_screening_meet_{candidate_id}_{int(start_time.timestamp())}",
                    "conferenceSolutionKey": {
                        "type": "hangoutsMeet"
                    }
                }
            }
        }
        
        created_event = service.events().insert(
            calendarId="primary",
            body=event,
            conferenceDataVersion=1
        ).execute()
        
        meet_link = created_event.get("hangoutLink", "")
        event_id = created_event.get("id", "")
        
        # If hangoutLink is not populated yet, search conferenceData
        if not meet_link and created_event.get("conferenceData"):
            entry_points = created_event["conferenceData"].get("entryPoints", [])
            for ep in entry_points:
                if ep.get("entryPointType") == "video":
                    meet_link = ep.get("uri")
                    break
                    
        if not meet_link:
            meet_link = f"https://meet.google.com/gtm-{candidate_id:03d}-meet" # Fallback link
            
        return {
            "event_id": event_id,
            "meet_link": meet_link,
            "scheduled_time": start_time.isoformat()
        }
        
    except Exception as e:
        print(f"Error creating Google Calendar event: {e}. Falling back to Mock.")
        # Fallback to mock
        return {
            "event_id": f"mock_err_{candidate_id}_{int(start_time.timestamp())}",
            "meet_link": f"https://meet.google.com/gtm-{candidate_id:03d}-meet",
            "scheduled_time": start_time.isoformat()
        }
