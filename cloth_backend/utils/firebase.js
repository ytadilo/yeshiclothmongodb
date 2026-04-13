const admin = require('firebase-admin');

function buildCredentialFromEnv() {
    const inlineJson = String(process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
    if (inlineJson) {
        try {
            const parsed = JSON.parse(inlineJson);
            return admin.credential.cert(parsed);
        } catch (error) {
            throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON');
        }
    }

    const projectId = String(process.env.FIREBASE_PROJECT_ID || '').trim();
    const clientEmail = String(process.env.FIREBASE_CLIENT_EMAIL || '').trim();
    const privateKeyRaw = String(process.env.FIREBASE_PRIVATE_KEY || '').trim();

    if (!projectId || !clientEmail || !privateKeyRaw) {
        throw new Error(
            'Firebase credentials are missing. Set FIREBASE_SERVICE_ACCOUNT or FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.'
        );
    }

    return admin.credential.cert({
        projectId,
        clientEmail,
        privateKey: privateKeyRaw.replace(/\\n/g, '\n')
    });
}

function initializeFirebase() {
    if (admin.apps.length > 0) {
        return admin.app();
    }

    const credential = buildCredentialFromEnv();
    const storageBucket = String(process.env.FIREBASE_STORAGE_BUCKET || '').trim();

    const options = { credential };
    if (storageBucket) {
        options.storageBucket = storageBucket;
    }

    return admin.initializeApp(options);
}

function getFirestore() {
    initializeFirebase();
    return admin.firestore();
}

function getFirebaseAdmin() {
    initializeFirebase();
    return admin;
}

module.exports = {
    initializeFirebase,
    getFirestore,
    getFirebaseAdmin
};
