import { createRequestQueue } from "./requestQueue";

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test("each lane runs at most its concurrency and reports waiting jobs", async () => {
  const queue = createRequestQueue({ perMinute: 100, lanes: { history: 2 } });
  const jobs = [deferred(), deferred(), deferred()];
  const running = [];
  const events = [];
  const results = jobs.map((job, index) => queue.schedule("history", () => {
    running.push(index);
    return job.promise;
  }, { onWait: () => events.push(`wait ${index}`), onStart: () => events.push(`start ${index}`) }));
  await flush();
  expect(running).toEqual([0, 1]);
  expect(events).toEqual(["wait 2"]);
  jobs[0].resolve("a");
  await flush();
  expect(running).toEqual([0, 1, 2]);
  expect(events).toEqual(["wait 2", "start 2"]);
  jobs[1].resolve("b");
  jobs[2].resolve("c");
  await expect(Promise.all(results)).resolves.toEqual(["a", "b", "c"]);
});

test("a failed job frees its slot and rejects only its own promise", async () => {
  const queue = createRequestQueue({ perMinute: 100, lanes: { history: 1 } });
  const failed = queue.schedule("history", () => Promise.reject(new Error("boom")));
  const next = queue.schedule("history", () => "ok");
  await expect(failed).rejects.toThrow("boom");
  await expect(next).resolves.toBe("ok");
});

test("lanes share the per-minute budget and resume when the window frees up", async () => {
  jest.useFakeTimers();
  try {
    let time = 0;
    const queue = createRequestQueue({ perMinute: 2, lanes: { other: 5, history: 5 }, now: () => time });
    const started = [];
    const task = (name) => () => { started.push(name); return name; };
    queue.schedule("other", task("a"));
    queue.schedule("history", task("b"));
    const third = queue.schedule("history", task("c"));
    await Promise.resolve();
    expect(started).toEqual(["a", "b"]);
    time = 60 * 1000;
    jest.advanceTimersByTime(60 * 1000);
    await expect(third).resolves.toBe("c");
    expect(started).toEqual(["a", "b", "c"]);
  } finally {
    jest.useRealTimers();
  }
});

test('canceling queued work skips its task and preserves the next request', async () => {
  const queue = createRequestQueue({ perMinute: 10, lanes: { history: 1 } });
  const active = deferred();
  const first = queue.schedule('history', () => active.promise);
  const controller = new AbortController();
  const removedTask = jest.fn();
  const removed = queue.schedule('history', removedTask, { signal: controller.signal });
  const rejection = expect(removed).rejects.toMatchObject({ code: 'ERR_CANCELED' });
  const next = queue.schedule('history', () => 'next');
  controller.abort();
  await rejection;
  active.resolve('first');
  await expect(first).resolves.toBe('first');
  await expect(next).resolves.toBe('next');
  expect(removedTask).not.toHaveBeenCalled();
});

test('already canceled work never starts', async () => {
  const queue = createRequestQueue({ perMinute: 10, lanes: { history: 1 } });
  const controller = new AbortController();
  controller.abort();
  const task = jest.fn();
  await expect(queue.schedule('history', task, { signal: controller.signal })).rejects.toMatchObject({ code: 'ERR_CANCELED' });
  expect(task).not.toHaveBeenCalled();
});
