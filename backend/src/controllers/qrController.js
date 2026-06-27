const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const db = require('../config/db');

/**
 * POST /api/qr/generate
 * Algorithm 3.7.1 — QR Code Generation Algorithm (Chapter 3)
 * Body: { course_id, expiry_minutes? }
 * Returns: { session_id, qr_code_base64, token_expiry }
 */
const generateQR = async (req, res, next) => {
  try {
    const { course_id, expiry_minutes } = req.body;
    const lecturerId = req.user.user_id;
    const expiryMin = parseInt(expiry_minutes, 10) || parseInt(process.env.QR_DEFAULT_EXPIRY, 10) || 15;

    if (!course_id) {
      return res.status(400).json({ error: 'course_id is required' });
    }

    // Step 1: Validate lecturer is assigned to this course
    const [courseRows] = await db.query(
      'SELECT course_id, course_code, course_title FROM courses WHERE course_id = ? AND lecturer_id = ?',
      [course_id, lecturerId]
    );
    if (courseRows.length === 0) {
      return res.status(403).json({ error: 'Not authorised for this course' });
    }

    // Step 2: Generate a cryptographically signed, time-stamped session token
    const now = new Date();
    const token = jwt.sign(
      {
        session_type: 'attendance',
        course_id: parseInt(course_id, 10),
        timestamp: now.getTime(),
      },
      process.env.JWT_SECRET,
      { expiresIn: `${expiryMin}m` }
    );

    // Step 3: Compute token_expiry datetime
    const tokenExpiry = new Date(now.getTime() + expiryMin * 60 * 1000);

    // Step 4: Insert session record
    const sessionDate = now.toISOString().split('T')[0];
    const [result] = await db.query(
      'INSERT INTO sessions (course_id, qr_token, token_expiry, session_date) VALUES (?, ?, ?, ?)',
      [course_id, token, tokenExpiry, sessionDate]
    );
    const sessionId = result.insertId;

    // Step 5: Encode token as QR code — error correction level H, 512x512 minimum
    const qrCodeBase64 = await QRCode.toDataURL(token, {
      errorCorrectionLevel: 'H',
      width: 512,
      margin: 2,
    });

    // Step 6: Return to Lecturer Dashboard
    res.status(201).json({
      session_id: sessionId,
      qr_code_base64: qrCodeBase64,
      token_expiry: tokenExpiry.toISOString(),
      course: courseRows[0],
      expiry_minutes: expiryMin,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/qr/session/:sessionId
 * Returns session details + regenerated QR if still active
 */
const getSession = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const [rows] = await db.query(
      `SELECT s.session_id, s.course_id, s.qr_token, s.token_expiry, s.session_date,
              c.course_code, c.course_title
       FROM sessions s
       JOIN courses c ON c.course_id = s.course_id
       WHERE s.session_id = ?`,
      [sessionId]
    );

    if (rows.length === 0) return res.status(404).json({ error: 'Session not found' });
    const session = rows[0];

    // Check if token is still valid
    const now = new Date();
    const isExpired = new Date(session.token_expiry) < now;

    let qrCodeBase64 = null;
    if (!isExpired) {
      qrCodeBase64 = await QRCode.toDataURL(session.qr_token, {
        errorCorrectionLevel: 'H',
        width: 512,
        margin: 2,
      });
    }

    res.json({ ...session, is_expired: isExpired, qr_code_base64: qrCodeBase64 });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/qr/sessions?course_id=
 * List sessions for a course (lecturer only)
 */
const listSessions = async (req, res, next) => {
  try {
    const { course_id } = req.query;
    const lecturerId = req.user.user_id;

    let query = `
      SELECT s.session_id, s.course_id, s.token_expiry, s.session_date, s.created_at,
             c.course_code, c.course_title,
             COUNT(a.attendance_id) AS present_count
      FROM sessions s
      JOIN courses c ON c.course_id = s.course_id
      LEFT JOIN attendance a ON a.session_id = s.session_id
      WHERE c.lecturer_id = ?
    `;
    const params = [lecturerId];

    if (course_id) {
      query += ' AND s.course_id = ?';
      params.push(course_id);
    }
    query += ' GROUP BY s.session_id ORDER BY s.created_at DESC';

    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
};

module.exports = { generateQR, getSession, listSessions };
