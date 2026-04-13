const mongoose = require('mongoose');
const Job = require('../models/Job');
const Offer = require('../models/Offer');
const ChatMessage = require('../models/ChatMessage');
const Notification = require('../models/Notification');
const AuditLog = require('../models/AuditLog');
const User = require('../models/User');
const Order = require('../models/Order');
const Upload = require('../models/Upload');
const Post = require('../models/Post');
const { subscribe, unsubscribe, pushEvent } = require('../utils/realtime');

function isAdmin(req) {
    return req.user && req.user.role === 'admin';
}

async function writeAudit(actorId, action, entityType, entityId, metadata) {
    try {
        await AuditLog.create({
            actor_id: actorId || null,
            action,
            entity_type: entityType,
            entity_id: String(entityId || ''),
            metadata: metadata || {}
        });
    } catch (_) {
        // no-op
    }
}

async function createNotification(userId, type, title, body, referenceId) {
    const doc = await Notification.create({
        user_id: userId,
        type,
        title,
        body,
        reference_id: String(referenceId || ''),
        is_read: false
    });

    pushEvent(userId, 'notification', {
        _id: doc._id,
        type: doc.type,
        title: doc.title,
        body: doc.body,
        reference_id: doc.reference_id,
        is_read: doc.is_read,
        timestamp: doc.timestamp
    });

    return doc;
}

function jobVisibleToUser(job, user) {
    if (!job || !user) return false;
    const uid = String(user.id);

    if (user.role === 'admin') return true;
    if (user.role === 'employee') {
        return String(job.work_type || 'employee') === 'employee' && (
            String(job.status) === 'EMPLOYEE_NEGOTIATION' || String(job.assigned_employee || '') === uid
        );
    }
    if (user.role === 'driver') {
        return String(job.work_type || 'employee') === 'delivery' && (
            String(job.status) === 'DRIVER_NEGOTIATION' || String(job.assigned_driver || '') === uid
        );
    }
    return String(job.created_by_user || '') === uid;
}

function parseOrderSyncPayload(raw) {
    if (!raw) return {};
    if (typeof raw === 'object' && raw !== null) return raw;
    if (typeof raw !== 'string') return {};
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
        return {};
    }
}

function sanitizeOrderSnapshotForRole(snapshot, role) {
    const src = snapshot && typeof snapshot === 'object' ? snapshot : {};
    if (role === 'admin') return src;

    if (role === 'employee') {
        return {
            cloth_details: src.cloth_details || {},
            measurements: src.measurements || {},
            reference_images: Array.isArray(src.reference_images) ? src.reference_images : []
        };
    }

    if (role === 'driver') {
        return {
            delivery_method: src.delivery_method || '',
            customer_info: {
                region: src?.customer_info?.region || '',
                city: src?.customer_info?.city || '',
                address: src?.customer_info?.address || ''
            }
        };
    }

    return {};
}

function sanitizeJobForUser(job, user) {
    if (!job) return null;
    const data = {
        _id: job._id,
        work_type: job.work_type || 'employee',
        title: job.title,
        description: job.description,
        status: job.status,
        assigned_employee: job.assigned_employee,
        assigned_driver: job.assigned_driver,
        production_info_shared: !!job.production_info_shared,
        delivery_info_shared: !!job.delivery_info_shared,
        production_images: Array.isArray(job.production_images) ? job.production_images : [],
        job_images: Array.isArray(job.job_images) ? job.job_images : [],
        production_notes: job.production_notes || '',
        order_snapshot: sanitizeOrderSnapshotForRole(job.order_snapshot || {}, user?.role || ''),
        delivery_status: job.delivery_status,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt
    };

    if (!user || user.role === 'admin') {
        data.created_by_user = job.created_by_user;
        data.order_id = job.order_id;
        data.source_post_id = job.source_post_id || null;
        data.pickup_location = job.pickup_location || {};
        data.customer_location = job.customer_location || {};
        return data;
    }

    const uid = String(user.id);

    if (user.role === 'employee') {
        const isAssigned = String(job.assigned_employee || '') === uid;
        if (isAssigned && job.production_info_shared) {
            data.pickup_location = job.pickup_location || {};
            data.customer_location = job.customer_location || {};
        }
        return data;
    }

    if (user.role === 'driver') {
        const isAssigned = String(job.assigned_driver || '') === uid;
        if (isAssigned && job.delivery_info_shared) {
            data.pickup_location = job.pickup_location || {};
            data.customer_location = job.customer_location || {};
        }
        return data;
    }

    if (String(job.created_by_user || '') === uid) {
        // customer only sees own destination summary
        data.customer_location = job.customer_location || {};
    }

    return data;
}

