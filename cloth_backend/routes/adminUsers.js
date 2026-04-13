const express = require('express');
const router = express.Router();

const auth = require('../middleware/authMiddleware');
const { adminOnly } = require('../middleware/authMiddleware');
const { listUsers, updateUserStatus, listUserDevices } = require('../controllers/adminUserController');

router.get('/', auth, adminOnly, listUsers);
router.put('/:id/status', auth, adminOnly, updateUserStatus);
router.get('/:id/devices', auth, adminOnly, listUserDevices);

module.exports = router;
