const crypto = require('crypto');
const { getFirestore } = require('./firebase');

function nowIso() {
    return new Date().toISOString();
}

function randomId() {
    return crypto.randomBytes(12).toString('hex');
}

function isFirebaseMode() {
    const provider = String(process.env.DB_PROVIDER || process.env.DATABASE_PROVIDER || 'mongo').trim().toLowerCase();
    return provider === 'firebase';
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function normalizeId(doc) {
    if (!doc) return null;
    const id = String(doc._id || doc.id || '');
    return { ...doc, _id: id, id };
}

function parseSelect(selectInput) {
    const raw = String(selectInput || '').trim();
    if (!raw) return null;

    const parts = raw.split(/\s+/).filter(Boolean);
    const includes = [];
    const excludes = [];

    parts.forEach((token) => {
        if (token.startsWith('-')) {
            excludes.push(token.slice(1));
        } else {
            includes.push(token);
        }
    });

    return { includes, excludes };
}

function applySelect(doc, selectInput) {
    const spec = parseSelect(selectInput);
    if (!spec) return doc;

    const { includes, excludes } = spec;
    if (includes.length > 0) {
        const picked = {};
        includes.forEach((key) => {
            if (Object.prototype.hasOwnProperty.call(doc, key)) {
                picked[key] = doc[key];
            }
        });
        if (!includes.includes('_id') && doc._id) {
            picked._id = doc._id;
        }
        if (!includes.includes('id') && doc.id) {
            picked.id = doc.id;
        }
        return picked;
    }

    const next = { ...doc };
    excludes.forEach((key) => {
        delete next[key];
    });
    return next;
}

function getValueByPath(obj, path) {
    if (!obj || !path) return undefined;
    const segments = String(path).split('.').filter(Boolean);
    let current = obj;
    for (const seg of segments) {
        if (current === null || current === undefined) {
            return undefined;
        }
        current = current[seg];
    }
    return current;
}

function matches(doc, query) {
    const keys = Object.keys(query || {});
    for (const key of keys) {
        const expected = query[key];
        const actual = getValueByPath(doc, key);

        if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
            if (Object.prototype.hasOwnProperty.call(expected, '$gt')) {
                const value = expected.$gt;
                const actualDate = new Date(actual).getTime();
                const cmpDate = new Date(value).getTime();
                if (!(Number.isFinite(actualDate) && Number.isFinite(cmpDate) && actualDate > cmpDate)) {
                    return false;
                }
                continue;
            }
            if (Object.prototype.hasOwnProperty.call(expected, '$gte')) {
                const value = expected.$gte;
                const actualDate = new Date(actual).getTime();
                const cmpDate = new Date(value).getTime();
                if (!(Number.isFinite(actualDate) && Number.isFinite(cmpDate) && actualDate >= cmpDate)) {
                    return false;
                }
                continue;
            }
            if (Object.prototype.hasOwnProperty.call(expected, '$lte')) {
                const value = expected.$lte;
                const actualDate = new Date(actual).getTime();
                const cmpDate = new Date(value).getTime();
                if (!(Number.isFinite(actualDate) && Number.isFinite(cmpDate) && actualDate <= cmpDate)) {
                    return false;
                }
                continue;
            }
            if (Object.prototype.hasOwnProperty.call(expected, '$ne')) {
                if (String(actual) === String(expected.$ne)) {
                    return false;
                }
                continue;
            }
            if (Object.prototype.hasOwnProperty.call(expected, '$exists')) {
                const exists = expected.$exists === true;
                const hasValue = actual !== undefined && actual !== null;
                if (exists !== hasValue) {
                    return false;
                }
                continue;
            }
            if (Object.prototype.hasOwnProperty.call(expected, '$in')) {
                const list = Array.isArray(expected.$in) ? expected.$in : [];
                const inMatch = list.some((item) => String(item) === String(actual));
                if (!inMatch) {
                    return false;
                }
                continue;
            }
        }

        if (String(actual) !== String(expected)) {
            return false;
        }
    }

    return true;
}

