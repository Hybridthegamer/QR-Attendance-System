const bcrypt = require('bcryptjs');
const db = require('../config/db');

/** GET /api/admin/users */
const listUsers = async (req, res, next) => {
  try {
    const { role } = req.query;
    let query = 'SELECT user_id, name, email, role, reg_number, created_at FROM users';
    const params = [];
    if (role) { query += ' WHERE role = ?'; params.push(role); }
    query += ' ORDER BY created_at DESC';
    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (err) { next(err); }
};

/** POST /api/admin/users — create student or lecturer */
const createUser = async (req, res, next) => {
  try {
    const { name, email, password, role, reg_number } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'name, email, password, role are required' });
    }
    if (!['student', 'lecturer', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    const hash = await bcrypt.hash(password, 12);
    const [result] = await db.query(
      'INSERT INTO users (name, email, password_hash, role, reg_number) VALUES (?, ?, ?, ?, ?)',
      [name, email.toLowerCase().trim(), hash, role, reg_number || null]
    );
    res.status(201).json({ user_id: result.insertId, name, email, role });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Email already exists' });
    next(err);
  }
};

/** PUT /api/admin/users/:userId */
const updateUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { name, email, password, reg_number } = req.body;
    const updates = [];
    const params = [];
    if (name) { updates.push('name = ?'); params.push(name); }
    if (email) { updates.push('email = ?'); params.push(email.toLowerCase().trim()); }
    if (password) { updates.push('password_hash = ?'); params.push(await bcrypt.hash(password, 12)); }
    if (reg_number !== undefined) { updates.push('reg_number = ?'); params.push(reg_number); }
    if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });
    params.push(userId);
    await db.query(`UPDATE users SET ${updates.join(', ')} WHERE user_id = ?`, params);
    res.json({ message: 'User updated' });
  } catch (err) { next(err); }
};

/** DELETE /api/admin/users/:userId */
const deleteUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    if (parseInt(userId, 10) === req.user.user_id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    await db.query('DELETE FROM users WHERE user_id = ?', [userId]);
    res.json({ message: 'User deleted' });
  } catch (err) { next(err); }
};

/** GET /api/admin/courses */
const listCourses = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT c.course_id, c.course_code, c.course_title, c.department, c.created_at,
              u.name AS lecturer_name, u.email AS lecturer_email
       FROM courses c JOIN users u ON u.user_id = c.lecturer_id ORDER BY c.course_code`
    );
    res.json(rows);
  } catch (err) { next(err); }
};

/** POST /api/admin/courses */
const createCourse = async (req, res, next) => {
  try {
    const { course_code, course_title, department, lecturer_id } = req.body;
    if (!course_code || !course_title || !lecturer_id) {
      return res.status(400).json({ error: 'course_code, course_title, lecturer_id required' });
    }
    const [result] = await db.query(
      'INSERT INTO courses (course_code, course_title, department, lecturer_id) VALUES (?, ?, ?, ?)',
      [course_code.toUpperCase(), course_title, department || null, lecturer_id]
    );
    res.status(201).json({ course_id: result.insertId, course_code, course_title });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Course code already exists' });
    next(err);
  }
};

/** DELETE /api/admin/courses/:courseId */
const deleteCourse = async (req, res, next) => {
  try {
    await db.query('DELETE FROM courses WHERE course_id = ?', [req.params.courseId]);
    res.json({ message: 'Course deleted' });
  } catch (err) { next(err); }
};

/** POST /api/admin/enrollments — enrol student(s) */
const enrollStudents = async (req, res, next) => {
  try {
    const { student_ids, course_id } = req.body;
    if (!Array.isArray(student_ids) || !course_id) {
      return res.status(400).json({ error: 'student_ids (array) and course_id required' });
    }
    let enrolled = 0;
    for (const sid of student_ids) {
      try {
        await db.query(
          'INSERT INTO enrollments (student_id, course_id) VALUES (?, ?)',
          [sid, course_id]
        );
        enrolled++;
      } catch (e) {
        if (e.code !== 'ER_DUP_ENTRY') throw e;
      }
    }
    res.status(201).json({ message: `${enrolled} student(s) enrolled` });
  } catch (err) { next(err); }
};

/** DELETE /api/admin/enrollments */
const removeEnrollment = async (req, res, next) => {
  try {
    const { student_id, course_id } = req.body;
    await db.query(
      'DELETE FROM enrollments WHERE student_id = ? AND course_id = ?',
      [student_id, course_id]
    );
    res.json({ message: 'Enrollment removed' });
  } catch (err) { next(err); }
};

/** GET /api/admin/enrollments/:courseId */
const getCourseEnrollments = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT u.user_id, u.name, u.email, u.reg_number, e.enrolled_at
       FROM enrollments e JOIN users u ON u.user_id = e.student_id
       WHERE e.course_id = ? ORDER BY u.name`,
      [req.params.courseId]
    );
    res.json(rows);
  } catch (err) { next(err); }
};

module.exports = {
  listUsers, createUser, updateUser, deleteUser,
  listCourses, createCourse, deleteCourse,
  enrollStudents, removeEnrollment, getCourseEnrollments,
};
