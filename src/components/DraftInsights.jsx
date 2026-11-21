import { getDraftInsights } from "../draftInsights";
import HeroPortrait from "./HeroPortrait";
import { signedPoints } from '../draftRecommendations';

export default function DraftInsights({ draft, players, catalog, minimum, onHero, onAction, samples = {}, results = {}, playerId = '', onPlayer, onLoad, meta = null }) {
  const insights = getDraftInsights(draft, players, catalog, minimum, samples, playerId, meta);
  const opponents = draft.filter(action => action.type === 'them');
  function options(rows, type) {
    return rows.map((row) => (
      <div className="draft-option" key={row.id}>
        <button className="draft-option-hero" onClick={() => onHero(row.id)} aria-label={`Inspect ${catalog[row.id].localized_name} ${type === "us" ? "pick" : "ban"} option`}>
          <HeroPortrait hero={catalog[row.id]} /><strong>{catalog[row.id].localized_name}</strong>
        </button>
        {!!row.fills.length && <p>{type === "us" ? "Adds" : "Would give opponents"}: {row.fills.join(", ").toLowerCase()}.</p>}
        {row.tournament && <small>{row.tournament.picks} picks · {row.tournament.bans} bans in {row.tournament.analyzed} tournament drafts</small>}
        {type === 'us' ? <>
          {row.comfort.map(player => <small key={player.id ?? player.name}>{player.name}: {player.games} games, {player.recent} recent · {player.decided ? `${Math.round(player.wins / player.decided * 100)}% wins in ${player.decided} decided games` : 'Win rate unavailable'}</small>)}
          {row.matchups.map(match => <small key={match.opponent}>{signedPoints(match.advantage)} vs {catalog[match.opponent]?.localized_name ?? match.opponent} · {match.games.toLocaleString()} games</small>)}
          {!!opponents.length && <small>{row.matchups.length}/{opponents.length} opponents with usable matchup data (100+ games).</small>}
          <details><summary>Why this pick?</summary>
            <p>{row.comfort.length ? `${row.comfort[0].name}: this hero makes up ${Math.round(row.comfort[0].share * 100)}% of their filtered games.` : 'No qualifying player history. This is a general meta and matchup option.'}</p>
            <p>Player comfort {row.comfortScore.toFixed(1)} · Tournament meta {row.metaScore.toFixed(1)} · Matchups {row.matchupScore.toFixed(1)} · Role coverage {row.roleScore}</p>
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
      <p className="muted small">{insights.metaAvailable ? `Meta: ${meta.name} · ${meta.analyzed} complete drafts` : meta && meta.analyzed < 5 ? `Meta: ${meta.name} needs at least 5 complete drafts.` : 'Select and load a recent tournament in Meta to include pro pick/ban priority.'}</p>
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
        <p className="muted small">{insights.genericPicks ? "Load your team's histories for player-specific picks." : "Your team's comfort heroes, weighted by tournament priority and loaded matchups."}</p>
        {options(insights.picks, "us")}
        {!insights.picks.length && <p className="muted small">No available options match the current filters.</p>}
      </>}
      <h3>Ban options</h3>
      <p className="muted small">Opponent comfort heroes, weighted by tournament priority.</p>
      {options(insights.bans, "ban")}
      {!insights.bans.length && <p className="muted small">No available opponent heroes in the loaded histories. Add opponents or adjust the history filters.</p>}
    </aside>
  );
}