function applySortToArray(list, sortInput) {
    const sortObj = sortInput && typeof sortInput === 'object' ? sortInput : null;
    if (!sortObj) return list;
    const entries = Object.entries(sortObj);
    if (!entries.length) return list;

    const [key, direction] = entries[0];
    const dir = Number(direction) >= 0 ? 1 : -1;
    return [...list].sort((a, b) => {
        const av = a ? a[key] : undefined;
        const bv = b ? b[key] : undefined;
        if (av === bv) return 0;
        if (av === undefined || av === null) return -1 * dir;
        if (bv === undefined || bv === null) return 1 * dir;

        const ad = new Date(av).getTime();
        const bd = new Date(bv).getTime();
        if (Number.isFinite(ad) && Number.isFinite(bd)) {
            if (ad === bd) return 0;
            return ad > bd ? dir : -dir;
        }

        const as = String(av);
        const bs = String(bv);
        if (as === bs) return 0;
        return as > bs ? dir : -dir;
    });
}

function queryBuilder(fetcher) {
    const state = { select: '', lean: false, sort: null, limit: null };

    const run = async () => {
        const value = await fetcher(state);
        return value;
    };

    const chain = {
        select(value) {
            state.select = value;
            return chain;
        },
        lean() {
            state.lean = true;
            return chain;
        },
        sort(value) {
            state.sort = value;
            return chain;
        },
        limit(value) {
            const n = Number(value);
            state.limit = Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
            return chain;
        },
        then(resolve, reject) {
            return run().then(resolve, reject);
        },
        catch(reject) {
            return run().catch(reject);
        },
        finally(handler) {
            return run().finally(handler);
        }
    };

    return chain;
}

function withBufferConversionForUpload(doc) {
    if (!doc) return null;
    const out = { ...doc };
    if (typeof out.data === 'string') {
        out.data = Buffer.from(out.data, 'base64');
    }
    return out;
}

class FirebaseUser {
    constructor(data = {}) {
        Object.assign(this, data);
    }

    static collection() {
        return getFirestore().collection('users');
    }

    static makeDocument(data) {
        const current = nowIso();
        const doc = {
            fullName: '',
            fatherName: '',
            email: '',
            phone: '',
            age: null,
            sex: '',
            profileImage: '',
            shipping_addresses: [],
            measurement_profiles: [],
            default_shipping_address_id: '',
            default_measurement_profile_id: '',
            passwordHash: '',
            authProvider: 'local',
            googleSub: '',
            firebaseUid: '',
            emailVerified: false,
            pendingEmail: '',
            providerIds: [],
            role: 'customer',
            national_id: '',
            national_id_image: '',
            tin_number: '',
            telebirr_account_number: '',
            cbe_account_number: '',
            legal_document_image: '',
            has_required_tools: false,
            approval_status: 'APPROVED',
            approved_by: null,
            approval_date: null,
            blocked_status: false,
            worker_rating: 0,
            status: 'active',
            isBanned: false,
            resetPasswordTokenHash: '',
            resetPasswordExpiresAt: null,
            createdAt: current,
            lastLoginAt: null,
            updatedAt: current,
            ...clone(data)
        };

        doc.email = String(doc.email || '').trim().toLowerCase();
        doc.shipping_addresses = Array.isArray(doc.shipping_addresses)
            ? doc.shipping_addresses.map((row) => ({ ...row, _id: String(row && row._id ? row._id : randomId()) }))
            : [];
        doc.measurement_profiles = Array.isArray(doc.measurement_profiles)
            ? doc.measurement_profiles.map((row) => ({ ...row, _id: String(row && row._id ? row._id : randomId()) }))
            : [];
        doc.updatedAt = current;
        return doc;
    }

