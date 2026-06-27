const router = require('express').Router();
const { generateQR, getSession, listSessions } = require('../controllers/qrController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);
router.post('/generate', authorize('lecturer', 'admin'), generateQR);
router.get('/sessions', authorize('lecturer', 'admin'), listSessions);
router.get('/session/:sessionId', authorize('lecturer', 'admin'), getSession);

module.exports = router;
