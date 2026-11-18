// Only complete, distinct drafts contribute to denominators. Early priority is
// deliberately defined as the first four actions, not a patch-dependent phase.
export function hasCompleteDraft(match) {
  const actions = match.picks_bans;
  return typeof match.radiant_win === "boolean" && Array.isArray(actions) &&
    actions.some(action => !action.is_pick) &&
    actions.filter(action => action.is_pick && action.team === 0).length === 5 &&
    actions.filter(action => action.is_pick && action.team === 1).length === 5 &&
    new Set(actions.map(action => action.hero_id)).size === actions.length &&
    new Set(actions.map(action => action.order)).size === actions.length;
}

export function summarizeTournament(matches) {
  const heroes = new Map();
  const seen = new Set();
  let analyzed = 0;
  for (const match of matches) {
    if (seen.has(match.match_id)) continue;
    seen.add(match.match_id);
    const actions = match.picks_bans;
    if (!hasCompleteDraft(match)) continue;
    analyzed += 1;
    [...actions].sort((a, b) => a.order - b.order).forEach((action, index) => {
      const row = heroes.get(action.hero_id) ?? { id: action.hero_id, picks: 0, bans: 0, wins: 0, early: 0 };
      if (action.is_pick) {
        row.picks += 1;
        if ((action.team === 0) === match.radiant_win) row.wins += 1;
      } else row.bans += 1;
      if (index < 4) row.early += 1;
      heroes.set(row.id, row);
    });
  }
  return { analyzed, rows: [...heroes.values()].map(row => ({ ...row,
    contest: (row.picks + row.bans) / analyzed,
    winRate: row.picks ? row.wins / row.picks : null,
  })) };
}