    static hydrate(doc, state) {
        if (!doc) return null;
        const normalized = normalizeId(doc);
        const projected = applySelect(normalized, state && state.select);
        if (state && state.lean) {
            return clone(projected);
        }
        return new FirebaseUser(projected);
    }

    static findOne(query) {
        return queryBuilder(async (state) => {
            const snap = await FirebaseUser.collection().get();
            const found = snap.docs
                .map((d) => ({ _id: d.id, ...d.data() }))
                .find((doc) => matches(doc, query || {}));
            return FirebaseUser.hydrate(found, state);
        });
    }

    static findById(id) {
        return queryBuilder(async (state) => {
            if (!id) return null;
            const ref = FirebaseUser.collection().doc(String(id));
            const snap = await ref.get();
            if (!snap.exists) return null;
            return FirebaseUser.hydrate({ _id: snap.id, ...snap.data() }, state);
        });
    }

    static async create(data) {
        const payload = FirebaseUser.makeDocument(data);
        const ref = await FirebaseUser.collection().add(payload);
        const created = { _id: ref.id, ...payload };
        return new FirebaseUser(created);
    }

    async save() {
        const current = nowIso();
        const toSave = FirebaseUser.makeDocument(this);
        toSave.updatedAt = current;

        if (this._id || this.id) {
            const id = String(this._id || this.id);
            await FirebaseUser.collection().doc(id).set(toSave, { merge: true });
            Object.assign(this, { _id: id, id, ...toSave });
            return this;
        }

        const ref = await FirebaseUser.collection().add(toSave);
        Object.assign(this, { _id: ref.id, id: ref.id, ...toSave });
        return this;
    }

    static find(query) {
        return queryBuilder(async (state) => {
            const snap = await FirebaseUser.collection().get();
            let list = snap.docs
                .map((d) => ({ _id: d.id, ...d.data() }))
                .filter((doc) => matches(doc, query || {}));

            list = applySortToArray(list, state && state.sort);
            if (state && Number.isFinite(state.limit) && state.limit > 0) {
                list = list.slice(0, state.limit);
            }

            return list.map((doc) => {
                const projected = applySelect(normalizeId(doc), state && state.select);
                return state && state.lean ? clone(projected) : new FirebaseUser(projected);
            });
        });
    }
}

class FirebaseOTPCode {
    constructor(data = {}) {
        Object.assign(this, data);
    }

    static collection() {
        return getFirestore().collection('otp_codes');
    }

    static hydrate(doc) {
        if (!doc) return null;
        return new FirebaseOTPCode(normalizeId(doc));
    }

    static async deleteMany(query) {
        const snap = await FirebaseOTPCode.collection().get();
        const hits = snap.docs
            .map((d) => ({ _id: d.id, ...d.data() }))
            .filter((doc) => matches(doc, query || {}));
        await Promise.all(hits.map((doc) => FirebaseOTPCode.collection().doc(String(doc._id)).delete()));
        return { deletedCount: hits.length };
    }

    static findOne(query) {
        return queryBuilder(async () => {
            const snap = await FirebaseOTPCode.collection().get();
            const hit = snap.docs
                .map((d) => ({ _id: d.id, ...d.data() }))
                .find((doc) => matches(doc, query || {}));
            return FirebaseOTPCode.hydrate(hit);
        });
    }

    async save() {
        const payload = {
            userId: String(this.userId || ''),
            otp: String(this.otp || ''),
            type: String(this.type || ''),
            expiresAt: this.expiresAt ? new Date(this.expiresAt).toISOString() : null,
            createdAt: nowIso()
        };

        const ref = await FirebaseOTPCode.collection().add(payload);
        Object.assign(this, { _id: ref.id, id: ref.id, ...payload });
        return this;
    }
}

class FirebaseUserDevice {
    static collection() {
        return getFirestore().collection('user_devices');
    }

