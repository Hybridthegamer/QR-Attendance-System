const router = require('express').Router();
const admin = require('../controllers/adminController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate, authorize('admin'));

router.get('/users', admin.listUsers);
router.post('/users', admin.createUser);
router.put('/users/:userId', admin.updateUser);
router.delete('/users/:userId', admin.deleteUser);

router.get('/courses', admin.listCourses);
router.post('/courses', admin.createCourse);
router.delete('/courses/:courseId', admin.deleteCourse);

router.post('/enrollments', admin.enrollStudents);
router.delete('/enrollments', admin.removeEnrollment);
router.get('/enrollments/:courseId', admin.getCourseEnrollments);

module.exports = router;
