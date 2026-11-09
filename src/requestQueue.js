const WINDOW = 60 * 1000;

// Runs requests in named lanes, each with its own concurrency limit, while all lanes
// share one requests-per-minute budget. Lanes listed first get budget first.
export function createRequestQueue({ perMinute, lanes, now = () => Date.now() }) {
  const state = Object.fromEntries(Object.entries(lanes).map(([name, concurrency]) =>
    [name, { concurrency, active: 0, waiting: [] }]));
  let started = [];
  let timer = null;
  let generation = 0;

  function budgetLeft() {
    const time = now();
    started = started.filter((startedAt) => time - startedAt < WINDOW);
    return perMinute - started.length;
  }

  // Budget used up: try again when the oldest request leaves the one-minute window.
  function wakeLater() {
    if (timer) return;
    timer = setTimeout(() => { timer = null; pump(); }, Math.max(0, started[0] + WINDOW - now()));
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
    for (const lane of Object.values(state)) {
      while (lane.waiting.length && lane.active < lane.concurrency) {
        if (budgetLeft() <= 0) { wakeLater(); return; }
        start(lane);
      }
    }
  }

  // onWait fires (synchronously) if the request can't start right away; onStart fires when it later does.
  function schedule(laneName, task, { onWait, onStart } = {}) {
    const lane = state[laneName];
    return new Promise((resolve, reject) => {
      let waited = false;
      const job = {
        run(done) {
          if (waited) onStart?.();
          Promise.resolve().then(task).then(resolve, reject).finally(done);
        },
      };
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
    generation += 1;
    for (const lane of Object.values(state)) {
      lane.active = 0;
      lane.waiting.length = 0;
    }
  }

  return { schedule, reset };
}
