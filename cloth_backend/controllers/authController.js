const User = require('../models/User');
const OTPCode = require('../models/OTPCode');
const UserDevice = require('../models/UserDevice');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sendEmail = require('../utils/sendEmail');
const crypto = require('crypto'); // to generate OTP random number
const BlockedDevice = require('../models/BlockedDevice');
const { OAuth2Client } = require('google-auth-library');
const Upload = require('../models/Upload');
const { getFirebaseAdmin } = require('../utils/firebase');

const ALLOWED_SEXES = new Set(['male', 'female', 'other', 'prefer_not_to_say']);
const DEFAULT_PUBLIC_BASE_URL = 'https://www.yeshiclothe.com.et';

function getDeviceHashFromReq(req) {
    const rawId = String(req.header('x-device-id') || '').trim();
    if (rawId && /^[a-f0-9]{64}$/i.test(rawId)) {
        return rawId.toLowerCase();
    }

    const fp = String(req.header('x-device-fingerprint') || '').trim();
    if (!fp) return null;
    return crypto.createHash('sha256').update(fp).digest('hex');
}

async function recordLoginDevice(req, userId, deviceHash) {
    if (!userId || !deviceHash) return;
    try {
        const ua = String(req.get('user-agent') || '').slice(0, 500);
        await UserDevice.findOneAndUpdate(
            { userId, deviceHash },
            {
                $set: { userAgent: ua, lastSeenAt: new Date() },
                $setOnInsert: { firstSeenAt: new Date() }
            },
            { upsert: true, new: true }
        );
    } catch (err) {
        // Do not block login if device recording fails
        console.error('recordLoginDevice error:', err);
    }
}

