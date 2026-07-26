'use strict';

const mongoose = require('mongoose');

// ---------------------------------------------------------------------------
// Sub-schemas
// ---------------------------------------------------------------------------

const ShippingAddressSubSchema = new mongoose.Schema(
  {
    _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
    label: { type: String, default: '' },
    fullName: { type: String, default: '' },
    phone: { type: String, default: '' },
    address: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    country: { type: String, default: '' },
    postalCode: { type: String, default: '' },
    isDefault: { type: Boolean, default: false },
  },
  { _id: true }
);

const MeasurementProfileSubSchema = new mongoose.Schema(
  {
    _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
    label: { type: String, default: '' },
    unit: { type: String, default: 'cm' },
    // Core body measurements (all optional — schema is open for any cloth controller fields)
    chest: { type: Number, default: null },
    waist: { type: Number, default: null },
    hips: { type: Number, default: null },
    shoulder: { type: Number, default: null },
    sleeveLength: { type: Number, default: null },
    inseam: { type: Number, default: null },
    neck: { type: Number, default: null },
    height: { type: Number, default: null },
    weight: { type: Number, default: null },
    extraNotes: { type: String, default: '' },
    isDefault: { type: Boolean, default: false },
  },
  { _id: true }
);

// ---------------------------------------------------------------------------
// Main User schema
// ---------------------------------------------------------------------------

const UserSchema = new mongoose.Schema(
  {
    fullName: { type: String, default: '' },
    fatherName: { type: String, default: '' },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, default: '' },
    authProvider: {
      type: String,
      enum: ['local', 'google'],
      default: 'local',
    },
    googleSub: { type: String, default: '' },
    firebaseUid: { type: String, default: '' },
    emailVerified: { type: Boolean, default: false },
    pendingEmail: { type: String, default: '' },
    providerIds: [{ type: String }],
    role: {
      type: String,
      enum: ['admin', 'customer'],
      default: 'customer',
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'banned'],
      default: 'active',
    },
    isBanned: { type: Boolean, default: false },
    blocked_status: { type: Boolean, default: false },
    phone: { type: String, default: '' },
    age: { type: Number, default: null },
    sex: { type: String, default: '' },
    profileImage: { type: String, default: '' },
    shipping_addresses: [ShippingAddressSubSchema],
    measurement_profiles: [MeasurementProfileSubSchema],
    default_shipping_address_id: { type: String, default: '' },
    default_measurement_profile_id: { type: String, default: '' },
    resetPasswordTokenHash: { type: String, default: '' },
    resetPasswordExpiresAt: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    collection: 'users',
    timestamps: false,
  }
);

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

// The unique index on `email` is declared via `unique: true` on the field
// definition above — no need for a separate schema.index() call.

// ---------------------------------------------------------------------------
// Duplicate-model guard (prevents OverwriteModelError in tests / hot-reload)
// ---------------------------------------------------------------------------

module.exports = mongoose.models.User || mongoose.model('User', UserSchema);
