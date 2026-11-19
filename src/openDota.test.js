import axios from 'axios';
import { loadAncientMatchups, peekAncientMatchups, getRateLimitUntil } from './openDota';
import { clearCache } from './cache';
import { loadPlayerMatches, loadHeroes, loadMatchups, loadProfile, peekMatchups, resetRequestQueue, loadLeagues, loadLeagueMatches, loadDraftMatch, loadMatchupBaselines } from './openDota';

jest.mock('axios');
beforeEach(() => { localStorage.clear(); clearCache(); resetRequestQueue(); axios.get.mockReset(); });
const seed = (key, value) => localStorage.setItem(`what2ban:cache:${key}`, JSON.stringify({ expires: Date.now() + 60000, value }));

test.each([
  ['matches:123', {}, () => loadPlayerMatches('123'), []],
  ['matches:123', [null], () => loadPlayerMatches('123'), []],
  ['heroes', [{ id: 1 }], loadHeroes, []],
  ['matchups:1', [{ hero_id: 2, games_played: 'bad' }], () => loadMatchups(1), []],
  ['profile:123', { personaname: 123 }, () => loadProfile('123'), { profile: { personaname: 'Player' } }],
])('invalid %s cache is replaced from the API', async (key, invalid, load, response) => {
  seed(key, invalid);
  axios.get.mockResolvedValue({ data: response });
  const result = await load();
  expect(result).toEqual(key.startsWith('profile') ? response.profile : response);
  expect(axios.get).toHaveBeenCalledTimes(1);
});

test('inspector peek discards invalid cached matchup rows', () => {
  seed('matchups:1', [null]);
  expect(peekMatchups(1)).toBeUndefined();
  expect(localStorage.getItem('what2ban:cache:matchups:1')).toBeNull();
});