function issueJwt(res, user) {
    const payload = {
        user: {
            id: user.id,
            role: user.role
        }
    };

    jwt.sign(
        payload,
        process.env.JWT_SECRET,
        { expiresIn: 360000 },
        (err, token) => {
            if (err) {
                console.error('JWT sign error:', err);
                return res.status(500).json({ msg: 'Server error' });
            }
            const cookieMaxAgeMs = 360000 * 1000;
            res.cookie('yeshi_token', token, {
                httpOnly: true,
                sameSite: 'lax',
                secure: process.env.NODE_ENV === 'production',
                maxAge: cookieMaxAgeMs,
                path: '/'
            });
            res.json({
                token,
                user: serializeUser(user)
            });
        }
    );
}

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function normalizeBaseUrl(value) {
    const raw = String(value || '').trim();
    if (!/^https?:\/\//i.test(raw)) return '';
    return raw.replace(/\/+$/, '');
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const RESERVED_ADMIN_EMAIL = normalizeEmail(process.env.ADMIN_EMAIL || 'hailetadilo@gmail.com');

function isReservedAdminEmail(email) {
    return normalizeEmail(email) === RESERVED_ADMIN_EMAIL;
}

function applyReservedRoleRules(user, email) {
    if (!user) return false;

    const normalizedEmail = normalizeEmail(email || user.email);
    const currentRole = String(user.role || '').trim().toLowerCase();

    if (isReservedAdminEmail(normalizedEmail)) {
        if (currentRole !== 'admin') {
            user.role = 'admin';
            return true;
        }
        return false;
    }

    if (!currentRole) {
        user.role = 'customer';
        return true;
    }

    return false;
}

function splitFullNameParts(fullName) {
    const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
    return {
        firstName: parts[0] || '',
        fatherName: parts[1] || ''
    };
}

function getFirstNameFromProfile(profile) {
    const raw = String(profile || '').trim();
    if (!raw) return '';
    return raw.split(/\s+/)[0];
}

function normalizeProviderIds(providerIds) {
    return Array.from(
        new Set(
            (Array.isArray(providerIds) ? providerIds : [])
                .map((value) => String(value || '').trim())
                .filter(Boolean)
        )
    );
}

function getPrimaryAuthProvider(providerIds) {
    const list = normalizeProviderIds(providerIds);
    if (list.includes('google.com') && !list.includes('password')) {
        return 'google';
    }
    return 'local';
}

function parseMaybeDate(value) {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildFirebasePublicConfig() {
    const projectId = String(process.env.FIREBASE_WEB_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || 'clotheyeshi').trim();
    const authDomain = String(process.env.FIREBASE_AUTH_DOMAIN || (projectId ? `${projectId}.firebaseapp.com` : '')).trim();
    const storageBucket = String(
        process.env.FIREBASE_WEB_STORAGE_BUCKET ||
        process.env.FIREBASE_STORAGE_BUCKET ||
        (projectId ? `${projectId}.firebasestorage.app` : '')
    ).trim();

    return {
        apiKey: String(process.env.FIREBASE_WEB_API_KEY || process.env.FIREBASE_API_KEY || '').trim(),
        authDomain,
        projectId,
        storageBucket,
        messagingSenderId: String(process.env.FIREBASE_WEB_MESSAGING_SENDER_ID || process.env.FIREBASE_MESSAGING_SENDER_ID || '').trim(),
        appId: String(process.env.FIREBASE_WEB_APP_ID || process.env.FIREBASE_APP_ID || '').trim(),
        measurementId: String(process.env.FIREBASE_WEB_MEASUREMENT_ID || process.env.FIREBASE_MEASUREMENT_ID || '').trim()
    };
}

async function findUserForFirebaseSession(firebaseUid, email) {
    const normalizedEmail = normalizeEmail(email);
    if (firebaseUid) {
        const byUid = await User.findOne({ firebaseUid });
        if (byUid) return byUid;
    }

    if (normalizedEmail) {
        const byEmail = await User.findOne({ email: normalizedEmail });
        if (byEmail) return byEmail;
    }

    return null;
}

function applyFirebaseProfileToUser(user, userRecord, providerIds) {
    const normalizedEmail = normalizeEmail(userRecord?.email);
    const displayName = String(userRecord?.displayName || '').trim();
    const profileImage = String(userRecord?.photoURL || '').trim();
    const phoneNumber = String(userRecord?.phoneNumber || '').trim();
    const primaryProvider = getPrimaryAuthProvider(providerIds);
    const googleProvider = (userRecord?.providerData || []).find((provider) => provider && provider.providerId === 'google.com');
    const nameParts = splitFullNameParts(displayName);

    if (normalizedEmail) user.email = normalizedEmail;
    if (userRecord?.uid) user.firebaseUid = String(userRecord.uid);

    user.authProvider = primaryProvider;
    user.emailVerified = !!userRecord?.emailVerified;
    user.pendingEmail = '';
    user.providerIds = normalizeProviderIds(providerIds);
    user.lastLoginAt = parseMaybeDate(userRecord?.metadata?.lastSignInTime) || new Date();

    if (!user.fullName || user.authProvider === 'google') {
        user.fullName = displayName || user.fullName || getFirstNameFromProfile(normalizedEmail) || 'User';
    }

    if (!user.fatherName || user.authProvider === 'google') {
        user.fatherName = nameParts.fatherName || user.fatherName || '';
    }

    if (!user.phone && phoneNumber) {
        user.phone = phoneNumber;
    }

    if (!user.profileImage && profileImage) {
        user.profileImage = profileImage;
    }

    if (primaryProvider === 'google') {
        user.googleSub = String((googleProvider && googleProvider.uid) || userRecord?.uid || user.googleSub || '');
    }

    if (!user.role) {
        user.role = 'customer';
    }
    if (!user.status) {
        user.status = 'active';
    }
    if (!user.createdAt) {
        user.createdAt = parseMaybeDate(userRecord?.metadata?.creationTime) || new Date();
    }
}

function getGoogleClient() {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
        throw new Error('Missing GOOGLE_CLIENT_ID');
    }
    return new OAuth2Client(clientId);
}

function parseAge(value) {
    const age = Number.parseInt(String(value || '').trim(), 10);
    if (!Number.isFinite(age) || age < 1 || age > 150) {
        return null;
    }
    return age;
}

function normalizeSex(value) {
    const normalized = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
    return ALLOWED_SEXES.has(normalized) ? normalized : '';
}

async function storeUpload(file, ownerUserId, purpose, visibility = 'public') {
    if (!file || !file.buffer) return null;

    const uploadDoc = await Upload.create({
        originalName: file.originalname || 'upload',
        mimeType: file.mimetype || 'application/octet-stream',
        size: Number(file.size || 0),
        data: file.buffer,
        visibility,
        owner_user_id: ownerUserId || null,
        purpose
    });

    return {
        uploadDoc,
        url: '/api/uploads/' + uploadDoc._id
    };
}

function serializeUser(user) {
    const shippingAddresses = Array.isArray(user.shipping_addresses)
        ? user.shipping_addresses.map((a) => ({
            id: String(a._id || a.id || ''),
            label: a.label || '',
            full_name: a.full_name || '',
            phone: a.phone || '',
            country: a.country || 'Ethiopia',
            country_code: a.country_code || '+251',
            region: a.region || '',
            region_custom: a.region_custom || '',
            city: a.city || '',
            zip_code: a.zip_code || '',
            is_default: !!a.is_default
        }))
        : [];

    const measurementProfiles = Array.isArray(user.measurement_profiles)
        ? user.measurement_profiles.map((m) => ({
            id: String(m._id || m.id || ''),
            profile_name: m.profile_name || '',
            chest: Number(m.chest || 0),
            waist: Number(m.waist || 0),
            hip: Number(m.hip || 0),
            shoulder: Number(m.shoulder || 0),
            length: Number(m.length || 0),
            sleeve_length: Number(m.sleeve_length || 0),
            is_default: !!m.is_default
        }))
        : [];

    return {
        id: user._id || user.id,
        fullName: user.fullName,
        fatherName: user.fatherName || '',
        email: user.email || '',
        pendingEmail: user.pendingEmail || '',
        emailVerified: !!user.emailVerified,
        phone: user.phone || '',
        age: user.age ?? null,
        sex: user.sex || '',
        profileImage: user.profileImage || '',
        role: user.role,
        authProvider: user.authProvider || 'local',
        providerIds: normalizeProviderIds(user.providerIds),
        firebaseUid: user.firebaseUid || '',
        status: user.status || 'active',
        isBanned: !!user.isBanned,
        shipping_addresses: shippingAddresses,
        measurement_profiles: measurementProfiles,
        default_shipping_address_id: user.default_shipping_address_id || '',
        default_measurement_profile_id: user.default_measurement_profile_id || '',
        createdAt: user.createdAt || null,
        lastLoginAt: user.lastLoginAt || null
    };
}

function parsePositiveMeasure(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
}

function sanitizeShippingAddresses(input) {
    const list = Array.isArray(input) ? input : [];
    const cleaned = list
        .map((row) => ({
            label: String(row?.label || '').trim(),
            full_name: String(row?.full_name || row?.fullName || '').trim(),
            phone: String(row?.phone || '').trim(),
            country: String(row?.country || 'Ethiopia').trim() || 'Ethiopia',
            country_code: String(row?.country_code || row?.countryCode || '+251').trim() || '+251',
            region: String(row?.region || '').trim(),
            region_custom: String(row?.region_custom || row?.regionCustom || '').trim(),
            city: String(row?.city || '').trim(),
            zip_code: String(row?.zip_code || row?.zipCode || '').trim(),
            is_default: !!row?.is_default
        }))
        .filter((row) => row.full_name && row.phone && row.country && row.region && row.city && row.zip_code);

    if (!cleaned.length) return [];
    let hasDefault = false;
    cleaned.forEach((row, idx) => {
        if (row.is_default && !hasDefault) {
            hasDefault = true;
        } else {
            row.is_default = false;
        }
        if (idx === 0 && !hasDefault) {
            row.is_default = true;
            hasDefault = true;
        }
    });
    return cleaned;
}

function sanitizeMeasurementProfiles(input) {
    const list = Array.isArray(input) ? input : [];
    const cleaned = list
        .map((row) => ({
            profile_name: String(row?.profile_name || row?.profileName || '').trim(),
            chest: parsePositiveMeasure(row?.chest),
            waist: parsePositiveMeasure(row?.waist),
            hip: parsePositiveMeasure(row?.hip),
            shoulder: parsePositiveMeasure(row?.shoulder),
            length: parsePositiveMeasure(row?.length),
            sleeve_length: parsePositiveMeasure(row?.sleeve_length || row?.sleeveLength),
            is_default: !!row?.is_default
        }))
        .filter((row) => row.profile_name && row.chest > 0 && row.waist > 0 && row.hip > 0 && row.shoulder > 0 && row.length > 0 && row.sleeve_length > 0);

    if (!cleaned.length) return [];
    let hasDefault = false;
    cleaned.forEach((row, idx) => {
        if (row.is_default && !hasDefault) {
            hasDefault = true;
        } else {
            row.is_default = false;
        }
        if (idx === 0 && !hasDefault) {
            row.is_default = true;
            hasDefault = true;
        }
    });
    return cleaned;
}

// Register User
exports.register = async (req, res) => {
    const {
        fullName,
        firstName,
        fatherName,
        email,
        password,
        age,
        sex,
        phone
    } = req.body;
    try {
        const normalizedEmail = normalizeEmail(email);
        if (!normalizedEmail) {
            return res.status(400).json({ msg: 'Email is required' });
        }

        // Reserve the seeded admin email so nobody can register it
        if (isReservedAdminEmail(normalizedEmail)) {
            return res.status(400).json({ msg: 'This email is not allowed to register' });
        }

        let user = await User.findOne({ email: normalizedEmail });
        if (user) {
            return res.status(400).json({ msg: 'User already exists' });
        }

        if (!password) {
            return res.status(400).json({ msg: 'Password is required' });
        }

        if (!phone) {
            return res.status(400).json({ msg: 'Phone is required' });
        }

        const parsedAge = parseAge(age);
        if (!parsedAge) {
            return res.status(400).json({ msg: 'Age is required' });
        }

        const normalizedSex = normalizeSex(sex);
        if (!normalizedSex) {
            return res.status(400).json({ msg: 'Sex is required' });
        }

        const displayName = String(fullName || firstName || '').trim();
        if (!displayName) {
            return res.status(400).json({ msg: 'First name is required' });
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        let profileImageUrl = '';
        const profileImageFile = req.files?.profileImage?.[0];
        const profileImageUpload = await storeUpload(profileImageFile, null, 'profile_image', 'public');
        if (profileImageUpload) {
            profileImageUrl = profileImageUpload.url;
        }

        user = new User({
            fullName: displayName,
            fatherName,
            email: normalizedEmail,
            passwordHash,
            phone,
            age: parsedAge,
            sex: normalizedSex,
            profileImage: profileImageUrl,
            // Never allow role escalation from client registration
            role: 'customer',
            authProvider: 'local'
        });

        await user.save();

        issueJwt(res, user);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server error' });
    }
};

// Login User
exports.login = async (req, res) => {
    const { email, password } = req.body;
    try {
        const normalizedEmail = normalizeEmail(email);
        let user = await User.findOne({ email: normalizedEmail });
        if (!user) {
            return res.status(400).json({ msg: 'Invalid Credentials' });
        }

        const deviceHash = getDeviceHashFromReq(req);
        if (user.role === 'admin' && !deviceHash) {
            return res.status(400).json({ msg: 'Missing device fingerprint' });
        }
        if (deviceHash) {
            const blocked = await BlockedDevice.findOne({ deviceHash, blocked: true })
                .select('_id')
                .lean();
            if (blocked) {
                return res.status(403).json({ msg: 'Device is blocked' });
            }
        }

        const status = user.status || (user.isBanned ? 'banned' : 'active');
        if (status === 'banned' || user.isBanned) {
            return res.status(403).json({ msg: 'User is banned' });
        }
        if (status === 'inactive') {
            return res.status(403).json({ msg: 'User is inactive' });
        }

        if (user.role !== 'admin' && user.role !== 'customer') {
            return res.status(403).json({ msg: 'This account type is no longer supported.' });
        }

        if (!user.passwordHash) {
            return res.status(400).json({ msg: 'This account uses Google Sign-In. Please continue with Google.' });
        }

        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) {
            return res.status(400).json({ msg: 'Invalid Credentials' });
        }

        if (deviceHash) {
            await recordLoginDevice(req, user._id, deviceHash);
        }

        issueJwt(res, user);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server error' });
    }
};

exports.firebaseConfig = async (_req, res) => {
    const config = buildFirebasePublicConfig();
    const missing = ['apiKey', 'authDomain', 'projectId', 'appId'].filter((key) => !String(config[key] || '').trim());

    if (missing.length) {
        return res.status(503).json({
            msg: `Firebase web config is incomplete. Missing: ${missing.join(', ')}`,
            missing
        });
    }

    res.set('Cache-Control', 'public, max-age=3600');
    return res.json(config);
};

exports.firebaseSession = async (req, res) => {
    const idToken = String(req.body?.idToken || '').trim();
    if (!idToken) {
        return res.status(400).json({ msg: 'Missing Firebase ID token' });
    }

    try {
        const admin = getFirebaseAdmin();
        const decoded = await admin.auth().verifyIdToken(idToken, true);
        const userRecord = await admin.auth().getUser(decoded.uid);
        const normalizedEmail = normalizeEmail(userRecord?.email || decoded?.email);
        const providerIds = normalizeProviderIds([
            ...(Array.isArray(userRecord?.providerData) ? userRecord.providerData.map((provider) => provider?.providerId) : []),
            decoded?.firebase?.sign_in_provider
        ]);
        const primaryProvider = getPrimaryAuthProvider(providerIds);

        if (!normalizedEmail) {
            return res.status(400).json({ msg: 'Firebase account has no email address' });
        }

        if (!providerIds.includes('google.com') && !userRecord.emailVerified) {
            return res.status(403).json({ msg: 'Please verify your email first' });
        }

        if (userRecord.disabled) {
            return res.status(403).json({ msg: 'User is inactive' });
        }

        let user = await findUserForFirebaseSession(decoded.uid, normalizedEmail);

        if (!user) {
            const displayName = String(userRecord.displayName || '').trim();
            const nameParts = splitFullNameParts(displayName);
            const createdAt = parseMaybeDate(userRecord?.metadata?.creationTime) || new Date();

            user = new User({
                fullName: displayName || getFirstNameFromProfile(normalizedEmail) || 'User',
                fatherName: nameParts.fatherName,
                email: normalizedEmail,
                phone: String(userRecord.phoneNumber || '').trim(),
                profileImage: String(userRecord.photoURL || '').trim(),
                authProvider: primaryProvider,
                googleSub: providerIds.includes('google.com')
                    ? String((userRecord.providerData || []).find((provider) => provider?.providerId === 'google.com')?.uid || decoded.uid || '')
                    : '',
                firebaseUid: decoded.uid,
                emailVerified: !!userRecord.emailVerified,
                pendingEmail: '',
                providerIds,
                role: isReservedAdminEmail(normalizedEmail) ? 'admin' : 'customer',
                status: 'active',
                isBanned: false,
                createdAt,
                lastLoginAt: parseMaybeDate(userRecord?.metadata?.lastSignInTime) || new Date()
            });
        }

        applyFirebaseProfileToUser(user, userRecord, providerIds);
        applyReservedRoleRules(user, normalizedEmail);
        await user.save();

        return issueJwt(res, user);
    } catch (err) {
        console.error('firebaseSession error:', err?.message || err);
        return res.status(401).json({ msg: 'Invalid Firebase session' });
    }
};

// Google Sign-In config (client id)
exports.googleConfig = async (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID || '';
    res.json({ clientId });
};

// Google Sign-In (verify token, create user if missing, then issue JWT)
exports.googleLogin = async (req, res) => {
    const { idToken } = req.body;

    if (!idToken) {
        return res.status(400).json({ msg: 'Missing Google token' });
    }

    try {
        const client = getGoogleClient();
        const ticket = await client.verifyIdToken({
            idToken,
            audience: process.env.GOOGLE_CLIENT_ID
        });
        const payload = ticket.getPayload();

        const normalizedEmail = normalizeEmail(payload && payload.email);
        if (!normalizedEmail) {
            return res.status(400).json({ msg: 'Google token has no email' });
        }

        let user = await User.findOne({ email: normalizedEmail });

        if (!user) {
            // Do not allow creating the reserved admin email via Google
            const googleName = (payload && (payload.given_name || payload.name)) || '';
            const first = getFirstNameFromProfile(googleName) || 'User';

            user = new User({
                fullName: first,
                email: normalizedEmail,
                role: isReservedAdminEmail(normalizedEmail) ? 'admin' : 'customer',
                authProvider: 'google',
                googleSub: payload && payload.sub,
                age: null,
                sex: '',
                profileImage: '',
                status: 'active',
                isBanned: false
            });

            await user.save();
        } else {
            // If the user exists, keep their role but record Google linkage if missing
            let changed = false;
            if (!user.googleSub && payload && payload.sub) {
                user.googleSub = payload.sub;
                changed = true;
            }
            if (!user.authProvider) {
                user.authProvider = 'local';
                changed = true;
            }
            if (applyReservedRoleRules(user, normalizedEmail)) {
                changed = true;
            }
            if (changed) {
                await user.save();
            }
        }

        const status = user.status || (user.isBanned ? 'banned' : 'active');
        if (status === 'banned' || user.isBanned) {
            return res.status(403).json({ msg: 'User is banned' });
        }
        if (status === 'inactive') {
            return res.status(403).json({ msg: 'User is inactive' });
        }

        const deviceHash = getDeviceHashFromReq(req);
        if (user.role === 'admin' && !deviceHash) {
            return res.status(400).json({ msg: 'Missing device fingerprint' });
        }
        if (deviceHash) {
            const blocked = await BlockedDevice.findOne({ deviceHash, blocked: true })
                .select('_id')
                .lean();
            if (blocked) {
                return res.status(403).json({ msg: 'Device is blocked' });
            }
            await recordLoginDevice(req, user._id, deviceHash);
        }

        issueJwt(res, user);
    } catch (err) {
        console.error(err);
        return res.status(401).json({ msg: 'Invalid Google token' });
    }
};

// Get current authenticated user (session validation helper)
exports.me = async (req, res) => {
    try {
        const user = await User.findById(req.user.id)
            .select('_id fullName fatherName email pendingEmail emailVerified phone age sex profileImage role status isBanned authProvider providerIds firebaseUid shipping_addresses measurement_profiles default_shipping_address_id default_measurement_profile_id createdAt lastLoginAt');

        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }

        res.json({
            user: serializeUser(user)
        });
    } catch (err) {
        console.error(err.message);
        return res.status(500).json({ msg: 'Server error' });
    }
};

// Update current authenticated user profile
exports.updateMe = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }

        if (req.body?.fullName !== undefined) {
            const nextFullName = String(req.body.fullName || '').trim();
            if (!nextFullName) {
                return res.status(400).json({ msg: 'Full name is required' });
            }
            user.fullName = nextFullName;
        }

        if (req.body?.fatherName !== undefined) {
            user.fatherName = String(req.body.fatherName || '').trim();
        }

        if (req.body?.phone !== undefined) {
            const nextPhone = String(req.body.phone || '').trim();
            if (!nextPhone) {
                return res.status(400).json({ msg: 'Phone is required' });
            }
            user.phone = nextPhone;
        }

        if (req.body?.age !== undefined) {
            const nextAge = parseAge(req.body.age);
            if (!nextAge) {
                return res.status(400).json({ msg: 'Age is required' });
            }
            user.age = nextAge;
        }

        if (req.body?.sex !== undefined) {
            const nextSex = normalizeSex(req.body.sex);
            if (!nextSex) {
                return res.status(400).json({ msg: 'Sex is required' });
            }
            user.sex = nextSex;
        }

        if (req.body?.shipping_addresses !== undefined || req.body?.shippingAddresses !== undefined) {
            const incoming = req.body?.shipping_addresses !== undefined
                ? req.body.shipping_addresses
                : req.body.shippingAddresses;
            const sanitized = sanitizeShippingAddresses(incoming);
            user.shipping_addresses = sanitized;
            const defaultAddress = sanitized.find((a) => a.is_default);
            user.default_shipping_address_id = defaultAddress ? String(defaultAddress._id || '') : '';
        }

        if (req.body?.measurement_profiles !== undefined || req.body?.measurementProfiles !== undefined) {
            const incoming = req.body?.measurement_profiles !== undefined
                ? req.body.measurement_profiles
                : req.body.measurementProfiles;
            const sanitized = sanitizeMeasurementProfiles(incoming);
            user.measurement_profiles = sanitized;
            const defaultMeasure = sanitized.find((m) => m.is_default);
            user.default_measurement_profile_id = defaultMeasure ? String(defaultMeasure._id || '') : '';
        }

        let uploadedProfile = null;
        if (req.file && req.file.buffer) {
            uploadedProfile = await storeUpload(req.file, user._id, 'profile_image', 'public');
            if (uploadedProfile) {
                user.profileImage = uploadedProfile.url;
            }
        }

        await user.save();

        if (uploadedProfile?.uploadDoc) {
            await Upload.findByIdAndUpdate(uploadedProfile.uploadDoc._id, { $set: { owner_user_id: user._id } }).catch(() => {});
        }

        return res.json({
            msg: 'Profile updated',
            user: serializeUser(user)
        });
    } catch (err) {
        console.error(err.message);
        return res.status(500).json({ msg: 'Server error' });
    }
};

