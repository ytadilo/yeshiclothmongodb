const SiteSettings = require('../models/SiteSettings');

function normalizeUrl(url) {
    const value = String(url || '').trim();
    return value;
}

function sanitizeSocial(body) {
    const social = (body && body.social) || body || {};
    return {
        tiktok: normalizeUrl(social.tiktok),
        telegram: normalizeUrl(social.telegram),
        facebook: normalizeUrl(social.facebook),
        instagram: normalizeUrl(social.instagram),
        whatsapp: normalizeUrl(social.whatsapp),
        phone: String(social.phone || '').trim()
    };
}

function sanitizeContent(body) {
    const content = (body && body.content) || body || {};
    const hasKey = (key) => Object.prototype.hasOwnProperty.call(content, key);
    const pick = (key) => String(content[key] ?? '').trim();

    const out = {};
    [
        'siteTitle',
        'headerLogoUrl',
        'faviconUrl',
        'authBadge',
        'authTitle',
        'authSubtitle',
        'authFeature1Title',
        'authFeature1Text',
        'authFeature2Title',
        'authFeature2Text',
        'authFeature3Title',
        'authFeature3Text',
        'footerBrand',
        'footerTagline',
        'footerContactHeader',
        'footerFollowHeader',
        'footerLocation',
        'footerEmailText',
        'workshopHeader',
        'workshopAddress',
        'footerWhatsAppText',
        'footerPhoneText',
        'footerTelegramText',
        'quickLink1Text',
        'quickLink1Url',
        'quickLink2Text',
        'quickLink2Url',
        'quickLink3Text',
        'quickLink3Url',
        'quickLink4Text',
        'quickLink4Url',
        'footerCopyright'
    ].forEach((key) => {
        if (hasKey(key)) out[key] = pick(key);
    });

    return out;
}

function sanitizeDelivery(body) {
    const delivery = (body && body.delivery) || body || {};
    const modeRaw = String(delivery.default_mode || delivery.defaultMode || '').trim().toLowerCase();
    const defaultMode = modeRaw === 'all_countries' ? 'all_countries' : 'ethiopia_only';

    const defaultCountry = String(delivery.default_country || delivery.defaultCountry || 'Ethiopia').trim() || 'Ethiopia';
    const defaultCountryCode = String(delivery.default_country_code || delivery.defaultCountryCode || '+251').trim() || '+251';
    const allowAllCountryCodes = delivery.allow_all_country_codes === true
        || String(delivery.allow_all_country_codes || delivery.allowAllCountryCodes || '').toLowerCase() === 'true'
        || String(delivery.allow_all_country_codes || delivery.allowAllCountryCodes || '') === '1';

    return {
        default_mode: defaultMode,
        default_country: defaultCountry,
        default_country_code: defaultCountryCode,
        allow_all_country_codes: allowAllCountryCodes
    };
}

