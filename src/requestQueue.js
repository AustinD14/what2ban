const WINDOW = 60 * 1000;

// Runs requests in named lanes, each with its own concurrency limit, while all lanes
// share one requests-per-minute budget. Lanes listed first get budget first.
export function createRequestQueue({ perMinute, lanes, now = () => Date.now() }) {
  const state = Object.fromEntries(Object.entries(lanes).map(([name, concurrency]) =>
    [name, { concurrency, active: 0, waiting: [] }]));
  let started = [];
  let timer = null;
  let generation = 0;
  let pausedUntil = 0;
  const listeners = new Set();
  const notify = () => listeners.forEach(listener => listener());

  function pause(milliseconds) {
    pausedUntil = Math.max(pausedUntil, now() + milliseconds);
    clearTimeout(timer);
    timer = null;
    notify();
    pump();
  }

  function budgetLeft() {
    const time = now();
    started = started.filter((startedAt) => time - startedAt < WINDOW);
    return perMinute - started.length;
  }

  // Budget used up: try again when the oldest request leaves the one-minute window.
  function wakeLater(at) {
    if (timer) return;
    timer = setTimeout(() => { timer = null; pump(); }, Math.min(2147483647, Math.max(0, at - now())));
  }

  function start(lane) {
    const job = lane.waiting.shift();
    const jobGeneration = generation;
    lane.active += 1;
    started.push(now());
    job.run(() => {
      if (jobGeneration !== generation) return; // queue was reset meanwhile
      lane.active -= 1;
      pump();
    });
  }

  function pump() {
    if (pausedUntil > now()) { wakeLater(pausedUntil); return; }
    if (pausedUntil) { pausedUntil = 0; notify(); }
    for (const lane of Object.values(state)) {
      while (lane.waiting.length && lane.active < lane.concurrency) {
        if (budgetLeft() <= 0) { wakeLater(started[0] + WINDOW); return; }
        start(lane);
      }
    }
  }

  // onWait fires (synchronously) if the request can't start right away; onStart fires when it later does.
  function schedule(laneName, task, { onWait, onStart, signal } = {}) {
    const lane = state[laneName];
    return new Promise((resolve, reject) => {
      let waited = false;
      const canceled = () => Object.assign(new Error("Request canceled."), { code: "ERR_CANCELED" });
      if (signal?.aborted) { reject(canceled()); return; }
      const cleanup = () => signal?.removeEventListener("abort", abort);
      function abort() {
        const index = lane.waiting.indexOf(job);
        if (index < 0) return; // Running tasks receive the same signal via axios.
        lane.waiting.splice(index, 1);
        cleanup();
        reject(canceled());
      }
      const job = {
        cancel() { cleanup(); reject(canceled()); },
        run(done) {
          cleanup();
          Promise.resolve().then(() => {
            if (signal?.aborted) throw canceled();
            if (waited) onStart?.();
            return task();
          }).then(resolve, reject).finally(done);
        },
      };
      signal?.addEventListener("abort", abort, { once: true });
      lane.waiting.push(job);
      pump();
      if (lane.waiting.includes(job)) {
        waited = true;
        onWait?.();
      }
    });
  }

  function reset() {
    clearTimeout(timer);
    timer = null;
    started = [];
    pausedUntil = 0;
    notify();
    generation += 1;
    for (const lane of Object.values(state)) {
      lane.active = 0;
      lane.waiting.splice(0).forEach((job) => job.cancel());
    }
  }

  return { schedule, reset, pause, getPauseUntil: () => pausedUntil,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); } };
}