// Stateless logout (client should clear local auth state)
exports.logout = async (_req, res) => {
    res.clearCookie('yeshi_token', {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/'
    });
    return res.json({ msg: 'Logged out' });
};

// Forgot Password - Generate OTP
exports.forgotPassword = async (req, res) => {
    const { email } = req.body;
    try {
        const normalizedEmail = normalizeEmail(email);
        const user = await User.findOne({ email: normalizedEmail });
        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }

        // Generate 6 digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        const type = user.role === 'admin' ? 'admin_reset_password' : 'reset_password';

        // Save OTP to DB
        // Delete any existing OTPs for this user/type to avoid clutter
        await OTPCode.deleteMany({ userId: user._id, type });

        await new OTPCode({
            userId: user._id,
            otp,
            type,
            expiresAt: new Date(Date.now() + 15 * 60 * 1000) // 15 mins
        }).save();

        const message = `Your password reset OTP is: ${otp}. It expires in 15 minutes.`;

        try {
            await sendEmail({
                email: user.email,
                subject: 'Password Reset OTP',
                message
            });
            return res.json({ msg: 'OTP sent to email' });
        } catch (err) {
            if (err && err.code === 'EMAIL_NOT_CONFIGURED') {
                if (process.env.NODE_ENV === 'production') {
                    return res.status(500).json({ msg: 'Email is not configured on the server' });
                }
                console.log(`[DEV MODE] OTP for ${user.email}: ${otp}`);
                return res.json({ msg: 'OTP generated (email not configured; check console in dev)' });
            }
            console.error(err);
            const msg = getEmailSendErrorMessage(err);
            const status = (err && (err.code === 'ETIMEDOUT' || err.code === 'ESOCKET' || err.code === 'ECONNECTION')) ? 503 : 500;
            return res.status(status).json({ msg });
        }

    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server error' });
    }
};

