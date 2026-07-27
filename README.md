#  AI Candidate Screening Platform

An end-to-end recruiting pipeline that screens candidates with AI, manages technical assessments, and **automatically schedules interviews** for qualified applicants via **Google Calendar** with **auto-generated Google Meet links**.

## Features

| Module | Description |
|--------|-------------|
| **AI Screening** | LangGraph + Hugging Face LLM evaluates resumes, GitHub profiles, and projects against a job description |
| **Test & Shortlist** | Upload aptitude/coding scores; auto-shortlist or reject based on configurable thresholds |
| **Interview Scheduling** | Schedule panel interviews with Google Calendar events and Meet links |
| **Email Automation** | Send test invites and interview confirmations (SMTP or mock mode) |

## Interview Scheduling

Qualified candidates (status: **Shortlisted**) can be scheduled for live interviews directly from the **Interview Board** dashboard.

### How it works

1. **Manual scheduling** — Pick a date/time on the Interview Board; the system creates a calendar event and sends the candidate an email with the Meet link.
2. **Automatic scheduling** — When test scores are uploaded and a candidate passes both LA and coding thresholds, an interview is auto-booked (2 days out at 10:00 AM UTC) with calendar event + email.
3. **Google Meet links** — Generated via the Google Calendar API `conferenceData` (real mode) or mock links in development mode.

### Google Calendar integration

| Mode | Behavior |
|------|----------|
| **Mock** (default) | Simulates calendar events and Meet links locally — no OAuth required |
| **Real** | Creates events on your Google Calendar with live Meet rooms |

#### Enable real Google Calendar

1. Create a project in [Google Cloud Console](https://console.cloud.google.com/).
2. Enable the **Google Calendar API**.
3. Create **OAuth 2.0 Web Client** credentials.
4. Add authorized redirect URI: `http://localhost:8000/api/google/callback`
5. In the app, go to **System Settings** → enter Client ID & Secret → set Calendar Mode to **Real** → click **Connect Google Calendar**.

## Tech Stack

- **Backend:** FastAPI, SQLite, LangGraph, Google Calendar API
- **Frontend:** React 19, TypeScript, Vite
- **Integrations:** Hugging Face, GitHub, Google OAuth, SMTP

## Project Structure

```
GTM_Engineering/
├── backend/
│   ├── main.py              # FastAPI routes & scheduling endpoints
│   ├── google_calendar.py   # OAuth + Calendar/Meet event creation
│   ├── email_service.py     # Interview invitation emails
│   ├── graph.py             # LangGraph screening pipeline
│   └── database.py          # SQLite schema (candidates, interviews, settings)
├── frontend/
│   └── src/
│       ├── App.tsx          # Recruiter dashboard UI
│       └── index.css        # Global styles
└── README.md
```

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- (Optional) Google Cloud OAuth credentials for real calendar mode
- (Optional) Hugging Face API token for AI screening

### Backend

```bash
cd D:\GTM_Engineering
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** — the Interview Board is in the sidebar under **Interview Board**.

## API — Interview Scheduling

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/candidates/{id}/schedule-interview` | Schedule interview; body: `{ "scheduled_time": "2026-07-26T10:00:00" }` |
| `GET` | `/api/google/login` | Returns OAuth authorization URL |
| `GET` | `/api/google/callback` | OAuth callback (redirects to frontend) |
| `GET` | `/api/google/status` | Check if Google Calendar is connected |

### Schedule interview example

```bash
curl -X POST http://localhost:8000/api/candidates/1/schedule-interview \
  -H "Content-Type: application/json" \
  -d "{\"scheduled_time\": \"2026-07-26T14:30:00\"}"
```

Response:

```json
{
  "message": "Interview scheduled and invitation sent",
  "meet_link": "https://meet.google.com/abc-defg-hij",
  "scheduled_time": "2026-07-26T14:30:00"
}
```

## Configuration

All settings are managed in the UI under **System Settings** or stored in SQLite (`settings` table):

| Setting | Default | Purpose |
|---------|---------|---------|
| `use_mock_calendar` | `true` | Use mock vs real Google Calendar |
| `use_mock_email` | `true` | Log emails locally vs send via SMTP |
| `google_client_id` | — | Google OAuth client ID |
| `google_client_secret` | — | Google OAuth client secret |
| `la_threshold` | `60` | Logical aptitude pass score (%) |
| `code_threshold` | `60` | Coding test pass score (%) |

Environment variables (`HF_TOKEN`, `GOOGLE_CLIENT_ID`, etc.) are supported as fallbacks via `backend/config.py`.

## Workflow

```
Upload Candidates → AI Screen → Send Test Invite → Upload Scores
       → Auto Shortlist → Auto Schedule Interview (Calendar + Meet + Email)
       → Recruiter joins via Interview Board
```

## Docker & Container Deployment

You can build, run, and scale this platform inside Docker containers. Both services are fully configured for multi-container orchestration.

### 1. Run Everything with Docker Compose

To build and launch the frontend, backend, and database stack together:

```bash
docker compose up --build -d
```

* **Frontend URL:** `http://localhost:5173`
* **Backend Docs:** `http://localhost:8000/docs`

To stop and remove the containers:

```bash
docker compose down
```

---

### 2. Standalone Containers & Registry Deployment

You can pull, run, or distribute the pre-built backend and frontend containers stand-alone using your container registry (e.g. Docker Hub).

#### Authenticate with Docker Hub:
```bash
docker login
```

#### Push to Registry:
```bash
# Tag and push the backend image
docker tag gtm_engineering-backend:latest your_docker_username/gtm_engineering-backend:latest
docker push your_docker_username/gtm_engineering-backend:latest

# Tag and push the frontend image
docker tag gtm_engineering-frontend:latest your_docker_username/gtm_engineering-frontend:latest
docker push your_docker_username/gtm_engineering-frontend:latest
```

#### Pull & Run Pre-built Containers Standalone:
```bash
# Run the backend image (with persistent db volume)
docker run -d -p 8000:8000 --name backend-app -v backend-db:/app/backend your_docker_username/gtm_engineering-backend:latest

# Run the frontend image
docker run -d -p 5173:80 --name frontend-app your_docker_username/gtm_engineering-frontend:latest
```

## License

Internal use — GTM Engineering / myNachiketa AI.