exports.createJob = async (req, res) => {
    try {
        if (!isAdmin(req)) return res.status(403).json({ msg: 'Access denied' });

        const title = String(req.body.title || '').trim();
        const description = String(req.body.description || '').trim();
        const orderId = String(req.body.order_id || '').trim();
        const postId = String(req.body.post_id || '').trim();
        const workTypeRaw = String(req.body.work_type || '').trim().toLowerCase();
        const workType = workTypeRaw === 'delivery' ? 'delivery' : 'employee';

        let sourcePost = null;
        if (postId && mongoose.isValidObjectId(postId)) {
            sourcePost = await Post.findById(postId).select('title description').lean();
            if (!sourcePost) {
                return res.status(400).json({ msg: 'Post not found for the provided post_id' });
            }
        }

        const finalTitle = title || String(sourcePost?.title || '').trim();
        const finalDescription = description || String(sourcePost?.description || '').trim();

        if (!finalTitle) return res.status(400).json({ msg: 'Title is required (or provide valid post_id)' });

        const payload = {
            work_type: workType,
            title: finalTitle,
            description: finalDescription,
            created_by_admin: req.user.id,
            status: workType === 'delivery' ? 'DRIVER_NEGOTIATION' : 'EMPLOYEE_NEGOTIATION'
        };

        if (sourcePost) {
            payload.source_post_id = sourcePost._id;
        }

        if (orderId && mongoose.isValidObjectId(orderId)) {
            const order = await Order.findById(orderId)
                .select('user_id customer_info cloth_details measurements reference_images delivery_method')
                .lean();
            if (order) {
                payload.order_id = orderId;
                payload.created_by_user = order.user_id || null;
                payload.customer_location = {
                    region: order?.customer_info?.region || '',
                    city: order?.customer_info?.city || '',
                    address: order?.customer_info?.address || ''
                };

                const orderSync = parseOrderSyncPayload(req.body.order_sync);
                const mergedSnapshot = {
                    customer_info: {
                        ...(order.customer_info || {}),
                        ...((orderSync.customer_info && typeof orderSync.customer_info === 'object') ? orderSync.customer_info : {})
                    },
                    cloth_details: {
                        ...(order.cloth_details || {}),
                        ...((orderSync.cloth_details && typeof orderSync.cloth_details === 'object') ? orderSync.cloth_details : {})
                    },
                    measurements: {
                        ...(order.measurements || {}),
                        ...((orderSync.measurements && typeof orderSync.measurements === 'object') ? orderSync.measurements : {})
                    },
                    delivery_method: orderSync.delivery_method || order.delivery_method || '',
                    reference_images: Array.isArray(orderSync.reference_images)
                        ? orderSync.reference_images.filter((v) => typeof v === 'string' && v.trim())
                        : (Array.isArray(order.reference_images) ? order.reference_images : [])
                };

                payload.order_snapshot = mergedSnapshot;
                payload.job_images = Array.isArray(mergedSnapshot.reference_images) ? mergedSnapshot.reference_images : [];
            }
        }

        const job = await Job.create(payload);

        const targetRole = workType === 'delivery' ? 'driver' : 'employee';
        const workers = await User.find({ role: targetRole, approval_status: 'APPROVED', status: 'active' })
            .select('_id')
            .lean();

        await Promise.all(
            workers.map((u) =>
                createNotification(u._id, 'status_update', 'New job available', finalTitle, job._id)
            )
        );

        await writeAudit(req.user.id, 'JOB_CREATED', 'job', job._id, {
            title: finalTitle,
            orderId: payload.order_id || null,
            source_post_id: payload.source_post_id || null,
            work_type: payload.work_type
        });

        return res.json({ msg: 'Job created', job: sanitizeJobForUser(job.toObject(), req.user) });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: 'Server error' });
    }
};