    static async findOneAndUpdate(filter, update, options = {}) {
        const userId = String(filter && filter.userId ? filter.userId : '');
        const deviceHash = String(filter && filter.deviceHash ? filter.deviceHash : '');
        if (!userId || !deviceHash) return null;

        const id = `${userId}_${deviceHash}`;
        const ref = FirebaseUserDevice.collection().doc(id);
        const prev = await ref.get();

        const setValues = clone((update && update.$set) || {});
        const setOnInsert = clone((update && update.$setOnInsert) || {});
        const payload = {
            userId,
            deviceHash,
            ...setValues
        };

        if (!prev.exists) {
            Object.assign(payload, setOnInsert);
        }

        await ref.set(payload, { merge: true });
        const next = await ref.get();
        if (!next.exists) return null;
        const out = { _id: next.id, ...next.data() };
        return options && options.new ? out : out;
    }
}

class FirebaseBlockedDevice {
    static collection() {
        return getFirestore().collection('blocked_devices');
    }

    static findOne(query) {
        return queryBuilder(async (state) => {
            const snap = await FirebaseBlockedDevice.collection().get();
            const hit = snap.docs
                .map((d) => ({ _id: d.id, ...d.data() }))
                .find((doc) => matches(doc, query || {}));
            if (!hit) return null;
            const projected = applySelect(normalizeId(hit), state && state.select);
            return state && state.lean ? clone(projected) : projected;
        });
    }
}

class FirebaseUpload {
    static collection() {
        return getFirestore().collection('uploads');
    }

    static async create(data) {
        const payload = {
            originalName: String(data && data.originalName ? data.originalName : ''),
            mimeType: String(data && data.mimeType ? data.mimeType : 'application/octet-stream'),
            size: Number(data && data.size ? data.size : 0),
            data: data && data.data ? Buffer.from(data.data).toString('base64') : '',
            visibility: String(data && data.visibility ? data.visibility : 'public'),
            owner_user_id: data && data.owner_user_id ? String(data.owner_user_id) : null,
            purpose: String(data && data.purpose ? data.purpose : ''),
            order_id: data && data.order_id ? String(data.order_id) : null,
            post_id: data && data.post_id ? String(data.post_id) : null,
            created_at: nowIso()
        };

        const ref = await FirebaseUpload.collection().add(payload);
        return withBufferConversionForUpload({ _id: ref.id, id: ref.id, ...payload });
    }

    static findById(id) {
        return queryBuilder(async (state) => {
            if (!id) return null;
            const snap = await FirebaseUpload.collection().doc(String(id)).get();
            if (!snap.exists) return null;
            const doc = withBufferConversionForUpload({ _id: snap.id, ...snap.data() });
            const projected = applySelect(doc, state && state.select);
            return state && state.lean ? clone(projected) : projected;
        });
    }

    static find(query) {
        return queryBuilder(async (state) => {
            const snap = await FirebaseUpload.collection().get();
            let list = snap.docs
                .map((d) => withBufferConversionForUpload({ _id: d.id, ...d.data() }))
                .filter((doc) => matches(doc, query || {}));

            list = applySortToArray(list, state && state.sort);
            if (state && Number.isFinite(state.limit) && state.limit > 0) {
                list = list.slice(0, state.limit);
            }

            return list.map((doc) => {
                const projected = applySelect(doc, state && state.select);
                return state && state.lean ? clone(projected) : projected;
            });
        });
    }

    static async insertMany(items) {
        const list = Array.isArray(items) ? items : [];
        const out = [];
        for (const item of list) {
            const doc = await FirebaseUpload.create(item);
            out.push(doc);
        }
        return out;
    }

    static async findByIdAndUpdate(id, update) {
        if (!id) return null;
        const setValues = clone((update && update.$set) || {});
        if (setValues.data) {
            setValues.data = Buffer.from(setValues.data).toString('base64');
        }

        const ref = FirebaseUpload.collection().doc(String(id));
        await ref.set(setValues, { merge: true });
        const snap = await ref.get();
        if (!snap.exists) return null;
        return withBufferConversionForUpload({ _id: snap.id, ...snap.data() });
    }
}

