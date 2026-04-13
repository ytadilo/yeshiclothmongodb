const express = require('express');
const archiver = require('archiver');
const multer = require('multer');
const unzipper = require('unzipper');
const path = require('path');
const mongoose = require('mongoose');
const { EJSON } = require('bson');

const auth = require('../middleware/authMiddleware');

const router = express.Router();

function requireAdmin(req, res) {
    if (!req.user || req.user.role !== 'admin') {
        res.status(403).json({ msg: 'Access denied' });
        return false;
    }
    return true;
}

function safeCollectionName(name) {
    return String(name || 'collection')
        .trim()
        .replace(/[\\/\0]/g, '_')
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9._-]/g, '_') || 'collection';
}

function formatBackupName() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    return `database-backup-${stamp}.zip`;
}

function listBackupCollections() {
    return mongoose.connection.db
        .listCollections()
        .toArray()
        .then((collections) => collections
            .map((entry) => String(entry && entry.name ? entry.name : '').trim())
            .filter((name) => name && !name.startsWith('system.')));
}

// GET /api/admin/uploads/export
// Exports every user collection in the database as a ZIP archive.
// Each collection is stored in collections/<name>.json using Extended JSON.
router.get('/export', auth, async (req, res) => {
    if (!requireAdmin(req, res)) return;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${formatBackupName()}"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
        console.error('Export archive error:', err);
        try {
            if (!res.headersSent) {
                res.status(500).json({ msg: 'Failed to create backup' });
            } else {
                res.end();
            }
        } catch (_) {
            // ignore
        }
    });

    archive.pipe(res);

    const manifest = {
        version: 2,
        exportedAt: new Date().toISOString(),
        collections: []
    };

    try {
        const collectionNames = await listBackupCollections();

        for (const collectionName of collectionNames) {
            const docs = await mongoose.connection.db.collection(collectionName).find({}).toArray();
            const fileName = `collections/${safeCollectionName(collectionName)}.json`;
            const payload = EJSON.stringify(docs, { relaxed: false });

            archive.append(Buffer.from(payload, 'utf8'), { name: fileName });
            manifest.collections.push({
                name: collectionName,
                file: fileName,
                count: docs.length
            });
        }

        archive.append(Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'), { name: 'manifest.json' });
        await archive.finalize();
    } catch (err) {
        console.error('Export failed:', err);
        try {
            archive.abort();
        } catch (_) {
            // ignore
        }
        if (!res.headersSent) {
            return res.status(500).json({ msg: 'Failed to export database backup' });
        }
    }
});

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

// POST /api/admin/uploads/import
// Restores a ZIP produced by /export by replacing the collections contained in the backup.
router.post('/import', auth, zipUpload.single('file'), async (req, res) => {
    if (!requireAdmin(req, res)) return;
    if (!req.file || !req.file.buffer) {
        return res.status(400).json({ msg: 'Missing ZIP file' });
    }

    try {
        const directory = await unzipper.Open.buffer(req.file.buffer);
        const filesByPath = new Map();
        for (const file of directory.files) {
            filesByPath.set(String(file.path || ''), file);
        }

        const manifestEntry = filesByPath.get('manifest.json');
        if (!manifestEntry) {
            return res.status(400).json({ msg: 'Invalid backup: manifest.json missing' });
        }

        const manifestRaw = await manifestEntry.buffer();
        const manifest = JSON.parse(manifestRaw.toString('utf8'));
        if (!manifest || manifest.version !== 2 || !Array.isArray(manifest.collections)) {
            return res.status(400).json({ msg: 'Invalid backup: bad manifest format' });
        }

        let imported = 0;
        let skipped = 0;

        for (const entry of manifest.collections) {
            const collectionName = String(entry && entry.name ? entry.name : '').trim();
            const fileName = String(entry && entry.file ? entry.file : `collections/${safeCollectionName(collectionName)}.json`).trim();

            if (!collectionName) {
                skipped += 1;
                continue;
            }

            const zipEntry = filesByPath.get(fileName);
            if (!zipEntry) {
                skipped += 1;
                continue;
            }

            const raw = await zipEntry.buffer();
            if (!raw || !raw.length) {
                skipped += 1;
                continue;
            }

            let docs = [];
            try {
                docs = EJSON.parse(raw.toString('utf8'));
            } catch (parseErr) {
                console.error(`Failed to parse backup collection ${collectionName}:`, parseErr);
                skipped += 1;
                continue;
            }

            if (!Array.isArray(docs)) {
                skipped += 1;
                continue;
            }

            const collection = mongoose.connection.db.collection(collectionName);
            await collection.deleteMany({});

            if (docs.length > 0) {
                await collection.insertMany(docs, { ordered: false });
            }

            imported += 1;
        }

        return res.json({
            ok: true,
            imported,
            skipped
        });
    } catch (err) {
        console.error('Import failed:', err);
        return res.status(500).json({ msg: 'Failed to import database backup' });
    }
});

module.exports = router;
