const express = require('express');
const mongoose = require('mongoose');

const Upload = require('../models/Upload');
const auth = require('../middleware/authMiddleware');
const optionalAuth = require('../middleware/optionalAuth');
const upload = require('../middleware/upload');

const router = express.Router();

function safeFilename(name) {
    const value = String(name || 'file');
    // avoid header injection / weird characters
    return value.replace(/[\r\n"]/g, '_');
}

// GET /api/uploads/:id
// Public for "public" uploads. "private" requires owner/admin.
router.get('/:id', optionalAuth, async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ msg: 'Invalid upload id' });
        }

        const upload = await Upload.findById(id).select(
            'data mimeType originalName visibility owner_user_id purpose'
        );

        if (!upload) return res.status(404).json({ msg: 'Upload not found' });

        if (upload.visibility === 'private') {
            const user = req.user;
            if (!user) return res.status(401).json({ msg: 'Authorization required' });

            // Chat attachments are private but viewable by authenticated users in chat UIs.
            if (String(upload.purpose || '') === 'chat_attachment') {
                res.setHeader('Content-Type', upload.mimeType || 'application/octet-stream');
                res.setHeader(
                    'Content-Disposition',
                    `inline; filename="${safeFilename(upload.originalName)}"`
                );
                return res.send(upload.data);
            }

            const isOwner =
                upload.owner_user_id &&
                String(upload.owner_user_id) === String(user.id);

            if (user.role !== 'admin' && !isOwner) {
                return res.status(403).json({ msg: 'Access denied' });
            }
        }

        res.setHeader('Content-Type', upload.mimeType || 'application/octet-stream');
        res.setHeader(
            'Content-Disposition',
            `inline; filename="${safeFilename(upload.originalName)}"`
        );
        return res.send(upload.data);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: 'Server error' });
    }
});

// POST /api/uploads
// Admin-only: upload an image (used for branding assets like header logo/favicon)
router.post('/', auth, upload.single('file'), async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ msg: 'Access denied' });
        }

        if (!req.file || !req.file.buffer) {
            return res.status(400).json({ msg: 'Missing file' });
        }

        const purpose = String(req.body?.purpose || '').trim() || 'branding';
        const doc = await Upload.create({
            originalName: req.file.originalname || 'upload',
            mimeType: req.file.mimetype || 'application/octet-stream',
            size: Number(req.file.size || 0),
            data: req.file.buffer,
            visibility: 'public',
            owner_user_id: req.user.id,
            purpose
        });

        return res.json({
            id: doc._id,
            url: '/api/uploads/' + doc._id
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: 'Server error' });
    }
});

module.exports = router;
