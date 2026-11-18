import { candidateMatchup, comfortPlayers } from './draftRecommendations';
import { getDraftInsights } from './draftInsights';

const catalog = Object.fromEntries([1, 2, 3, 4].map(id => [id, { id, localized_name: `Hero ${id}`, roles: ['Carry'] }]));
const sample = { baselines: [1, 2, 3, 4].map(hero_id => ({ hero_id, games: 1000, wins: 500 })),
  matchups: [{ hero_id: 1, games_played: 200, wins: 80 }, { hero_id: 2, games_played: 200, wins: 120 }] };
const players = [{ id: 'a', name: 'Alice', team: 'us', summary: { heroes: [
  { id: 1, games: 20, recent: 5, decided: 20, wins: 10 }, { id: 2, games: 20, recent: 5, decided: 20, wins: 10 },
] } }, { id: 'b', name: 'Bob', team: 'us', summary: { heroes: [{ id: 2, games: 50, recent: 10, decided: 50, wins: 30 }] } }];

test('opponent snapshots are reversed into candidate win rate and adjusted advantage', () => {
  const row = candidateMatchup(1, 3, sample);
  expect(row.winRate).toBeCloseTo(0.6);
  expect(row.advantage).toBeCloseTo(0.1);
  expect(candidateMatchup(2, 3, sample).advantage).toBeCloseTo(-0.1);
  expect(candidateMatchup(1, 3, sample, 201)).toBeNull();
  expect(candidateMatchup(4, 3, sample)).toBeNull();
  expect(candidateMatchup(1, 3, { ...sample, baselines: [] })).toBeNull();
});

test('comfort ranks real experience above a one-game perfect record and uses decided games', () => {
  const rows = [{ id: 'new', name: 'New', team: 'us', summary: { heroes: [{ id: 1, games: 1, recent: 1, wins: 1, decided: 1 }] } }, players[0]];
  expect(comfortPlayers(1, rows, 1)[0].name).toBe('Alice');
  expect(comfortPlayers(1, rows, 2)).toHaveLength(1);
  expect(comfortPlayers(1, [{ ...players[0], team: 'watch' }], 1)).toEqual([]);
});

test('selected teammate and loaded matchup evidence change picks without including bans', () => {
  const draft = [{ id: 3, type: 'them' }];
  expect(getDraftInsights(draft, players, catalog, 1).picks[0].id).toBe(2);
  const targeted = getDraftInsights(draft, players, catalog, 1, { 3: sample }, 'a');
  expect(targeted.picks[0].id).toBe(1);
  expect(targeted.picks[0].comfort.map(row => row.name)).toEqual(['Alice']);
  expect(targeted.picks[0].matchups).toHaveLength(1);
  expect(getDraftInsights([...draft, { id: 1, type: 'ban' }], players, catalog, 1, { 3: sample }, 'a').picks.map(row => row.id)).toEqual([2]);
  expect(getDraftInsights(draft, players, catalog, 100, { 3: sample }, 'a').picks).toEqual([]);
});

test('missing pair data stays unknown and removing an opponent removes its evidence', () => {
  const result = getDraftInsights([{ id: 4, type: 'them' }], players, catalog, 1, { 3: sample });
  expect(result.picks.every(row => row.advantage === null && row.matchups.length === 0)).toBe(true);
  const thin = { ...sample, matchups: [{ hero_id: 1, games_played: 99, wins: 1 }] };
  expect(getDraftInsights([{ id: 3, type: 'them' }], players, catalog, 1, { 3: thin }).picks.every(row => row.advantage === null)).toBe(true);
});
