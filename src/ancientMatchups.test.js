import { ancientMatchupQuery } from './ancientMatchups';

test('Ancient+ baselines and opponents come from one bounded ranked All Pick sample', () => {
  const sql = ancientMatchupQuery(2);
  expect(sql).toContain('avg_rank_tier >= 61');
  expect(sql).toContain('lobby_type = 7 AND game_mode = 22');
  expect(sql).toContain('30 * 86400');
  expect(sql).toContain('LIMIT 250000');
  expect(sql).toContain('LIMIT 50000');
  expect(sql).toContain('FROM sample WHERE 2 = ANY(radiant_team)');
  expect(sql).toContain('FROM sample WHERE 2 = ANY(dire_team)');
  expect(sql).toContain('NOT radiant_win');
  expect(sql).not.toContain('player_matches');
});

test.each(['2; DROP TABLE matches', -1, 0, 2.5, NaN])('rejects invalid hero input %s', id => {
  expect(() => ancientMatchupQuery(id)).toThrow('Invalid hero ID');
});
