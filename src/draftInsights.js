export const DRAFT_ROLES = [
  { role: "Initiator", label: "Initiation" },
  { role: "Disabler", label: "Disables" },
  { role: "Durable", label: "Frontline" },
  { role: "Pusher", label: "Tower pressure" },
  { role: "Nuker", label: "Burst damage" },
  { role: "Carry", label: "Scaling damage" },
  { role: "Support", label: "Support" },
];

export function getDraftInsights(draft, players, catalog, minimum) {
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
    for (const player of players.filter((entry) => entry.team === team)) {
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
  const hasOurHistory = players.some((player) => player.team === "us" && player.summary.heroes.length);
  const full = (team) => draft.filter((action) => action.type === team).length >= 5;
  // Generic options are role matches only; never imply that a teammate plays them.
  const generic = Object.values(catalog).filter((hero) => !unavailable.has(hero.id))
    .map((hero) => ({ id: hero.id, games: 0, recent: 0, players: [] }))
    .filter((hero) => ours.some((entry) => !entry.heroes.length && catalog[hero.id]?.roles?.includes(entry.role)));
  return {
    ours, theirs, genericPicks: !hasOurHistory,
    picks: full("us") ? [] : rank(hasOurHistory ? ourPool : generic, ours),
    bans: rank(pool("them"), full("them") ? [] : theirs),
    ourFull: full("us"),
  };
}
