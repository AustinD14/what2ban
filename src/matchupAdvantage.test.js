import { matchupAdvantage, rankMatchups } from './matchupAdvantage';
const baselines = { 1: { games: 1000, wins: 500 }, 2: { games: 1000, wins: 200 }, 3: { games: 1000, wins: 800 } };
const rows = [{ hero_id: 2, games_played: 200, wins: 120 }, { hero_id: 3, games_played: 200, wins: 80 }];

test('a positive raw win rate can still be an unfavorable adjusted matchup', () => {
  const score = matchupAdvantage(rows[0], baselines[1], baselines[2]);
  expect(score.expected).toBeCloseTo(.8);
  expect(score.advantage).toBeCloseTo(-.2);
  expect(rankMatchups(rows, 1, baselines, 100, 'difficult', 'advantage').map(row => row.hero_id)).toEqual([2]);
  expect(rankMatchups(rows, 1, baselines, 100, 'difficult', 'winRate').map(row => row.hero_id)).toEqual([3, 2]);
});

test('favorable rankings show positive advantage and exclude missing baselines', () => {
  const input = [...rows, { hero_id: 4, games_played: 1000, wins: 900 }];
  const result = rankMatchups(input, 1, baselines, 100, 'favorable', 'advantage');
  expect(result.map(row => row.hero_id)).toEqual([3]);
  expect(result[0].advantage).toBeCloseTo(.2);
  expect(rankMatchups(input, 1, baselines, 250, 'favorable', 'advantage')).toEqual([]);
});

test('equal baselines imply 50% expected and reversing the matchup reverses advantage', () => {
  expect(matchupAdvantage(rows[0], baselines[1], baselines[1]).expected).toBe(.5);
  const forward = matchupAdvantage(rows[0], baselines[1], baselines[2]);
  const reverse = matchupAdvantage({ games_played: 200, wins: 80 }, baselines[2], baselines[1]);
  expect(reverse.advantage).toBeCloseTo(-forward.advantage);
});

test('missing, empty or undefined baselines do not invent an adjusted score', () => {
  expect(matchupAdvantage(rows[0], null, baselines[2])).toBeNull();
  expect(matchupAdvantage(rows[0], { games: 0, wins: 0 }, baselines[2])).toBeNull();
  expect(matchupAdvantage(rows[0], { games: 10, wins: 10 }, { games: 10, wins: 10 })).toBeNull();
});
