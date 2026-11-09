export const HISTORY_SIZES = [20, 50, 100, 250, 500, 1000];

export function matchResult(match) {
  if (typeof match.radiant_win !== "boolean" || !Number.isInteger(match.player_slot)) return null;
  return (match.player_slot < 128) === match.radiant_win;
}

export function summarizeMatches(matches, limit, days, recentLimit, now = Date.now()) {
  const cutoff = days ? now / 1000 - days * 86400 : 0;
  const sample = [...new Map(matches.map((match) => [match.match_id, match])).values()]
    .filter((match) => match.hero_id > 0 && match.start_time >= cutoff)
    .sort((a, b) => b.start_time - a.start_time)
    .slice(0, limit);
  const recent = sample.slice(0, recentLimit);
  const heroes = new Map();
  for (const match of sample) {
    const row = heroes.get(match.hero_id) ?? {
      id: match.hero_id, games: 0, wins: 0, decided: 0, recent: 0, last: match.start_time,
    };
    row.games += 1;
    const result = matchResult(match);
    if (result !== null) {
      row.decided += 1;
      row.wins += Number(result);
    }
    heroes.set(match.hero_id, row);
  }
  for (const match of recent) heroes.get(match.hero_id).recent += 1;
  return { sample, recent, heroes: [...heroes.values()].sort((a, b) => b.games - a.games || b.last - a.last) };
}

export function validPlayerId(value) {
  const id = Number(value.trim());
  return /^\d+$/.test(value.trim()) && id > 0 && id < 2 ** 32 ? String(id) : null;
}

export function winRate(row) {
  return row.decided ? Math.round(row.wins / row.decided * 100) + "%" : "—";
}
