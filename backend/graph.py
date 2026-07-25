from typing import TypedDict, Dict, Any, List
import json
import httpx
from langgraph.graph import StateGraph, END
from backend.config import settings
from backend.resume_downloader import download_and_extract
from backend.github_client import fetch_github_profile_data
from backend.database import get_db_connection

# Define the State structure
class AgentState(TypedDict):
    candidate_id: int
    name: str
    email: str
    branch: str
    github_profile: str
    resume_link: str
    job_description: str
    resume_text: str
    github_repos_data: dict
    github_analysis: str
    screening_score: int
    screening_feedback: str
    status: str
    errors: List[str]

# Node 1: Download Resume
def download_resume_node(state: AgentState) -> Dict[str, Any]:
    print(f"[Node: download_resume] Processing candidate: {state['name']}")
    errors = list(state.get("errors", []))
    try:
        resume_text = download_and_extract(
            state["resume_link"], 
            candidate_name=state["name"], 
            branch=state["branch"]
        )
    except Exception as e:
        resume_text = ""
        errors.append(f"Resume extraction failed: {str(e)}")
        
    return {
        "resume_text": resume_text,
        "errors": errors
    }

# Node 2: Fetch GitHub Data
def fetch_github_node(state: AgentState) -> Dict[str, Any]:
    print(f"[Node: fetch_github] Fetching GitHub info for: {state['github_profile']}")
    errors = list(state.get("errors", []))
    try:
        github_data = fetch_github_profile_data(state["github_profile"], token=settings.github_token)
    except Exception as e:
        github_data = {}
        errors.append(f"GitHub fetch failed: {str(e)}")
        
    return {
        "github_repos_data": github_data,
        "errors": errors
    }

# Node 3: LLM AI Screening Node
def ai_screening_node(state: AgentState) -> Dict[str, Any]:
    print(f"[Node: ai_screening] Scoring candidate against Job Description")
    
    resume_text = state.get("resume_text", "")
    github_repos_data = state.get("github_repos_data", {})
    job_desc = state.get("job_description", "")
    
    # Check if HF Token is set
    token = settings.hf_token
    if not token or token.strip() == "":
        print("[AI SCREENING] HF_TOKEN is empty. Falling back to rule-based mock evaluation.")
        return _generate_mock_evaluation(state)
        
    # Query Hugging Face Serverless API
    try:
        # Construct repo summary for LLM
        repos_summary = []
        for r in github_repos_data.get("repos", []):
            repos_summary.append(f"- {r.get('name')} ({r.get('language') or 'N/A'}): {r.get('description') or 'No description'}. Stars: {r.get('stars')}")
        repos_str = "\n".join(repos_summary) if repos_summary else "No public repositories found."
        
        prompt = f"""You are an AI Recruitment Screener. Compare the Candidate Profile and GitHub repositories against the Job Description.

[JOB DESCRIPTION]
{job_desc}

[CANDIDATE RESUME]
{resume_text[:2000]}

[CANDIDATE GITHUB PROJECTS]
{repos_str}

Evaluate the candidate and return your response in raw JSON format (do not wrap in markdown blocks, do not add extra text) with the following fields:
{{
  "screening_score": <an integer between 0 and 100 representing how well they match the JD>,
  "github_analysis": "<1-2 sentences summarizing their GitHub project quality and activity>",
  "strengths": ["list of 2-3 key strengths matching the JD"],
  "weaknesses": ["list of 1-2 weaknesses or gaps relative to the JD"],
  "overall_critique": "<2-3 sentences explaining your final screening decision>"
}}
"""
        # Call HF inference endpoint
        # Using Llama 3 8B Instruct model
        model_id = "meta-llama/Meta-Llama-3-8B-Instruct"
        api_url = f"https://api-inference.huggingface.co/models/{model_id}"
        
        headers = {"Authorization": f"Bearer {token}"}
        payload = {
            "inputs": prompt,
            "parameters": {
                "max_new_tokens": 512,
                "return_full_text": False
            }
        }
        
        response = httpx.post(api_url, headers=headers, json=payload, timeout=20.0)
        
        if response.status_code == 200:
            result = response.json()
            # Handle list vs dict response from HF
            text_response = result[0]["generated_text"] if isinstance(result, list) else result.get("generated_text", "")
            
            # Clean response if LLM added markdown codeblock
            if "```json" in text_response:
                text_response = text_response.split("```json")[1].split("```")[0]
            elif "```" in text_response:
                text_response = text_response.split("```")[1].split("```")[0]
                
            data = json.loads(text_response.strip())
            
            # Save feedback formatted nicely
            feedback_text = f"STRENGTHS:\n" + "\n".join([f"- {s}" for s in data.get("strengths", [])]) + "\n\n"
            feedback_text += f"WEAKNESSES:\n" + "\n".join([f"- {w}" for w in data.get("weaknesses", [])]) + "\n\n"
            feedback_text += f"CRITIQUE:\n{data.get('overall_critique', '')}"
            
            score = int(data.get("screening_score", 50))
            status = "Screening Passed" if score >= 65 else "Screening Failed"
            
            return {
                "screening_score": score,
                "github_analysis": data.get("github_analysis", ""),
                "screening_feedback": feedback_text,
                "status": status
            }
        else:
            print(f"Hugging Face API returned status {response.status_code}: {response.text}")
            return _generate_mock_evaluation(state, error_msg=f"HF API Error: {response.status_code}")
            
    except Exception as e:
        print(f"Error during AI screening call: {e}")
        return _generate_mock_evaluation(state, error_msg=str(e))

