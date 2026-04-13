const mongoose = require('mongoose');

const connectDB = async () => {
    const mongoUri =
        process.env.MONGO_URI ||
        process.env.MONGODB_URI ||
        process.env.DATABASE_URL ||
        process.env.DB_URI;

    if (!mongoUri) {
        throw new Error('MongoDB connection string is missing. Set one of: MONGO_URI, MONGODB_URI, DATABASE_URL, DB_URI');
    }

    try {
        await mongoose.connect(mongoUri, {
            // Fail fast when Atlas/network access is blocked instead of buffering operations.
            serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 10000),
            connectTimeoutMS: Number(process.env.MONGO_CONNECT_TIMEOUT_MS || 10000),
            socketTimeoutMS: Number(process.env.MONGO_SOCKET_TIMEOUT_MS || 30000),
            maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE || 20),
            minPoolSize: Number(process.env.MONGO_MIN_POOL_SIZE || 0),
            maxIdleTimeMS: Number(process.env.MONGO_MAX_IDLE_TIME_MS || 10000)
        });
        console.log('MongoDB connected');
    } catch (err) {
        console.error('MongoDB connection failed:', err.message);
        throw err;
    }
};

module.exports = connectDB;
