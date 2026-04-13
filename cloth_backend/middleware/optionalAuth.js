const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = async function optionalAuth(req, _res, next) {
    const token = req.header('x-auth-token') || (req.query && (req.query.token || req.query.auth));
    if (!token) return next();

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = decoded && decoded.user;
        if (!user || !user.id) return next();

        const dbUser = await User.findById(user.id).select('status isBanned role');
        if (!dbUser) return next();

        const status = dbUser.status || (dbUser.isBanned ? 'banned' : 'active');
        if (status === 'banned' || dbUser.isBanned) return next();
        if (status === 'inactive') return next();

        req.user = { ...user, role: dbUser.role };
    } catch (_err) {
        // Ignore invalid tokens for optional auth
    }

    next();
};
