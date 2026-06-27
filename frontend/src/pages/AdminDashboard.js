import React, { useState, useEffect } from 'react';
import { Routes, Route, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import API from '../services/api';

// ─── Overview ────────────────────────────────────────────────────────────────
function Overview() {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    API.get('/reports/system').then(res => setStats(res.data)).catch(() => {});
  }, []);

  return (
    <div>
      <div className="page-header"><h1>🏠 Admin Overview</h1><p>System-wide statistics</p></div>
      {stats && (
        <>
          <div className="stat-grid" style={{ marginBottom: 24 }}>
            <div className="stat-card"><div className="stat-value">{stats.totals.total_students}</div><div className="stat-label">Students</div></div>
            <div className="stat-card"><div className="stat-value">{stats.totals.total_lecturers}</div><div className="stat-label">Lecturers</div></div>
            <div className="stat-card"><div className="stat-value">{stats.totals.total_courses}</div><div className="stat-label">Courses</div></div>
            <div className="stat-card"><div className="stat-value">{stats.totals.total_sessions}</div><div className="stat-label">Sessions</div></div>
            <div className="stat-card"><div className="stat-value">{stats.totals.total_records}</div><div className="stat-label">Attendance Records</div></div>
          </div>
          <div className="card">
            <h2>Course Overview</h2>
            <div className="table-wrapper">
              <table>
                <thead><tr><th>Code</th><th>Title</th><th>Lecturer</th><th>Sessions</th><th>Students</th></tr></thead>
                <tbody>
                  {stats.courses.map((c, i) => (
                    <tr key={i}>
                      <td><strong>{c.course_code}</strong></td>
                      <td>{c.course_title}</td>
                      <td>{c.lecturer}</td>
                      <td>{c.sessions}</td>
                      <td>{c.enrolled_students}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Manage Users ────────────────────────────────────────────────────────────
function ManageUsers() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'student', reg_number: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = () => API.get('/admin/users').then(res => setUsers(res.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const handleCreate = async e => {
    e.preventDefault(); setError(''); setSuccess('');
    try {
      await API.post('/admin/users', form);
      setSuccess('User created successfully');
      setForm({ name: '', email: '', password: '', role: 'student', reg_number: '' });
      load();
    } catch (err) { setError(err.response?.data?.error || 'Failed to create user'); }
  };

  const handleDelete = async userId => {
    if (!window.confirm('Delete this user?')) return;
    try { await API.delete(`/admin/users/${userId}`); load(); }
    catch (err) { setError(err.response?.data?.error || 'Delete failed'); }
  };

  return (
    <div>
      <div className="page-header"><h1>👥 Manage Users</h1><p>Create and manage students, lecturers, and admins</p></div>
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 20 }}>
        <div className="card">
          <h2>Add New User</h2>
          <form onSubmit={handleCreate}>
            {['name', 'email', 'password'].map(f => (
              <div className="form-group" key={f}>
                <label>{f.charAt(0).toUpperCase() + f.slice(1)}</label>
                <input type={f === 'password' ? 'password' : f === 'email' ? 'email' : 'text'}
                  value={form[f]} onChange={e => setForm({ ...form, [f]: e.target.value })} required />
              </div>
            ))}
            <div className="form-group">
              <label>Role</label>
              <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                <option value="student">Student</option>
                <option value="lecturer">Lecturer</option>
                <option value="admin">Administrator</option>
              </select>
            </div>
            {form.role === 'student' && (
              <div className="form-group">
                <label>Registration Number</label>
                <input value={form.reg_number} onChange={e => setForm({ ...form, reg_number: e.target.value })} />
              </div>
            )}
            <button className="btn btn-primary" type="submit">➕ Create User</button>
          </form>
        </div>
        <div className="card">
          <h2>All Users</h2>
          <div className="table-wrapper">
            <table>
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Reg No.</th><th></th></tr></thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.user_id}>
                    <td>{u.name}</td>
                    <td style={{ fontSize: '0.8rem' }}>{u.email}</td>
                    <td><span className={`badge badge-${u.role === 'admin' ? 'red' : u.role === 'lecturer' ? 'blue' : 'green'}`}>{u.role}</span></td>
                    <td>{u.reg_number || '—'}</td>
                    <td>
                      <button className="btn btn-danger" style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                        onClick={() => handleDelete(u.user_id)}>Del</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Manage Courses ───────────────────────────────────────────────────────────
function ManageCourses() {
  const [courses, setCourses] = useState([]);
  const [lecturers, setLecturers] = useState([]);
  const [form, setForm] = useState({ course_code: '', course_title: '', department: '', lecturer_id: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = () => {
    API.get('/admin/courses').then(res => setCourses(res.data)).catch(() => {});
    API.get('/admin/users?role=lecturer').then(res => setLecturers(res.data)).catch(() => {});
  };
  useEffect(load, []);

  const handleCreate = async e => {
    e.preventDefault(); setError(''); setSuccess('');
    try {
      await API.post('/admin/courses', form);
      setSuccess('Course created'); setForm({ course_code: '', course_title: '', department: '', lecturer_id: '' });
      load();
    } catch (err) { setError(err.response?.data?.error || 'Failed'); }
  };

  const handleDelete = async id => {
    if (!window.confirm('Delete course and all its sessions?')) return;
    try { await API.delete(`/admin/courses/${id}`); load(); }
    catch (err) { setError(err.response?.data?.error || 'Delete failed'); }
  };

  return (
    <div>
      <div className="page-header"><h1>📚 Manage Courses</h1></div>
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 20 }}>
        <div className="card">
          <h2>Add Course</h2>
          <form onSubmit={handleCreate}>
            {[['course_code', 'Course Code (e.g. CSC401)'], ['course_title', 'Course Title'], ['department', 'Department']].map(([f, label]) => (
              <div className="form-group" key={f}>
                <label>{label}</label>
                <input value={form[f]} onChange={e => setForm({ ...form, [f]: e.target.value })}
                  required={f !== 'department'} />
              </div>
            ))}
            <div className="form-group">
              <label>Assigned Lecturer</label>
              <select value={form.lecturer_id} onChange={e => setForm({ ...form, lecturer_id: e.target.value })} required>
                <option value="">Select lecturer...</option>
                {lecturers.map(l => <option key={l.user_id} value={l.user_id}>{l.name}</option>)}
              </select>
            </div>
            <button className="btn btn-primary" type="submit">➕ Add Course</button>
          </form>
        </div>
        <div className="card">
          <h2>Courses</h2>
          <div className="table-wrapper">
            <table>
              <thead><tr><th>Code</th><th>Title</th><th>Lecturer</th><th></th></tr></thead>
              <tbody>
                {courses.map(c => (
                  <tr key={c.course_id}>
                    <td><strong>{c.course_code}</strong></td>
                    <td>{c.course_title}</td>
                    <td>{c.lecturer_name}</td>
                    <td>
                      <button className="btn btn-danger" style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                        onClick={() => handleDelete(c.course_id)}>Del</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Enrolments Page ──────────────────────────────────────────────────────────
function ManageEnrollments() {
  const [courses, setCourses] = useState([]);
  const [students, setStudents] = useState([]);
  const [enrolled, setEnrolled] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [success, setSuccess] = useState(''); const [error, setError] = useState('');

  useEffect(() => {
    API.get('/admin/courses').then(r => setCourses(r.data)).catch(() => {});
    API.get('/admin/users?role=student').then(r => setStudents(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedCourse) return;
    API.get(`/admin/enrollments/${selectedCourse}`).then(r => setEnrolled(r.data)).catch(() => {});
  }, [selectedCourse]);

  const handleEnroll = async () => {
    if (!selectedStudents.length || !selectedCourse) return;
    setError(''); setSuccess('');
    try {
      const res = await API.post('/admin/enrollments', { student_ids: selectedStudents.map(Number), course_id: Number(selectedCourse) });
      setSuccess(res.data.message); setSelectedStudents([]);
      API.get(`/admin/enrollments/${selectedCourse}`).then(r => setEnrolled(r.data));
    } catch (err) { setError(err.response?.data?.error || 'Failed'); }
  };

  const handleRemove = async studentId => {
    try {
      await API.delete('/admin/enrollments', { data: { student_id: studentId, course_id: Number(selectedCourse) } });
      setEnrolled(enrolled.filter(e => e.user_id !== studentId));
    } catch {}
  };

  const enrolledIds = enrolled.map(e => e.user_id);

  return (
    <div>
      <div className="page-header"><h1>📋 Enrolments</h1><p>Assign students to courses</p></div>
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}
      <div className="card">
        <div className="form-group">
          <label>Select Course</label>
          <select value={selectedCourse} onChange={e => setSelectedCourse(e.target.value)}>
            <option value="">Choose a course...</option>
            {courses.map(c => <option key={c.course_id} value={c.course_id}>{c.course_code} — {c.course_title}</option>)}
          </select>
        </div>
      </div>
      {selectedCourse && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div className="card">
            <h2>Add Students</h2>
            <div className="table-wrapper" style={{ maxHeight: 360, overflowY: 'auto' }}>
              <table>
                <thead><tr><th>Select</th><th>Name</th><th>Reg No.</th></tr></thead>
                <tbody>
                  {students.filter(s => !enrolledIds.includes(s.user_id)).map(s => (
                    <tr key={s.user_id}>
                      <td><input type="checkbox" checked={selectedStudents.includes(s.user_id)}
                        onChange={e => setSelectedStudents(e.target.checked
                          ? [...selectedStudents, s.user_id]
                          : selectedStudents.filter(id => id !== s.user_id))} /></td>
                      <td>{s.name}</td>
                      <td>{s.reg_number || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="btn btn-primary" style={{ marginTop: 12 }}
              onClick={handleEnroll} disabled={!selectedStudents.length}>
              ➕ Enrol Selected ({selectedStudents.length})
            </button>
          </div>
          <div className="card">
            <h2>Enrolled Students <span className="badge badge-blue">{enrolled.length}</span></h2>
            <div className="table-wrapper">
              <table>
                <thead><tr><th>Name</th><th>Reg No.</th><th></th></tr></thead>
                <tbody>
                  {enrolled.map(s => (
                    <tr key={s.user_id}>
                      <td>{s.name}</td>
                      <td>{s.reg_number || '—'}</td>
                      <td>
                        <button className="btn btn-danger" style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                          onClick={() => handleRemove(s.user_id)}>Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Admin Dashboard Layout ───────────────────────────────────────────────────
export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="dashboard-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h2>📋 QR Attendance</h2>
          <p>Admin Panel</p>
        </div>
        <nav className="sidebar-nav">
          <NavLink to="/admin" end>🏠 Overview</NavLink>
          <NavLink to="/admin/users">👥 Users</NavLink>
          <NavLink to="/admin/courses">📚 Courses</NavLink>
          <NavLink to="/admin/enrollments">📋 Enrolments</NavLink>
        </nav>
        <div className="sidebar-footer">
          <button style={{ background:'none',border:'none',color:'#ff6b6b',cursor:'pointer',padding:0 }}
            onClick={() => { logout(); navigate('/login'); }}>
            🚪 Sign Out
          </button>
          <p style={{ marginTop: 8, fontSize: '0.8rem' }}>{user?.name}</p>
        </div>
      </aside>
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/users" element={<ManageUsers />} />
          <Route path="/courses" element={<ManageCourses />} />
          <Route path="/enrollments" element={<ManageEnrollments />} />
        </Routes>
      </main>
    </div>
  );
}