exports.updateJob = async (req, res) => {
    try {
        if (!isAdmin(req)) return res.status(403).json({ msg: 'Access denied' });

        const jobId = String(req.params.jobId || '').trim();
        if (!mongoose.isValidObjectId(jobId)) return res.status(400).json({ msg: 'Invalid job id' });

        const job = await Job.findById(jobId);
        if (!job) return res.status(404).json({ msg: 'Job not found' });

        const title = String(req.body.title || '').trim();
        const description = String(req.body.description || '').trim();
        const postId = String(req.body.post_id || '').trim();
        const orderSync = parseOrderSyncPayload(req.body.order_sync);

        if (title) job.title = title;
        if (description || req.body.description === '') job.description = description;

        if (postId) {
            if (!mongoose.isValidObjectId(postId)) {
                return res.status(400).json({ msg: 'Invalid post_id' });
            }
            const sourcePost = await Post.findById(postId).select('title description').lean();
            if (!sourcePost) return res.status(400).json({ msg: 'Post not found for post_id' });
            job.source_post_id = sourcePost._id;
            if (!title) job.title = String(sourcePost.title || job.title || '').trim();
            if (!description) job.description = String(sourcePost.description || job.description || '').trim();
        }

        if (job.order_id) {
            const order = await Order.findById(job.order_id)
                .select('customer_info cloth_details measurements reference_images delivery_method')
                .lean();

            const baseSnapshot = (job.order_snapshot && typeof job.order_snapshot === 'object' && Object.keys(job.order_snapshot).length)
                ? job.order_snapshot
                : {
                    customer_info: order?.customer_info || {},
                    cloth_details: order?.cloth_details || {},
                    measurements: order?.measurements || {},
                    reference_images: Array.isArray(order?.reference_images) ? order.reference_images : [],
                    delivery_method: order?.delivery_method || ''
                };

            if (Object.keys(orderSync).length) {
                job.order_snapshot = {
                    customer_info: {
                        ...(baseSnapshot.customer_info || {}),
                        ...((orderSync.customer_info && typeof orderSync.customer_info === 'object') ? orderSync.customer_info : {})
                    },
                    cloth_details: {
                        ...(baseSnapshot.cloth_details || {}),
                        ...((orderSync.cloth_details && typeof orderSync.cloth_details === 'object') ? orderSync.cloth_details : {})
                    },
                    measurements: {
                        ...(baseSnapshot.measurements || {}),
                        ...((orderSync.measurements && typeof orderSync.measurements === 'object') ? orderSync.measurements : {})
                    },
                    delivery_method: orderSync.delivery_method || baseSnapshot.delivery_method || '',
                    reference_images: Array.isArray(orderSync.reference_images)
                        ? orderSync.reference_images.filter((v) => typeof v === 'string' && v.trim())
                        : (Array.isArray(baseSnapshot.reference_images) ? baseSnapshot.reference_images : [])
                };

                if (Array.isArray(job.order_snapshot.reference_images)) {
                    job.job_images = job.order_snapshot.reference_images;
                }
            }
        }

        job.updatedAt = new Date();
        await job.save();

        await writeAudit(req.user.id, 'JOB_UPDATED', 'job', job._id, {
            title: job.title,
            source_post_id: job.source_post_id || null,
            synced_order: !!job.order_id
        });

        return res.json({ msg: 'Job updated', job: sanitizeJobForUser(job.toObject(), req.user) });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: 'Server error' });
    }
};

exports.listJobs = async (req, res) => {
    try {
        const role = req.user.role;
        const uid = req.user.id;

        let query = {};
        if (role === 'employee') {
            query = {
                work_type: 'employee',
                $or: [{ status: 'EMPLOYEE_NEGOTIATION' }, { assigned_employee: uid }]
            };
        } else if (role === 'driver') {
            query = {
                work_type: 'delivery',
                $or: [{ status: 'DRIVER_NEGOTIATION' }, { assigned_driver: uid }]
            };
        } else if (role === 'customer') {
            query = { created_by_user: uid };
        }

        const jobs = await Job.find(query).sort({ createdAt: -1 }).lean();
        return res.json(jobs.filter((j) => jobVisibleToUser(j, req.user)).map((j) => sanitizeJobForUser(j, req.user)));
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: 'Server error' });
    }
};

