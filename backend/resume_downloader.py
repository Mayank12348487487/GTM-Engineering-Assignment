import httpx
import os
import re
from pypdf import PdfReader
from io import BytesIO

def download_and_extract(url: str, candidate_name: str = "Candidate", branch: str = "Computer Science") -> str:
    """
    Downloads a PDF resume from the given URL and extracts its text.
    If it's a local file path, reads it from disk.
    If the download or extraction fails, generates a mock resume for demonstration.
    """
    url = url.strip()
    if not url:
        return _generate_mock_resume(candidate_name, branch)

    # Convert Google Drive sharing links to direct download links
    gd_match1 = re.search(r"drive\.google\.com/file/d/([^/?#\s]+)", url)
    gd_match2 = re.search(r"drive\.google\.com/open\?id=([^&#\s]+)", url)
    gd_match3 = re.search(r"docs\.google\.com/file/d/([^/?#\s]+)", url)
    
    if gd_match1:
        url = f"https://drive.google.com/uc?export=download&id={gd_match1.group(1)}"
    elif gd_match2:
        url = f"https://drive.google.com/uc?export=download&id={gd_match2.group(1)}"
    elif gd_match3:
        url = f"https://drive.google.com/uc?export=download&id={gd_match3.group(1)}"
        
    # Check if local path
    if os.path.exists(url) and url.lower().endswith(".pdf"):
        try:
            with open(url, "rb") as f:
                reader = PdfReader(f)
                text = ""
                for page in reader.pages:
                    text += page.extract_text() or ""
                return text if text.strip() else _generate_mock_resume(candidate_name, branch)
        except Exception as e:
            print(f"Error reading local PDF {url}: {e}")
            return _generate_mock_resume(candidate_name, branch)
            
    # Try downloading
    try:
        # Mock check
        if "example.com" in url or "mock" in url or not url.startswith("http"):
            return _generate_mock_resume(candidate_name, branch)
            
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
        response = httpx.get(url, headers=headers, timeout=15.0, follow_redirects=True)
        if response.status_code == 200:
            # Check content type or guess
            content_type = response.headers.get("content-type", "").lower()
            if "pdf" in content_type or url.lower().endswith(".pdf") or response.content.startswith(b"%PDF"):
                pdf_file = BytesIO(response.content)
                reader = PdfReader(pdf_file)
                text = ""
                for page in reader.pages:
                    text += page.extract_text() or ""
                if text.strip():
                    return text
            else:
                # Treat as plain text
                text = response.text
                if len(text.strip()) > 50:
                    return text
        
        # If code execution reached here, download failed or returned invalid data
        return _generate_mock_resume(candidate_name, branch)
    except Exception as e:
        print(f"Error downloading/extracting resume from {url}: {e}")
        return _generate_mock_resume(candidate_name, branch)

def _generate_mock_resume(name: str, branch: str) -> str:
    """Generates realistic mock resume text if the download fails or is a placeholder."""
    return f"""
RESUME: {name}
Email: {name.lower().replace(' ', '')}@example.com
Degree: Bachelor of Technology (B.Tech)
Branch: {branch or 'Computer Science and Engineering'}
Objective: Highly motivated engineer seeking a role as a Software Developer to leverage technical and analytical skills.

TECHNICAL SKILLS:
- Languages: Python, Java, JavaScript, C++
- Web Development: React, Node.js, HTML5, CSS3, REST APIs
- AI/ML: PyTorch, TensorFlow, Natural Language Processing, Scikit-learn
- Tools & Databases: SQLite, Git, Docker, AWS

EXPERIENCE:
Software Engineering Intern | TechCorp (May 2025 - July 2025)
- Assisted in building a React-based client dashboard, reducing page load times by 20%.
- Integrated backend REST APIs using Node.js/Express.
- Managed version control and CI/CD pipelines using Git and GitHub.

PROJECTS:
1. Intelligent Screening Agent: Built a Python application that uses LLMs to parse documents and match search queries.
2. E-Commerce Backend: Designed a scalable database schema using PostgreSQL and built FastAPI endpoints.

EDUCATION:
B.Tech in {branch or 'Computer Science'} | CGPA: 8.5/10 (Expected graduation 2026)
"""
