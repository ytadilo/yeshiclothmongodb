const multer = require('multer');
const path = require('path');

// Check file type
function checkFileType(file, cb) {
    const extPattern = /\.(jpeg|jpg|png|gif|webp|ico|pdf|heic|heif|avif|bmp|jfif)$/i;
    const mimePattern = /^(image\/(jpeg|jpg|png|gif|webp|heic|heif|avif|bmp|x-icon|vnd\.microsoft\.icon)|application\/pdf)$/i;
    const originalName = String(file.originalname || '');
    const mimeType = String(file.mimetype || '');
    const extOk = extPattern.test(originalName);
    const mimeOk = mimePattern.test(mimeType);

    if (mimeOk || extOk) {
        return cb(null, true);
    } else {
        cb(new Error('Only image or PDF files are allowed'));
    }
}

// Init upload
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 12000000 }, // 12MB limit
    fileFilter: function (req, file, cb) {
        checkFileType(file, cb);
    }
});

module.exports = upload;
