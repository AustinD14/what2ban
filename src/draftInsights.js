import { recommendationEvidence, comfortPlayers, tournamentEvidence, usableTournamentMeta } from './draftRecommendations';

export const DRAFT_ROLES = [
  { role: "Initiator", label: "Initiation" },
  { role: "Disabler", label: "Disables" },
  { role: "Durable", label: "Frontline" },
  { role: "Pusher", label: "Tower pressure" },
  { role: "Nuker", label: "Burst damage" },
  { role: "Carry", label: "Scaling damage" },
  { role: "Support", label: "Support" },
];

export function getDraftInsights(draft, players, catalog, minimum, samples = {}, playerId = '', meta = null) {
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
  const sortOptions = rows => rows.sort((a, b) => b.score - a.score || b.games - a.games || a.id - b.id).slice(0, 4);
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
    const tournament = tournamentEvidence(row.id, meta);
    // Broad tags are a tie-breaker, not additive evidence of several jobs filled.
    const roleScore = fills.length ? 2 : 0;
    const comfortScore = evidence.comfort[0]?.score ?? 0;
    return { ...row, ...evidence, ...tournament, fills, roleScore, comfortScore,
      score: comfortScore + roleScore + evidence.matchupScore + tournament.metaScore };
  });
  const bans = pool('them').map(row => {
    const fills = full('them') ? [] : theirs.filter(entry => !entry.heroes.length && catalog[row.id]?.roles?.includes(entry.role)).map(entry => entry.label);
    const tournament = tournamentEvidence(row.id, meta);
    const comfort = comfortPlayers(row.id, players, minimum, 'them');
    const roleScore = fills.length ? 2 : 0;
    const comfortScore = comfort[0]?.score ?? 0;
    return { ...row, ...tournament, fills, comfort, roleScore, comfortScore,
      score: comfortScore + roleScore + tournament.metaScore };
  });
  return {
    metaAvailable: usableTournamentMeta(meta),
    ours, theirs, genericPicks: !hasOurHistory,
    picks: full("us") ? [] : sortOptions(picks),
    bans: sortOptions(bans),
    ourFull: full("us"),
  };
}
