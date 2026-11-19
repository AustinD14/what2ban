// Log5 expected win probability from the two overall win rates. Baselines and
// pair results must use the same population/window; never mix in /heroStats.
// With overall win probabilities A and B, expected = A*(1-B) / (A*(1-B)+(1-A)*B).
// Advantage = observed head-to-head win probability minus expected. Multiply by
// 100 for percentage points: positive favors our selected hero, negative favors
// the opponent. This is our estimate, not a reproduction of Dotabuff's formula.
// These are whole-match outcomes, without adjustment for lanes, teammates or
// patch changes. Small samples can be noisy even after the minimum-game filter.
export function matchupAdvantage(row, ours, theirs) {
  if (!ours?.games || !theirs?.games || !row.games_played) return null;
  const a = ours.wins / ours.games;
  const b = theirs.wins / theirs.games;
  const numerator = a * (1 - b);
  const denominator = numerator + (1 - a) * b;
  if (!denominator) return null;
  const expected = numerator / denominator;
  return { expected, advantage: row.wins / row.games_played - expected };
}

// Adjusted mode shows negative advantages for "Countered by" and positive ones
// for "Counters". Raw mode sorts observed win rates without that sign filter.
// Both apply the minimum pair count and return up to 12 rows; ties prefer more
// games, then hero ID. Missing baselines cannot produce an adjusted advantage.
export function rankMatchups(data, id, baselines, minimum, direction, metric) {
  const rows = data.filter(row => row.hero_id !== id && row.games_played >= minimum && row.games_played > 0)
    .map(row => ({ ...row, ...matchupAdvantage(row, baselines?.[id], baselines?.[row.hero_id]) }));
  return rows.filter(row => metric === "winRate" || (Number.isFinite(row.advantage) &&
    (direction === "difficult" ? row.advantage < 0 : row.advantage > 0)))
    .sort((a, b) => {
      const difference = metric === "advantage" ? a.advantage - b.advantage : a.wins / a.games_played - b.wins / b.games_played;
      return (direction === "difficult" ? difference : -difference) || b.games_played - a.games_played || a.hero_id - b.hero_id;
    }).slice(0, 12);
}