def _generate_mock_evaluation(state: AgentState, error_msg: str = None) -> Dict[str, Any]:
    """Generates a detailed rule-based mock evaluation if LLM fails or token is missing."""
    name = state["name"]
    branch = state.get("branch", "Computer Science")
    cgpa = state.get("cgpa", 8.0)
    jd = state.get("job_description", "").lower()
    
    # Rule-based matching score
    match_score = 60
    
    # Increase score based on CGPA
    if cgpa >= 9.0:
        match_score += 15
    elif cgpa >= 8.0:
        match_score += 10
        
    # Check keyword matches between JD and branch/resume
    has_react = "react" in jd or "frontend" in jd
    has_python = "python" in jd or "backend" in jd or "django" in jd or "fastapi" in jd
    has_ai = "ai" in jd or "ml" in jd or "machine learning" in jd or "llm" in jd
    
    strengths = []
    weaknesses = []
    
    if branch.lower() in ["computer science", "information technology", "cs", "it"]:
        match_score += 10
        strengths.append("Strong academic background in Computer Science core principles.")
    else:
        weaknesses.append(f"Academic branch is {branch}, might require additional training in core software engineering.")
        
    github_repos = state.get("github_repos_data", {}).get("repos", [])
    github_star_count = sum(r.get("stars", 0) for r in github_repos)
    
    if github_repos:
        match_score += min(len(github_repos) * 3, 10)
        strengths.append(f"Active GitHub profile with {len(github_repos)} repositories.")
        if github_star_count > 0:
            strengths.append(f"Open-source validation with {github_star_count} stars across repositories.")
    else:
        weaknesses.append("No active public repositories found on GitHub.")
        
    # Evaluate best project and research work if available
    conn = get_db_connection()
    cand = conn.execute("SELECT best_ai_project, research_work FROM candidates WHERE email = ?", (state["email"],)).fetchone()
    conn.close()
    
    best_project = cand["best_ai_project"] if cand else ""
    research_work = cand["research_work"] if cand else ""
    
    if best_project and len(best_project.strip()) > 5:
        match_score += 5
        strengths.append(f"AI project experience: {best_project}")
    if research_work and len(research_work.strip()) > 5:
        match_score += 5
        strengths.append(f"Relevant research contributions: {research_work}")
        
    # Cap score
    match_score = min(max(match_score, 30), 98)
    
    if len(weaknesses) == 0:
        weaknesses.append("No critical skill gaps identified in the screening stage.")
        
    github_analysis = f"Candidate has an active GitHub profile under user '{state.get('github_repos_data', {}).get('username', 'candidate')}'. "
    if github_repos:
        github_analysis += f"Primary languages used: {', '.join(set(r.get('language') for r in github_repos if r.get('language')))}."
    else:
        github_analysis += "No repository language details available."
        
    feedback = "STRENGTHS:\n" + "\n".join([f"- {s}" for s in strengths]) + "\n\n"
    feedback += "WEAKNESSES:\n" + "\n".join([f"- {w}" for w in weaknesses]) + "\n\n"
    
    if error_msg:
        feedback += f"SYSTEM NOTE: This evaluation was fallback rule-based because LLM failed: {error_msg}\n\n"
    else:
        feedback += "SYSTEM NOTE: Rule-based screen because Hugging Face API key is not set.\n\n"
        
    status = "Screening Passed" if match_score >= 65 else "Screening Failed"
    feedback += f"CRITIQUE:\nCandidate {name} demonstrates a match score of {match_score}%. They possess solid fundamentals and project exposure. Recommended for {'shortlisting and further testing' if status == 'Screening Passed' else 'rejection at this time'}."
    
    return {
        "screening_score": match_score,
        "github_analysis": github_analysis,
        "screening_feedback": feedback,
        "status": status
    }

