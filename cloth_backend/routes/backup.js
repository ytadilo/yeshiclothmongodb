// backup.js
// Admin backup routes

const express = require('express');
const router = express.Router();
const multer = require('multer');
const backupController = require('../controllers/backupController');
const auth = require('../middleware/authMiddleware');

const upload = multer({ dest: 'uploads/' });

// Export database (download)
router.get('/export', auth, backupController.exportDatabase);

// Import database (upload)
router.post('/import', auth, upload.single('backup'), backupController.importDatabase);

// Backup history and auto backup config
router.get('/history', auth, backupController.getBackupHistory);
router.post('/auto-config', auth, backupController.configureAutoBackup);

module.exports = router;