exports.submitOffer = async (req, res) => {
    try {
        if (!(req.user.role === 'employee' || req.user.role === 'driver')) {
            return res.status(403).json({ msg: 'Only employee/driver can submit offers' });
        }

        const jobId = String(req.params.jobId || '').trim();
        const offeredPrice = Number(req.body.offered_price);
        const message = String(req.body.message || '').trim();

        if (!mongoose.isValidObjectId(jobId)) return res.status(400).json({ msg: 'Invalid job id' });
        if (!Number.isFinite(offeredPrice) || offeredPrice < 0) {
            return res.status(400).json({ msg: 'Invalid offered price' });
        }

        const job = await Job.findById(jobId);
        if (!job) return res.status(404).json({ msg: 'Job not found' });

        if (req.user.role === 'employee' && !['EMPLOYEE_NEGOTIATION', 'EMPLOYEE_ASSIGNED'].includes(job.status)) {
            return res.status(400).json({ msg: 'Employee negotiation is closed for this job' });
        }
        if (req.user.role === 'employee' && String(job.work_type || 'employee') !== 'employee') {
            return res.status(403).json({ msg: 'Employees can only offer on employee work' });
        }
        if (req.user.role === 'driver' && !['DRIVER_NEGOTIATION', 'DRIVER_ASSIGNED'].includes(job.status)) {
            return res.status(400).json({ msg: 'Driver negotiation is closed for this job' });
        }
        if (req.user.role === 'driver' && String(job.work_type || 'employee') !== 'delivery') {
            return res.status(403).json({ msg: 'Drivers can only offer on delivery work' });
        }

        const worker = await User.findById(req.user.id).select('has_required_tools worker_rating').lean();

        const offer = await Offer.create({
            job_id: jobId,
            worker_id: req.user.id,
            worker_role: req.user.role,
            offered_price: offeredPrice,
            message,
            has_required_tools: !!worker?.has_required_tools,
            worker_rating: Number(worker?.worker_rating || 0)
        });

        await createNotification(job.created_by_admin, 'status_update', 'New offer submitted', `${req.user.role} sent offer ${offeredPrice}`, job._id);
        await writeAudit(req.user.id, 'OFFER_SUBMITTED', 'offer', offer._id, { jobId, offeredPrice, role: req.user.role });

        return res.json({ msg: 'Offer submitted', offer });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: 'Server error' });
    }
};

exports.listOffers = async (req, res) => {
    try {
        const jobId = String(req.params.jobId || '').trim();
        if (!mongoose.isValidObjectId(jobId)) return res.status(400).json({ msg: 'Invalid job id' });

        const job = await Job.findById(jobId).lean();
        if (!job) return res.status(404).json({ msg: 'Job not found' });

        if (!jobVisibleToUser(job, req.user)) {
            return res.status(403).json({ msg: 'Access denied' });
        }

        let query = { job_id: jobId };
        if (req.user.role !== 'admin') {
            query.worker_id = req.user.id;
        }

        const offers = await Offer.find(query)
            .populate('worker_id', 'fullName role has_required_tools')
            .sort({ timestamp: -1 })
            .lean();

        return res.json(offers);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: 'Server error' });
    }
};

exports.compareOffers = async (req, res) => {
    try {
        if (!isAdmin(req)) return res.status(403).json({ msg: 'Access denied' });

        const jobId = String(req.params.jobId || '').trim();
        const role = String(req.query.role || '').trim();
        if (!mongoose.isValidObjectId(jobId)) return res.status(400).json({ msg: 'Invalid job id' });

        const roleFilter = role && ['employee', 'driver'].includes(role) ? { worker_role: role } : {};
        const offers = await Offer.find({ job_id: jobId, ...roleFilter })
            .populate('worker_id', 'fullName has_required_tools')
            .sort({ offered_price: 1, timestamp: 1 })
            .lean();

        const prices = offers.map((o) => Number(o.offered_price)).filter((v) => Number.isFinite(v));
        const avgPrice = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
        const lowestPrice = prices.length ? Math.min(...prices) : 0;

        const rows = offers.map((o) => ({
            _id: o._id,
            worker_id: o.worker_id?._id || o.worker_id,
            worker_name: o.worker_id?.fullName || 'Worker',
            worker_role: o.worker_role,
            offered_price: o.offered_price,
            message: o.message,
            has_required_tools: o.has_required_tools,
            worker_rating: o.worker_rating || 0,
            timestamp: o.timestamp,
            is_best_price: Number(o.offered_price) === lowestPrice
        }));

        return res.json({
            rows,
            summary: {
                count: rows.length,
                average_price: Number(avgPrice.toFixed(2)),
                lowest_price: lowestPrice
            }
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: 'Server error' });
    }
};

exports.assignEmployee = async (req, res) => {
    try {
        if (!isAdmin(req)) return res.status(403).json({ msg: 'Access denied' });
        const jobId = String(req.params.jobId || '').trim();
        const employeeId = String(req.body.employee_id || '').trim();
        if (!mongoose.isValidObjectId(jobId) || !mongoose.isValidObjectId(employeeId)) {
            return res.status(400).json({ msg: 'Invalid ids' });
        }

        const employee = await User.findOne({ _id: employeeId, role: 'employee', approval_status: 'APPROVED', status: 'active' }).select('_id');
        if (!employee) return res.status(400).json({ msg: 'Employee not eligible' });

        const job = await Job.findById(jobId);
        if (!job) return res.status(404).json({ msg: 'Job not found' });

        job.assigned_employee = employeeId;
        job.work_type = 'employee';
        job.production_info_shared = true;
        job.status = 'EMPLOYEE_ASSIGNED';
        job.updatedAt = new Date();
        await job.save();

        await createNotification(employeeId, 'status_update', 'You were assigned a job', job.title, job._id);
        await writeAudit(req.user.id, 'EMPLOYEE_ASSIGNED', 'job', job._id, { employeeId });

        return res.json({ msg: 'Employee assigned', job: sanitizeJobForUser(job.toObject(), req.user) });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: 'Server error' });
    }
};