class FirebaseOrder {
    constructor(data = {}) {
        Object.assign(this, data);
    }

    static collection() {
        return getFirestore().collection('orders');
    }

    static makeDocument(data) {
        const current = nowIso();
        return {
            ...clone(data || {}),
            updated_at: current,
            updatedAt: current,
            created_at: data && data.created_at ? data.created_at : (data && data.createdAt ? data.createdAt : current),
            createdAt: data && data.createdAt ? data.createdAt : (data && data.created_at ? data.created_at : current)
        };
    }

    static hydrate(doc, state) {
        if (!doc) return null;
        const normalized = normalizeId(doc);
        const projected = applySelect(normalized, state && state.select);
        return state && state.lean ? clone(projected) : new FirebaseOrder(projected);
    }

    static async create(data) {
        const payload = FirebaseOrder.makeDocument(data);
        const ref = await FirebaseOrder.collection().add(payload);
        return new FirebaseOrder({ _id: ref.id, id: ref.id, ...payload });
    }

    static find(query) {
        return queryBuilder(async (state) => {
            const snap = await FirebaseOrder.collection().get();
            let list = snap.docs
                .map((d) => ({ _id: d.id, ...d.data() }))
                .filter((doc) => matches(doc, query || {}));
            list = applySortToArray(list, state && state.sort);
            if (state && Number.isFinite(state.limit) && state.limit > 0) {
                list = list.slice(0, state.limit);
            }
            return list.map((doc) => FirebaseOrder.hydrate(doc, state));
        });
    }

    static findOne(query, projection) {
        return queryBuilder(async (state) => {
            const snap = await FirebaseOrder.collection().get();
            let list = snap.docs
                .map((d) => ({ _id: d.id, ...d.data() }))
                .filter((doc) => matches(doc, query || {}));
            list = applySortToArray(list, state && state.sort);
            const first = list.length ? list[0] : null;
            const localState = {
                ...state,
                select: state && state.select ? state.select : (projection || '')
            };
            return FirebaseOrder.hydrate(first, localState);
        });
    }

    static findById(id) {
        return queryBuilder(async (state) => {
            if (!id) return null;
            const snap = await FirebaseOrder.collection().doc(String(id)).get();
            if (!snap.exists) return null;
            return FirebaseOrder.hydrate({ _id: snap.id, ...snap.data() }, state);
        });
    }

    static async countDocuments(query) {
        const list = await FirebaseOrder.find(query || {}).lean();
        return Array.isArray(list) ? list.length : 0;
    }

    static async distinct(field) {
        const list = await FirebaseOrder.find({}).lean();
        const values = new Set();
        (Array.isArray(list) ? list : []).forEach((doc) => {
            if (doc && doc[field] !== undefined && doc[field] !== null && String(doc[field]).trim()) {
                values.add(String(doc[field]));
            }
        });
        return Array.from(values);
    }

    static async deleteOne(query) {
        const hit = await FirebaseOrder.findOne(query).lean();
        if (!hit || !hit._id) return { deletedCount: 0 };
        await FirebaseOrder.collection().doc(String(hit._id)).delete();
        return { deletedCount: 1 };
    }

    async save() {
        const payload = FirebaseOrder.makeDocument(this);
        if (this._id || this.id) {
            const id = String(this._id || this.id);
            await FirebaseOrder.collection().doc(id).set(payload, { merge: true });
            Object.assign(this, { _id: id, id, ...payload });
            return this;
        }
        const ref = await FirebaseOrder.collection().add(payload);
        Object.assign(this, { _id: ref.id, id: ref.id, ...payload });
        return this;
    }
}

class FirebasePost {
    static collection() {
        return getFirestore().collection('posts');
    }

