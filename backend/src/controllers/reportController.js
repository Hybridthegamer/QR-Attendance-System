const db = require('../config/db');

/**
 * GET /api/reports/course/:courseId
 * Full attendance report for a course — returns JSON or triggers CSV download
 */
const courseReport = async (req, res, next) => {
  try {
    const { courseId } = req.params;
    const { format } = req.query; // ?format=csv
    const lecturerId = req.user.user_id;

    // Access control: lecturer must own course (admin bypasses)
    if (req.user.role === 'lecturer') {
      const [check] = await db.query(
        'SELECT course_id FROM courses WHERE course_id = ? AND lecturer_id = ?',
        [courseId, lecturerId]
      );
      if (check.length === 0) return res.status(403).json({ error: 'Forbidden' });
    }

    const [rows] = await db.query(
      `SELECT
         u.name AS student_name,
         u.reg_number,
         u.email,
         s.session_date,
         s.session_id,
         c.course_code,
         c.course_title,
         CASE WHEN a.attendance_id IS NOT NULL THEN 'Present' ELSE 'Absent' END AS status
       FROM enrollments e
       JOIN users u ON u.user_id = e.student_id
       JOIN courses c ON c.course_id = e.course_id
       JOIN sessions s ON s.course_id = c.course_id
       LEFT JOIN attendance a ON a.session_id = s.session_id AND a.student_id = e.student_id
       WHERE c.course_id = ?
       ORDER BY s.session_date, u.name`,
      [courseId]
    );

    if (format === 'csv') {
      const header = 'Student Name,Reg Number,Email,Course Code,Course Title,Session Date,Status\n';
      const csv = rows.map(r =>
        `"${r.student_name}","${r.reg_number || ''}","${r.email}","${r.course_code}","${r.course_title}","${r.session_date}","${r.status}"`
      ).join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="attendance_${r?.course_code || courseId}.csv"`);
      return res.send(header + csv);
    }

    res.json(rows);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/reports/summary/:courseId
 * Attendance summary per student (% attendance)
 */
const courseSummary = async (req, res, next) => {
  try {
    const { courseId } = req.params;
    const lecturerId = req.user.user_id;

    if (req.user.role === 'lecturer') {
      const [check] = await db.query(
        'SELECT course_id FROM courses WHERE course_id = ? AND lecturer_id = ?',
        [courseId, lecturerId]
      );
      if (check.length === 0) return res.status(403).json({ error: 'Forbidden' });
    }

    const [rows] = await db.query(
      `SELECT
         u.name,
         u.reg_number,
         u.email,
         COUNT(DISTINCT s.session_id) AS total_sessions,
         COUNT(DISTINCT a.session_id) AS attended_sessions,
         ROUND((COUNT(DISTINCT a.session_id) / COUNT(DISTINCT s.session_id)) * 100, 1) AS attendance_percentage
       FROM enrollments e
       JOIN users u ON u.user_id = e.student_id
       JOIN courses c ON c.course_id = e.course_id
       JOIN sessions s ON s.course_id = c.course_id
       LEFT JOIN attendance a ON a.session_id = s.session_id AND a.student_id = e.student_id
       WHERE c.course_id = ?
       GROUP BY u.user_id, u.name, u.reg_number, u.email
       ORDER BY attendance_percentage DESC`,
      [courseId]
    );

    res.json(rows);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/reports/system  — admin only
 * System-wide attendance overview
 */
const systemReport = async (req, res, next) => {
  try {
    const [courseStats] = await db.query(
      `SELECT c.course_code, c.course_title, u.name AS lecturer,
              COUNT(DISTINCT s.session_id) AS sessions,
              COUNT(DISTINCT a.attendance_id) AS total_marks,
              COUNT(DISTINCT e.student_id) AS enrolled_students
       FROM courses c
       JOIN users u ON u.user_id = c.lecturer_id
       LEFT JOIN sessions s ON s.course_id = c.course_id
       LEFT JOIN attendance a ON a.session_id = s.session_id
       LEFT JOIN enrollments e ON e.course_id = c.course_id
       GROUP BY c.course_id
       ORDER BY c.course_code`
    );

    const [totals] = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM users WHERE role = 'student') AS total_students,
        (SELECT COUNT(*) FROM users WHERE role = 'lecturer') AS total_lecturers,
        (SELECT COUNT(*) FROM courses) AS total_courses,
        (SELECT COUNT(*) FROM sessions) AS total_sessions,
        (SELECT COUNT(*) FROM attendance) AS total_records
    `);

    res.json({ totals: totals[0], courses: courseStats });
  } catch (err) {
    next(err);
  }
};

module.exports = { courseReport, courseSummary, systemReport };
