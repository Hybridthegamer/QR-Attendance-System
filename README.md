# QR Code Classroom Attendance System

> A full-stack, offline-capable Progressive Web Application for recording classroom attendance using dynamic QR codes — Final Year Project, Computer Science.

![Tech Stack](https://img.shields.io/badge/Stack-Node.js%20%7C%20React%20%7C%20MySQL-blue)
![PWA](https://img.shields.io/badge/PWA-Offline%20Support-green)
![License](https://img.shields.io/badge/License-MIT-yellow)

---

## 📖 Table of Contents
- [Overview](#overview)
- [Why This Tech Stack?](#why-this-tech-stack)
- [System Requirements](#system-requirements)
- [Project Structure](#project-structure)
- [Setup & Installation](#setup--installation)
- [Default Credentials](#default-credentials)
- [API Reference](#api-reference)
- [Offline Architecture](#offline-architecture)
- [User Roles](#user-roles)

---

## Overview

This system replaces manual paper-based attendance with a QR-code-based Progressive Web Application. Key features:

- 🔲 **Dynamic QR Codes** — cryptographically signed, time-limited (configurable, default 15 min) per session
- 📴 **Offline-First** — students can mark attendance without internet; records sync automatically on reconnection
- 🔒 **Role-Based Access Control** — Student, Lecturer, and Administrator roles with JWT authentication
- 📊 **Real-time Dashboard** — live attendance count and CSV export for lecturers
- 🚀 **No App Installation** — runs in any mobile browser as a PWA

---

## Why This Tech Stack?

### Node.js + Express.js (Backend)
- **Justification**: Node.js's event-driven, non-blocking I/O model handles concurrent attendance submissions efficiently — critical when an entire class (up to 500 students) scans within a short window. Its JavaScript runtime unifies the language across frontend and backend, reducing context switching for developers.
- **Express.js** provides a minimal, unopinionated HTTP framework ideal for building RESTful APIs with clean separation of concerns (routes → controllers → middleware).
- **Alternatives considered**: Django (Python) — heavier runtime, slower for high-concurrency I/O; Laravel (PHP) — synchronous by default. Node.js was chosen for its superior performance for concurrent, real-time API workloads.

### React.js (Frontend)
- **Justification**: React's component-based architecture enables independent development of the three distinct interfaces (Student Scanner, Lecturer Dashboard, Admin Panel) as reusable components. Its virtual DOM minimises re-renders — essential for the live-updating attendance list that refreshes every 10 seconds.
- The React ecosystem provides React Router for SPA navigation and a mature toolchain (Create React App) with built-in PWA support and service worker integration.
- **Alternatives considered**: Vue.js — comparable but smaller ecosystem; Angular — heavier framework overhead for this scale; plain HTML/JS — insufficient component reuse and state management.

### MySQL (Relational Database)
- **Justification**: Attendance data is inherently relational — students, courses, sessions, and attendance records form a structured schema with foreign key constraints. MySQL's ACID-compliant transactions are critical for concurrent scan handling: the `UNIQUE(session_id, student_id)` constraint on the attendance table prevents duplicate records even under race conditions.
- MySQL's 3NF-normalised schema design ensures data integrity and provides straightforward reporting queries via SQL JOINs.
- **Alternatives considered**: PostgreSQL — equally suitable; MongoDB — inappropriate for relational data with strict consistency requirements; SQLite — insufficient for multi-user concurrent access.

### Progressive Web Application (PWA) + Service Worker + IndexedDB
- **Justification**: The most critical differentiator from existing systems is **offline support**. Nigerian academic environments have unreliable internet connectivity. PWA technology (Service Workers + IndexedDB) enables the system to:
  1. Intercept failed attendance API calls when offline
  2. Store them locally in IndexedDB
  3. Automatically re-submit via Background Sync API when connectivity restores
- No native app installation is required — the PWA runs in Chrome, Firefox, and Safari mobile browsers, eliminating adoption friction.
- **Alternatives considered**: React Native — requires app store installation; Ionic — additional framework complexity; plain webapp — lacks offline capability.

### JSON Web Tokens (JWT)
- **Justification**: JWTs serve dual purpose: (1) user session authentication with RBAC (role claim in payload), and (2) the QR code session token itself — cryptographically signed with a server secret and expiry claim, making tokens tamper-proof and automatically time-bounded without database lookups on every scan.

### bcryptjs (Password Hashing)
- **Justification**: bcrypt's adaptive cost factor ensures password hashes remain computationally expensive as hardware improves, protecting stored credentials against brute-force attacks.

---

## System Requirements

### Server / Development Machine
| Requirement | Minimum |
|---|---|
| OS | Windows 10+, macOS 10.15+, Ubuntu 20.04+ |
| Node.js | v18.x or higher |
| npm | v9.x or higher |
| MySQL | v8.0 or higher |
| RAM | 4 GB (8 GB recommended) |
| Disk Space | 500 MB |

### Client (Student/Lecturer Device)
| Requirement | Details |
|---|---|
| Browser | Chrome 80+, Firefox 79+, Safari 14+, Edge 80+ |
| Camera | Required for QR scanning (students) |
| Internet | Optional — offline mode supported |
| Installation | None required (PWA via browser) |

---

## Project Structure

```
QR-Attendance-System/
├── backend/
│   ├── src/
│   │   ├── server.js            # Express app entry point
│   │   ├── config/
│   │   │   ├── db.js            # MySQL connection pool
│   │   │   └── migrate.js       # Database schema migration
│   │   ├── middleware/
│   │   │   └── auth.js          # JWT authentication & RBAC middleware
│   │   ├── controllers/
│   │   │   ├── authController.js       # Login, /me
│   │   │   ├── qrController.js         # QR generation (Algorithm 3.7.1)
│   │   │   ├── attendanceController.js # Attendance marking (Algorithms 3.7.2 & 3.7.3)
│   │   │   ├── reportController.js     # CSV reports, summaries
│   │   │   └── adminController.js      # User/course/enrolment management
│   │   └── routes/
│   │       ├── auth.js
│   │       ├── qr.js
│   │       ├── attendance.js
│   │       ├── reports.js
│   │       └── admin.js
│   ├── .env.example
│   └── package.json
│
├── frontend/
│   ├── public/
│   │   ├── index.html
│   │   ├── manifest.json        # PWA manifest
│   │   └── service-worker.js    # Offline sync (Algorithm 3.7.3)
│   ├── src/
│   │   ├── App.js               # Router & protected routes
│   │   ├── App.css              # Global styles
│   │   ├── index.js             # Entry point + SW registration
│   │   ├── context/
│   │   │   └── AuthContext.js   # JWT auth state
│   │   ├── services/
│   │   │   └── api.js           # Axios instance with auth interceptor
│   │   ├── pages/
│   │   │   ├── Login.js
│   │   │   ├── StudentDashboard.js   # QR scanner, attendance history
│   │   │   ├── LecturerDashboard.js  # QR generator, live attendance
│   │   │   └── AdminDashboard.js     # Users, courses, enrolments
│   │   └── components/
│   │       └── shared/
│   │           └── QRScanner.js  # jsQR camera scanner component
│   ├── .env.example
│   └── package.json
│
└── README.md
```

---

## Setup & Installation

### 1. Clone the Repository

```bash
git clone https://github.com/Hybridthegamer/QR-Attendance-System.git
cd QR-Attendance-System
```

### 2. Configure the Backend

```bash
cd backend
cp .env.example .env
```

Edit `.env` and fill in your values:

```env
PORT=5000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=qr_attendance
JWT_SECRET=your_jwt_secret_here
QR_DEFAULT_EXPIRY=15
FRONTEND_URL=http://localhost:3000
```

> **Generate a strong JWT_SECRET:**
> ```bash
> node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
> ```

### 3. Run Database Migration

Ensure MySQL is running, then:

```bash
cd backend
npm install
npm run migrate
```

This creates the `qr_attendance` database with all 5 tables and seeds a default admin account.

### 4. Start the Backend

```bash
npm run dev      # Development (nodemon auto-restart)
# or
npm start        # Production
```

Backend runs on **http://localhost:5000**

### 5. Configure and Start the Frontend

```bash
cd ../frontend
cp .env.example .env
# .env already points to http://localhost:5000/api — no changes needed for local dev
npm install
npm start
```

Frontend runs on **http://localhost:3000**

### 6. Access the Application

Open **http://localhost:3000** in your browser.

For mobile QR scanning, connect your phone to the same network and navigate to `http://<your-machine-ip>:3000`.

---

## Default Credentials

After migration, a default administrator account is created:

| Field | Value |
|---|---|
| Email | `admin@qrattendance.edu` |
| Password | `Admin@1234` |
| Role | Administrator |

> ⚠️ **Change this password immediately in production.**

### First-Time Setup Workflow

1. Log in as **admin**
2. **Users** → create lecturer accounts
3. **Courses** → create courses and assign lecturers
4. **Users** → create student accounts
5. **Enrolments** → assign students to their courses
6. Lecturers log in → generate QR codes per session
7. Students log in → scan QR codes to mark attendance

---

## API Reference

All endpoints require `Authorization: Bearer <token>` except `/api/auth/login`.

### Authentication
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/login` | All | Login, returns JWT |
| GET | `/api/auth/me` | All | Current user info |

### QR Code (Algorithm 3.7.1)
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| POST | `/api/qr/generate` | Lecturer/Admin | Generate session QR code |
| GET | `/api/qr/sessions` | Lecturer/Admin | List sessions |
| GET | `/api/qr/session/:id` | Lecturer/Admin | Get session + QR image |

### Attendance (Algorithms 3.7.2 & 3.7.3)
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| POST | `/api/attendance` | Student | Mark attendance (online) |
| POST | `/api/attendance/sync` | Student | Sync offline records |
| GET | `/api/attendance/session/:id` | Lecturer/Admin | Live session attendee list |
| GET | `/api/attendance/student` | Student | Own attendance history |

### Reports
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/api/reports/course/:id` | Lecturer/Admin | Full report (JSON or `?format=csv`) |
| GET | `/api/reports/summary/:id` | Lecturer/Admin | % attendance per student |
| GET | `/api/reports/system` | Admin | System-wide statistics |

### Admin
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET/POST | `/api/admin/users` | Admin | List/create users |
| PUT/DELETE | `/api/admin/users/:id` | Admin | Update/delete user |
| GET/POST/DELETE | `/api/admin/courses` | Admin | Manage courses |
| GET/POST/DELETE | `/api/admin/enrollments` | Admin | Manage enrolments |

---

## Offline Architecture

The offline-first architecture implements **Algorithm 3.7.3** (Chapter 3):

```
Student scans QR code
        │
        ▼
  Network available?
   ┌────┴────┐
  YES       NO
   │         │
   ▼         ▼
POST to    Service Worker
 API       intercepts →
   │       stores in
   ▼       IndexedDB
Attendance      │
 Recorded       ▼ (on network restore)
           Background Sync fires
           → resubmits to API
           → removes from IDB
           → notifies UI
```

The service worker (`frontend/public/service-worker.js`) handles:
- **Install**: Caches static assets for offline loading
- **Fetch**: Intercepts attendance POSTs when offline → reroutes to IndexedDB
- **Sync**: Background Sync API re-submits pending records with exponential back-off (max 5 attempts)

---

## User Roles

| Role | Capabilities |
|------|-------------|
| **Student** | Scan QR codes, view own attendance history, see pending sync status |
| **Lecturer** | Generate session QR codes, view live attendance, export CSV reports |
| **Administrator** | All lecturer capabilities + manage users, courses, enrolments; system-wide reports |

---

## Running in Production

1. Set `NODE_ENV=production` in backend `.env`
2. Build the frontend: `cd frontend && npm run build`
3. Serve `frontend/build` via Express static middleware or Nginx
4. Use PM2: `pm2 start src/server.js --name qr-attendance`
5. Configure Nginx/Apache reverse proxy with **HTTPS**

> ⚠️ **HTTPS is mandatory in production** — the camera (MediaDevices API) and Service Worker both require a secure context.

---

## License

MIT © 2024
