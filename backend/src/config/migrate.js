require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mysql = require('mysql2/promise');

async function migrate() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
  });

  console.log('Running database migration...');

  await connection.query(`CREATE DATABASE IF NOT EXISTS qr_attendance CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
  await connection.query(`USE qr_attendance;`);

  // users table
  await connection.query(`
    CREATE TABLE IF NOT EXISTS users (
      user_id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      email VARCHAR(191) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('student', 'lecturer', 'admin') NOT NULL DEFAULT 'student',
      reg_number VARCHAR(50) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;
  `);

  // courses table
  await connection.query(`
    CREATE TABLE IF NOT EXISTS courses (
      course_id INT AUTO_INCREMENT PRIMARY KEY,
      course_code VARCHAR(20) NOT NULL UNIQUE,
      course_title VARCHAR(255) NOT NULL,
      department VARCHAR(150),
      lecturer_id INT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_course_lecturer FOREIGN KEY (lecturer_id) REFERENCES users(user_id) ON DELETE RESTRICT
    ) ENGINE=InnoDB;
  `);

  // sessions table
  await connection.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      session_id INT AUTO_INCREMENT PRIMARY KEY,
      course_id INT NOT NULL,
      qr_token VARCHAR(512) NOT NULL UNIQUE,
      token_expiry DATETIME NOT NULL,
      session_date DATE NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_session_course FOREIGN KEY (course_id) REFERENCES courses(course_id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);

  // enrollments table
  await connection.query(`
    CREATE TABLE IF NOT EXISTS enrollments (
      enrollment_id INT AUTO_INCREMENT PRIMARY KEY,
      student_id INT NOT NULL,
      course_id INT NOT NULL,
      enrolled_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_enrollment_student FOREIGN KEY (student_id) REFERENCES users(user_id) ON DELETE CASCADE,
      CONSTRAINT fk_enrollment_course FOREIGN KEY (course_id) REFERENCES courses(course_id) ON DELETE CASCADE,
      CONSTRAINT uq_enrollment UNIQUE (student_id, course_id)
    ) ENGINE=InnoDB;
  `);

  // attendance table
  await connection.query(`
    CREATE TABLE IF NOT EXISTS attendance (
      attendance_id INT AUTO_INCREMENT PRIMARY KEY,
      session_id INT NOT NULL,
      student_id INT NOT NULL,
      marked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      sync_status ENUM('synced', 'pending') NOT NULL DEFAULT 'synced',
      CONSTRAINT fk_attendance_session FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE,
      CONSTRAINT fk_attendance_student FOREIGN KEY (student_id) REFERENCES users(user_id) ON DELETE CASCADE,
      CONSTRAINT uq_attendance UNIQUE (session_id, student_id)
    ) ENGINE=InnoDB;
  `);

  // Seed default admin
  const bcrypt = require('bcryptjs');
  const hash = await bcrypt.hash('Admin@1234', 12);
  await connection.query(`
    INSERT IGNORE INTO users (name, email, password_hash, role)
    VALUES ('System Administrator', 'admin@qrattendance.edu', ?, 'admin');
  `, [hash]);

  console.log('Migration complete. Default admin: admin@qrattendance.edu / Admin@1234');
  await connection.end();
}

migrate().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
