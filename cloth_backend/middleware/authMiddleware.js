const { resolveRequestUser } = require('./authCore');

// Middleware to check if user is admin
function adminOnly(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ msg: 'No token, authorization denied' });
    }
    
    if (req.user.role !== 'admin') {
        return res.status(403).json({ msg: 'Access denied. Admin only.' });
    }
    
    next();
}

module.exports = async function (req, res, next) {
    const resolved = await resolveRequestUser(req, { allowLegacyJwt: true, optional: false });
    if (!resolved.ok) {
        return res.status(resolved.status || 401).json({ msg: resolved.msg || 'No token, authorization denied' });
    }
    return next();
};

module.exports.protect = module.exports;
module.exports.adminOnly = adminOnly;
