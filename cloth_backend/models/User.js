const { isFirebaseMode, FirebaseUser } = require('../utils/firebaseAuthModels');

if (isFirebaseMode()) {
    module.exports = FirebaseUser;
    return;
}

const mongoose = require('mongoose');

const ShippingAddressSchema = new mongoose.Schema({
    label: { type: String, default: '' },
    full_name: { type: String, default: '' },
    phone: { type: String, default: '' },
    country: { type: String, default: 'Ethiopia' },
    country_code: { type: String, default: '+251' },
    region: { type: String, default: '' },
    region_custom: { type: String, default: '' },
    city: { type: String, default: '' },
    zip_code: { type: String, default: '' },
    is_default: { type: Boolean, default: false }
}, { _id: true });

const MeasurementProfileSchema = new mongoose.Schema({
    profile_name: { type: String, default: '' },
    chest: { type: Number, default: 0 },
    waist: { type: Number, default: 0 },
    hip: { type: Number, default: 0 },
    shoulder: { type: Number, default: 0 },
    length: { type: Number, default: 0 },
    sleeve_length: { type: Number, default: 0 },
    is_default: { type: Boolean, default: false }
}, { _id: true });

const UserSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    fatherName: { type: String }, // Optional for admin, generally used for customers
    email: { type: String, required: true, unique: true },
    phone: { type: String },
    age: { type: Number, default: null },
    sex: { type: String, enum: ['male', 'female', 'other', 'prefer_not_to_say'], default: '' },
    profileImage: { type: String, default: '' },
    shipping_addresses: { type: [ShippingAddressSchema], default: [] },
    measurement_profiles: { type: [MeasurementProfileSchema], default: [] },
    default_shipping_address_id: { type: String, default: '' },
    default_measurement_profile_id: { type: String, default: '' },
    passwordHash: { type: String },
    authProvider: { type: String, enum: ['local', 'google'], default: 'local' },
    googleSub: { type: String },
    role: { type: String, enum: ['admin', 'customer', 'employee', 'driver'], default: 'customer' },

    // Worker onboarding + approval workflow
    national_id: { type: String },
    national_id_image: { type: String },
    tin_number: { type: String },
    telebirr_account_number: { type: String },
    cbe_account_number: { type: String },
    legal_document_image: { type: String }, // URL to /api/uploads/:id
    has_required_tools: { type: Boolean, default: false },
    approval_status: { type: String, enum: ['APPROVED', 'PENDING_APPROVAL', 'REJECTED'], default: 'APPROVED' },
    approved_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approval_date: { type: Date, default: null },
    blocked_status: { type: Boolean, default: false },
    worker_rating: { type: Number, default: 0, min: 0 },

    status: { type: String, enum: ['active', 'inactive', 'banned'], default: 'active' },
    isBanned: { type: Boolean, default: false },
    resetPasswordTokenHash: { type: String },
    resetPasswordExpiresAt: { type: Date },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);
