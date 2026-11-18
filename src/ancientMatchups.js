// Ancient 1 = rank tier 61; unknown ranks are excluded by the SQL predicate.
// One query produces both baselines and pair counts from exactly the same sample.
// Bound the initial index scan: filtering the whole table exceeds Explorer's
// timeout. Coverage is a recent sample, not a complete 30-day census.
export function ancientMatchupQuery(heroId) {
  if (!Number.isSafeInteger(heroId) || heroId <= 0) throw new Error("Invalid hero ID");
  return `WITH recent AS (
    SELECT * FROM public_matches ORDER BY match_id DESC LIMIT 250000
  ), sample AS (
    SELECT match_id, start_time, radiant_win, radiant_team, dire_team FROM recent
    WHERE avg_rank_tier >= 61 AND lobby_type = 7 AND game_mode = 22
      AND start_time > extract(epoch from now()) - 30 * 86400
      AND radiant_win IS NOT NULL
      AND array_length(radiant_team, 1) = 5 AND array_length(dire_team, 1) = 5
      AND 0 < ALL(radiant_team) AND 0 < ALL(dire_team)
      AND (SELECT count(DISTINCT hero) FROM unnest(radiant_team || dire_team) AS hero) = 10
    ORDER BY match_id DESC LIMIT 50000
  ), appearances AS (
    SELECT unnest(radiant_team) AS hero_id, radiant_win AS won FROM sample
    UNION ALL SELECT unnest(dire_team), NOT radiant_win FROM sample
  ), baseline AS (
    SELECT hero_id, count(*) AS games, count(*) FILTER (WHERE won) AS wins
    FROM appearances GROUP BY hero_id
  ), opponents AS (
    SELECT unnest(dire_team) AS hero_id, radiant_win AS won FROM sample WHERE ${heroId} = ANY(radiant_team)
    UNION ALL SELECT unnest(radiant_team), NOT radiant_win FROM sample WHERE ${heroId} = ANY(dire_team)
  ), matchup AS (
    SELECT hero_id, count(*) AS games_played, count(*) FILTER (WHERE won) AS wins
    FROM opponents GROUP BY hero_id
  ) SELECT (SELECT count(*) FROM sample) AS sample_size,
    (SELECT min(start_time) FROM sample) AS oldest, (SELECT max(start_time) FROM sample) AS newest,
    (SELECT json_agg(baseline) FROM baseline) AS baselines,
    (SELECT json_agg(matchup) FROM matchup) AS matchups`;
}
