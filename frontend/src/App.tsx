import { useState, useEffect, useRef } from 'react'
import './App.css'

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

const APTITUDE_QUESTIONS = [
  {
    id: "q1",
    question: "1. If a training session starts at 10:00 AM and ends at 11:30 AM, how long is the session?",
    options: [
      { key: "A", text: "60 minutes" },
      { key: "B", text: "90 minutes" },
      { key: "C", text: "120 minutes" },
      { key: "D", text: "150 minutes" }
    ],
    answer: "B"
  },
  {
    id: "q2",
    question: "2. Which number should come next in the sequence: 2, 4, 8, 16, 32, __?",
    options: [
      { key: "A", text: "48" },
      { key: "B", text: "64" },
      { key: "C", text: "128" },
      { key: "D", text: "40" }
    ],
    answer: "B"
  },
  {
    id: "q3",
    question: "3. If 'All software engineers write code' and 'Alice is a software engineer', does Alice write code?",
    options: [
      { key: "A", text: "Yes" },
      { key: "B", text: "No" },
      { key: "C", text: "Cannot be determined" },
      { key: "D", text: "Only on weekdays" }
    ],
    answer: "A"
  },
  {
    id: "q4",
    question: "4. Choose the odd one out among the following options:",
    options: [
      { key: "A", text: "Python" },
      { key: "B", text: "Java" },
      { key: "C", text: "React" },
      { key: "D", text: "C++" }
    ],
    answer: "C"
  },
  {
    id: "q5",
    question: "5. If today is Friday, what day of the week was it exactly 4 days ago?",
    options: [
      { key: "A", text: "Monday" },
      { key: "B", text: "Tuesday" },
      { key: "C", text: "Wednesday" },
      { key: "D", text: "Thursday" }
    ],
    answer: "A"
  }
];

interface Candidate {
  id: number;
  name: string;
  email: string;
  college: string;
  branch: string;
  cgpa: number;
  best_ai_project: string;
  research_work: string;
  github_profile: string;
  resume_link: string;
  resume_text: string;
  github_repos_data: any;
  github_analysis: string;
  screening_score: number;
  screening_feedback: string;
  status: string;
  test_la_score: number;
  test_code_score: number;
  test_status: string;
  interview_time?: string;
  interview_meet_link?: string;
}

interface Settings {
  hf_token: string;
  github_token: string;
  google_client_id: string;
  google_client_secret: string;
  google_redirect_uri: string;
  smtp_host: string;
  smtp_port: string;
  smtp_user: string;
  smtp_pass: string;
  smtp_from: string;
  use_mock_email: string;
  use_mock_calendar: string;
  la_threshold: string;
  code_threshold: string;
  email_mode: string;
  resend_api_key: string;
  recruiter_email: string;
  company_name: string;
}

interface EmailLog {
  id: number;
  candidate_email: string;
  subject: string;
  body: string;
  sent_at: string;
  status: string;
}

