'use strict';

const mongoose = require('mongoose');

const SiteSettingsSchema = new mongoose.Schema(
  {
    key:       { type: String, default: 'default', unique: true },
    social:    { type: mongoose.Schema.Types.Mixed, default: {} },
    content:   { type: mongoose.Schema.Types.Mixed, default: {} },
    delivery:  { type: mongoose.Schema.Types.Mixed, default: {} },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: 'site_settings', timestamps: false }
);

module.exports = mongoose.models.SiteSettings || mongoose.model('SiteSettings', SiteSettingsSchema);
