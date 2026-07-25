import httpx
import re

def extract_username(profile_url: str) -> str:
    """Extracts username from github profile URL or returns username directly."""
    if not profile_url:
        return ""
    profile_url = profile_url.strip()
    # Matches github.com/username
    match = re.search(r"github\.com/([^/?#\s]+)", profile_url, re.IGNORECASE)
    if match:
        return match.group(1)
    # Fallback to last path component or original string
    if "/" in profile_url:
        parts = [p for p in profile_url.split("/") if p.strip()]
        if parts:
            return parts[-1]
    return profile_url

def fetch_github_profile_data(profile_input: str, token: str = None) -> dict:
    """
    Fetches GitHub profile and repository data.
    If the API call fails or is rate-limited, returns mock data for testing.
    """
    username = extract_username(profile_input)
    if not username:
        return _generate_mock_github_data("candidate")
        
    headers = {"Accept": "application/vnd.github.v3+json"}
    if token:
        headers["Authorization"] = f"token {token}"
        
    try:
        # Check for mock usernames or placeholders
        if username.lower() in ["mock", "test", "candidate", "example", "none"]:
            return _generate_mock_github_data(username)
            
        with httpx.Client(timeout=10.0) as client:
            # Fetch user profile
            user_url = f"https://api.github.com/users/{username}"
            r_user = client.get(user_url, headers=headers)
            
            if r_user.status_code != 200:
                print(f"GitHub API user fetch returned {r_user.status_code} for {username}")
                return _generate_mock_github_data(username)
                
            user_info = r_user.json()
            
            # Fetch repos
            repos_url = f"https://api.github.com/users/{username}/repos?sort=updated&per_page=10"
            r_repos = client.get(repos_url, headers=headers)
            
            repos = []
            if r_repos.status_code == 200:
                for repo in r_repos.json():
                    if not repo.get("fork"): # Skip forks to evaluate original work
                        repos.append({
                            "name": repo.get("name"),
                            "description": repo.get("description"),
                            "language": repo.get("language"),
                            "stars": repo.get("stargazers_count"),
                            "forks": repo.get("forks_count"),
                            "created_at": repo.get("created_at"),
                            "updated_at": repo.get("updated_at"),
                            "url": repo.get("html_url")
                        })
            
            return {
                "username": username,
                "name": user_info.get("name") or username,
                "bio": user_info.get("bio"),
                "public_repos": user_info.get("public_repos"),
                "followers": user_info.get("followers"),
                "following": user_info.get("following"),
                "avatar_url": user_info.get("avatar_url"),
                "repos": repos[:5] # Return top 5 original repos
            }
            
    except Exception as e:
        print(f"Error fetching GitHub profile for {username}: {e}")
        return _generate_mock_github_data(username)

def _generate_mock_github_data(username: str) -> dict:
    """Generates realistic mock GitHub profile data for demonstration and testing."""
    return {
        "username": username,
        "name": username.title(),
        "bio": "Full Stack Developer & AI Enthusiast | B.Tech Undergraduate",
        "public_repos": 14,
        "followers": 12,
        "following": 15,
        "avatar_url": f"https://api.dicebear.com/7.x/bottts/svg?seed={username}",
        "repos": [
            {
                "name": "ai-candidate-screening",
                "description": "An automated system to evaluate resumes and GitHub profiles using LangGraph, LangChain, and LLMs.",
                "language": "Python",
                "stars": 4,
                "forks": 1,
                "created_at": "2025-01-10T12:00:00Z",
                "updated_at": "2026-07-20T15:30:00Z",
                "url": f"https://github.com/{username}/ai-candidate-screening"
            },
            {
                "name": "react-recruiter-portal",
                "description": "A dashboard for recruiters to view rankings, upload test scores, and schedule Google Meet interviews.",
                "language": "TypeScript",
                "stars": 2,
                "forks": 0,
                "created_at": "2025-02-15T09:30:00Z",
                "updated_at": "2026-07-22T10:15:00Z",
                "url": f"https://github.com/{username}/react-recruiter-portal"
            },
            {
                "name": "data-analysis-tool",
                "description": "Fast data processing script for tabular datasets. Built with pure standard Python.",
                "language": "Python",
                "stars": 1,
                "forks": 0,
                "created_at": "2024-11-05T08:00:00Z",
                "updated_at": "2024-12-10T14:45:00Z",
                "url": f"https://github.com/{username}/data-analysis-tool"
            }
        ]
    }
