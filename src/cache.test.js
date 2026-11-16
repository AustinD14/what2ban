import { cached, clearCache, peek } from './cache';

beforeEach(() => { localStorage.clear(); clearCache(); });

test('expired memory falls back to fresh data written by another tab', async () => {
  const clock = jest.spyOn(Date, 'now').mockReturnValue(1000);
  try {
    await cached('shared', 10, async () => 'old');
    clock.mockReturnValue(2000);
    localStorage.setItem('what2ban:cache:shared', JSON.stringify({ expires: 9000, value: 'new' }));
    const load = jest.fn();
    expect(await cached('shared', 10, load)).toBe('new');
    expect(load).not.toHaveBeenCalled();
  } finally { clock.mockRestore(); }
});

test('invalid stored data is discarded and concurrent cache misses share a load', async () => {
  localStorage.setItem('what2ban:cache:list', JSON.stringify({ expires: Date.now() + 60000, value: {} }));
  let finish;
  const load = jest.fn(() => new Promise(resolve => { finish = resolve; }));
  const first = cached('list', 1000, load, { validate: Array.isArray });
  const second = cached('list', 1000, load, { validate: Array.isArray });
  finish([]);
  expect(await first).toEqual([]);
  expect(await second).toEqual([]);
  expect(load).toHaveBeenCalledTimes(1);
});

test('aborted loads cannot poison the cache or replace a new load', async () => {
  let finishOld;
  const controller = new AbortController();
  const old = cached('player', 1000, () => new Promise(resolve => { finishOld = resolve; }), { signal: controller.signal });
  const canceled = expect(old).rejects.toMatchObject({ code: 'ERR_CANCELED' });
  controller.abort();
  expect(await cached('player', 1000, async () => 'new', { signal: new AbortController().signal })).toBe('new');
  finishOld('old');
  await canceled;
  expect(peek('player')).toBe('new');
});
