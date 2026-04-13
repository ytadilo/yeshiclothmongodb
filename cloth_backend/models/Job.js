const mongoose = require('mongoose');

const LocationSchema = new mongoose.Schema(
    {
        region: { type: String, default: '' },
        city: { type: String, default: '' },
        address: { type: String, default: '' }
    },
    { _id: false }
);

const JobSchema = new mongoose.Schema({
    work_type: { type: String, enum: ['employee', 'delivery'], default: 'employee' },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    created_by_user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    created_by_admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    order_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    source_post_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', default: null },

    assigned_employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    assigned_driver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    production_info_shared: { type: Boolean, default: false },
    delivery_info_shared: { type: Boolean, default: false },

    production_notes: { type: String, default: '' },
    production_images: [{ type: String }],
    job_images: [{ type: String }],
    order_snapshot: { type: mongoose.Schema.Types.Mixed, default: {} },

    delivery_status: {
        type: String,
        enum: ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'DELAYED'],
        default: 'NOT_STARTED'
    },

    status: {
        type: String,
        enum: [
            'EMPLOYEE_NEGOTIATION',
            'EMPLOYEE_ASSIGNED',
            'PRODUCTION_READY',
            'DRIVER_NEGOTIATION',
            'DRIVER_ASSIGNED',
            'DELIVERY_IN_PROGRESS',
            'COMPLETED',
            'CANCELLED'
        ],
        default: 'EMPLOYEE_NEGOTIATION'
    },

    pickup_location: { type: LocationSchema, default: () => ({}) },
    customer_location: { type: LocationSchema, default: () => ({}) },

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Job', JobSchema);
