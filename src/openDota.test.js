import axios from 'axios';
import { clearCache } from './cache';
import { loadPlayerMatches, loadHeroes, loadMatchups, loadProfile, peekMatchups, resetRequestQueue } from './openDota';

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
