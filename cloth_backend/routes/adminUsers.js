const express = require('express');
const router = express.Router();

const auth = require('../middleware/authMiddleware');
const { adminOnly } = require('../middleware/authMiddleware');
const { listUsers, updateUserStatus, listUserDevices, approveUser, rejectUser } = require('../controllers/adminUserController');

router.get('/', auth, adminOnly, listUsers);
router.put('/:id/approve', auth, adminOnly, approveUser);
router.put('/:id/reject', auth, adminOnly, rejectUser);
router.put('/:id/status', auth, adminOnly, updateUserStatus);
router.get('/:id/devices', auth, adminOnly, listUserDevices);

module.exports = router;