// Verify OTP
exports.verifyOTP = async (req, res) => {
    const { email, otp } = req.body;
    try {
        const normalizedEmail = normalizeEmail(email);
        const user = await User.findOne({ email: normalizedEmail });
        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }

        const type = user.role === 'admin' ? 'admin_reset_password' : 'reset_password';
        
        const validOTP = await OTPCode.findOne({
            userId: user._id,
            otp,
            type,
            expiresAt: { $gt: Date.now() }
        });

        if (!validOTP) {
            return res.status(400).json({ msg: 'Invalid or expired OTP' });
        }

        res.json({ msg: 'OTP verified', valid: true });

    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server error' });
    }
};

// Reset Password
exports.resetPassword = async (req, res) => {
    const { email, otp, newPassword } = req.body;
    try {
        const normalizedEmail = normalizeEmail(email);
        const user = await User.findOne({ email: normalizedEmail });
        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }

        if (!newPassword || String(newPassword).length < 6) {
            return res.status(400).json({ msg: 'Password must be at least 6 characters' });
        }

        const type = user.role === 'admin' ? 'admin_reset_password' : 'reset_password';

        const validOTP = await OTPCode.findOne({
            userId: user._id,
            otp,
            type,
            expiresAt: { $gt: Date.now() }
        });

        if (!validOTP) {
            return res.status(400).json({ msg: 'Invalid or expired OTP' });
        }

        const saltValue = await bcrypt.genSalt(10);
        user.passwordHash = await bcrypt.hash(newPassword, saltValue);
        await user.save();

        await OTPCode.deleteMany({ userId: user._id, type });

        res.json({ msg: 'Password reset successful' });

    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server error' });
    }
};

