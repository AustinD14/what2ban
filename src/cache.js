// Response cache: an in-memory Map backed by localStorage, so cached data
// survives a reload. Concurrent requests for the same key share one promise.
const PREFIX = "what2ban:cache:";
const memory = new Map();
const pending = new Map();

function readStored(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return undefined;
    const entry = JSON.parse(raw);
    if (entry && entry.expires > Date.now()) return entry;
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

function fresh(key) {
  const entry = memory.get(key) ?? readStored(key);
  if (!entry || entry.expires <= Date.now()) return undefined;
  memory.set(key, entry);
  return entry;
}

export function peek(key) {
  return fresh(key)?.value;
}

export function cached(key, ttl, load) {
  const hit = fresh(key);
  if (hit) return Promise.resolve(hit.value);
  if (pending.has(key)) return pending.get(key);
  const request = load().then((value) => {
    const entry = { expires: Date.now() + ttl, value };
    memory.set(key, entry);
    store(key, entry);
    return value;
  }).finally(() => {
    if (pending.get(key) === request) pending.delete(key);
  });
  pending.set(key, request);
  return request;
}

export function clearCache() {
  memory.clear();
  pending.clear();
  try { storedKeys().forEach((key) => localStorage.removeItem(key)); } catch { /* storage unavailable */ }
}
