const jwt = require('jsonwebtoken');
const db = require('../config/db');

/**
 * POST /api/attendance
 * Algorithm 3.7.2 — Attendance Marking Algorithm (Steps 4-6, online path)
 * Body: { qr_token, student_id? }  — student_id extracted from JWT if not provided
 * Returns 201, 401, 403, or 409
 */
const markAttendance = async (req, res, next) => {
  try {
    const { qr_token } = req.body;
    const studentId = req.user.user_id;

    if (!qr_token) {
      return res.status(400).json({ error: 'qr_token is required' });
    }

    // Step 4: Verify and decode the QR token
    let decoded;
    try {
      decoded = jwt.verify(qr_token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired session token' });
    }

    if (decoded.session_type !== 'attendance') {
      return res.status(401).json({ error: 'Invalid token type' });
    }

    // Retrieve session record
    const [sessionRows] = await db.query(
      'SELECT session_id, course_id, token_expiry FROM sessions WHERE qr_token = ?',
      [qr_token]
    );
    if (sessionRows.length === 0) {
      return res.status(401).json({ error: 'Session not found' });
    }

    const session = sessionRows[0];

    // Check server-side expiry as well
    if (new Date(session.token_expiry) < new Date()) {
      return res.status(401).json({ error: 'Session QR code has expired' });
    }

    // Step 5: Check student is enrolled in this course
    const [enrollRows] = await db.query(
      'SELECT enrollment_id FROM enrollments WHERE student_id = ? AND course_id = ?',
      [studentId, session.course_id]
    );
    if (enrollRows.length === 0) {
      return res.status(403).json({ error: 'Not enrolled in this course' });
    }

    // Step 6: Insert attendance record (unique constraint prevents duplicates)
    try {
      await db.query(
        `INSERT INTO attendance (session_id, student_id, marked_at, sync_status)
         VALUES (?, ?, NOW(), 'synced')`,
        [session.session_id, studentId]
      );
      return res.status(201).json({ message: 'Attendance recorded', session_id: session.session_id });
    } catch (dbErr) {
      // MySQL duplicate entry error code
      if (dbErr.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'Attendance already recorded for this session' });
      }
      throw dbErr;
    }
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/attendance/sync
 * Algorithm 3.7.3 — Offline Synchronisation (server-side handler)
 * Body: { records: [{ qr_token, student_id, timestamp }] }
 * Returns: { synced, duplicates, expired, failed }
 */
const syncOfflineAttendance = async (req, res, next) => {
  try {
    const { records } = req.body;
    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: 'records array is required' });
    }

    const studentId = req.user.user_id;
    const results = { synced: 0, duplicates: 0, expired: 0, failed: 0 };

    for (const record of records) {
      try {
        let decoded;
        try {
          decoded = jwt.verify(record.qr_token, process.env.JWT_SECRET);
        } catch {
          // Step 6: Token expired — unresolvable, skip
          results.expired++;
          continue;
        }

        const [sessionRows] = await db.query(
          'SELECT session_id, course_id, token_expiry FROM sessions WHERE qr_token = ?',
          [record.qr_token]
        );
        if (sessionRows.length === 0) { results.expired++; continue; }

        const session = sessionRows[0];

        const [enrollRows] = await db.query(
          'SELECT enrollment_id FROM enrollments WHERE student_id = ? AND course_id = ?',
          [studentId, session.course_id]
        );
        if (enrollRows.length === 0) { results.failed++; continue; }

        try {
          await db.query(
            `INSERT INTO attendance (session_id, student_id, marked_at, sync_status)
             VALUES (?, ?, ?, 'pending')`,
            [session.session_id, studentId, new Date(record.timestamp)]
          );
          results.synced++;
        } catch (dbErr) {
          if (dbErr.code === 'ER_DUP_ENTRY') {
            results.duplicates++; // Step 5 — already exists, treat as success
          } else {
            results.failed++;
          }
        }
      } catch {
        results.failed++;
      }
    }

    res.json({ message: 'Sync complete', ...results });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/attendance/session/:sessionId
 * Live attendance list for lecturer dashboard
 */
const getSessionAttendance = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const lecturerId = req.user.user_id;

    // Ensure lecturer owns session's course
    const [rows] = await db.query(
      `SELECT a.attendance_id, u.name, u.reg_number, u.email, a.marked_at, a.sync_status
       FROM attendance a
       JOIN users u ON u.user_id = a.student_id
       JOIN sessions s ON s.session_id = a.session_id
       JOIN courses c ON c.course_id = s.course_id
       WHERE a.session_id = ? AND c.lecturer_id = ?
       ORDER BY a.marked_at ASC`,
      [sessionId, lecturerId]
    );

    // Also get enrolled count
    const [countRows] = await db.query(
      `SELECT COUNT(*) AS enrolled_count
       FROM enrollments e
       JOIN sessions s ON s.course_id = e.course_id
       WHERE s.session_id = ?`,
      [sessionId]
    );

    res.json({
      session_id: parseInt(sessionId, 10),
      present_count: rows.length,
      enrolled_count: countRows[0].enrolled_count,
      attendees: rows,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/attendance/student/:studentId?
 * Student's own attendance history across all courses
 */
const getStudentAttendance = async (req, res, next) => {
  try {
    const studentId = req.params.studentId || req.user.user_id;

    // Students can only view their own records
    if (req.user.role === 'student' && parseInt(studentId, 10) !== req.user.user_id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const [rows] = await db.query(
      `SELECT a.attendance_id, a.marked_at, a.sync_status,
              s.session_date, s.session_id,
              c.course_code, c.course_title
       FROM attendance a
       JOIN sessions s ON s.session_id = a.session_id
       JOIN courses c ON c.course_id = s.course_id
       WHERE a.student_id = ?
       ORDER BY a.marked_at DESC`,
      [studentId]
    );

    res.json(rows);
  } catch (err) {
    next(err);
  }
};

module.exports = { markAttendance, syncOfflineAttendance, getSessionAttendance, getStudentAttendance };
