const { getFirestore } = require('./firebase');

function getDatabaseProvider() {
    return 'firebase';
}

const connectDB = async () => {
    try {
        const firestore = getFirestore();
        // Quick readiness check so startup fails fast on invalid credentials.
        await firestore.collection('_health').limit(1).get();
        console.log('Firebase Firestore connected');
        return { provider: 'firebase' };
    } catch (err) {
        console.error('Firebase Firestore connection failed:', err.message);
        throw err;
    }
};

module.exports = connectDB;
module.exports.getDatabaseProvider = getDatabaseProvider;