function createResetToken() {
    const raw = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    return { raw, hash };
}

function getEmailSendErrorMessage(err) {
    const code = err && err.code ? String(err.code) : '';
    const responseCode = err && err.responseCode ? Number(err.responseCode) : undefined;
    const status = err && err.status ? Number(err.status) : undefined;
    const rawMessage = String((err && err.message) || '');

    if (code === 'ETIMEDOUT' || code === 'ESOCKET' || code === 'ECONNECTION') {
        return 'Email service timeout. Please try again later.';
    }

    if (code === 'EAUTH' || responseCode === 535) {
        return 'Email authentication failed. Check SMTP_USER/SMTP_PASS (Gmail requires an App Password).';
    }

    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
        return 'Email service DNS/network error. Please try again later.';
    }

    // Resend: free/testing keys often restrict sending to the account email only
    if (code === 'RESEND_ERROR' && status === 403) {
        if (/only send testing emails/i.test(rawMessage) || /verify a domain/i.test(rawMessage)) {
            return 'Email provider (Resend) is in testing mode. Verify a domain in Resend and set RESEND_FROM to an address on that domain, then try again.';
        }
        return 'Email provider (Resend) rejected the request. Check RESEND_FROM and domain verification in Resend.';
    }

    return 'Email could not be sent';
}

