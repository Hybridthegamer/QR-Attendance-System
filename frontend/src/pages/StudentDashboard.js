import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import QRScanner from '../components/shared/QRScanner';
import API from '../services/api';

// ─── Offline / Sync status hook ─────────────────────────────────────────────
function useNetworkStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const dn = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', dn);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', dn); };
  }, []);
  return online;
}

// ─── Scan Page ───────────────────────────────────────────────────────────────
function ScanPage() {
  const { user } = useAuth();
  const online = useNetworkStatus();
  const [status, setStatus] = useState(null); // { type: 'success'|'error'|'offline', message }
  const [scanning, setScanning] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);

  // Count pending IDB records on load
  useEffect(() => {
    countPending().then(setPendingCount);
    const handler = () => countPending().then(setPendingCount);
    window.addEventListener('attendance-synced', handler);
    return () => window.removeEventListener('attendance-synced', handler);
  }, []);

  const handleScan = useCallback(async token => {
    setScanning(false);
    setStatus(null);
    try {
      // Algorithm 3.7.2 Step 3: attempt POST
      const res = await API.post('/attendance', { qr_token: token });
      setStatus({ type: 'success', message: res.data.message || 'Attendance recorded!' });
    } catch (err) {
      const status = err.response?.status;
      if (!navigator.onLine || status === undefined) {
        // Step 7: Offline — store locally
        await storeOffline(token, user.user_id);
        const count = await countPending();
        setPendingCount(count);
        setStatus({ type: 'offline', message: 'No internet — attendance saved locally and will sync automatically.' });
      } else if (status === 409) {
        setStatus({ type: 'error', message: 'Attendance already recorded for this session.' });
      } else if (status === 401) {
        setStatus({ type: 'error', message: 'QR code has expired. Ask your lecturer to refresh it.' });
      } else if (status === 403) {
        setStatus({ type: 'error', message: 'You are not enrolled in this course.' });
      } else {
        setStatus({ type: 'error', message: err.response?.data?.error || 'Failed to record attendance.' });
      }
    }
  }, [user]);

  return (
    <div>
      <div className="page-header">
        <h1>📷 Scan QR Code</h1>
        <p>Scan the code displayed by your lecturer to mark attendance</p>
      </div>

      {!online && (
        <div className="alert alert-warning">
          ⚠️ You are offline — attendance will be stored locally and synced when reconnected.
        </div>
      )}

      {pendingCount > 0 && (
        <div className="alert alert-info">
          🔄 {pendingCount} record(s) pending synchronisation
        </div>
      )}

      {status && (
        <div className={`alert alert-${status.type === 'success' ? 'success' : status.type === 'offline' ? 'warning' : 'error'}`}>
          {status.type === 'success' && '✅ '}
          {status.type === 'offline' && '📴 '}
          {status.type === 'error' && '❌ '}
          {status.message}
          {status.type !== 'scanning' && (
            <button className="btn btn-secondary" style={{ marginLeft: 12, padding: '4px 12px' }}
              onClick={() => { setStatus(null); setScanning(true); }}>
              Scan Again
            </button>
          )}
        </div>
      )}

      {scanning && (
        <div className="card">
          <QRScanner onScan={handleScan} onError={msg => setStatus({ type: 'error', message: msg })} />
        </div>
      )}
    </div>
  );
}

// ─── Attendance History Page ─────────────────────────────────────────────────
function AttendancePage() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    API.get('/attendance/student')
      .then(res => setRecords(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const grouped = records.reduce((acc, r) => {
    if (!acc[r.course_code]) acc[r.course_code] = { title: r.course_title, records: [] };
    acc[r.course_code].records.push(r);
    return acc;
  }, {});

  return (
    <div>
      <div className="page-header">
        <h1>📊 My Attendance</h1>
        <p>Your attendance history across all enrolled courses</p>
      </div>
      {loading ? <p>Loading...</p> : Object.keys(grouped).length === 0 ? (
        <div className="card"><p style={{ color: '#888' }}>No attendance records found.</p></div>
      ) : Object.entries(grouped).map(([code, { title, records }]) => (
        <div className="card" key={code}>
          <h2>{code} — {title} <span className="badge badge-blue">{records.length} sessions</span></h2>
          <div className="table-wrapper">
            <table>
              <thead><tr><th>Date</th><th>Marked At</th><th>Status</th></tr></thead>
              <tbody>
                {records.map(r => (
                  <tr key={r.attendance_id}>
                    <td>{r.session_date}</td>
                    <td>{new Date(r.marked_at).toLocaleTimeString()}</td>
                    <td>
                      <span className={`badge ${r.sync_status === 'synced' ? 'badge-green' : 'badge-orange'}`}>
                        {r.sync_status === 'synced' ? 'Synced' : 'Pending'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── IndexedDB helpers (client-side offline queue) ───────────────────────────
function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('qr_attendance_offline', 1);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('pending_attendance'))
        db.createObjectStore('pending_attendance', { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = e => reject(e.target.error);
  });
}

async function storeOffline(qr_token, student_id) {
  const token = localStorage.getItem('token');
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pending_attendance', 'readwrite');
    tx.objectStore('pending_attendance').add({ qr_token, student_id, timestamp: Date.now(), attempt: 1, auth_token: token });
    tx.oncomplete = resolve;
    tx.onerror = e => reject(e.target.error);
  });
}

async function countPending() {
  try {
    const db = await openIDB();
    return new Promise((resolve) => {
      const tx = db.transaction('pending_attendance', 'readonly');
      const req = tx.objectStore('pending_attendance').count();
      req.onsuccess = e => resolve(e.target.result);
      req.onerror = () => resolve(0);
    });
  } catch { return 0; }
}

// ─── Student Dashboard Layout ─────────────────────────────────────────────────
export default function StudentDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const online = useNetworkStatus();

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div className="dashboard-layout">
      {!online && <div className="offline-banner">📴 You are offline — attendance will sync automatically when reconnected</div>}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h2>📋 QR Attendance</h2>
          <p>{user?.name}</p>
        </div>
        <nav className="sidebar-nav">
          <NavLink to="/student" end>📷 Scan QR</NavLink>
          <NavLink to="/student/attendance">📊 My Attendance</NavLink>
        </nav>
        <div className="sidebar-footer">
          <button className="btn logout-btn" onClick={handleLogout} style={{ background:'none',border:'none',color:'#ff6b6b',cursor:'pointer',padding:0 }}>
            🚪 Sign Out
          </button>
          <p style={{ marginTop: 8 }}>{user?.reg_number || user?.email}</p>
        </div>
      </aside>
      <main className="main-content" style={{ marginTop: online ? 0 : 36 }}>
        <Routes>
          <Route path="/" element={<ScanPage />} />
          <Route path="/attendance" element={<AttendancePage />} />
        </Routes>
      </main>
    </div>
  );
}
