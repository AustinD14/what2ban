// Response cache: an in-memory Map backed by localStorage, so cached data
// survives a reload. Requests with the same key and cancellation owner share a promise.
const PREFIX = "what2ban:cache:";
const memory = new Map();
const pending = new Map();

function readStored(key, validate) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return undefined;
    const entry = JSON.parse(raw);
    if (entry && Number.isFinite(entry.expires) && entry.expires > Date.now() && validate(entry.value)) return entry;
    localStorage.removeItem(PREFIX + key);
  } catch {
    // Storage unavailable or corrupt entry: treat as a miss.
  }
  return undefined;
}

function storedKeys() {
  const keys = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(PREFIX)) keys.push(key);
  }
  return keys;
}

// Frees space by dropping the half of our entries that expire soonest (expired ones first).
function prune() {
  const entries = storedKeys().map((key) => {
    try { return [key, JSON.parse(localStorage.getItem(key)).expires || 0]; } catch { return [key, 0]; }
  }).sort((a, b) => a[1] - b[1]);
  entries.slice(0, Math.ceil(entries.length / 2)).forEach(([key]) => localStorage.removeItem(key));
}

function store(key, entry) {
  const value = JSON.stringify(entry);
  try {
    localStorage.setItem(PREFIX + key, value);
  } catch {
    try {
      prune();
      localStorage.setItem(PREFIX + key, value);
    } catch {
      // Still no room (or storage disabled): keep the in-memory copy only.
    }
  }
}

function fresh(key, validate) {
  const inMemory = memory.get(key);
  if (inMemory && inMemory.expires > Date.now() && validate(inMemory.value)) return inMemory;
  memory.delete(key);
  const entry = readStored(key, validate);
  if (!entry) return undefined;
  memory.set(key, entry);
  return entry;
}

export function peek(key, validate = () => true) {
  return fresh(key, validate)?.value;
}

export function cached(key, ttl, load, { validate = () => true, signal } = {}) {
  const canceled = () => Object.assign(new Error("Request canceled."), { code: "ERR_CANCELED" });
  if (signal?.aborted) return Promise.reject(canceled());
  const hit = fresh(key, validate);
  if (hit) return Promise.resolve(hit.value);
  // Independent cancellation owners must not share an abortable request.
  const existing = pending.get(key);
  if (existing && existing.signal === signal && !signal?.aborted) return existing.request;
  const request = load().then((value) => {
    if (signal?.aborted) throw canceled();
    if (!validate(value)) throw Object.assign(new Error("Invalid response."), { code: "INVALID_RESPONSE" });
    const entry = { expires: Date.now() + ttl, value };
    memory.set(key, entry);
    store(key, entry);
    return value;
  }).finally(() => {
    if (pending.get(key)?.request === request) pending.delete(key);
  });
  pending.set(key, { request, signal });
  return request;
}

export function clearCache() {
  memory.clear();
  pending.clear();
  try { storedKeys().forEach((key) => localStorage.removeItem(key)); } catch { /* storage unavailable */ }
}
