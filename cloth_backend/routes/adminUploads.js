const express = require('express');
const multer = require('multer');
const auth = require('../middleware/authMiddleware');
const { adminOnly } = require('../middleware/authMiddleware');
const backupController = require('../controllers/backupController');

const router = express.Router();

const zipUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 200 * 1024 * 1024 },
    fileFilter: function (_req, file, cb) {
        const name = String(file.originalname || '').toLowerCase();
        const ok = file.mimetype === 'application/zip' || name.endsWith('.zip');
        if (!ok) return cb(new Error('ZIP files only'));
        cb(null, true);
    }
});

// GET /api/admin/uploads/export
router.get('/export', auth, adminOnly, backupController.exportDatabase);

// POST /api/admin/uploads/import
router.post('/import', auth, adminOnly, zipUpload.single('file'), (req, res, next) => {
    // Write buffer to a temp file because backupController.importDatabase expects req.file.path
    if (req.file && req.file.buffer) {
        const fs = require('fs');
        const path = require('path');
        const tmpPath = path.join(__dirname, '../../tmp', 'upload_' + Date.now() + '.zip');
        fs.writeFileSync(tmpPath, req.file.buffer);
        req.file.path = tmpPath;
    }
    next();
}, backupController.importDatabase);

module.exports = router;
