const express = require('express');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { getDatabaseProvider } = require('../utils/db');

const Upload = require('../models/Upload');
const auth = require('../middleware/authMiddleware');
const { adminOnly } = require('../middleware/authMiddleware');
const optionalAuth = require('../middleware/optionalAuth');
const upload = require('../middleware/upload');

const router = express.Router();

function skipAdminDeviceCheck(req, _res, next) {
    req.__skipAdminDeviceCheck = true;
    return next();
}

function safeFilename(name) {
    const value = String(name || 'file');
    // avoid header injection / weird characters
    return value.replace(/[\r\n"]/g, '_');
}

function escapeRegex(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function resolveUploadByReference(rawId, provider) {
    const id = String(rawId || '').trim();
    if (!id) return null;

    const selectFields = 'data storage_path mimeType originalName visibility owner_user_id purpose';

    const direct = await Upload.findById(id).select(selectFields);
    if (direct) return direct;

    const maybeDecoded = (() => {
        try {
            return decodeURIComponent(id);
        } catch (_) {
            return id;
        }
    })();

    if (provider === 'mongo') {
        const suffixMatcher = new RegExp(`(^|/)${escapeRegex(maybeDecoded)}(\\.[^./\\\\]+)?$`, 'i');
        return Upload.findOne({
            $or: [
                { storage_path: suffixMatcher },
                { originalName: maybeDecoded }
            ]
        }).select(selectFields);
    }

    // Firebase fallback: resolve legacy references by storage path basename.
    const all = await Upload.find({}).select(selectFields).lean();
    if (!Array.isArray(all) || !all.length) return null;

    const lowerId = maybeDecoded.toLowerCase();
    const hit = all.find((doc) => {
        const storagePath = String(doc && doc.storage_path ? doc.storage_path : '');
        const originalName = String(doc && doc.originalName ? doc.originalName : '');
        const fileName = path.basename(storagePath || '').toLowerCase();
        const fileNameNoExt = fileName.replace(/\.[^.]+$/, '');
        return (
            storagePath.toLowerCase() === lowerId
            || fileName === lowerId
            || fileNameNoExt === lowerId
            || originalName.toLowerCase() === lowerId
        );
    });

    return hit || null;
}

// GET /api/uploads/:id
// Public for "public" uploads. "private" requires owner/admin.
router.get('/:id', skipAdminDeviceCheck, optionalAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const provider = getDatabaseProvider();
        if (provider === 'mongo' && !mongoose.Types.ObjectId.isValid(id)) {
            // Allow legacy non-ObjectId references to be resolved via storage_path fallback.
        }

        const upload = await resolveUploadByReference(id, provider);

        if (!upload) return res.status(404).json({ msg: 'Upload not found' });

        if (upload.visibility === 'private') {
            const user = req.user;
            if (!user) return res.status(401).json({ msg: 'Authorization required' });

            // Chat attachments are private but viewable by authenticated users in chat UIs.
            if (String(upload.purpose || '') === 'chat_attachment') {
                if (upload.storage_path) {
                    const absolutePath = path.join(__dirname, '..', 'uploads', ...String(upload.storage_path).split('/'));
                    if (fs.existsSync(absolutePath)) {
                        res.setHeader('Content-Type', upload.mimeType || 'application/octet-stream');
                        res.setHeader(
                            'Content-Disposition',
                            `inline; filename="${safeFilename(upload.originalName)}"`
                        );
                        return res.sendFile(absolutePath);
                    }
                }
                
                if (upload.data && upload.data.length > 0) {
                    res.setHeader('Content-Type', upload.mimeType || 'application/octet-stream');
                    res.setHeader(
                        'Content-Disposition',
                        `inline; filename="${safeFilename(upload.originalName)}"`
                    );
                    return res.send(upload.data);
                }
                
                return res.status(404).json({ msg: 'Upload file not found (chat)' });
            }

            const isOwner =
                upload.owner_user_id &&
                String(upload.owner_user_id) === String(user.id);

            if (user.role !== 'admin' && !isOwner) {
                return res.status(403).json({ msg: 'Access denied' });
            }
        }

        if (upload.storage_path) {
            const absolutePath = path.join(__dirname, '..', 'uploads', ...String(upload.storage_path).split('/'));
            if (fs.existsSync(absolutePath)) {
                res.setHeader('Content-Type', upload.mimeType || 'application/octet-stream');
                res.setHeader(
                    'Content-Disposition',
                    `inline; filename="${safeFilename(upload.originalName)}"`
                );
                return res.sendFile(absolutePath);
            }
        }

        if (upload.data && upload.data.length > 0) {
            res.setHeader('Content-Type', upload.mimeType || 'application/octet-stream');
            res.setHeader(
                'Content-Disposition',
                `inline; filename="${safeFilename(upload.originalName)}"`
            );
            return res.send(upload.data);
        }

        return res.status(404).json({ msg: 'Upload file not found' });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: 'Server error' });
    }
});

// POST /api/uploads
// Admin-only: upload an image (used for branding assets like header logo/favicon)
router.post('/', auth, adminOnly, upload.single('file'), async (req, res) => {
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
