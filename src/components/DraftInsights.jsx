import { getDraftInsights } from "../draftInsights";
import HeroPortrait from "./HeroPortrait";
import { signedPoints } from '../draftRecommendations';

export default function DraftInsights({ draft, players, catalog, minimum, onHero, onAction, samples = {}, results = {}, playerId = '', onPlayer, onLoad }) {
  const insights = getDraftInsights(draft, players, catalog, minimum, samples, playerId);
  const opponents = draft.filter(action => action.type === 'them');
  function options(rows, type) {
    return rows.map((row) => (
      <div className="draft-option" key={row.id}>
        <button className="draft-option-hero" onClick={() => onHero(row.id)} aria-label={`Inspect ${catalog[row.id].localized_name} ${type === "us" ? "pick" : "ban"} option`}>
          <HeroPortrait hero={catalog[row.id]} /><strong>{catalog[row.id].localized_name}</strong>
        </button>
        {!!row.fills.length && <p>{type === "us" ? "Adds" : "Would give opponents"}: {row.fills.join(", ").toLowerCase()}.</p>}
        {type === 'us' ? <>
          {row.comfort.map(player => <small key={player.id ?? player.name}>{player.name}: {player.games} games, {player.recent} recent · {player.decided ? `${Math.round(player.wins / player.decided * 100)}% wins in ${player.decided} decided games` : 'Win rate unavailable'}</small>)}
          {row.matchups.map(match => <small key={match.opponent}>{signedPoints(match.advantage)} vs {catalog[match.opponent]?.localized_name ?? match.opponent} · {match.games.toLocaleString()} games</small>)}
          {!!opponents.length && <small>{row.matchups.length}/{opponents.length} opponents with usable matchup data (100+ games).</small>}
          <details><summary>Why this pick?</summary>
            <p>{row.comfort.length ? `Comfort score uses ${row.comfort[0].name}'s history; other teammates' games are not added to their score.` : 'No qualifying player history. This is a general role and matchup option.'}</p>
            <p>{row.fills.length ? `Fills missing role tags: ${row.fills.join(', ')}.` : 'Does not add a missing role tag.'}</p>
            <p>{row.advantage === null ? 'Matchup strength is unknown and adds no points.' : `Average adjusted advantage: ${signedPoints(row.advantage)} across the opponents shown. Missing matchups add no points.`}</p>
            <p>Recommendation score: {row.score.toFixed(1)}. This is a ranking aid, not a predicted win rate.</p>
          </details>
        </> : row.players.map((player) => <small key={player}>{player}</small>)}
        <button className="text-button" onClick={() => onAction(row.id, type)}>{type === "us" ? "Pick" : "Ban"} {catalog[row.id].localized_name}</button>
      </div>
    ));
  }
  return (
    <aside className="surface draft-insights" aria-label="Draft insights">
      <h2>Draft insights</h2>
      <h3>Your lineup</h3>
      <div className="role-coverage">{insights.ours.map(({ role, label, heroes }) => (
        <div key={role} className={heroes.length ? "role-covered" : "role-missing"}>
          <span>{label}</span><strong>{heroes.length || "Missing"}</strong>
          {!!heroes.length && <small>{heroes.join(", ")}</small>}
        </div>
      ))}</div>
      <p className="muted small">Based on hero role tags. Items, lanes and ability details can change coverage.</p>
      <h3>Pick options</h3>
      <label className="recommend-player">Recommend for<select aria-label="Recommend for" value={playerId} onChange={event => onPlayer?.(event.target.value)}>
        <option value="">Anyone on your team</option>
        {players.filter(player => player.team === 'us').map(player => <option key={player.id ?? player.name} value={player.id ?? player.name}>{player.name}</option>)}
      </select></label>
      {!!opponents.length && <div className="matchup-loads">
        <p className="muted small">Load opponent matchups to include Ancient+ counter strength. Uses the hero-card cache.</p>
        {opponents.map(({ id }) => <div key={id}>
          <button disabled={results[id]?.status === 'loading'} onClick={() => onLoad?.(id)}>
            {results[id]?.status === 'loading' ? 'Loading' : samples[id] ? 'Reload' : 'Load'} {catalog[id]?.localized_name ?? id} matchups
          </button>
          {samples[id] && <small>Loaded · {samples[id].sample_size.toLocaleString()} sampled matches</small>}
          {results[id]?.error && <p className="error" role="alert">{results[id].error}</p>}
        </div>)}
      </div>}
      {insights.ourFull ? <p className="muted small">Five picks recorded.</p> : <>
        <p className="muted small">{insights.genericPicks ? "General role and loaded matchup options. Load your team's histories for comfort picks." : "Comfort picks balance experience, recent use, win record, missing roles and loaded opponent matchups. History filters apply."}</p>
        {options(insights.picks, "us")}
        {!insights.picks.length && <p className="muted small">No available options match the current filters.</p>}
      </>}
      <h3>Ban options</h3>
      <p className="muted small">Opponent pools, sorted by their missing roles, recent games, then total games.</p>
      {options(insights.bans, "ban")}
      {!insights.bans.length && <p className="muted small">No available opponent heroes in the loaded histories. Add opponents or adjust the history filters.</p>}
      <details className="muted small"><summary>How pick ranking works</summary>
        <p>Experience: up to 35 points on a logarithmic scale, capped at 50 games. Recent use: 2 points per game, capped at 20. Win record: up to 15 points, using (wins + 5) / (decided games + 10) to reduce small-sample swings. The highest-scoring eligible teammate supplies the comfort score.</p>
        <p>Missing role tags add 5 points each, capped at 15. Average adjusted matchup advantage adds 2 points per percentage point, capped at ±15. Only loaded matchups with at least 100 games count. These whole-match results do not measure lane wins or predict a five-hero lineup's win rate.</p>
      </details>
    </aside>
  );
}
