'use strict';

/**
 * googleAuth.js
 *
 * Verifies a Google ID token using Google's public OAuth2 tokeninfo endpoint.
 * No firebase-admin, no third-party SDK — pure HTTPS call to Google.
 *
 * Google docs: https://developers.google.com/identity/sign-in/web/backend-auth#verify-the-integrity-of-the-id-token
 *
 * Returned payload fields (subset):
 *   sub          — Google user ID (stable, unique per user)
 *   email        — verified email address
 *   email_verified — boolean string "true"/"false"
 *   name         — display name
 *   given_name   — first name
 *   family_name  — last name
 *   picture      — profile photo URL
 *   aud          — client ID the token was issued for
 *   exp          — expiry (unix seconds)
 */

const https = require('https');

const GOOGLE_TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';

/**
 * Verifies a Google ID token by calling Google's tokeninfo endpoint.
 *
 * @param {string} idToken  — The raw Google ID token from the client.
 * @returns {Promise<object>} Resolved payload on success.
 * @throws  {Error}          With a descriptive message on failure.
 */
function verifyGoogleToken(idToken) {
    return new Promise((resolve, reject) => {
        const url = `${GOOGLE_TOKENINFO_URL}?id_token=${encodeURIComponent(idToken)}`;

        https.get(url, (res) => {
            let raw = '';
            res.on('data', (chunk) => { raw += chunk; });
            res.on('end', () => {
                let payload;
                try {
                    payload = JSON.parse(raw);
                } catch (_) {
                    return reject(new Error('Google tokeninfo returned invalid JSON'));
                }

                // Google returns { error_description } on failure
                if (payload.error_description || payload.error) {
                    return reject(new Error(payload.error_description || payload.error || 'Invalid Google token'));
                }

                // Token must not be expired
                const now = Math.floor(Date.now() / 1000);
                if (Number(payload.exp) < now) {
                    return reject(new Error('Google token has expired'));
                }

                // Optionally enforce audience (GOOGLE_CLIENT_ID must match)
                const expectedAud = String(process.env.GOOGLE_CLIENT_ID || '').trim();
                if (expectedAud && payload.aud !== expectedAud) {
                    return reject(new Error('Google token audience mismatch'));
                }

                resolve(payload);
            });
        }).on('error', (err) => {
            reject(new Error(`Google tokeninfo request failed: ${err.message}`));
        });
    });
}

module.exports = { verifyGoogleToken };
