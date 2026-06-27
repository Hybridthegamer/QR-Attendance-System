const router = require('express').Router();
const { markAttendance, syncOfflineAttendance, getSessionAttendance, getStudentAttendance } = require('../controllers/attendanceController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);
router.post('/', authorize('student'), markAttendance);
router.post('/sync', authorize('student'), syncOfflineAttendance);
router.get('/session/:sessionId', authorize('lecturer', 'admin'), getSessionAttendance);
router.get('/student/:studentId?', getStudentAttendance);

module.exports = router;
