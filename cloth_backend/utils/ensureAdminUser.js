const bcrypt = require('bcryptjs');
const User = require('../models/User');

async function ensureAdminUser() {
    const adminEmail = String(process.env.ADMIN_EMAIL || 'hailetadilo@gmail.com').trim().toLowerCase();
    const adminPassword = String(process.env.ADMIN_PASSWORD || 'adminpassword');
    const adminName = String(process.env.ADMIN_NAME || 'admin').trim() || 'admin';

    if (!adminEmail || !adminPassword) {
        console.warn('Admin bootstrap skipped: ADMIN_EMAIL or ADMIN_PASSWORD is empty.');
        return;
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(adminPassword, salt);

    const user = await User.findOne({ email: adminEmail });

    if (!user) {
        await User.create({
            fullName: adminName,
            email: adminEmail,
            passwordHash,
            role: 'admin',
            authProvider: 'local',
            status: 'active',
            isBanned: false
        });
        console.log(`Admin bootstrap: created admin user ${adminEmail}`);
        return;
    }

    user.fullName = adminName;
    user.passwordHash = passwordHash;
    user.role = 'admin';
    user.authProvider = 'local';
    user.status = 'active';
    user.isBanned = false;

    await user.save();
    console.log(`Admin bootstrap: updated admin user ${adminEmail}`);
}

module.exports = ensureAdminUser;
