import { recommendationEvidence } from './draftRecommendations';

export const DRAFT_ROLES = [
  { role: "Initiator", label: "Initiation" },
  { role: "Disabler", label: "Disables" },
  { role: "Durable", label: "Frontline" },
  { role: "Pusher", label: "Tower pressure" },
  { role: "Nuker", label: "Burst damage" },
  { role: "Carry", label: "Scaling damage" },
  { role: "Support", label: "Support" },
];

export function getDraftInsights(draft, players, catalog, minimum, samples = {}, playerId = '') {
  const selectedPlayers = playerId ? players.filter(player => String(player.id) === playerId || player.team !== 'us') : players;
  const unavailable = new Set(draft.map(({ id }) => id));
  const coverage = (team) => DRAFT_ROLES.map((entry) => ({
    ...entry,
    heroes: draft.filter((action) => action.type === team && catalog[action.id]?.roles?.includes(entry.role))
      .map(({ id }) => catalog[id].localized_name),
  }));
  const ours = coverage("us");
  const theirs = coverage("them");
  const pool = (team) => {
    const result = new Map();
    for (const player of selectedPlayers.filter((entry) => entry.team === team)) {
      for (const hero of player.summary.heroes) {
        if (hero.games < minimum || unavailable.has(hero.id) || !catalog[hero.id]) continue;
        const row = result.get(hero.id) ?? { id: hero.id, games: 0, recent: 0, players: [] };
        row.games += hero.games;
        row.recent += hero.recent ?? 0;
        row.players.push(`${player.name}: ${hero.games} games, ${hero.recent ?? 0} recent`);
        result.set(hero.id, row);
      }
    }
    return [...result.values()];
  };
  const rank = (rows, roles) => rows.map((row) => ({
    ...row,
    fills: roles.filter((entry) => !entry.heroes.length && catalog[row.id]?.roles?.includes(entry.role)).map(({ label }) => label),
  })).sort((a, b) => b.fills.length - a.fills.length || b.recent - a.recent || b.games - a.games || a.id - b.id).slice(0, 4);
  const ourPool = pool("us");
  const hasOurHistory = selectedPlayers.some((player) => player.team === "us" && player.summary.heroes.length);
  const full = (team) => draft.filter((action) => action.type === team).length >= 5;
  // All available heroes remain eligible; role coverage affects their score only.
  // Never imply that a teammate plays these generic options.
  const generic = Object.values(catalog).filter((hero) => !unavailable.has(hero.id))
    .map((hero) => ({ id: hero.id, games: 0, recent: 0, players: [] }));
  const opponents = draft.filter(action => action.type === 'them').map(action => action.id);
  const picks = (hasOurHistory ? ourPool : generic).map(row => {
    const fills = ours.filter(entry => !entry.heroes.length && catalog[row.id]?.roles?.includes(entry.role)).map(entry => entry.label);
    const evidence = recommendationEvidence(row.id, selectedPlayers, minimum, opponents, samples);
    return { ...row, ...evidence, fills,
      score: (evidence.comfort[0]?.score ?? 0) + Math.min(3, fills.length) * 5 + evidence.matchupScore };
  }).sort((a, b) => b.score - a.score || b.games - a.games || a.id - b.id).slice(0, 4);
  return {
    ours, theirs, genericPicks: !hasOurHistory,
    picks: full("us") ? [] : picks,
    bans: rank(pool("them"), full("them") ? [] : theirs),
    ourFull: full("us"),
  };
}
