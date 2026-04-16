const { resolveRequestUser } = require('./authCore');

module.exports = async function optionalAuth(req, _res, next) {
    try {
        await resolveRequestUser(req, { allowLegacyJwt: true, optional: true });
    } catch (_) {
        // Ignore invalid tokens for optional auth
    }
    return next();
};