exports.markProductionReady = async (req, res) => {
    try {
        if (!isAdmin(req)) return res.status(403).json({ msg: 'Access denied' });
        const jobId = String(req.params.jobId || '').trim();
        if (!mongoose.isValidObjectId(jobId)) return res.status(400).json({ msg: 'Invalid job id' });

        const job = await Job.findById(jobId);
        if (!job) return res.status(404).json({ msg: 'Job not found' });

        job.status = 'DRIVER_NEGOTIATION';
        job.work_type = 'delivery';
        job.updatedAt = new Date();
        await job.save();

        const drivers = await User.find({ role: 'driver', approval_status: 'APPROVED', status: 'active' }).select('_id').lean();
        await Promise.all(drivers.map((d) => createNotification(d._id, 'status_update', 'New delivery request', job.title, job._id)));

        await writeAudit(req.user.id, 'PRODUCTION_READY', 'job', job._id, {});
        return res.json({ msg: 'Job moved to driver negotiation', job: sanitizeJobForUser(job.toObject(), req.user) });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: 'Server error' });
    }
};

exports.assignDriver = async (req, res) => {
    try {
        if (!isAdmin(req)) return res.status(403).json({ msg: 'Access denied' });
        const jobId = String(req.params.jobId || '').trim();
        const driverId = String(req.body.driver_id || '').trim();
        if (!mongoose.isValidObjectId(jobId) || !mongoose.isValidObjectId(driverId)) {
            return res.status(400).json({ msg: 'Invalid ids' });
        }

        const driver = await User.findOne({ _id: driverId, role: 'driver', approval_status: 'APPROVED', status: 'active' }).select('_id');
        if (!driver) return res.status(400).json({ msg: 'Driver not eligible' });

        const job = await Job.findById(jobId);
        if (!job) return res.status(404).json({ msg: 'Job not found' });

        job.assigned_driver = driverId;
        job.work_type = 'delivery';
        job.delivery_info_shared = true;
        job.status = 'DRIVER_ASSIGNED';
        job.updatedAt = new Date();
        await job.save();

        await createNotification(driverId, 'status_update', 'Delivery assigned to you', job.title, job._id);
        if (job.created_by_user) {
            await createNotification(job.created_by_user, 'status_update', 'Driver assigned for your order', job.title, job._id);
        }
        await writeAudit(req.user.id, 'DRIVER_ASSIGNED', 'job', job._id, { driverId });

        return res.json({ msg: 'Driver assigned', job: sanitizeJobForUser(job.toObject(), req.user) });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: 'Server error' });
    }
};

exports.updateDeliveryStatus = async (req, res) => {
    try {
        if (!(req.user.role === 'driver' || req.user.role === 'admin')) {
            return res.status(403).json({ msg: 'Access denied' });
        }

        const jobId = String(req.params.jobId || '').trim();
        const status = String(req.body.delivery_status || '').trim().toUpperCase();
        if (!mongoose.isValidObjectId(jobId)) return res.status(400).json({ msg: 'Invalid job id' });
        if (!['IN_PROGRESS', 'COMPLETED', 'DELAYED'].includes(status)) {
            return res.status(400).json({ msg: 'Invalid delivery status' });
        }

        const job = await Job.findById(jobId);
        if (!job) return res.status(404).json({ msg: 'Job not found' });

        if (req.user.role === 'driver' && String(job.assigned_driver || '') !== String(req.user.id)) {
            return res.status(403).json({ msg: 'Not assigned to this delivery' });
        }

        job.delivery_status = status;
        if (status === 'IN_PROGRESS') {
            job.status = 'DELIVERY_IN_PROGRESS';
        } else if (status === 'COMPLETED') {
            job.status = 'COMPLETED';
        }
        job.updatedAt = new Date();
        await job.save();

        await createNotification(job.created_by_admin, 'status_update', 'Delivery status updated', `${job.title}: ${status}`, job._id);
        if (job.created_by_user) {
            await createNotification(job.created_by_user, 'status_update', 'Delivery status updated', `${job.title}: ${status}`, job._id);
        }
        await writeAudit(req.user.id, 'DELIVERY_STATUS_UPDATED', 'job', job._id, { delivery_status: status });

        return res.json({ msg: 'Delivery status updated', job: sanitizeJobForUser(job.toObject(), req.user) });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: 'Server error' });
    }
};

