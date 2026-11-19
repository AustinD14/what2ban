export const RECENT_TOURNAMENT_DAYS = 90;

// League IDs are registration order, not event dates. One indexed, aggregated
// query finds active tournaments without requesting each league's match list.
export const RECENT_LEAGUES_QUERY = `SELECT l.leagueid, l.name, l.tier, max(m.start_time) AS last_match_time
  FROM matches m JOIN leagues l ON l.leagueid = m.leagueid
  WHERE m.start_time >= extract(epoch from now()) - ${RECENT_TOURNAMENT_DAYS} * 86400
    AND m.start_time <= extract(epoch from now())
    AND l.tier IN ('premium', 'professional')
  GROUP BY l.leagueid, l.name, l.tier ORDER BY last_match_time DESC`;

// OpenDota's premium/professional labels are not Tier 1 classifications.
// This discoverability preset is deliberately name-based, not an asserted tier.
export function isMajorEvent(league) {
  if (/qualif|division\s*(?:2|ii)\b|challenger|open\s+stage/i.test(league.name)) return false;
  return league.tier === 'premium' || /\b(the international|dreamleague|esl one|pgl wallachia|blast\s+(?:dota\s+)?slam|riyadh masters|esports world cup|fissure universe)\b/i.test(league.name);
}

export function filterRecentLeagues(leagues, { days = RECENT_TOURNAMENT_DAYS, majorOnly = true, search = '', now = Date.now() } = {}) {
  const cutoff = now / 1000 - days * 86400;
  const query = search.trim().toLowerCase();
  return leagues.filter(row => ['premium', 'professional'].includes(row.tier)
    && Number.isFinite(row.last_match_time) && row.last_match_time >= cutoff && row.last_match_time <= now / 1000
    && (!majorOnly || isMajorEvent(row)) && row.name.toLowerCase().includes(query))
    .sort((a, b) => b.last_match_time - a.last_match_time || b.leagueid - a.leagueid);
}

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
