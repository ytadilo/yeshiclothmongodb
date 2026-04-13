const subscribers = new Map();

function subscribe(userId, res) {
    const key = String(userId);
    if (!subscribers.has(key)) subscribers.set(key, new Set());
    subscribers.get(key).add(res);
}

function unsubscribe(userId, res) {
    const key = String(userId);
    const set = subscribers.get(key);
    if (!set) return;
    set.delete(res);
    if (!set.size) subscribers.delete(key);
}

function pushEvent(userId, event, payload) {
    const key = String(userId);
    const set = subscribers.get(key);
    if (!set || !set.size) return;
    const data = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    set.forEach((res) => {
        try {
            res.write(data);
        } catch (_) {
            // ignore broken pipes
        }
    });
}

module.exports = {
    subscribe,
    unsubscribe,
    pushEvent
};