    static findById(id) {
        return queryBuilder(async (state) => {
            if (!id) return null;
            const snap = await FirebasePost.collection().doc(String(id)).get();
            if (!snap.exists) return null;
            const doc = normalizeId({ _id: snap.id, ...snap.data() });
            const projected = applySelect(doc, state && state.select);
            return state && state.lean ? clone(projected) : projected;
        });
    }

    static async updateOne(filter, update) {
        const id = filter && filter._id ? String(filter._id) : '';
        if (!id) return { modifiedCount: 0 };

        const ref = FirebasePost.collection().doc(id);
        const snap = await ref.get();
        if (!snap.exists) return { modifiedCount: 0 };
        const current = snap.data() || {};

        if (filter && filter.stock_quantity && Object.prototype.hasOwnProperty.call(filter.stock_quantity, '$gte')) {
            const minRequired = Number(filter.stock_quantity.$gte || 0);
            const currentStock = Number(current.stock_quantity || 0);
            if (!(Number.isFinite(currentStock) && currentStock >= minRequired)) {
                return { modifiedCount: 0 };
            }
        }

        const setValues = clone((update && update.$set) || {});
        const incValues = clone((update && update.$inc) || {});
        const payload = { ...setValues };
        Object.entries(incValues).forEach(([key, value]) => {
            const next = Number(current[key] || 0) + Number(value || 0);
            payload[key] = next;
        });

        await ref.set(payload, { merge: true });
        return { modifiedCount: 1 };
    }
}

class FirebaseProduct {
    constructor(data = {}) {
        Object.assign(this, data);
    }

    static collection() {
        return getFirestore().collection('products');
    }

    static findById(id) {
        return queryBuilder(async () => {
            if (!id) return null;
            const snap = await FirebaseProduct.collection().doc(String(id)).get();
            if (!snap.exists) return null;
            return new FirebaseProduct(normalizeId({ _id: snap.id, ...snap.data() }));
        });
    }

    async save() {
        const id = String(this._id || this.id || '');
        if (!id) return this;
        await FirebaseProduct.collection().doc(id).set(clone(this), { merge: true });
        return this;
    }
}

class FirebaseNotification {
    static collection() {
        return getFirestore().collection('notifications');
    }

    static async create(data) {
        const payload = {
            ...clone(data || {}),
            timestamp: data && data.timestamp ? data.timestamp : nowIso()
        };
        const ref = await FirebaseNotification.collection().add(payload);
        return normalizeId({ _id: ref.id, ...payload });
    }

    static async insertMany(list) {
        const rows = Array.isArray(list) ? list : [];
        const out = [];
        for (const row of rows) {
            out.push(await FirebaseNotification.create(row));
        }
        return out;
    }
}

class FirebaseSiteSettings {
    static collection() {
        return getFirestore().collection('site_settings');
    }

    static findOne(query) {
        return queryBuilder(async (state) => {
            const key = query && query.key ? String(query.key) : '';
            if (key) {
                const snap = await FirebaseSiteSettings.collection().doc(key).get();
                if (!snap.exists) return null;
                const doc = normalizeId({ _id: snap.id, ...snap.data() });
                const projected = applySelect(doc, state && state.select);
                return state && state.lean ? clone(projected) : projected;
            }

            const all = await FirebaseSiteSettings.collection().get();
            const first = all.docs[0];
            if (!first) return null;
            const doc = normalizeId({ _id: first.id, ...first.data() });
            const projected = applySelect(doc, state && state.select);
            return state && state.lean ? clone(projected) : projected;
        });
    }
}

module.exports = {
    isFirebaseMode,
    FirebaseUser,
    FirebaseOTPCode,
    FirebaseUserDevice,
    FirebaseBlockedDevice,
    FirebaseUpload,
    FirebaseOrder,
    FirebasePost,
    FirebaseProduct,
    FirebaseNotification,
    FirebaseSiteSettings
};