// User: Forgot Password via Email Link
// Sends a reset link to /auth/reset-password?token=...
exports.forgotPasswordLink = async (req, res) => {
    const { email } = req.body;

    try {
        const normalizedEmail = normalizeEmail(email);
        if (!normalizedEmail) {
            return res.status(400).json({ msg: 'Email is required' });
        }

        const user = await User.findOne({ email: normalizedEmail });
        if (!user) {
            return res.status(404).json({
                msg: 'No account was found for that email',
                code: 'yeshi/user-not-found'
            });
        }

        if (user.role === 'admin') {
            // Keep admins on OTP flow (existing pages)
            return res.status(400).json({ msg: 'Please use the admin password recovery flow.' });
        }

        if (!user.passwordHash) {
            return res.status(400).json({ msg: 'This account uses Google Sign-In. Please continue with Google.' });
        }

        const { raw, hash } = createResetToken();
        user.resetPasswordTokenHash = hash;
        user.resetPasswordExpiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
        await user.save();

        const configuredBase = String(process.env.PUBLIC_BASE_URL || '').trim();
        const origin = String(req.get('origin') || '').trim();
        // When Netlify proxies /api/* to Render, req.get('host') can become the Render host.
        // The browser still sends Origin as the Netlify site; prefer that for reset links.
        const originBase = normalizeBaseUrl(origin);
        const requestBase = normalizeBaseUrl(`${req.protocol}://${req.get('host')}`);
        const baseUrl = normalizeBaseUrl(configuredBase) || originBase || requestBase || DEFAULT_PUBLIC_BASE_URL;
        const resetUrl = `${baseUrl}/auth/reset-password?token=${raw}`;
        const appName = 'Yeshi Clothe';
        const message = [
            'Hello,',
            '',
            `Follow this link to reset your ${appName} password for your ${user.email} account.`,
            '',
            resetUrl,
            '',
            'If you did not ask to reset your password, you can ignore this email.',
            '',
            'Thanks,',
            `Your ${appName} team`
        ].join('\n');
        const html = [
            '<p>Hello,</p>',
            `<p>Follow this link to reset your ${escapeHtml(appName)} password for your ${escapeHtml(user.email)} account.</p>`,
            `<p><a href="${escapeHtml(resetUrl)}">${escapeHtml(resetUrl)}</a></p>`,
            '<p>If you didn\'t ask to reset your password, you can ignore this email.</p>',
            '<p>Thanks,</p>',
            `<p>Your ${escapeHtml(appName)} team</p>`
        ].join('');

        try {
            await sendEmail({
                email: user.email,
                subject: `Reset your ${appName} password`,
                message,
                html
            });
        } catch (err) {
            if (err && err.code === 'EMAIL_NOT_CONFIGURED') {
                if (process.env.NODE_ENV === 'production') {
                    return res.status(500).json({ msg: 'Email is not configured on the server' });
                }
                console.log(`[DEV MODE] Password reset link for ${user.email}: ${resetUrl}`);
                return res.json({ msg: 'Password reset email sent' });
            }
            console.error(err);
            const msg = getEmailSendErrorMessage(err);
            const status = (err && (err.code === 'ETIMEDOUT' || err.code === 'ESOCKET' || err.code === 'ECONNECTION')) ? 503 : 500;
            return res.status(status).json({ msg });
        }

        return res.json({ msg: 'Password reset email sent' });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: 'Server error' });
    }
};