# Build LangGraph Workflow
def create_screening_workflow():
    workflow = StateGraph(AgentState)
    
    # Add nodes
    workflow.add_node("download_resume", download_resume_node)
    workflow.add_node("fetch_github", fetch_github_node)
    workflow.add_node("ai_screening", ai_screening_node)
    
    # Set entry point and edges
    workflow.set_entry_point("download_resume")
    workflow.add_edge("download_resume", "fetch_github")
    workflow.add_edge("fetch_github", "ai_screening")
    workflow.add_edge("ai_screening", END)
    
    return workflow.compile()

# Instantiated graph app
screening_graph = create_screening_workflow()

def run_candidate_screening(candidate_id: int, job_description: str) -> dict:
    """Helper function to load candidate, run graph, and save results to DB."""
    conn = get_db_connection()
    row = conn.execute("SELECT * FROM candidates WHERE id = ?", (candidate_id,)).fetchone()
    if not row:
        conn.close()
        raise ValueError(f"Candidate with ID {candidate_id} not found.")
        
    candidate = dict(row)
    conn.close()
    
    # Initialize state
    initial_state = {
        "candidate_id": candidate["id"],
        "name": candidate["name"],
        "email": candidate["email"],
        "branch": candidate["branch"],
        "github_profile": candidate["github_profile"],
        "resume_link": candidate["resume_link"],
        "job_description": job_description,
        "resume_text": "",
        "github_repos_data": {},
        "github_analysis": "",
        "screening_score": -1,
        "screening_feedback": "",
        "status": "Applied",
        "errors": []
    }
    
    # Execute graph
    final_state = screening_graph.invoke(initial_state)
    
    # Update candidate in DB
    conn = get_db_connection()
    conn.execute("""
        UPDATE candidates 
        SET resume_text = ?,
            github_repos_data = ?,
            github_analysis = ?,
            screening_score = ?,
            screening_feedback = ?,
            status = ?
        WHERE id = ?
    """, (
        final_state["resume_text"],
        json.dumps(final_state["github_repos_data"]),
        final_state["github_analysis"],
        final_state["screening_score"],
        final_state["screening_feedback"],
        final_state["status"],
        candidate_id
    ))
    conn.commit()
    conn.close()
    
    return final_state
