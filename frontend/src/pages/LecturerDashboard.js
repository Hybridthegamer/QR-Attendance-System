import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import API from '../services/api';

// ─── Generate QR Page ─────────────────────────────────────────────────────────
function GenerateQRPage() {
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState('');
  const [expiryMin, setExpiryMin] = useState(15);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [timeLeft, setTimeLeft] = useState(null);

  useEffect(() => {
    API.get('/admin/courses').then(res => setCourses(res.data)).catch(() => {
      // Lecturers don't have admin access — fetch their own courses via session list
      API.get('/qr/sessions').then(res => {
        const unique = [...new Map(res.data.map(s => [s.course_id, { course_id: s.course_id, course_code: s.course_code, course_title: s.course_title }])).values()];
        setCourses(unique);
      }).catch(() => {});
    });
  }, []);

  // Countdown timer for QR expiry
  useEffect(() => {
    if (!session) return;
    const interval = setInterval(() => {
      const left = Math.max(0, Math.floor((new Date(session.token_expiry) - Date.now()) / 1000));
      setTimeLeft(left);
      if (left === 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [session]);

  const handleGenerate = async e => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await API.post('/qr/generate', { course_id: courseId, expiry_minutes: expiryMin });
      setSession(res.data);
      setTimeLeft(expiryMin * 60);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate QR code');
    } finally { setLoading(false); }
  };

  const formatTime = s => `${Math.floor(s / 60).toString().padStart(2,'0')}:${(s % 60).toString().padStart(2,'0')}`;

  return (
    <div>
      <div className="page-header">
        <h1>🔲 Generate QR Code</h1>
        <p>Create a time-limited session QR code for your class</p>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: session ? '1fr 1fr' : '1fr', gap: 20 }}>
        <div className="card">
          <h2>Session Settings</h2>
          <form onSubmit={handleGenerate}>
            <div className="form-group">
              <label>Course</label>
              <select value={courseId} onChange={e => setCourseId(e.target.value)} required>
                <option value="">Select a course...</option>
                {courses.map(c => (
                  <option key={c.course_id} value={c.course_id}>
                    {c.course_code} — {c.course_title}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>QR Code Expiry (minutes)</label>
              <input type="number" min={1} max={60} value={expiryMin}
                onChange={e => setExpiryMin(parseInt(e.target.value, 10))} />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading || !courseId}>
              {loading ? 'Generating...' : '⚡ Generate QR Code'}
            </button>
          </form>
        </div>

        {session && (
          <div className="card qr-display">
            <h2>{session.course?.course_code} — QR Code</h2>
            <img src={session.qr_code_base64} alt="Session QR Code" style={{ maxWidth: 280 }} />
            <div className="qr-timer">
              {timeLeft > 0
                ? `⏱ Expires in: ${formatTime(timeLeft)}`
                : '⛔ QR Code Expired — Generate a new one'}
            </div>
            <p style={{ color: '#666', marginTop: 8, fontSize: '0.85rem' }}>
              Display this on your projector for students to scan
            </p>
            <button className="btn btn-secondary" style={{ marginTop: 12 }}
              onClick={() => setSession(null)}>
              Generate New Code
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Live Attendance Page ─────────────────────────────────────────────────────
function LiveAttendancePage() {
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [attendance, setAttendance] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    API.get('/qr/sessions').then(res => setSessions(res.data)).catch(() => {});
  }, []);

  const loadAttendance = useCallback(async sessionId => {
    setLoading(true);
    try {
      const res = await API.get(`/attendance/session/${sessionId}`);
      setAttendance(res.data);
      setSelectedSession(sessionId);
    } catch {} finally { setLoading(false); }
  }, []);

  // Auto-refresh every 10 seconds for the selected session
  useEffect(() => {
    if (!selectedSession) return;
    const interval = setInterval(() => loadAttendance(selectedSession), 10000);
    return () => clearInterval(interval);
  }, [selectedSession, loadAttendance]);

  const downloadCSV = async courseId => {
    const res = await API.get(`/reports/course/${courseId}?format=csv`, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url; a.download = `attendance_course_${courseId}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="page-header">
        <h1>📊 Attendance Records</h1>
        <p>Select a session to view live attendance</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 20 }}>
        <div className="card">
          <h2>Recent Sessions</h2>
          <div className="table-wrapper">
            <table>
              <thead><tr><th>Course</th><th>Date</th><th>Present</th><th></th></tr></thead>
              <tbody>
                {sessions.map(s => (
                  <tr key={s.session_id} style={{ cursor: 'pointer' }}
                    onClick={() => loadAttendance(s.session_id)}>
                    <td><strong>{s.course_code}</strong></td>
                    <td>{s.session_date}</td>
                    <td><span className="badge badge-green">{s.present_count}</span></td>
                    <td>
                      <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                        onClick={e => { e.stopPropagation(); downloadCSV(s.course_id); }}>
                        CSV
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          {!attendance ? (
            <p style={{ color: '#888' }}>Select a session on the left to view attendance</p>
          ) : (
            <>
              <h2>Session Attendance
                <span className="badge badge-blue" style={{ marginLeft: 8 }}>
                  {attendance.present_count}/{attendance.enrolled_count} present
                </span>
              </h2>
              {loading && <p>Refreshing...</p>}
              <div className="table-wrapper">
                <table>
                  <thead><tr><th>Name</th><th>Reg Number</th><th>Time</th></tr></thead>
                  <tbody>
                    {attendance.attendees.map(a => (
                      <tr key={a.attendance_id}>
                        <td>{a.name}</td>
                        <td>{a.reg_number || '—'}</td>
                        <td>{new Date(a.marked_at).toLocaleTimeString()}</td>
                      </tr>
                    ))}
                    {attendance.attendees.length === 0 && (
                      <tr><td colSpan={3} style={{ textAlign: 'center', color: '#888' }}>No students have scanned yet</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p style={{ fontSize: '0.8rem', color: '#888', marginTop: 8 }}>Auto-refreshes every 10 seconds</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Lecturer Dashboard Layout ────────────────────────────────────────────────
export default function LecturerDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="dashboard-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h2>📋 QR Attendance</h2>
          <p>{user?.name}</p>
        </div>
        <nav className="sidebar-nav">
          <NavLink to="/lecturer" end>🔲 Generate QR</NavLink>
          <NavLink to="/lecturer/attendance">📊 Attendance</NavLink>
        </nav>
        <div className="sidebar-footer">
          <button style={{ background:'none',border:'none',color:'#ff6b6b',cursor:'pointer',padding:0 }}
            onClick={() => { logout(); navigate('/login'); }}>
            🚪 Sign Out
          </button>
          <p style={{ marginTop: 8, fontSize: '0.8rem' }}>{user?.email}</p>
        </div>
      </aside>
      <main className="main-content">
        <Routes>
          <Route path="/" element={<GenerateQRPage />} />
          <Route path="/attendance" element={<LiveAttendancePage />} />
        </Routes>
      </main>
    </div>
  );
}