// User: Reset Password via Email Link
// Accepts token + password + confirmPassword, then auto-logs in
exports.resetPasswordLink = async (req, res) => {
    const { token, password, confirmPassword } = req.body;

    try {
        if (!token) {
            return res.status(400).json({ msg: 'Missing reset token' });
        }
        if (!password || !confirmPassword) {
            return res.status(400).json({ msg: 'Password and confirmation are required' });
        }
        if (password !== confirmPassword) {
            return res.status(400).json({ msg: 'Passwords do not match' });
        }
        if (String(password).length < 6) {
            return res.status(400).json({ msg: 'Password must be at least 6 characters' });
        }

        const hash = crypto.createHash('sha256').update(String(token)).digest('hex');

        const user = await User.findOne({
            resetPasswordTokenHash: hash,
            resetPasswordExpiresAt: { $gt: new Date() },
            role: 'customer'
        });

        if (!user) {
            return res.status(400).json({ msg: 'Invalid or expired reset link' });
        }

        const salt = await bcrypt.genSalt(10);
        user.passwordHash = await bcrypt.hash(password, salt);
        user.resetPasswordTokenHash = undefined;
        user.resetPasswordExpiresAt = undefined;
        await user.save();

        // Auto-login after reset
        issueJwt(res, user);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: 'Server error' });
    }
};

// Change Password (Authenticated)
exports.changePassword = async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    try {
        const user = await User.findById(req.user.id);
        
        const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!isMatch) {
            return res.status(400).json({ msg: 'Invalid current password' });
        }

        const salt = await bcrypt.genSalt(10);
        user.passwordHash = await bcrypt.hash(newPassword, salt);
        await user.save();

        res.json({ msg: 'Password changed successfully' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server error' });
    }
};

