'use strict';

const mongoose = require('mongoose');

/**
 * Establishes a Mongoose connection to MongoDB Atlas.
 *
 * - Reads MONGODB_URI from process.env.
 * - Throws immediately (before any connect call) if the URI is missing or empty.
 * - Logs "MongoDB connected" on success.
 * - Rethrows any connection error so the caller (startServer) can handle it.
 *
 * @returns {Promise<void>}
 */
const connectDB = async () => {
  const uri = process.env.MONGODB_URI;

  if (!uri || uri.trim() === '') {
    throw new Error(
      'MongoDB connection string is missing. Set MONGODB_URI in your .env file.'
    );
  }

  try {
    await mongoose.connect(uri);
    console.log('MongoDB connected');
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    throw err;
  }
};

module.exports = connectDB;
