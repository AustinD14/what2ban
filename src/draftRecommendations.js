import { matchupAdvantage } from './matchupAdvantage';

// Reverse the opponent's snapshot so every number is from the candidate's side.
export function candidateMatchup(id, opponent, sample, minimum = 100) {
  const pair = sample?.matchups.find(row => row.hero_id === id);
  if (!pair || pair.games_played < minimum || !pair.games_played) return null;
  const baselines = Object.fromEntries(sample.baselines.map(row => [row.hero_id, row]));
  const adjusted = matchupAdvantage(pair, baselines[opponent], baselines[id]);
  if (!adjusted) return null;
  return { opponent, games: pair.games_played, winRate: 1 - pair.wins / pair.games_played,
    advantage: -adjusted.advantage };
}

export function comfortPlayers(id, players, minimum, team = 'us') {
  return players.filter(player => player.team === team).flatMap(player => {
    const hero = player.summary.heroes.find(row => row.id === id && row.games >= minimum);
    if (!hero) return [];
    const decided = hero.decided ?? 0;
    const totalGames = player.summary.heroes.reduce((sum, row) => sum + row.games, 0);
    const totalRecent = player.summary.heroes.reduce((sum, row) => sum + (row.recent ?? 0), 0);
    const share = hero.games / totalGames;
    // Comfort (up to 70): experience 30, recent share 20, pool share 10, wins 10.
    // Shares are relative to this player's filtered history, never teammates'
    // pooled games. Shrink pool share and wins to avoid one-game specialists.
    const score = 30 * Math.min(1, Math.log1p(hero.games) / Math.log(51))
      + 20 * Math.min(1, (hero.recent ?? 0) / Math.max(10, totalRecent) / 0.4)
      + 10 * Math.min(1, share / 0.25) * hero.games / (hero.games + 10)
      + 10 * ((hero.wins ?? 0) + 10) / (decided + 20);
    return [{ id: player.id, name: player.name, games: hero.games, recent: hero.recent ?? 0,
      decided, wins: hero.wins ?? 0, share, score }];
  }).sort((a, b) => b.score - a.score || b.games - a.games || a.name.localeCompare(b.name));
}

export function usableTournamentMeta(meta, now = Date.now()) {
  return Boolean(meta && meta.analyzed >= 5 && Array.isArray(meta.rows)
    && Number.isFinite(meta.last_match_time) && meta.last_match_time <= now / 1000
    && meta.last_match_time >= now / 1000 - 90 * 86400);
}

export function tournamentEvidence(id, meta) {
  if (!usableTournamentMeta(meta)) return { metaScore: 0, tournament: null };
  const row = meta.rows.find(row => row.id === id);
  const picks = row?.picks ?? 0;
  const bans = row?.bans ?? 0;
  const wins = row?.wins ?? 0;
  const contest = (picks + bans) / meta.analyzed;
  // Pro priority is supporting evidence, not a pub win prediction. At least five
  // complete drafts are required; n/(n+20) tempers a partly loaded tournament.
  // Contest contributes up to 25; smoothed pick wins adjust by at most +/-5.
  // A ban-only hero still has priority; unknown win performance is neutral.
  const confidence = meta.analyzed / (meta.analyzed + 20);
  const performance = picks ? ((wins + 5) / (picks + 10) - 0.5) * 10 : 0;
  return { metaScore: (25 * contest + performance) * confidence,
    tournament: { name: meta.name, picks, bans, wins, contest, analyzed: meta.analyzed } };
}

export function recommendationEvidence(id, players, minimum, opponents, samples) {
  const comfort = comfortPlayers(id, players, minimum);
  const matchups = opponents.map(opponent => candidateMatchup(id, opponent, samples[opponent])).filter(Boolean);
  const advantage = matchups.length ? matchups.reduce((sum, row) => sum + row.advantage, 0) / matchups.length : null;
  return { comfort, matchups, advantage,
    matchupScore: advantage === null ? 0 : Math.max(-15, Math.min(15, advantage * 200)) };
}

export const signedPoints = value => `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)} pp`;