async function getOrCreateSettings() {
    let doc = await SiteSettings.findOne({ key: 'default' });
    let shouldSave = false;
    if (!doc) {
        doc = new SiteSettings({
            key: 'default',
            social: {
                tiktok: 'https://www.tiktok.com/@yeshi_traditional',
                telegram: 'https://t.me/Gondarkemisdress',
                facebook: '',
                instagram: '',
                whatsapp: 'https://wa.me/251933797981',
                phone: '+251933797981'
            },
            content: {
                siteTitle: 'Yeshi',
                headerLogoUrl: '/images/logo.png',
                faviconUrl: '/images/logo.png',
                authBadge: 'Secure login · Fast checkout',
                authTitle: 'Welcome back',
                authSubtitle: 'Order modern Ethiopian cultural dresses, custom-made for your event.',
                authFeature1Title: 'New cultural designs',
                authFeature1Text: 'for wedding, holiday, and daily wear.',
                authFeature2Title: 'Custom sizing',
                authFeature2Text: '(standard or measurements) for the perfect fit.',
                authFeature3Title: 'Easy order',
                authFeature3Text: 'with delivery choice and payment screenshot upload.',
                footerBrand: 'Yeshi | የሺ',
                footerTagline: 'Bringing elegance and culture to your wardrobe.',
                footerContactHeader: 'Contact',
                footerFollowHeader: 'Follow Us',
                footerLocation: 'Gondar, Ethiopia',
                footerEmailText: 'yeshiclothe@gmail.com',
                workshopHeader: 'Our Workshop',
                workshopAddress: 'Piazza Street, Near Fasil Ghebbi Castle',
                footerWhatsAppText: 'WhatsApp',
                footerPhoneText: 'Call: +251 933 797 981',
                footerTelegramText: 'Telegram Group',
                quickLink1Text: 'How It Works',
                quickLink1Url: '/how-it-works',
                quickLink2Text: 'About',
                quickLink2Url: '/about',
                quickLink3Text: 'Contact',
                quickLink3Url: '/contact',
                quickLink4Text: 'Our Story',
                quickLink4Url: '/about',
                footerCopyright: '© 2024 Yeshi Traditional Clothes. Crafted with pride in Gondar.'
            },
            delivery: {
                default_mode: 'ethiopia_only',
                default_country: 'Ethiopia',
                default_country_code: '+251',
                allow_all_country_codes: true
            }
        });
        shouldSave = true;
    }

    if (doc && doc.social) {
        if (String(doc.social.whatsapp || '').includes('251935224855')) {
            doc.social.whatsapp = 'https://wa.me/251933797981';
            shouldSave = true;
        }
        if (String(doc.social.phone || '').includes('251935224855')) {
            doc.social.phone = '+251933797981';
            shouldSave = true;
        }
    }

    if (doc && doc.content) {
        const footerPhone = String(doc.content.footerPhoneText || '');
        if (footerPhone.includes('935 22 48 55') || footerPhone.includes('251935224855')) {
            doc.content.footerPhoneText = 'Call: +251 933 797 981';
            shouldSave = true;
        }
    }

    if (shouldSave) {
        await doc.save();
    }
    return doc;
}

// Public: fetch social links
exports.getSocialLinks = async (req, res) => {
    try {
        const doc = await getOrCreateSettings();
        res.json({ social: doc.social || {} });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Server error' });
    }
};

// Admin: update social links
exports.updateSocialLinks = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ msg: 'Access denied' });
        }

        const doc = await getOrCreateSettings();
        const incoming = sanitizeSocial(req.body);

        doc.social = {
            ...doc.social.toObject?.() ? doc.social.toObject() : doc.social,
            ...incoming
        };
        doc.updatedAt = new Date();
        await doc.save();

        res.json({ msg: 'Updated', social: doc.social });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Server error' });
    }
};

// Public: fetch editable site content
exports.getContent = async (req, res) => {
    try {
        const doc = await getOrCreateSettings();
        res.json({ content: doc.content || {} });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Server error' });
    }
};

// Admin: update editable site content
exports.updateContent = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ msg: 'Access denied' });
        }

        const doc = await getOrCreateSettings();
        const incoming = sanitizeContent(req.body);

        doc.content = {
            ...doc.content.toObject?.() ? doc.content.toObject() : doc.content,
            ...incoming
        };
        doc.updatedAt = new Date();
        await doc.save();

        res.json({ msg: 'Updated', content: doc.content });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Server error' });
    }
};

// Public: fetch delivery settings
exports.getDeliverySettings = async (req, res) => {
    try {
        const doc = await getOrCreateSettings();
        res.json({
            delivery: doc.delivery || {
                default_mode: 'ethiopia_only',
                default_country: 'Ethiopia',
                default_country_code: '+251',
                allow_all_country_codes: true
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Server error' });
    }
};

// Admin: update delivery settings
exports.updateDeliverySettings = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ msg: 'Access denied' });
        }

        const doc = await getOrCreateSettings();
        const incoming = sanitizeDelivery(req.body);

        doc.delivery = {
            ...doc.delivery?.toObject?.() ? doc.delivery.toObject() : doc.delivery,
            ...incoming
        };
        doc.updatedAt = new Date();
        await doc.save();

        res.json({ msg: 'Updated', delivery: doc.delivery });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Server error' });
    }
};


