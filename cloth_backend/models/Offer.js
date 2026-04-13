const mongoose = require('mongoose');

const OfferSchema = new mongoose.Schema({
    job_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
    worker_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    worker_role: { type: String, enum: ['employee', 'driver'], required: true },
    offered_price: { type: Number, required: true, min: 0 },
    message: { type: String, default: '' },
    has_required_tools: { type: Boolean, default: false },
    worker_rating: { type: Number, default: 0, min: 0 },
    timestamp: { type: Date, default: Date.now }
});

OfferSchema.index({ job_id: 1, worker_id: 1, timestamp: -1 });

module.exports = mongoose.model('Offer', OfferSchema);