exports.uploadProductionImages = async (req, res) => {
    try {
        if (!isAdmin(req)) return res.status(403).json({ msg: 'Access denied' });

        const jobId = String(req.params.jobId || '').trim();
        if (!mongoose.isValidObjectId(jobId)) return res.status(400).json({ msg: 'Invalid job id' });

        const job = await Job.findById(jobId);
        if (!job) return res.status(404).json({ msg: 'Job not found' });

        const files = Array.isArray(req.files) ? req.files.filter((f) => f && f.buffer) : [];
        if (!files.length) return res.status(400).json({ msg: 'No files uploaded' });

        const uploadDocs = await Upload.insertMany(
            files.map((f) => ({
                originalName: f.originalname,
                mimeType: f.mimetype,
                size: f.size,
                data: f.buffer,
                visibility: 'private',
                owner_user_id: req.user.id,
                purpose: 'job_production_image'
            }))
        );

        const urls = uploadDocs.map((u) => `/api/uploads/${u._id}`);
        job.production_images = [...(job.production_images || []), ...urls];
        job.updatedAt = new Date();
        await job.save();

        if (job.assigned_employee) {
            await createNotification(job.assigned_employee, 'status_update', 'New production images uploaded', job.title, job._id);
        }

        await writeAudit(req.user.id, 'PRODUCTION_IMAGE_UPLOADED', 'job', job._id, { count: urls.length });
        return res.json({ msg: 'Uploaded', images: urls, job: sanitizeJobForUser(job.toObject(), req.user) });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: 'Server error' });
    }
};

exports.sendMessage = async (req, res) => {
    try {
        const sender = await User.findById(req.user.id).select('role blocked_status status isBanned');
        if (!sender) return res.status(401).json({ msg: 'User not found' });

        if (!isAdmin(req) && sender.blocked_status) {
            return res.status(403).json({ msg: 'Messaging is blocked for your account' });
        }

        const receiverId = String(req.body.receiver_id || '').trim();
        const text = String(req.body.message || '').trim();
        const jobId = String(req.body.job_id || '').trim();
        const deliveryId = String(req.body.delivery_id || '').trim();
        const replyTo = req.body.reply_to && mongoose.isValidObjectId(req.body.reply_to) ? req.body.reply_to : null;

        if (!mongoose.isValidObjectId(receiverId)) return res.status(400).json({ msg: 'Invalid receiver' });
        if (!text) return res.status(400).json({ msg: 'Message is required' });

        const receiver = await User.findById(receiverId).select('role');
        if (!receiver) return res.status(404).json({ msg: 'Receiver not found' });

        if (!isAdmin(req)) {
            if (receiver.role !== 'admin') {
                return res.status(403).json({ msg: 'Only admin chat is allowed for this account' });
            }
        }

        if (jobId && mongoose.isValidObjectId(jobId)) {
            const job = await Job.findById(jobId).lean();
            if (!job || !jobVisibleToUser(job, req.user)) {
                return res.status(403).json({ msg: 'No access to this job chat' });
            }
        }

        const message = await ChatMessage.create({
            sender_id: req.user.id,
            receiver_id: receiverId,
            job_id: mongoose.isValidObjectId(jobId) ? jobId : null,
            delivery_id: mongoose.isValidObjectId(deliveryId) ? deliveryId : null,
            message: text,
            reply_to: replyTo
        });

        const senderName = String(sender?.fullName || sender?.email || 'User').trim();
        const notificationPreview = String(text || '').trim() || 'Sent an attachment';
        await createNotification(
            receiverId,
            'message',
            req.user.role === 'admin' ? 'New admin message' : 'New customer message',
            `${senderName}: ${notificationPreview}`.slice(0, 240),
            message._id
        );
        await writeAudit(req.user.id, 'CHAT_MESSAGE_SENT', 'chat', message._id, { receiverId, jobId: jobId || null, deliveryId: deliveryId || null, replyTo });

        return res.json({ msg: 'Sent', message });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: 'Server error' });
    }
};