function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'jd' | 'testing' | 'scheduler' | 'emails' | 'settings'>('dashboard');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [jobDescription, setJobDescription] = useState<string>(() => {
    return localStorage.getItem("gtm_job_description") || 
      "We are looking for a Software Engineer Intern with experience in Python, React, and building REST APIs. Exposure to AI/ML tools is a plus.";
  });
  const [settings, setSettings] = useState<Settings>({
    hf_token: "",
    github_token: "",
    google_client_id: "",
    google_client_secret: "",
    google_redirect_uri: "",
    smtp_host: "",
    smtp_port: "",
    smtp_user: "",
    smtp_pass: "",
    smtp_from: "",
    use_mock_email: "true",
    use_mock_calendar: "true",
    la_threshold: "60",
    code_threshold: "60",
    email_mode: "mock",
    resend_api_key: "",
    recruiter_email: "",
    company_name: ""
  });
  
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);
  const [googleConnected, setGoogleConnected] = useState<boolean>(false);
  const [alert, setAlert] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [screeningCandidateId, setScreeningCandidateId] = useState<number | null>(null);
  const [candidateDetailTab, setCandidateDetailTab] = useState<'profile' | 'github' | 'ai' | 'resume'>('profile');
  const [scheduleTime, setScheduleTime] = useState<string>("");
  const [showScheduleModal, setShowScheduleModal] = useState<boolean>(false);

  // Candidate Online Test View States
  const [isCandidateTestView, setIsCandidateTestView] = useState<boolean>(false);
  const [testCandidate, setTestCandidate] = useState<Candidate | null>(null);
  const [testSubmitted, setTestSubmitted] = useState<boolean>(false);
  const [testStep, setTestStep] = useState<'welcome' | 'aptitude' | 'coding' | 'submitting'>('welcome');
  const [testAnswers, setTestAnswers] = useState<{ [key: string]: string }>({});
  const [codingAnswers, setCodingAnswers] = useState<{ [key: string]: string }>({
    q1: "function isPalindrome(s) {\n  // Write your code here\n}",
    q2: "function findMax(arr) {\n  // Write your code here\n}"
  });
  const [testSubmitError, setTestSubmitError] = useState<string>("");
  const [candidateScores, setCandidateScores] = useState<{ la: number; code: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const testResultsInputRef = useRef<HTMLInputElement>(null);

  // Load Initial Data
  useEffect(() => {
    fetchCandidates();
    fetchSettings();
    fetchEmailLogs();
    checkGoogleStatus();
    
    // Check URL parameters for Google OAuth callback status
    const params = new URLSearchParams(window.location.search);
    if (params.get("google_connected") === "true") {
      triggerAlert("success", "Successfully connected Google Calendar OAuth!");
      setActiveTab("settings");
      // Clean query string
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (params.get("google_error")) {
      triggerAlert("error", `Failed to connect Google Calendar: ${params.get("google_error")}`);
      setActiveTab("settings");
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    const emailParam = params.get("email");
    if (emailParam && (window.location.pathname.endsWith("/test") || window.location.pathname.includes("/test"))) {
      setIsCandidateTestView(true);
      fetchCandidateByEmail(emailParam);
    }
  }, []);

  // Save Job Description to Local Storage on change
  useEffect(() => {
    localStorage.setItem("gtm_job_description", jobDescription);
  }, [jobDescription]);

  const triggerAlert = (type: 'success' | 'error', message: string) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 5000);
  };

  const fetchCandidates = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/candidates`);
      if (res.ok) {
        const data = await res.json();
        setCandidates(data);
        // Refresh selected candidate reference if open
        if (selectedCandidate) {
          const updated = data.find((c: Candidate) => c.id === selectedCandidate.id);
          if (updated) setSelectedCandidate(updated);
        }
      }
    } catch (err) {
      console.error("Error fetching candidates:", err);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/settings`);
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      }
    } catch (err) {
      console.error("Error fetching settings:", err);
    }
  };

  const fetchEmailLogs = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/emails`);
      if (res.ok) {
        const data = await res.json();
        setEmailLogs(data);
      }
    } catch (err) {
      console.error("Error fetching email logs:", err);
    }
  };

  const checkGoogleStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/google/status`);
      if (res.ok) {
        const data = await res.json();
        setGoogleConnected(data.connected);
      }
    } catch (err) {
      console.error("Error checking Google status:", err);
    }
  };

  const handleSettingsChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setSettings(prev => ({ ...prev, [name]: value }));
  };

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings)
      });
      if (res.ok) {
        triggerAlert("success", "System settings updated successfully!");
        fetchSettings();
      } else {
        triggerAlert("error", "Failed to update settings.");
      }
    } catch (err) {
      triggerAlert("error", "Network error updating settings.");
    } finally {
      setLoading(false);
    }
  };

  const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/candidates/upload`, {
        method: "POST",
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        triggerAlert("success", `Successfully imported ${data.imported} candidates! (Skipped: ${data.skipped})`);
        fetchCandidates();
      } else {
        triggerAlert("error", data.detail || "Error uploading candidates CSV.");
      }
    } catch (err) {
      triggerAlert("error", "Network error uploading CSV.");
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleTestResultsUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/candidates/upload-test-results`, {
        method: "POST",
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        triggerAlert("success", `Successfully updated scores for ${data.updated} candidates!`);
        fetchCandidates();
      } else {
        triggerAlert("error", data.detail || "Error uploading test results CSV.");
      }
    } catch (err) {
      triggerAlert("error", "Network error uploading test results.");
    } finally {
      setLoading(false);
      if (testResultsInputRef.current) testResultsInputRef.current.value = "";
    }
  };

  const triggerScreening = async (id: number) => {
    setScreeningCandidateId(id);
    try {
      const res = await fetch(`${API_BASE}/api/candidates/${id}/screen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_description: jobDescription })
      });
      const data = await res.json();
      if (res.ok) {
        triggerAlert("success", `Screening completed for candidate. Score: ${data.screening_score}%`);
        fetchCandidates();
      } else {
        triggerAlert("error", data.detail || "Screening failed.");
      }
    } catch (err) {
      triggerAlert("error", "Network error during screening.");
    } finally {
      setScreeningCandidateId(null);
    }
  };

  const sendTestInvite = async (id: number) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/candidates/${id}/send-test`, {
        method: "POST"
      });
      const data = await res.json();
      if (res.ok) {
        triggerAlert("success", data.message || "Test invite link sent!");
        fetchCandidates();
        fetchEmailLogs();
      } else {
        triggerAlert("error", data.detail || "Failed to send test invite.");
      }
    } catch (err) {
      triggerAlert("error", "Network error sending test invitation.");
    } finally {
      setLoading(false);
    }
  };

  const applyShortlistingCutoffs = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/candidates/shortlist-test-performance`, {
        method: "POST"
      });
      if (res.ok) {
        triggerAlert("success", "Cut-offs applied! Candidates auto-shortlisted or rejected based on scores.");
        fetchCandidates();
      } else {
        triggerAlert("error", "Failed to apply shortlisting rules.");
      }
    } catch (err) {
      triggerAlert("error", "Network error applying test filters.");
    } finally {
      setLoading(false);
    }
  };

  const scheduleInterview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCandidate) return;
    if (!scheduleTime) {
      triggerAlert("error", "Please select a valid date and time.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/candidates/${selectedCandidate.id}/schedule-interview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduled_time: new Date(scheduleTime).toISOString() })
      });
      const data = await res.json();
      if (res.ok) {
        triggerAlert("success", `Interview scheduled successfully! Meet Link: ${data.meet_link}`);
        setShowScheduleModal(false);
        fetchCandidates();
        fetchEmailLogs();
      } else {
        triggerAlert("error", data.detail || "Failed to schedule interview.");
      }
    } catch (err) {
      triggerAlert("error", "Network error during scheduling.");
    } finally {
      setLoading(false);
    }
  };

  const connectGoogleCalendar = async () => {
    try {
      // Save client settings first so redirect flow works
      const saveRes = await fetch(`${API_BASE}/api/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings)
      });
      
      if (!saveRes.ok) {
        triggerAlert("error", "Failed to save Client Credentials before initiating OAuth.");
        return;
      }

      const res = await fetch(`${API_BASE}/api/google/login`);
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        triggerAlert("error", data.detail || "Google OAuth client configuration missing. Enter Client ID and Secret in settings.");
      }
    } catch (err) {
      triggerAlert("error", "Network error initiating Google OAuth login.");
    }
  };

  const fetchCandidateByEmail = async (email: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/candidates?email=${encodeURIComponent(email)}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.length > 0) {
          const cand = data[0];
          if (cand.test_status === 'Completed' || cand.status === 'Interview Scheduled' || cand.status === 'Rejected') {
            setTestSubmitted(true);
            setTestCandidate(cand);
            setCandidateScores({ la: cand.test_la_score, code: cand.test_code_score });
          } else {
            setTestCandidate(cand);
          }
        } else {
          setTestSubmitError("No candidate record matches this email address. Please make sure the link is correct.");
        }
      } else {
        setTestSubmitError("Failed to fetch candidate details from the server.");
      }
    } catch (err) {
      setTestSubmitError("Network error fetching candidate details.");
    } finally {
      setLoading(false);
    }
  };

  const handleTestSubmit = async () => {
    if (!testCandidate) return;
    
    setTestStep('submitting');
    
    // Grade the test
    let laCorrect = 0;
    APTITUDE_QUESTIONS.forEach(q => {
      if (testAnswers[q.id] === q.answer) {
        laCorrect++;
      }
    });
    const laScore = Math.round((laCorrect / APTITUDE_QUESTIONS.length) * 100);

    let codeScore = 0;
    // Question 1 Palindrome keywords
    const q1Code = (codingAnswers["q1"] || "").toLowerCase();
    const hasReverse = q1Code.includes("reverse") || q1Code.includes("split") || q1Code.includes("[::-1]");
    const hasComparison = q1Code.includes("==") || q1Code.includes("===") || q1Code.includes("equal");
    if (q1Code.length > 25 && (hasReverse || hasComparison)) {
      codeScore += 50;
    } else if (q1Code.length > 15) {
      codeScore += 25;
    }

    // Question 2 Max element keywords
    const q2Code = (codingAnswers["q2"] || "").toLowerCase();
    const hasMax = q2Code.includes("math.max") || q2Code.includes("max(") || q2Code.includes("sorted");
    const hasLoop = q2Code.includes(">") && (q2Code.includes("for") || q2Code.includes("while"));
    if (q2Code.length > 25 && (hasMax || hasLoop)) {
      codeScore += 50;
    } else if (q2Code.length > 15) {
      codeScore += 25;
    }

    setCandidateScores({ la: laScore, code: codeScore });

    // Wait a couple of seconds to simulate evaluation micro-animations
    await new Promise(resolve => setTimeout(resolve, 2500));

    try {
      const res = await fetch(`${API_BASE}/api/candidates/${testCandidate.id}/submit-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ la_score: laScore, code_score: codeScore })
      });
      if (res.ok) {
        // Fetch candidate state again to see final status
        const detailsRes = await fetch(`${API_BASE}/api/candidates/${testCandidate.id}`);
        if (detailsRes.ok) {
          const updatedCandidate = await detailsRes.json();
          setTestCandidate(updatedCandidate);
        }
        setTestSubmitted(true);
      } else {
        setTestSubmitError("Failed to submit test scores to the server.");
        setTestStep('coding');
      }
    } catch (err) {
      setTestSubmitError("Network error submitting test. Please try again.");
      setTestStep('coding');
    }
  };

  const renderCandidateTestView = () => {
    if (loading) {
      return (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", backgroundColor: "var(--bg-primary)" }}>
          <div className="loading-spinner" style={{ width: "48px", height: "48px", border: "4px solid rgba(20, 184, 166, 0.1)", borderTop: "4px solid var(--accent-teal)", borderRadius: "50%", animation: "spin 1s linear infinite" }}></div>
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      );
    }

    if (testSubmitError) {
      return (
        <div className="candidate-test-container" style={{ maxWidth: "600px", margin: "6rem auto", padding: "0 1.5rem" }}>
          <div className="glass-card" style={{ textAlign: "center", padding: "3rem 2rem" }}>
            <div style={{ color: "var(--status-failed)", fontSize: "3rem", marginBottom: "1rem" }}>⚠️</div>
            <h2 className="page-title" style={{ marginBottom: "1rem" }}>Error Loading Assessment</h2>
            <p style={{ color: "var(--text-secondary)", marginBottom: "2rem" }}>{testSubmitError}</p>
            <button className="btn btn-secondary" onClick={() => window.location.reload()}>Retry</button>
          </div>
        </div>
      );
    }

    if (testSubmitted) {
      const passed = (candidateScores?.la ?? 0) >= parseFloat(settings.la_threshold) && (candidateScores?.code ?? 0) >= parseFloat(settings.code_threshold);
      
      return (
        <div className="candidate-test-container" style={{ maxWidth: "600px", margin: "6rem auto", padding: "0 1.5rem" }}>
          <div className="glass-card" style={{ textAlign: "center", padding: "3rem 2rem" }}>
            {passed ? (
              <>
                <div style={{ color: "var(--status-passed)", fontSize: "4rem", marginBottom: "1rem" }}>🎉</div>
                <h2 className="page-title" style={{ marginBottom: "1rem" }}>Congratulations!</h2>
                <p style={{ color: "var(--text-secondary)", fontSize: "1.1rem", marginBottom: "1.5rem", lineHeight: "1.6" }}>
                  Great job, <strong>{testCandidate?.name}</strong>! You have successfully passed our technical screening thresholds.
                </p>
                <div style={{ background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.2)", borderRadius: "12px", padding: "1.25rem", margin: "1.5rem 0", textAlign: "left" }}>
                  <h4 style={{ color: "var(--status-passed)", marginBottom: "0.5rem", fontWeight: "600" }}>Assessment Results:</h4>
                  <div style={{ display: "flex", justifyContent: "space-between", margin: "0.25rem 0" }}>
                    <span>Logical Aptitude:</span>
                    <strong>{candidateScores?.la}%</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", margin: "0.25rem 0" }}>
                    <span>Coding Assessment:</span>
                    <strong>{candidateScores?.code}%</strong>
                  </div>
                </div>
                <p style={{ color: "var(--text-primary)", fontWeight: "500", marginBottom: "0.5rem" }}>
                  🗓️ Interview Scheduled Automatically!
                </p>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", marginBottom: "2rem" }}>
                  We have booked a Google Meet technical panel interview for you. Check your inbox (<strong>{testCandidate?.email}</strong>) for the calendar invitation and Meet link.
                </p>
              </>
            ) : (
              <>
                <div style={{ color: "var(--text-secondary)", fontSize: "4rem", marginBottom: "1rem" }}>✉️</div>
                <h2 className="page-title" style={{ marginBottom: "1rem" }}>Assessment Completed</h2>
                <p style={{ color: "var(--text-secondary)", fontSize: "1.1rem", marginBottom: "1.5rem", lineHeight: "1.6" }}>
                  Thank you for completing the assessment, <strong>{testCandidate?.name}</strong>.
                </p>
                <div style={{ background: "rgba(255, 255, 255, 0.04)", border: "1px solid var(--border-color)", borderRadius: "12px", padding: "1.25rem", margin: "1.5rem 0", textAlign: "left" }}>
                  <h4 style={{ color: "var(--text-primary)", marginBottom: "0.5rem", fontWeight: "600" }}>Assessment Results:</h4>
                  <div style={{ display: "flex", justifyContent: "space-between", margin: "0.25rem 0" }}>
                    <span>Logical Aptitude:</span>
                    <strong>{candidateScores?.la}%</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", margin: "0.25rem 0" }}>
                    <span>Coding Assessment:</span>
                    <strong>{candidateScores?.code}%</strong>
                  </div>
                </div>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", marginBottom: "2rem" }}>
                  Your scores did not meet the minimum requirement thresholds. Our team will review your application and keep you updated.
                </p>
              </>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="candidate-test-container" style={{ maxWidth: "800px", margin: "4rem auto", padding: "0 1.5rem 6rem 1.5rem" }}>
        
        {/* Header Block */}
        <div style={{ textAlign: "center", marginBottom: "3rem" }}>
          <div style={{ display: "inline-flex", background: "linear-gradient(135deg, var(--accent-teal), var(--accent-indigo))", width: "48px", height: "48px", borderRadius: "12px", alignItems: "center", justifyContent: "center", marginBottom: "1rem", boxShadow: "0 4px 20px rgba(20, 184, 166, 0.3)" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          <h2 className="page-title">GTM Engineering Technical Assessment</h2>
          <p className="page-subtitle" style={{ marginTop: "0.5rem" }}>Candidate: <strong>{testCandidate?.name}</strong> ({testCandidate?.email})</p>
        </div>

        {/* Progress Tracker */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--bg-secondary)", border: "1px solid var(--border-color)", padding: "1rem 2rem", borderRadius: "12px", marginBottom: "2rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: testStep === 'welcome' ? "var(--accent-teal)" : "var(--text-muted)", fontWeight: testStep === 'welcome' ? "600" : "500" }}>
            <span style={{ display: "inline-block", width: "24px", height: "24px", borderRadius: "50%", background: testStep === 'welcome' ? "var(--accent-teal)" : "rgba(255,255,255,0.05)", color: testStep === 'welcome' ? "#000" : "var(--text-secondary)", textAlign: "center", lineHeight: "24px", fontSize: "0.85rem", fontWeight: "700" }}>1</span>
            Welcome
          </div>
          <div style={{ height: "1px", flexGrow: 1, background: "var(--border-color)", margin: "0 1rem" }}></div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: testStep === 'aptitude' ? "var(--accent-teal)" : "var(--text-muted)", fontWeight: testStep === 'aptitude' ? "600" : "500" }}>
            <span style={{ display: "inline-block", width: "24px", height: "24px", borderRadius: "50%", background: testStep === 'aptitude' ? "var(--accent-teal)" : "rgba(255,255,255,0.05)", color: testStep === 'aptitude' ? "#000" : "var(--text-secondary)", textAlign: "center", lineHeight: "24px", fontSize: "0.85rem", fontWeight: "700" }}>2</span>
            Aptitude
          </div>
          <div style={{ height: "1px", flexGrow: 1, background: "var(--border-color)", margin: "0 1rem" }}></div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: testStep === 'coding' ? "var(--accent-teal)" : "var(--text-muted)", fontWeight: testStep === 'coding' ? "600" : "500" }}>
            <span style={{ display: "inline-block", width: "24px", height: "24px", borderRadius: "50%", background: testStep === 'coding' ? "var(--accent-teal)" : "rgba(255,255,255,0.05)", color: testStep === 'coding' ? "#000" : "var(--text-secondary)", textAlign: "center", lineHeight: "24px", fontSize: "0.85rem", fontWeight: "700" }}>3</span>
            Coding
          </div>
        </div>

        {/* Step Welcome */}
        {testStep === 'welcome' && (
          <div className="glass-card" style={{ padding: "2.5rem" }}>
            <h3 style={{ fontSize: "1.4rem", fontWeight: "600", marginBottom: "1.25rem", color: "#fff" }}>Instructions</h3>
            <ul style={{ color: "var(--text-secondary)", lineHeight: "1.8", paddingLeft: "1.25rem", marginBottom: "2rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <li>This online screening test consists of two parts.</li>
              <li><strong>Part 1: Logical Aptitude (MCQs)</strong> - 5 multiple-choice questions assessing analytical skills.</li>
              <li><strong>Part 2: Coding Assessment</strong> - 2 algorithm problems. You may write solutions in JavaScript or Python.</li>
              <li>Once you click <strong>Start Assessment</strong>, the timer begins. Make sure you have a stable internet connection.</li>
              <li>After submission, your scores will be auto-graded. Candidates passing the thresholds will have their final interview scheduled on Google Calendar automatically.</li>
            </ul>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className="btn btn-primary" onClick={() => setTestStep('aptitude')}>
                Start Assessment →
              </button>
            </div>
          </div>
        )}

        {/* Step Aptitude */}
        {testStep === 'aptitude' && (
          <div className="glass-card" style={{ padding: "2.5rem" }}>
            <h3 style={{ fontSize: "1.4rem", fontWeight: "600", marginBottom: "2rem", color: "#fff" }}>Section 1: Logical Aptitude</h3>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}>
              {APTITUDE_QUESTIONS.map((q, idx) => (
                <div key={q.id} style={{ borderBottom: idx < APTITUDE_QUESTIONS.length - 1 ? "1px solid var(--border-color)" : "none", paddingBottom: "1.5rem" }}>
                  <p style={{ fontWeight: "600", fontSize: "1.05rem", marginBottom: "1.25rem", lineHeight: "1.5", color: "#fff" }}>{q.question}</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                    {q.options.map(opt => {
                      const isSelected = testAnswers[q.id] === opt.key;
                      return (
                        <div 
                          key={opt.key} 
                          onClick={() => setTestAnswers(prev => ({ ...prev, [q.id]: opt.key }))}
                          style={{
                            background: isSelected ? "rgba(20, 184, 166, 0.06)" : "rgba(255, 255, 255, 0.02)",
                            border: isSelected ? "1px solid var(--accent-teal)" : "1px solid var(--border-color)",
                            borderRadius: "10px",
                            padding: "0.85rem 1.25rem",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "0.75rem",
                            transition: "var(--transition-smooth)"
                          }}
                        >
                          <span style={{
                            display: "inline-block",
                            width: "22px",
                            height: "22px",
                            borderRadius: "50%",
                            border: isSelected ? "5px solid var(--accent-teal)" : "2px solid var(--text-muted)",
                            background: "transparent"
                          }}></span>
                          <span style={{ color: isSelected ? "#fff" : "var(--text-secondary)", fontWeight: isSelected ? "600" : "400" }}>{opt.text}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "3rem" }}>
              <button 
                className="btn btn-primary" 
                disabled={Object.keys(testAnswers).length < APTITUDE_QUESTIONS.length}
                onClick={() => setTestStep('coding')}
              >
                Proceed to Coding Section →
              </button>
            </div>
          </div>
        )}

        {/* Step Coding */}
        {testStep === 'coding' && (
          <div className="glass-card" style={{ padding: "2.5rem" }}>
            <h3 style={{ fontSize: "1.4rem", fontWeight: "600", marginBottom: "1rem", color: "#fff" }}>Section 2: Coding Problems</h3>
            <p style={{ color: "var(--text-secondary)", marginBottom: "2rem" }}>Provide implementation for the functions described below. Write clean, readable code.</p>

            <div style={{ display: "flex", flexDirection: "column", gap: "3rem" }}>
              {/* Code Question 1 */}
              <div>
                <p style={{ fontWeight: "600", fontSize: "1.05rem", marginBottom: "0.5rem", color: "#fff" }}>Problem 1: Palindrome Check</p>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.92rem", marginBottom: "1rem" }}>
                  Write a function <code>isPalindrome(s)</code> that returns true if the input string is a palindrome, and false otherwise.
                </p>
                <textarea
                  value={codingAnswers["q1"]}
                  onChange={e => setCodingAnswers(prev => ({ ...prev, q1: e.target.value }))}
                  style={{
                    width: "100%",
                    height: "180px",
                    background: "#070a13",
                    border: "1px solid var(--border-color)",
                    borderRadius: "10px",
                    padding: "1rem",
                    color: "#a5f3fc",
                    fontFamily: "monospace",
                    fontSize: "0.95rem",
                    resize: "vertical",
                    outline: "none"
                  }}
                />
              </div>

              {/* Code Question 2 */}
              <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "2rem" }}>
                <p style={{ fontWeight: "600", fontSize: "1.05rem", marginBottom: "0.5rem", color: "#fff" }}>Problem 2: Find Maximum Element</p>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.92rem", marginBottom: "1rem" }}>
                  Write a function <code>findMax(arr)</code> that takes an array of numbers and returns the largest number in the array.
                </p>
                <textarea
                  value={codingAnswers["q2"]}
                  onChange={e => setCodingAnswers(prev => ({ ...prev, q2: e.target.value }))}
                  style={{
                    width: "100%",
                    height: "180px",
                    background: "#070a13",
                    border: "1px solid var(--border-color)",
                    borderRadius: "10px",
                    padding: "1rem",
                    color: "#a5f3fc",
                    fontFamily: "monospace",
                    fontSize: "0.95rem",
                    resize: "vertical",
                    outline: "none"
                  }}
                />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "3rem" }}>
              <button className="btn btn-secondary" onClick={() => setTestStep('aptitude')}>
                ← Back
              </button>
              <button className="btn btn-primary" onClick={handleTestSubmit}>
                Submit Assessment ✓
              </button>
            </div>
          </div>
        )}

        {/* Step Submitting Glassmorphic Loader */}
        {testStep === 'submitting' && (
          <div className="glass-card" style={{ textAlign: "center", padding: "4rem 2rem", position: "relative" }}>
            <div style={{ display: "inline-block", width: "64px", height: "64px", border: "4px solid rgba(20, 184, 166, 0.1)", borderTop: "4px solid var(--accent-teal)", borderRadius: "50%", animation: "spin 1s linear infinite", marginBottom: "2rem" }}></div>
            <h3 style={{ fontSize: "1.3rem", fontWeight: "600", marginBottom: "0.5rem", color: "#fff" }}>Evaluating Results...</h3>
            <p style={{ color: "var(--text-secondary)" }}>Please wait while our system validates your test cases.</p>
            <style>{`
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            `}</style>
          </div>
        )}
      </div>
    );
  };

  // Status Badge Class Helper
  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'Applied': return 'badge-applied';
      case 'Screening Passed': return 'badge-passed';
      case 'Screening Failed': return 'badge-failed';
      case 'Test Pending': return 'badge-pending';
      case 'Test Completed': return 'badge-pending';
      case 'Shortlisted': return 'badge-passed';
      case 'Interview Scheduled': return 'badge-scheduled';
      case 'Rejected': return 'badge-failed';
      default: return 'badge-applied';
    }
  };

  const getScoreColorClass = (score: number) => {
    if (score === -1) return 'score-none';
    if (score >= 75) return 'score-high';
    if (score >= 60) return 'score-mid';
    return 'score-low';
  };

  // Pipeline Counters
  const getStats = () => {
    const total = candidates.length;
    const passedScreen = candidates.filter(c => c.screening_score >= 65).length;
    const scheduled = candidates.filter(c => c.status === 'Interview Scheduled').length;
    const testPending = candidates.filter(c => c.status === 'Test Pending').length;
    return { total, passedScreen, scheduled, testPending };
  };

  const stats = getStats();

  const shortlistedCandidates = candidates.filter(c => c.status === 'Shortlisted');
  const scheduledCandidates = candidates.filter(c => c.status === 'Interview Scheduled');
  const calendarModeLabel = settings.use_mock_calendar === 'true' ? 'Mock Mode' : 'Live Google Calendar';

  const copyMeetLink = (link: string) => {
    navigator.clipboard.writeText(link);
    triggerAlert('success', 'Meet link copied to clipboard!');
  };

  if (isCandidateTestView) {
    return renderCandidateTestView();
  }

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="logo-container">
          <div className="logo-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          <span className="logo-text">myNachiketa AI</span>
        </div>

        <nav className="nav-menu">
          <div className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => { setActiveTab('dashboard'); setSelectedCandidate(null); }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="9" /><rect x="14" y="3" width="7" height="5" /><rect x="14" y="12" width="7" height="9" /><rect x="3" y="16" width="7" height="5" />
            </svg>
            Dashboard
          </div>
          <div className={`nav-item ${activeTab === 'jd' ? 'active' : ''}`} onClick={() => setActiveTab('jd')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
            </svg>
            Job Description
          </div>
          <div className={`nav-item ${activeTab === 'testing' ? 'active' : ''}`} onClick={() => setActiveTab('testing')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            Test & Shortlist
          </div>
          <div className={`nav-item ${activeTab === 'scheduler' ? 'active' : ''}`} onClick={() => setActiveTab('scheduler')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            Interview Board
          </div>
          <div className={`nav-item ${activeTab === 'emails' ? 'active' : ''}`} onClick={() => { setActiveTab('emails'); fetchEmailLogs(); }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
            </svg>
            Outgoing Mail Logs
          </div>
          <div className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.5 1z" />
            </svg>
            System Settings
          </div>
        </nav>

        <div className="sidebar-footer">
          <div className="connection-status">
            <span className={`status-dot ${googleConnected ? 'connected' : ''}`}></span>
            Google Calendar: {googleConnected ? "Connected" : "Disconnected"}
          </div>
        </div>
      </aside>

      {/* Main Panel Content */}
      <main className="main-content">
        
        {/* Alerts Banner */}
        {alert && (
          <div className={`alert-banner ${alert.type === 'success' ? 'alert-success' : 'alert-error'}`}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              {alert.type === 'success' ? (
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3" />
              ) : (
                <><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></>
              )}
            </svg>
            <span>{alert.message}</span>
          </div>
        )}

        {/* LOADING SCREEN */}
        {loading && (
          <div className="modal-overlay" style={{ background: 'rgba(11, 15, 25, 0.8)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
              <div className="spinner" style={{ width: '48px', height: '48px', borderWidth: '4px' }}></div>
              <p style={{ fontWeight: '500', color: 'var(--accent-teal)' }}>Processing backend request...</p>
            </div>
          </div>
        )}

        {/* 1. RECRUITER DASHBOARD TAB */}
        {activeTab === 'dashboard' && !selectedCandidate && (
          <>
            <div className="header-container">
              <div>
                <h1 className="page-title">Candidate Pipeline</h1>
                <p className="page-subtitle">Evaluate, rank, and progress application profiles using AI screening.</p>
              </div>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <input
                  type="file"
                  accept=".csv, .xlsx, .xls, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                  ref={fileInputRef}
                  onChange={handleCSVUpload}
                  style={{ display: 'none' }}
                />
                <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  Upload CSV/Excel
                </button>
              </div>
            </div>

            {/* Statistics */}
            <div className="stats-grid">
              <div className="glass-card stat-card">
                <div className="stat-icon teal">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </div>
                <div>
                  <div className="stat-number">{stats.total}</div>
                  <div className="stat-label">Total Applicants</div>
                </div>
              </div>
              <div className="glass-card stat-card">
                <div className="stat-icon indigo">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14 9 11" />
                  </svg>
                </div>
                <div>
                  <div className="stat-number">{stats.passedScreen}</div>
                  <div className="stat-label">Passed AI Screen</div>
                </div>
              </div>
              <div className="glass-card stat-card">
                <div className="stat-icon amber">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                  </svg>
                </div>
                <div>
                  <div className="stat-number">{stats.testPending}</div>
                  <div className="stat-label">Tests Pending</div>
                </div>
              </div>
              <div className="glass-card stat-card">
                <div className="stat-icon blue">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </div>
                <div>
                  <div className="stat-number">{stats.scheduled}</div>
                  <div className="stat-label">Interviews Booked</div>
                </div>
              </div>
            </div>

            {/* Candidates Table List */}
            <div className="glass-card">
              <h2 className="section-title" style={{ border: 'none', margin: '0' }}>Active Application Queue</h2>
              {candidates.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-secondary)' }}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: '1rem', color: 'var(--text-muted)' }}>
                    <circle cx="12" cy="12" r="10" /><line x1="8" y1="12" x2="16" y2="12" />
                  </svg>
                  <p>No candidates imported yet. Click "Upload CSV/Excel" to parse sample data.</p>
                </div>
              ) : (
                <div className="table-container">
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>Candidate Name</th>
                        <th>College & Branch</th>
                        <th>CGPA</th>
                        <th>AI Score</th>
                        <th>Status</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {candidates.map((c) => (
                        <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => { setSelectedCandidate(c); setCandidateDetailTab('profile'); }}>
                          <td>
                            <div style={{ fontWeight: '600' }}>{c.name}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{c.email}</div>
                          </td>
                          <td>
                            <div>{c.college || "N/A"}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{c.branch}</div>
                          </td>
                          <td style={{ fontWeight: '500' }}>{c.cgpa ? c.cgpa.toFixed(2) : "0.00"}</td>
                          <td>
                            <span className={`score-indicator ${getScoreColorClass(c.screening_score)}`}>
                              {c.screening_score === -1 ? "--" : `${c.screening_score}%`}
                            </span>
                          </td>
                          <td>
                            <span className={`badge ${getStatusBadgeClass(c.status)}`}>
                              {c.status}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                              <button 
                                className="btn btn-secondary" 
                                style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                                onClick={() => triggerScreening(c.id)}
                                disabled={screeningCandidateId === c.id}
                              >
                                {screeningCandidateId === c.id ? (
                                  <div className="spinner" style={{ width: '12px', height: '12px' }}></div>
                                ) : "Screen"}
                              </button>
                              
                              {c.status === 'Screening Passed' && (
                                <button 
                                  className="btn btn-primary" 
                                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                                  onClick={() => sendTestInvite(c.id)}
                                >
                                  Invite
                                </button>
                              )}
                              
                              {c.status === 'Shortlisted' && (
                                <button 
                                  className="btn btn-primary" 
                                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', background: 'linear-gradient(135deg, var(--accent-indigo), #4f46e5)' }}
                                  onClick={() => { setSelectedCandidate(c); setShowScheduleModal(true); }}
                                >
                                  Schedule
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* 2. JOB DESCRIPTION EDITOR */}
        {activeTab === 'jd' && (
          <div className="glass-card">
            <h1 className="page-title" style={{ marginBottom: '1.5rem' }}>Define Target Job Profile</h1>
            <p className="page-subtitle" style={{ marginBottom: '2rem' }}>
              The job profile description will be processed inside the LangGraph screening loop. 
              The Hugging Face LLM compares candidates' project work, branch specialization, and resume capabilities against these key requirements.
            </p>
            <div className="form-group">
              <label className="form-label">Job Description text</label>
              <textarea
                className="form-textarea"
                style={{ height: '300px' }}
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                placeholder="Paste the role requirements here..."
              ></textarea>
            </div>
            <button className="btn btn-primary" onClick={() => triggerAlert("success", "Active Job Description saved successfully!")}>
              Save Job Description
            </button>
          </div>
        )}

        {/* 3. TEST & SHORTLISTING DASHBOARD */}
        {activeTab === 'testing' && (
          <>
            <div className="header-container">
              <div>
                <h1 className="page-title">Technical Test Assessment</h1>
                <p className="page-subtitle">Upload candidates' logical aptitude and coding scores to filter final shortlists.</p>
              </div>
              <div>
                <input
                  type="file"
                  accept=".csv, .xlsx, .xls, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                  ref={testResultsInputRef}
                  onChange={handleTestResultsUpload}
                  style={{ display: 'none' }}
                />
                <button className="btn btn-secondary" onClick={() => testResultsInputRef.current?.click()}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  Upload Test CSV/Excel
                </button>
              </div>
            </div>

            <div className="split-layout">
              {/* Left Settings Panel */}
              <div className="glass-card split-aside">
                <h3 style={{ fontSize: '1.05rem', fontWeight: '700', marginBottom: '0.75rem' }}>Cut-off Criteria</h3>
                
                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Logical Aptitude</span>
                    <span style={{ color: 'var(--accent-teal)' }}>{settings.la_threshold}%</span>
                  </label>
                  <input
                    type="range"
                    name="la_threshold"
                    min="0"
                    max="100"
                    value={settings.la_threshold}
                    onChange={handleSettingsChange}
                    style={{ accentColor: 'var(--accent-teal)', cursor: 'pointer' }}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Coding Assessment</span>
                    <span style={{ color: 'var(--accent-indigo)' }}>{settings.code_threshold}%</span>
                  </label>
                  <input
                    type="range"
                    name="code_threshold"
                    min="0"
                    max="100"
                    value={settings.code_threshold}
                    onChange={handleSettingsChange}
                    style={{ accentColor: 'var(--accent-indigo)', cursor: 'pointer' }}
                  />
                </div>

                <button className="btn btn-primary" onClick={applyShortlistingCutoffs} style={{ marginTop: '1rem', width: '100%' }}>
                  Apply Cutoffs & Shortlist
                </button>
              </div>

              {/* Right Table Panel */}
              <div className="glass-card">
                <h3 style={{ fontSize: '1.05rem', fontWeight: '700', marginBottom: '1rem' }}>Candidate Scoreboard</h3>
                <div className="table-container">
                  <table className="custom-table" style={{ fontSize: '0.9rem' }}>
                    <thead>
                      <tr>
                        <th>Candidate</th>
                        <th>Aptitude Score (LA)</th>
                        <th>Coding Score</th>
                        <th>Test Status</th>
                        <th>Final Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {candidates.filter(c => c.test_status !== 'Not Sent').length === 0 ? (
                        <tr>
                          <td colSpan={5} style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-muted)' }}>
                            No candidates have been invited for testing yet.
                          </td>
                        </tr>
                      ) : (
                        candidates.filter(c => c.test_status !== 'Not Sent').map((c) => (
                          <tr key={c.id}>
                            <td style={{ fontWeight: '600' }}>{c.name}</td>
                            <td style={{ fontWeight: '700' }}>{c.test_la_score === -1 ? "--" : `${c.test_la_score}%`}</td>
                            <td style={{ fontWeight: '700' }}>{c.test_code_score === -1 ? "--" : `${c.test_code_score}%`}</td>
                            <td>
                              <span style={{ color: c.test_status === 'Completed' ? 'var(--status-passed)' : 'var(--status-pending)', fontWeight: '500' }}>
                                {c.test_status}
                              </span>
                            </td>
                            <td>
                              <span className={`badge ${getStatusBadgeClass(c.status)}`}>
                                {c.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}

        {/* 4. INTERVIEW SCHEDULER BOARD */}
        {activeTab === 'scheduler' && (
          <>
            <div className="header-container">
              <div>
                <h1 className="page-title">Interview Scheduling</h1>
                <p className="page-subtitle">
                  Automatically schedule interviews for qualified candidates using Google Calendar and auto-generated Google Meet links.
                </p>
              </div>
              <div className="scheduler-header-actions">
                <span className={`scheduler-status-pill ${googleConnected ? 'connected' : 'disconnected'}`}>
                  <span className={`status-dot ${googleConnected ? 'connected' : ''}`}></span>
                  {calendarModeLabel}
                </span>
                {settings.use_mock_calendar === 'false' && (
                  <button className="btn btn-secondary" onClick={connectGoogleCalendar} style={{ padding: '0.6rem 1rem', fontSize: '0.85rem' }}>
                    {googleConnected ? 'Re-connect Calendar' : 'Connect Calendar'}
                  </button>
                )}
              </div>
            </div>

            <div className="stats-grid">
              <div className="glass-card stat-card">
                <div className="stat-icon amber">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" />
                  </svg>
                </div>
                <div>
                  <div className="stat-number">{shortlistedCandidates.length}</div>
                  <div className="stat-label">Ready to Schedule</div>
                </div>
              </div>
              <div className="glass-card stat-card">
                <div className="stat-icon blue">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </div>
                <div>
                  <div className="stat-number">{scheduledCandidates.length}</div>
                  <div className="stat-label">Interviews Booked</div>
                </div>
              </div>
              <div className="glass-card stat-card">
                <div className="stat-icon teal">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                </div>
                <div>
                  <div className="stat-number">{googleConnected || settings.use_mock_calendar === 'true' ? 'Active' : 'Setup'}</div>
                  <div className="stat-label">Calendar Integration</div>
                </div>
              </div>
            </div>

            <div className="scheduler-features">
              <div className="scheduler-feature-card">
                <div className="scheduler-feature-icon calendar">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </div>
                <div>
                  <div className="scheduler-feature-title">Google Calendar</div>
                  <div className="scheduler-feature-desc">Events are pushed to your primary calendar with candidate attendees.</div>
                </div>
              </div>
              <div className="scheduler-feature-card">
                <div className="scheduler-feature-icon meet">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                  </svg>
                </div>
                <div>
                  <div className="scheduler-feature-title">Google Meet Links</div>
                  <div className="scheduler-feature-desc">Meet rooms are auto-generated and included in invitation emails.</div>
                </div>
              </div>
              <div className="scheduler-feature-card">
                <div className="scheduler-feature-icon email">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
                  </svg>
                </div>
                <div>
                  <div className="scheduler-feature-title">Email Invitations</div>
                  <div className="scheduler-feature-desc">Candidates receive the schedule and Meet link automatically.</div>
                </div>
              </div>
            </div>

            <div className="scheduler-board">
              <div className="glass-card scheduler-panel">
                <div className="scheduler-panel-header">
                  <span className="scheduler-panel-title">Ready to Schedule</span>
                  <span className="scheduler-panel-count">{shortlistedCandidates.length}</span>
                </div>
                {shortlistedCandidates.length === 0 ? (
                  <div className="scheduler-empty">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
                    </svg>
                    <p>No shortlisted candidates yet.<br />Complete screening and test assessment first.</p>
                  </div>
                ) : (
                  <div className="scheduler-candidate-list">
                    {shortlistedCandidates.map((c) => (
                      <div key={c.id} className="scheduler-candidate-row">
                        <div>
                          <div className="scheduler-candidate-name">{c.name}</div>
                          <div className="scheduler-candidate-email">{c.email}</div>
                        </div>
                        <button
                          className="btn btn-primary"
                          style={{ padding: '0.45rem 1rem', fontSize: '0.8rem', flexShrink: 0 }}
                          onClick={() => { setSelectedCandidate(c); setShowScheduleModal(true); }}
                        >
                          Schedule
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="glass-card scheduler-panel">
                <div className="scheduler-panel-header">
                  <span className="scheduler-panel-title">Upcoming Interviews</span>
                  <span className="scheduler-panel-count">{scheduledCandidates.length}</span>
                </div>
                {scheduledCandidates.length === 0 ? (
                  <div className="scheduler-empty">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                    <p>No interviews scheduled yet.<br />Pick a candidate and book a time slot.</p>
                  </div>
                ) : (
                  <div className="scheduler-candidate-list">
                    {scheduledCandidates.map((c) => (
                      <div key={c.id} className="scheduler-interview-card">
                        <div className="scheduler-interview-top">
                          <div>
                            <div className="scheduler-candidate-name">{c.name}</div>
                            <div className="scheduler-candidate-email">{c.email}</div>
                            {c.interview_time && (
                              <div className="scheduler-interview-time">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                                </svg>
                                {new Date(c.interview_time).toLocaleString()}
                              </div>
                            )}
                          </div>
                          <span className={`badge ${getStatusBadgeClass(c.status)}`}>{c.status}</span>
                        </div>
                        {c.interview_meet_link && (
                          <div className="scheduler-meet-link-box">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-teal)" strokeWidth="2">
                              <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                            </svg>
                            <span className="scheduler-meet-link-text">{c.interview_meet_link}</span>
                          </div>
                        )}
                        <div className="scheduler-card-actions">
                          {c.interview_meet_link && (
                            <>
                              <a
                                href={c.interview_meet_link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn btn-primary"
                                style={{ padding: '0.45rem 1rem', fontSize: '0.8rem', flex: 1 }}
                              >
                                Join Meet
                              </a>
                              <button
                                className="btn btn-secondary"
                                style={{ padding: '0.45rem 0.85rem', fontSize: '0.8rem' }}
                                onClick={() => copyMeetLink(c.interview_meet_link!)}
                              >
                                Copy Link
                              </button>
                            </>
                          )}
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '0.45rem 0.85rem', fontSize: '0.8rem' }}
                            onClick={() => { setSelectedCandidate(c); setShowScheduleModal(true); }}
                          >
                            Reschedule
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* 5. EMAIL LOGS VIEW */}
        {activeTab === 'emails' && (
          <div className="glass-card">
            <h1 className="page-title" style={{ marginBottom: '1.5rem' }}>System Mail Outbox logs</h1>
            <p className="page-subtitle" style={{ marginBottom: '2rem' }}>
              Inspect and track automated emails sent to candidates. In Mock mode, you can inspect details here.
            </p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {emailLogs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-secondary)' }}>
                  <p>No emails have been dispatched by the screening system yet.</p>
                </div>
              ) : (
                emailLogs.map((log) => (
                  <div key={log.id} className="email-log-item">
                    <div className="email-log-header">
                      <div className="email-log-to">To: {log.candidate_email}</div>
                      <div className="email-log-date">{new Date(log.sent_at).toLocaleString()}</div>
                    </div>
                    <div className="email-log-subject">Subject: {log.subject}</div>
                    <div style={{ marginBottom: '0.5rem' }}>
                      <span className="badge" style={{ 
                        backgroundColor: log.status.includes('Failed') 
                          ? 'rgba(239, 68, 68, 0.1)' 
                          : log.status.includes('SMTP') 
                            ? 'rgba(16, 185, 129, 0.1)' 
                            : 'rgba(99, 102, 241, 0.1)',
                        color: log.status.includes('Failed') 
                          ? 'var(--status-failed)' 
                          : log.status.includes('SMTP') 
                            ? 'var(--status-passed)' 
                            : 'var(--accent-indigo)',
                        border: 'none',
                        fontSize: '0.75rem',
                        padding: '0.2rem 0.5rem'
                      }}>
                        {log.status}
                      </span>
                    </div>
                    <pre className="email-log-body">{log.body}</pre>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* 6. SYSTEM SETTINGS PANEL */}
        {activeTab === 'settings' && (
          <div className="glass-card">
            <h1 className="page-title" style={{ marginBottom: '1.5rem' }}>Integrations & Settings</h1>
            
            <form onSubmit={saveSettings}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700', margin: '1.5rem 0 1rem 0', color: 'var(--accent-teal)' }}>API Keys</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                <div className="form-group">
                  <label className="form-label">Hugging Face Token (HF_TOKEN)</label>
                  <input
                    type="password"
                    name="hf_token"
                    className="form-input"
                    value={settings.hf_token}
                    onChange={handleSettingsChange}
                    placeholder="Enter HuggingFace API key..."
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Required for LLM evaluation. Leaving empty activates mock screen evaluator fallback.</span>
                </div>
                <div className="form-group">
                  <label className="form-label">GitHub Token (GITHUB_TOKEN)</label>
                  <input
                    type="password"
                    name="github_token"
                    className="form-input"
                    value={settings.github_token}
                    onChange={handleSettingsChange}
                    placeholder="Enter GitHub developer access token..."
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Optional. Used to fetch repos securely without public API rate limits.</span>
                </div>
              </div>

              <h3 style={{ fontSize: '1.1rem', fontWeight: '700', margin: '2rem 0 1rem 0', color: 'var(--accent-indigo)' }}>Google Calendar OAuth</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                <div className="form-group">
                  <label className="form-label">Google Client ID</label>
                  <input
                    type="text"
                    name="google_client_id"
                    className="form-input"
                    value={settings.google_client_id}
                    onChange={handleSettingsChange}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Google Client Secret</label>
                  <input
                    type="password"
                    name="google_client_secret"
                    className="form-input"
                    value={settings.google_client_secret}
                    onChange={handleSettingsChange}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', marginTop: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Calendar Mode</label>
                  <select name="use_mock_calendar" className="form-select" value={settings.use_mock_calendar} onChange={handleSettingsChange}>
                    <option value="true">Mock Mode (Internal meetings logs)</option>
                    <option value="false">Real Mode (Google Calendar OAuth Integration)</option>
                  </select>
                </div>
                
                {settings.use_mock_calendar === 'false' && (
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    style={{ marginTop: '1.1rem', gap: '0.5rem', display: 'inline-flex', alignItems: 'center' }}
                    onClick={connectGoogleCalendar}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                    {googleConnected ? "Re-auth with Google" : "Connect Google Calendar"}
                  </button>
                )}
              </div>

              <h3 style={{ fontSize: '1.1rem', fontWeight: '700', margin: '2rem 0 1rem 0', color: 'var(--accent-teal)' }}>Email Service Settings</h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                <div className="form-group">
                  <label className="form-label">Email Send Mode</label>
                  <select name="email_mode" className="form-select" value={settings.email_mode} onChange={handleSettingsChange}>
                    <option value="mock">🔬 Mock Mode (Internal Logs & Console Print)</option>
                    <option value="smtp">🔑 Real SMTP Mode (Custom Outbox Credentials)</option>
                  </select>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Choose how automated candidate invitations are processed in real time.
                  </span>
                </div>
              </div>

              {/* Recruiter Branding & Reply-To details */}
              <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.5rem', marginBottom: '1.5rem' }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: '600', color: '#fff', marginBottom: '1rem', marginTop: 0 }}>Sender & Branding Profile</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                  <div className="form-group">
                    <label className="form-label">Company Name</label>
                    <input
                      type="text"
                      name="company_name"
                      className="form-input"
                      value={settings.company_name}
                      onChange={handleSettingsChange}
                      placeholder="e.g. GTM Engineering"
                    />
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Used in email headers and congratulations bodies.</span>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Recruiter Email (Reply-To)</label>
                    <input
                      type="email"
                      name="recruiter_email"
                      className="form-input"
                      value={settings.recruiter_email}
                      onChange={handleSettingsChange}
                      placeholder="e.g. recruiter@company.com"
                    />
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>The candidate replies to this email.</span>
                  </div>
                </div>
              </div>

              {/* Resend Configuration Block */}
              {/* SMTP Configuration Block */}
              {settings.email_mode === 'smtp' && (
                <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.5rem', marginBottom: '1.5rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1rem' }}>
                    <div className="form-group">
                      <label className="form-label">SMTP Server Host</label>
                      <input type="text" name="smtp_host" className="form-input" value={settings.smtp_host} onChange={handleSettingsChange} placeholder="e.g. smtp.gmail.com" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Port</label>
                      <input type="text" name="smtp_port" className="form-input" value={settings.smtp_port} onChange={handleSettingsChange} placeholder="e.g. 587 or 465" />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem', marginBottom: '1rem' }}>
                    <div className="form-group">
                      <label className="form-label">SMTP Username</label>
                      <input type="text" name="smtp_user" className="form-input" value={settings.smtp_user} onChange={handleSettingsChange} placeholder="e.g. user@gmail.com" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">SMTP Password</label>
                      <input type="password" name="smtp_pass" className="form-input" value={settings.smtp_pass} onChange={handleSettingsChange} placeholder="App Password / Credential..." />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Sender Address (From)</label>
                      <input type="text" name="smtp_from" className="form-input" value={settings.smtp_from} onChange={handleSettingsChange} placeholder="e.g. recruiter@company.com" />
                    </div>
                  </div>

                  {/* Built-in Guide */}
                  <div style={{ background: 'rgba(99, 102, 241, 0.03)', border: '1px solid rgba(99, 102, 241, 0.15)', borderRadius: '8px', padding: '1rem' }}>
                    <h5 style={{ margin: '0 0 0.5rem 0', color: '#fff', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      💡 SMTP Setup & Troubleshooting Guide
                    </h5>
                    <ul style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', paddingLeft: '1.1rem', margin: 0, lineHeight: '1.5' }}>
                      <li><strong>Gmail:</strong> Use Host <code>smtp.gmail.com</code>, Port <code>587</code>, and generate a 16-character <strong>App Password</strong> in your Google Account Security settings. Your normal Gmail password will fail.</li>
                      <li><strong>Elastic Email:</strong> Use Host <code>smtp.elasticemail.com</code>, Port <code>2525</code> or <code>587</code>, Username = your account email address, and Password = your SMTP API Key.</li>
                      <li><strong>Port 465 vs 587/2525:</strong> Port <code>465</code> automatically uses secure SSL. Ports <code>587</code> and <code>2525</code> use TLS. Our backend auto-detects and uses the correct method.</li>
                      <li><strong>Firewalls/Blocked Ports:</strong> If connection times out, your cloud host or network provider might be blocking outbound port <code>587</code>, <code>2525</code> or <code>25</code>.</li>
                    </ul>
                  </div>
                </div>
              )}

              <button type="submit" className="btn btn-primary" style={{ marginTop: '2rem' }}>
                Save Configurations
              </button>
            </form>
          </div>
        )}

        {/* --- SELECTED CANDIDATE DETAILED EVALUATION VIEW --- */}
        {selectedCandidate && !showScheduleModal && (
          <>
            <div className="header-container">
              <div>
                <button className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', marginBottom: '1rem' }} onClick={() => { setSelectedCandidate(null); fetchCandidates(); }}>
                  ← Back to Pipeline
                </button>
                <h1 className="page-title">{selectedCandidate.name}</h1>
                <p className="page-subtitle">Candidate screening audit trail and profile metrics.</p>
              </div>

              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <span className={`badge ${getStatusBadgeClass(selectedCandidate.status)}`} style={{ padding: '0.6rem 1rem', fontSize: '0.9rem' }}>
                  {selectedCandidate.status}
                </span>

                <button 
                  className="btn btn-primary"
                  onClick={() => triggerScreening(selectedCandidate.id)}
                  disabled={screeningCandidateId === selectedCandidate.id}
                >
                  {screeningCandidateId === selectedCandidate.id ? (
                    <div className="spinner" style={{ width: '16px', height: '16px' }}></div>
                  ) : "Trigger AI Screen"}
                </button>

                {selectedCandidate.status === 'Screening Passed' && (
                  <button className="btn btn-secondary" onClick={() => sendTestInvite(selectedCandidate.id)}>
                    Send Test Link
                  </button>
                )}

                {(selectedCandidate.status === 'Shortlisted' || selectedCandidate.status === 'Interview Scheduled') && (
                  <button className="btn btn-primary" style={{ background: 'linear-gradient(135deg, var(--accent-indigo), #4f46e5)' }} onClick={() => setShowScheduleModal(true)}>
                    Schedule Interview
                  </button>
                )}
              </div>
            </div>

            <div className="details-grid">
              {/* Left Main Panels */}
              <div className="glass-card">
                {/* Tabs */}
                <div style={{ display: 'flex', gap: '1.5rem', borderBottom: '1px solid var(--border-color)', marginBottom: '1.5rem' }}>
                  <div className={`nav-item ${candidateDetailTab === 'profile' ? 'active' : ''}`} style={{ padding: '0.5rem 1rem', borderRadius: '8px 8px 0 0', border: 'none', background: 'none' }} onClick={() => setCandidateDetailTab('profile')}>
                    Profile Info
                  </div>
                  <div className={`nav-item ${candidateDetailTab === 'github' ? 'active' : ''}`} style={{ padding: '0.5rem 1rem', borderRadius: '8px 8px 0 0', border: 'none', background: 'none' }} onClick={() => setCandidateDetailTab('github')}>
                    GitHub Analysis
                  </div>
                  <div className={`nav-item ${candidateDetailTab === 'ai' ? 'active' : ''}`} style={{ padding: '0.5rem 1rem', borderRadius: '8px 8px 0 0', border: 'none', background: 'none' }} onClick={() => setCandidateDetailTab('ai')}>
                    AI Screening Report
                  </div>
                  <div className={`nav-item ${candidateDetailTab === 'resume' ? 'active' : ''}`} style={{ padding: '0.5rem 1rem', borderRadius: '8px 8px 0 0', border: 'none', background: 'none' }} onClick={() => setCandidateDetailTab('resume')}>
                    Extracted Resume text
                  </div>
                </div>

                {/* Tab Content 1: PROFILE INFO */}
                {candidateDetailTab === 'profile' && (
                  <div className="details-content">
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
                      <div className="details-item"><span className="details-label">College</span><span className="details-value">{selectedCandidate.college || "N/A"}</span></div>
                      <div className="details-item"><span className="details-label">Branch</span><span className="details-value">{selectedCandidate.branch || "N/A"}</span></div>
                      <div className="details-item"><span className="details-label">GPA</span><span className="details-value">{selectedCandidate.cgpa || "0.0"} / 10.0</span></div>
                      <div className="details-item"><span className="details-label">Email</span><span className="details-value">{selectedCandidate.email}</span></div>
                    </div>
                    
                    <h4 style={{ color: 'var(--accent-teal)', marginBottom: '0.75rem', fontWeight: '700' }}>Best AI Project</h4>
                    <p style={{ backgroundColor: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '1.5rem' }}>
                      {selectedCandidate.best_ai_project || "None listed in application."}
                    </p>

                    <h4 style={{ color: 'var(--accent-indigo)', marginBottom: '0.75rem', fontWeight: '700' }}>Research Work</h4>
                    <p style={{ backgroundColor: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                      {selectedCandidate.research_work || "None listed in application."}
                    </p>
                  </div>
                )}

                {/* Tab Content 2: GITHUB ANALYSIS */}
                {candidateDetailTab === 'github' && (
                  <div className="details-content">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                      <div>
                        <h4 style={{ color: 'var(--accent-teal)', fontWeight: '700' }}>Repository-level Analysis</h4>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Extracted from GitHub Profile: {selectedCandidate.github_profile}</p>
                      </div>
                      {selectedCandidate.github_repos_data?.avatar_url && (
                        <img src={selectedCandidate.github_repos_data.avatar_url} alt="avatar" style={{ width: '48px', height: '48px', borderRadius: '50%', border: '2px solid var(--accent-teal)' }} />
                      )}
                    </div>

                    <p style={{ backgroundColor: 'var(--accent-teal-glow)', color: 'var(--text-primary)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(20, 184, 166, 0.3)', marginBottom: '1.5rem' }}>
                      {selectedCandidate.github_analysis || "GitHub evaluation pending. Run 'Trigger AI Screen' to retrieve public repo metrics."}
                    </p>

                    <h4 style={{ marginBottom: '1rem', fontWeight: '700' }}>Repository Portfolio</h4>
                    {selectedCandidate.github_repos_data?.repos?.length > 0 ? (
                      selectedCandidate.github_repos_data.repos.map((repo: any, i: number) => (
                        <div key={i} className="github-repo-card">
                          <div className="github-repo-header">
                            <span className="github-repo-title">{repo.name}</span>
                            {repo.language && (
                              <span style={{ fontSize: '0.75rem', backgroundColor: 'rgba(255,255,255,0.06)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: '600' }}>
                                {repo.language}
                              </span>
                            )}
                          </div>
                          <div className="github-repo-desc">{repo.description || "No description provided."}</div>
                          <div className="github-repo-meta">
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                              </svg>
                              {repo.stars} stars
                            </span>
                            <span>Updated: {new Date(repo.updated_at).toLocaleDateString()}</span>
                            <a href={repo.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-indigo)', textDecoration: 'none', marginLeft: 'auto' }}>View Repo</a>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div style={{ color: 'var(--text-muted)' }}>No repositories loaded.</div>
                    )}
                  </div>
                )}

                {/* Tab Content 3: AI EVALUATION CRITIQUE */}
                {candidateDetailTab === 'ai' && (
                  <div className="details-content">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                      <div style={{ fontSize: '2.5rem', fontWeight: '800', color: selectedCandidate.screening_score >= 65 ? 'var(--status-passed)' : 'var(--status-failed)' }}>
                        {selectedCandidate.screening_score === -1 ? "--" : `${selectedCandidate.screening_score}%`}
                      </div>
                      <div>
                        <h4 style={{ fontWeight: '700' }}>Explainable Screening Score</h4>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Calculated against active Job Description</p>
                      </div>
                    </div>

                    <pre style={{ 
                      whiteSpace: 'pre-wrap', 
                      fontFamily: 'var(--font-family)', 
                      fontSize: '0.95rem',
                      lineHeight: '1.6',
                      backgroundColor: 'rgba(0,0,0,0.15)',
                      padding: '1.5rem',
                      borderRadius: '12px',
                      border: '1px solid var(--border-color)'
                    }}>
                      {selectedCandidate.screening_feedback || "No screening evaluation found. Trigger AI screen evaluation above."}
                    </pre>
                  </div>
                )}

                {/* Tab Content 4: RESUME TEXT */}
                {candidateDetailTab === 'resume' && (
                  <div className="details-content">
                    <h4 style={{ marginBottom: '1rem', fontWeight: '700' }}>Extracted Plaintext Summary</h4>
                    <pre style={{ 
                      maxHeight: '400px', 
                      overflowY: 'auto',
                      whiteSpace: 'pre-wrap', 
                      fontFamily: 'monospace', 
                      fontSize: '0.85rem',
                      backgroundColor: '#090d16',
                      padding: '1rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-secondary)'
                    }}>
                      {selectedCandidate.resume_text || "No resume text extracted yet. Run screening to download PDF."}
                    </pre>
                  </div>
                )}
              </div>

              {/* Right Summary Panel */}
              <div className="glass-card">
                <h4 style={{ fontSize: '1.05rem', fontWeight: '700', marginBottom: '1.25rem' }}>Application Audit</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.9rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="details-label">Logical Aptitude</span>
                    <span className="details-value">{selectedCandidate.test_la_score === -1 ? "N/A" : `${selectedCandidate.test_la_score}%`}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="details-label">Coding Score</span>
                    <span className="details-value">{selectedCandidate.test_code_score === -1 ? "N/A" : `${selectedCandidate.test_code_score}%`}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="details-label">Test Link Status</span>
                    <span className="details-value">{selectedCandidate.test_status}</span>
                  </div>
                  
                  {selectedCandidate.interview_meet_link && (
                    <>
                      <hr style={{ borderColor: 'var(--border-color)' }} />
                      <div className="details-label" style={{ fontWeight: '600', color: 'var(--text-primary)' }}>Scheduled Interview</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {selectedCandidate.interview_time ? new Date(selectedCandidate.interview_time).toLocaleString() : ""}
                      </div>
                      <a 
                        href={selectedCandidate.interview_meet_link} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="btn btn-primary"
                        style={{ padding: '0.5rem', fontSize: '0.8rem', marginTop: '0.5rem' }}
                      >
                        Join Google Meet Room
                      </a>
                    </>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* --- SCHEDULE INTERVIEW MODAL POPUP --- */}
        {showScheduleModal && selectedCandidate && (
          <div className="modal-overlay">
            <div className="modal-content glass-card">
              <button className="modal-close" onClick={() => setShowScheduleModal(false)}>×</button>
              <h2 className="section-title">Schedule Live Panel Interview</h2>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                Booking calendar appointment for: <strong>{selectedCandidate.name}</strong> ({selectedCandidate.email})
              </p>
              
              <form onSubmit={scheduleInterview}>
                <div className="form-group">
                  <label className="form-label">Interview Date & Time (Local)</label>
                  <input
                    type="datetime-local"
                    className="form-input"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    required
                  />
                </div>

                <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem', justifyContent: 'flex-end' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowScheduleModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary">Schedule & Send Meet Link</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
