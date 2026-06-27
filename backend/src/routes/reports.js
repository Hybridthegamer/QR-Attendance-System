const router = require('express').Router();
const { courseReport, courseSummary, systemReport } = require('../controllers/reportController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);
router.get('/course/:courseId', authorize('lecturer', 'admin'), courseReport);
router.get('/summary/:courseId', authorize('lecturer', 'admin'), courseSummary);
router.get('/system', authorize('admin'), systemReport);

module.exports = router;