exports.uploadChatAttachment = async (req, res) => {
    try {
        const sender = await User.findById(req.user.id).select('role blocked_status status isBanned');
        if (!sender) return res.status(401).json({ msg: 'User not found' });

        if (!isAdmin(req) && sender.blocked_status) {
            return res.status(403).json({ msg: 'Messaging is blocked for your account' });
        }

        if (!req.file || !req.file.buffer) {
            return res.status(400).json({ msg: 'Missing file' });
        }

        const doc = await Upload.create({
            originalName: req.file.originalname || 'attachment',
            mimeType: req.file.mimetype || 'application/octet-stream',
            size: Number(req.file.size || 0),
            data: req.file.buffer,
            visibility: 'private',
            owner_user_id: req.user.id,
            purpose: 'chat_attachment'
        });

        return res.json({
            id: doc._id,
            url: '/api/uploads/' + doc._id,
            name: doc.originalName,
            size: doc.size,
            mimeType: doc.mimeType
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: 'Server error' });
    }
};

exports.listChatContacts = async (req, res) => {
    try {
        if (isAdmin(req)) {
            // Return only customers (exclude admin, driver, employee)
            const users = await User.find({
                role: 'customer',
                status: { $ne: 'banned' },
                isBanned: { $ne: true }
            })
            .select('fullName email phone age sex profileImage role status approval_status blocked_status createdAt')
            .sort({ createdAt: -1 })
            .lean();
            return res.json(users.map((user) => ({
                _id: user._id,
                fullName: user.fullName,
                email: user.email || '',
                phone: user.phone || '',
                age: user.age ?? null,
                sex: user.sex || '',
                profileImage: user.profileImage || '',
                role: user.role,
                status: user.status || 'active',
                approval_status: user.approval_status || 'APPROVED',
                blocked_status: !!user.blocked_status
            })));
        }

        const adminFilter = {
            role: 'admin',
            isBanned: { $ne: true },
            $or: [
                { status: 'active' },
                { status: { $exists: false } },
                { status: null },
                { status: '' }
            ]
        };

        const admins = await User.find(adminFilter)
            .select('fullName role')
            .sort({ createdAt: 1 })
            .lean();

        return res.json(admins.map((admin) => ({
            _id: admin._id,
            fullName: admin.fullName,
            role: admin.role
        })));
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: 'Server error' });
    }
};

exports.listMessages = async (req, res) => {
    try {
        const jobId = String(req.query.job_id || '').trim();
        const deliveryId = String(req.query.delivery_id || '').trim();
        const otherId = String(req.query.other_user_id || '').trim();

        const query = {};
        if (mongoose.isValidObjectId(jobId)) query.job_id = jobId;
        if (mongoose.isValidObjectId(deliveryId)) query.delivery_id = deliveryId;

        if (!isAdmin(req)) {
            // User: only allow chat with admin(s), and only see their own messages
            const adminFilter = {
                role: 'admin',
                isBanned: { $ne: true },
                $or: [
                    { status: 'active' },
                    { status: { $exists: false } },
                    { status: null },
                    { status: '' }
                ]
            };
            const adminDocs = await User.find(adminFilter).select('_id').lean();
            const adminIds = adminDocs.map((admin) => String(admin._id));
            if (!adminIds.length) return res.json([]);
            // Only allow messages with admin(s)
            if (mongoose.isValidObjectId(otherId) && adminIds.includes(otherId)) {
                query.$or = [
                    { sender_id: req.user.id, receiver_id: otherId },
                    { sender_id: otherId, receiver_id: req.user.id }
                ];
            } else {
                // Default: show all messages between user and any admin
                query.$or = [
                    { sender_id: req.user.id, receiver_id: { $in: adminIds } },
                    { sender_id: { $in: adminIds }, receiver_id: req.user.id }
                ];
            }
        } else if (isAdmin(req) && mongoose.isValidObjectId(otherId)) {
            // Admin: see chat with any user (otherId)
            query.$or = [
                { sender_id: req.user.id, receiver_id: otherId },
                { sender_id: otherId, receiver_id: req.user.id }
            ];
        }

        // Find messages
        const messages = await ChatMessage.find(query)
            .populate('sender_id', 'fullName email profileImage role')
            .populate('receiver_id', 'fullName email profileImage role')
            .populate('reply_to')
            .sort({ timestamp: 1 })
            .limit(400)
            .lean();

        // Mark as seen all messages received by the current user that are not yet seen
        const unseenIds = messages
            .filter(m => String(m.receiver_id?._id || m.receiver_id) === String(req.user.id) && !m.seen)
            .map(m => m._id);
        if (unseenIds.length) {
            await ChatMessage.updateMany(
                { _id: { $in: unseenIds } },
                { $set: { seen: true, seen_at: new Date() } }
            );
        }

        // If any messages were updated, reload them to return updated seen status
        if (unseenIds.length) {
            const updatedMessages = await ChatMessage.find(query)
                .populate('sender_id', 'fullName email profileImage role')
                .populate('receiver_id', 'fullName email profileImage role')
                .populate('reply_to')
                .sort({ timestamp: 1 })
                .limit(400)
                .lean();
            return res.json(updatedMessages);
        }

        return res.json(messages);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: 'Server error' });
    }
};

