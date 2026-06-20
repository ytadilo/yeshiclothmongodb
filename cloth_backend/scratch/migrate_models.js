const fs = require('fs');
const path = require('path');

const backendDir = 'c:\\Users\\haile\\Documents\\firbase_fullstack\\myclothefullstack\\cloth_backend';
const modelsDir = path.join(backendDir, 'models');
const firebaseModelsPath = path.join(backendDir, 'utils', 'firebaseAuthModels.js');

// 1. Append missing Firebase classes to firebaseAuthModels.js
let firebaseModelsCode = fs.readFileSync(firebaseModelsPath, 'utf8');

const missingClasses = `
class FirebasePayment {
    constructor(data = {}) { Object.assign(this, data); }
    static collection() { return getFirestore().collection('payments'); }
    static makeDocument(data) {
        const src = data && typeof data === 'object' ? clone(data) : {};
        return {
            user_id: src.user_id ? String(src.user_id) : '',
            order_id: src.order_id ? String(src.order_id) : null,
            tx_ref: String(src.tx_ref || ''),
            chapa_transaction_id: String(src.chapa_transaction_id || ''),
            amount: Number(src.amount || 0),
            currency: String(src.currency || 'ETB'),
            customer_name: String(src.customer_name || ''),
            customer_email: String(src.customer_email || ''),
            customer_phone: String(src.customer_phone || ''),
            payment_method: String(src.payment_method || ''),
            payment_status: String(src.payment_status || 'pending'),
            verified: !!src.verified,
            created_at: src.created_at || nowIso(),
            updated_at: nowIso(),
            ...src
        };
    }
    static hydrate(doc, state) {
        if (!doc) return null;
        const projected = applySelect(normalizeId(doc), state && state.select);
        return state && state.lean ? clone(projected) : new FirebasePayment(projected);
    }
    static async create(data) {
        const payload = FirebasePayment.makeDocument(data);
        const ref = await FirebasePayment.collection().add(payload);
        return new FirebasePayment({ _id: ref.id, id: ref.id, ...payload });
    }
    static findOne(query) {
        return queryBuilder(async (state) => {
            const snap = await FirebasePayment.collection().get();
            const hit = snap.docs.map(d => ({ _id: d.id, ...d.data() })).find(doc => matches(doc, query || {}));
            return FirebasePayment.hydrate(hit, state);
        });
    }
    static find(query) {
        return queryBuilder(async (state) => {
            const snap = await FirebasePayment.collection().get();
            let list = snap.docs.map(d => ({ _id: d.id, ...d.data() })).filter(doc => matches(doc, query || {}));
            list = applySortToArray(list, state && state.sort);
            if (state && Number.isFinite(state.limit) && state.limit > 0) list = list.slice(0, state.limit);
            return list.map(doc => FirebasePayment.hydrate(doc, state));
        });
    }
    async save() {
        const payload = FirebasePayment.makeDocument(this);
        const id = String(this._id || this.id);
        if (id && id !== 'undefined') {
            await FirebasePayment.collection().doc(id).set(payload, { merge: true });
            Object.assign(this, { _id: id, id, ...payload });
        } else {
            const ref = await FirebasePayment.collection().add(payload);
            Object.assign(this, { _id: ref.id, id: ref.id, ...payload });
        }
        return this;
    }
}

class FirebaseAnalyticsUserSummary {
    constructor(data = {}) { Object.assign(this, data); }
    static collection() { return getFirestore().collection('analytics_user_summaries'); }
    static hydrate(doc, state) { return state && state.lean ? clone(doc) : new FirebaseAnalyticsUserSummary(doc); }
    static findOne(query) {
        return queryBuilder(async (state) => {
            const snap = await FirebaseAnalyticsUserSummary.collection().get();
            const hit = snap.docs.map(d => ({ _id: d.id, ...d.data() })).find(doc => matches(doc, query || {}));
            return hit ? FirebaseAnalyticsUserSummary.hydrate(hit, state) : null;
        });
    }
    static async findOneAndUpdate(filter, update, options) {
        let doc = await FirebaseAnalyticsUserSummary.findOne(filter).then(r => r);
        if (!doc) {
            const payload = { ...filter, ...(update.$setOnInsert || {}), ...(update.$set || {}) };
            const ref = await FirebaseAnalyticsUserSummary.collection().add(payload);
            return { _id: ref.id, ...payload };
        } else {
            const payload = { ...doc, ...(update.$set || {}) };
            await FirebaseAnalyticsUserSummary.collection().doc(String(doc._id)).set(payload, { merge: true });
            return payload;
        }
    }
}

class FirebaseAuditLog {
    constructor(data = {}) { Object.assign(this, data); }
    static collection() { return getFirestore().collection('audit_logs'); }
    static hydrate(doc, state) { return state && state.lean ? clone(doc) : new FirebaseAuditLog(doc); }
    static async create(data) {
        const ref = await FirebaseAuditLog.collection().add({ ...data, timestamp: nowIso() });
        return new FirebaseAuditLog({ _id: ref.id, id: ref.id, ...data });
    }
    static find(query) {
        return queryBuilder(async (state) => {
            const snap = await FirebaseAuditLog.collection().get();
            let list = snap.docs.map(d => ({ _id: d.id, ...d.data() })).filter(doc => matches(doc, query || {}));
            list = applySortToArray(list, state && state.sort);
            if (state && Number.isFinite(state.limit) && state.limit > 0) list = list.slice(0, state.limit);
            return list.map(doc => FirebaseAuditLog.hydrate(doc, state));
        });
    }
}
`;

if (!firebaseModelsCode.includes('class FirebasePayment')) {
    // Insert classes before module.exports
    firebaseModelsCode = firebaseModelsCode.replace('module.exports = {', missingClasses + '\\nmodule.exports = {\\n    FirebasePayment,\\n    FirebaseAnalyticsUserSummary,\\n    FirebaseAuditLog,');
    fs.writeFileSync(firebaseModelsPath, firebaseModelsCode, 'utf8');
    console.log('Added missing Firebase classes to firebaseAuthModels.js');
}

// 2. Rewrite all model files
const modelFiles = fs.readdirSync(modelsDir).filter(f => f.endsWith('.js'));

for (const file of modelFiles) {
    const modelName = file.replace('.js', '');
    const firebaseClassName = 'Firebase' + modelName;
    
    const content = "const { " + firebaseClassName + " } = require('../utils/firebaseAuthModels');\n\nmodule.exports = " + firebaseClassName + ";\n";
    
    fs.writeFileSync(path.join(modelsDir, file), content, 'utf8');
    console.log('Rewrote ' + file);
}
