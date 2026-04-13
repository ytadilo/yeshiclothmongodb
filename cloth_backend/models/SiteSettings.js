const mongoose = require('mongoose');

const SocialLinksSchema = new mongoose.Schema(
    {
        tiktok: { type: String, default: '' },
        telegram: { type: String, default: '' },
        facebook: { type: String, default: '' },
        instagram: { type: String, default: '' },
        whatsapp: { type: String, default: '' },
        phone: { type: String, default: '' }
    },
    { _id: false }
);

const SiteContentSchema = new mongoose.Schema(
    {
        siteTitle: { type: String, default: '' },
        headerLogoUrl: { type: String, default: '' },
        faviconUrl: { type: String, default: '' },
        authBadge: { type: String, default: '' },
        authTitle: { type: String, default: '' },
        authSubtitle: { type: String, default: '' },
        authFeature1Title: { type: String, default: '' },
        authFeature1Text: { type: String, default: '' },
        authFeature2Title: { type: String, default: '' },
        authFeature2Text: { type: String, default: '' },
        authFeature3Title: { type: String, default: '' },
        authFeature3Text: { type: String, default: '' },
        footerBrand: { type: String, default: '' },
        footerTagline: { type: String, default: '' },
        footerContactHeader: { type: String, default: '' },
        footerFollowHeader: { type: String, default: '' },
        footerLocation: { type: String, default: '' },
        footerEmailText: { type: String, default: '' },
        workshopHeader: { type: String, default: '' },
        workshopAddress: { type: String, default: '' },
        footerWhatsAppText: { type: String, default: '' },
        footerPhoneText: { type: String, default: '' },
        footerTelegramText: { type: String, default: '' },
        quickLink1Text: { type: String, default: '' },
        quickLink1Url: { type: String, default: '' },
        quickLink2Text: { type: String, default: '' },
        quickLink2Url: { type: String, default: '' },
        quickLink3Text: { type: String, default: '' },
        quickLink3Url: { type: String, default: '' },
        quickLink4Text: { type: String, default: '' },
        quickLink4Url: { type: String, default: '' },
        footerCopyright: { type: String, default: '' }
    },
    { _id: false }
);

const DeliverySettingsSchema = new mongoose.Schema(
    {
        default_mode: {
            type: String,
            enum: ['ethiopia_only', 'all_countries'],
            default: 'ethiopia_only'
        },
        default_country: { type: String, default: 'Ethiopia' },
        default_country_code: { type: String, default: '+251' },
        allow_all_country_codes: { type: Boolean, default: true }
    },
    { _id: false }
);

const SiteSettingsSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    social: { type: SocialLinksSchema, default: () => ({}) },
    content: { type: SiteContentSchema, default: () => ({}) },
    delivery: { type: DeliverySettingsSchema, default: () => ({}) },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('SiteSettings', SiteSettingsSchema);