exports.blockMessaging = async (req, res) => {
    try {
        if (!isAdmin(req)) return res.status(403).json({ msg: 'Access denied' });
        const userId = String(req.params.userId || '').trim();
        const blocked = !!req.body.blocked_status;
        if (!mongoose.isValidObjectId(userId)) return res.status(400).json({ msg: 'Invalid user id' });

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ msg: 'User not found' });

        user.blocked_status = blocked;
        await user.save();

        await writeAudit(req.user.id, blocked ? 'MESSAGING_BLOCKED' : 'MESSAGING_UNBLOCKED', 'user', userId, {});
        return res.json({ msg: blocked ? 'Messaging blocked' : 'Messaging unblocked' });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: 'Server error' });
    }
};

exports.getNotifications = async (req, res) => {
    try {
        const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
        const list = await Notification.find({ user_id: req.user.id })
            .sort({ timestamp: -1 })
            .limit(limit)
            .lean();
        return res.json(list);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: 'Server error' });
    }
};

exports.getUnreadCount = async (req, res) => {
    try {
        const count = await Notification.countDocuments({ user_id: req.user.id, is_read: false });
        return res.json({ unread: count });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: 'Server error' });
    }
};

exports.getUnreadCounts = async (req, res) => {
    try {
        const userId = String(req.user.id || '');
        if (!userId) {
            return res.status(401).json({ msg: 'Unauthorized' });
        }

        let unreadMessagesQuery = {
            receiver_id: userId,
            seen: false
        };

        if (!isAdmin(req)) {
            const adminFilter = {
                role: 'admin',
                isBanned: { $ne: true },
                $or: [
                    { status: 'active' },
                    { status: { $exists: false } },
                    { status: null },
                    { status: '' }
                ]
            };
            const adminDocs = await User.find(adminFilter).select('_id').lean();
            const adminIds = adminDocs.map((admin) => String(admin._id));

            if (!adminIds.length) {
                unreadMessagesQuery = { _id: null };
            } else {
                unreadMessagesQuery.sender_id = { $in: adminIds };
            }
        }

        const [unreadMessages, unreadNotifications] = await Promise.all([
            ChatMessage.countDocuments(unreadMessagesQuery),
            Notification.countDocuments({ user_id: userId, is_read: false })
        ]);

        return res.json({
            unreadMessages: Number(unreadMessages) || 0,
            unreadNotifications: Number(unreadNotifications) || 0
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: 'Server error' });
    }
};

exports.markNotificationRead = async (req, res) => {
    try {
        const id = String(req.params.id || '').trim();
        if (!mongoose.isValidObjectId(id)) return res.status(400).json({ msg: 'Invalid notification id' });
        const doc = await Notification.findOneAndUpdate(
            { _id: id, user_id: req.user.id },
            { $set: { is_read: true } },
            { new: true }
        );
        if (!doc) return res.status(404).json({ msg: 'Not found' });
        return res.json({ msg: 'Marked read', notification: doc });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: 'Server error' });
    }
};

exports.markAllNotificationsRead = async (req, res) => {
    try {
        await Notification.updateMany({ user_id: req.user.id, is_read: false }, { $set: { is_read: true } });
        return res.json({ msg: 'All notifications marked read' });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: 'Server error' });
    }
};

exports.streamNotifications = async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    res.write(`event: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`);

    const keepAlive = setInterval(() => {
        try {
            res.write('event: ping\\ndata: {}\\n\\n');
        } catch (_) {
            // ignore
        }
    }, 25000);

    subscribe(req.user.id, res);

    req.on('close', () => {
        clearInterval(keepAlive);
        unsubscribe(req.user.id, res);
    });
};

exports.getAuditLogs = async (req, res) => {
    try {
        if (!isAdmin(req)) return res.status(403).json({ msg: 'Access denied' });
        const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 300);

        const logs = await AuditLog.find({})
            .populate('actor_id', 'fullName email role')
            .sort({ timestamp: -1 })
            .limit(limit)
            .lean();

        return res.json(logs);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: 'Server error' });
    }
};
