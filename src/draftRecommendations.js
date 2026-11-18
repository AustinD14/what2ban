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

export function comfortPlayers(id, players, minimum) {
  return players.filter(player => player.team === 'us').flatMap(player => {
    const hero = player.summary.heroes.find(row => row.id === id && row.games >= minimum);
    if (!hero) return [];
    const decided = hero.decided ?? 0;
    // Shrink small win samples toward 50%; volume and recent use carry more weight.
    const score = 35 * Math.min(1, Math.log1p(hero.games) / Math.log(51))
      + 20 * Math.min(1, (hero.recent ?? 0) / 10)
      + 15 * ((hero.wins ?? 0) + 5) / (decided + 10);
    return [{ id: player.id, name: player.name, games: hero.games, recent: hero.recent ?? 0,
      decided, wins: hero.wins ?? 0, score }];
  }).sort((a, b) => b.score - a.score || b.games - a.games || a.name.localeCompare(b.name));
}

export function recommendationEvidence(id, players, minimum, opponents, samples) {
  const comfort = comfortPlayers(id, players, minimum);
  const matchups = opponents.map(opponent => candidateMatchup(id, opponent, samples[opponent])).filter(Boolean);
  const advantage = matchups.length ? matchups.reduce((sum, row) => sum + row.advantage, 0) / matchups.length : null;
  return { comfort, matchups, advantage,
    matchupScore: advantage === null ? 0 : Math.max(-15, Math.min(15, advantage * 200)) };
}

export const signedPoints = value => `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)} pp`;