test('invalid API rows reject cleanly and are not cached', async () => {
  axios.get.mockResolvedValue({ data: [null] });
  await expect(loadHeroes()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  expect(localStorage.getItem('what2ban:cache:heroes')).toBeNull();
});

test('tournament metadata is validated and reused', async () => {
  seed('meta:leagues', [{ leagueid: 99, name: 'Old catalog', tier: 'professional' }]);
  axios.get.mockResolvedValueOnce({ data: { rows: [{ leagueid: '42', name: 'Cup', tier: 'professional', last_match_time: '1700000000', banner: 'unused' }] } })
    .mockResolvedValueOnce({ data: [{ match_id: 100, start_time: 1700000000, duration: 2000 }] });
  expect(await loadLeagues()).toEqual([{ leagueid: 42, name: 'Cup', tier: 'professional', last_match_time: 1700000000 }]);
  await loadLeagues();
  expect(decodeURIComponent(axios.get.mock.calls[0][0])).toContain('max(m.start_time)');
  expect(await loadLeagueMatches(42)).toEqual([{ match_id: 100, start_time: 1700000000 }]);
  await loadLeagueMatches(42);
  expect(axios.get).toHaveBeenCalledTimes(2);
});

test.each([{ err: 'Query failed', rows: [] }, { rows: [{ leagueid: 1, name: 'No date', tier: 'premium' }] }])('invalid recent tournament responses are not cached', async data => {
  axios.get.mockResolvedValue({ data });
  await expect(loadLeagues()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  expect(localStorage.getItem('what2ban:cache:meta:recent-leagues:90d:v1')).toBeNull();
});

test('complete drafts use long caching and retain only draft fields', async () => {
  const actions = [{ hero_id: 20, is_pick: false, team: 1, order: 0 },
    ...Array.from({ length: 10 }, (_, i) => ({ hero_id: i + 1, is_pick: true, team: i < 5 ? 0 : 1, order: i + 1 }))];
  axios.get.mockResolvedValue({ data: { match_id: 100, radiant_win: true, picks_bans: actions, players: ['unused'] } });
  const result = await loadDraftMatch(100);
  expect(result).toEqual({ match_id: 100, radiant_win: true, picks_bans: actions });
  await loadDraftMatch(100);
  expect(axios.get).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem('what2ban:cache:meta:draft:100')).not.toBeNull();
});

test('missing drafts are not stored as complete drafts', async () => {
  axios.get.mockResolvedValue({ data: { match_id: 100, radiant_win: false, picks_bans: null } });
  expect(await loadDraftMatch(100)).toEqual({ match_id: 100, radiant_win: false, picks_bans: [] });
  expect(localStorage.getItem('what2ban:cache:meta:draft:100')).toBeNull();
});

test('yearly matchup baselines normalize counts and share one cached query', async () => {
  axios.get.mockResolvedValue({ data: { rows: [{ hero_id: 1, games: '1000', wins: '550' }], err: null } });
  const first = loadMatchupBaselines();
  const second = loadMatchupBaselines();
  expect(await first).toEqual([{ hero_id: 1, games: 1000, wins: 550 }]);
  expect(await second).toEqual(await loadMatchupBaselines());
  expect(axios.get).toHaveBeenCalledTimes(1);
  const query = decodeURIComponent(axios.get.mock.calls[0][0]);
  expect(query).toContain('365 * 86400');
  expect(query).toContain('player_matches');
});

test('failed or malformed baseline responses are not cached and can be retried', async () => {
  axios.get.mockResolvedValueOnce({ data: { err: 'timeout' } })
    .mockResolvedValueOnce({ data: { rows: [{ hero_id: 1, games: 10, wins: 11 }] } })
    .mockResolvedValueOnce({ data: { rows: [{ hero_id: 1, games: 100, wins: 50 }] } });
  await expect(loadMatchupBaselines()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  await expect(loadMatchupBaselines()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  expect(await loadMatchupBaselines()).toEqual([{ hero_id: 1, games: 100, wins: 50 }]);
});

test('Ancient+ queries ignore old pro caches and share one complete snapshot', async () => {
  seed('matchups:2', [{ hero_id: 1, games_played: 200, wins: 10 }]);
  seed('matchup-baselines:365:v1', [{ hero_id: 2, games: 1000, wins: 900 }]);
  axios.get.mockResolvedValue({ data: { rows: [{ sample_size: '1000', oldest: '1700000000', newest: '1700086400',
    baselines: [{ hero_id: 2, games: '300', wins: '150' }, { hero_id: 1, games: '200', wins: '100' }],
    matchups: [{ hero_id: 1, games_played: '100', wins: '45' }],
  }] } });
  const first = loadAncientMatchups(2);
  const second = loadAncientMatchups(2);
  const snapshot = await first;
  expect(await second).toEqual(snapshot);
  expect(snapshot.sample_size).toBe(1000);
  expect(snapshot.matchups[0].wins).toBe(45);
  expect(snapshot.baselines[0].wins).toBe(150);
  expect(peekAncientMatchups(2)).toEqual(snapshot);
  expect(axios.get).toHaveBeenCalledTimes(1);
  expect(decodeURIComponent(axios.get.mock.calls[0][0])).toContain('avg_rank_tier >= 61');
});

test('empty Ancient+ coverage remains empty without falling back to pro matches', async () => {
  axios.get.mockResolvedValue({ data: { rows: [{ sample_size: '0', oldest: null, newest: null, baselines: null, matchups: null }] } });
  expect(await loadAncientMatchups(2)).toEqual({ sample_size: 0, oldest: null, newest: null, baselines: [], matchups: [] });
  expect(axios.get).toHaveBeenCalledTimes(1);
});

test('invalid Ancient+ snapshots reject and do not populate the cache', async () => {
  axios.get.mockResolvedValue({ data: { rows: [{ sample_size: 1000, oldest: null, newest: null,
    baselines: [{ hero_id: 2, games: 100, wins: 50 }], matchups: [{ hero_id: 1, games_played: 10, wins: 11 }],
  }] } });
  await expect(loadAncientMatchups(2)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  expect(peekAncientMatchups(2)).toBeUndefined();
});

const settleRequests = async () => { for (let i = 0; i < 30; i += 1) await Promise.resolve(); };
const limited = (retryAfter) => ({ response: { status: 429, headers: retryAfter === undefined ? {} : { 'retry-after': retryAfter } } });

describe('shared rate-limit recovery', () => {
  beforeEach(() => { jest.useFakeTimers('modern'); jest.setSystemTime(new Date('2026-11-16T12:00:00Z')); });
  afterEach(() => { resetRequestQueue(); jest.useRealTimers(); });

  test.each([
    ['seconds', '10', 10000],
    ['HTTP date', 'Mon, 16 Nov 2026 12:00:20 GMT', 20000],
    ['missing header', undefined, 60000],
    ['invalid header', 'unknown', 60000],
    ['negative seconds', '-1', 60000],
  ])('honors %s and pauses other lanes while keeping cache usable', async (_, header, delay) => {
    seed('profile:9', { personaname: 'Cached' });
    axios.get.mockRejectedValueOnce(limited(header)).mockResolvedValue({ data: [] });
    const heroes = loadHeroes();
    await settleRequests();
    expect(getRateLimitUntil()).toBe(Date.now() + delay);
    const history = loadPlayerMatches('123');
    await expect(loadProfile('9')).resolves.toEqual({ personaname: 'Cached' });
    jest.advanceTimersByTime(delay - 1);
    await settleRequests();
    expect(axios.get).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1);
    await expect(heroes).resolves.toEqual([]);
    await expect(history).resolves.toEqual([]);
    expect(axios.get).toHaveBeenCalledTimes(3);
    expect(getRateLimitUntil()).toBe(0);
  });

  test('stops after two retries and still cools down after the final 429', async () => {
    axios.get.mockRejectedValue(limited());
    const result = loadHeroes();
    const rejection = expect(result).rejects.toMatchObject({ response: { status: 429 } });
    await settleRequests();
    for (let i = 0; i < 2; i += 1) {
      jest.advanceTimersByTime(60000);
      await settleRequests();
    }
    await rejection;
    expect(axios.get).toHaveBeenCalledTimes(3);
    expect(getRateLimitUntil()).toBe(Date.now() + 60000);
    jest.advanceTimersByTime(60000);
    await settleRequests();
    expect(axios.get).toHaveBeenCalledTimes(3);
    expect(getRateLimitUntil()).toBe(0);
  });

  test('canceling during cooldown prevents the retry', async () => {
    axios.get.mockRejectedValueOnce(limited());
    const controller = new AbortController();
    const result = loadPlayerMatches('123', { signal: controller.signal });
    const rejection = expect(result).rejects.toMatchObject({ code: 'ERR_CANCELED' });
    await settleRequests();
    controller.abort();
    await rejection;
    jest.advanceTimersByTime(60000);
    await settleRequests();
    expect(axios.get).toHaveBeenCalledTimes(1);
  });
});
