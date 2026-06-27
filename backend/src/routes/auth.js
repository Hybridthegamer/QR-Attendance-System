const router = require('express').Router();
const { login, me } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

router.post('/login', login);
router.get('/me', authenticate, me);

module.exports = router;
