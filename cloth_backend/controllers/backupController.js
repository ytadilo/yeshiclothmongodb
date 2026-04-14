// backupController.js
// Handles database export/import for admin backup system

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const unzipper = require('unzipper');

const User = require('../models/User');
const Order = require('../models/Order');
const Product = require('../models/Product');
const AnalyticsEvent = require('../models/Analytics');
const Post = require('../models/Post');
const SiteSettings = require('../models/SiteSettings');

const TMP_DIR = path.join(__dirname, '../../tmp');
const BACKUP_DIR = path.join(TMP_DIR, 'backups');
const MAX_BACKUP_HISTORY = 30;

let autoBackupTimer = null;
let autoBackupConfig = { enabled: false, frequency: 'off' };

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function pruneBackupHistory() {
  ensureDir(BACKUP_DIR);
  const files = fs.readdirSync(BACKUP_DIR)
    .filter((f) => /^backup_\d+\.zip$/i.test(f))
    .map((f) => {
      const full = path.join(BACKUP_DIR, f);
      const st = fs.statSync(full);
      return { name: f, fullPath: full, mtimeMs: st.mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  files.slice(MAX_BACKUP_HISTORY).forEach((f) => {
    try { fs.unlinkSync(f.fullPath); } catch (_) {}
  });
}

async function readModelDocuments(model) {
  if (model && typeof model.find === 'function') {
    const query = model.find({});
    if (query && typeof query.lean === 'function') {
      return await query.lean();
    }
    return await query;
  }

  if (model && typeof model.collection === 'function') {
    const snap = await model.collection().get();
    return snap.docs.map((doc) => ({ _id: doc.id, id: doc.id, ...doc.data() }));
  }

  return [];
}

async function replaceModelDocuments(model, items) {
  const list = Array.isArray(items) ? items : [];

  if (model && typeof model.deleteMany === 'function' && typeof model.insertMany === 'function') {
    await model.deleteMany({});
    if (list.length) await model.insertMany(list);
    return;
  }

  if (model && typeof model.collection === 'function') {
    const collection = model.collection();
    const existing = await collection.get();
    await Promise.all(existing.docs.map((doc) => collection.doc(String(doc.id)).delete()));

    for (const item of list) {
      const doc = item && typeof item === 'object' ? { ...item } : {};
      const id = String(doc._id || doc.id || doc.key || '').trim();
      delete doc._id;
      delete doc.id;

      if (id) {
        await collection.doc(id).set(doc, { merge: false });
      } else {
        await collection.add(doc);
      }
    }
  }
}

async function createBackupArchive() {
  const collections = {
    users: await readModelDocuments(User),
    orders: await readModelDocuments(Order),
    products: await readModelDocuments(Product),
    analytics: await readModelDocuments(AnalyticsEvent),
    posts: await readModelDocuments(Post),
    links: await readModelDocuments(SiteSettings)
  };

  ensureDir(BACKUP_DIR);
  const stamp = Date.now();
  const zipPath = path.join(BACKUP_DIR, `backup_${stamp}.zip`);
  const output = fs.createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  await new Promise((resolve, reject) => {
    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);
    archive.pipe(output);
    for (const [name, data] of Object.entries(collections)) {
      archive.append(JSON.stringify(data, null, 2), { name: `${name}.json` });
    }
    archive.finalize().catch(reject);
  });

  pruneBackupHistory();
  return zipPath;
}

function scheduleAutoBackup(frequency) {
  if (autoBackupTimer) {
    clearInterval(autoBackupTimer);
    autoBackupTimer = null;
  }

  if (frequency === 'daily' || frequency === 'weekly') {
    const ms = frequency === 'daily' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
    autoBackupTimer = setInterval(async () => {
      try {
        await createBackupArchive();
      } catch (err) {
        console.error('Auto backup failed:', err?.message || err);
      }
    }, ms);
    autoBackupConfig = { enabled: true, frequency };
  } else {
    autoBackupConfig = { enabled: false, frequency: 'off' };
  }
}

// Export all collections as a zip
exports.exportDatabase = async (req, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ msg: 'Access denied' });
  }
  try {
    const zipPath = await createBackupArchive();
    const downloadName = path.basename(zipPath);
    return res.download(zipPath, downloadName);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Backup failed', error: err.message });
  }
};

// Import database from zip
exports.importDatabase = async (req, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ msg: 'Access denied' });
  }
  try {
    if (!req.file) return res.status(400).json({ msg: 'No file uploaded' });
    if (!/\.zip$/i.test(String(req.file.originalname || ''))) {
      return res.status(400).json({ msg: 'Invalid file type. Please upload a .zip backup file.' });
    }
    const zipPath = req.file.path;
    const extractDir = path.join(__dirname, '../../tmp/import_' + Date.now());
    fs.mkdirSync(extractDir);
    await fs.createReadStream(zipPath).pipe(unzipper.Extract({ path: extractDir })).promise();
    // Read and import collections
    const importCollection = async (model, file) => {
      const data = JSON.parse(fs.readFileSync(path.join(extractDir, file)));
      await replaceModelDocuments(model, data);
    };
    await importCollection(User, 'users.json');
    await importCollection(Order, 'orders.json');
    await importCollection(Product, 'products.json');
    await importCollection(AnalyticsEvent, 'analytics.json');
    await importCollection(Post, 'posts.json');
    await importCollection(SiteSettings, 'links.json');
    fs.rmSync(extractDir, { recursive: true, force: true });
    fs.unlinkSync(zipPath);
    res.json({ success: true, msg: 'Database restored from backup.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Import failed', error: err.message });
  }
};

exports.getBackupHistory = async (req, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ msg: 'Access denied' });
  }
  try {
    ensureDir(BACKUP_DIR);
    const backups = fs.readdirSync(BACKUP_DIR)
      .filter((f) => /^backup_\d+\.zip$/i.test(f))
      .map((f) => {
        const fullPath = path.join(BACKUP_DIR, f);
        const st = fs.statSync(fullPath);
        return {
          fileName: f,
          sizeBytes: st.size,
          createdAt: st.mtime
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return res.json({ success: true, autoBackup: autoBackupConfig, backups });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ msg: 'Failed to load backup history', error: err.message });
  }
};

exports.configureAutoBackup = async (req, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ msg: 'Access denied' });
  }
  try {
    const frequency = String(req.body?.frequency || 'off').toLowerCase();
    if (!['off', 'daily', 'weekly'].includes(frequency)) {
      return res.status(400).json({ msg: 'Invalid frequency. Use off, daily, or weekly.' });
    }

    scheduleAutoBackup(frequency);
    return res.json({ success: true, autoBackup: autoBackupConfig });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ msg: 'Failed to configure auto backup', error: err.message });
  }
};
