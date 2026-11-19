import { useState } from 'react';
import { candidateMatchup, comfortPlayers, signedPoints } from '../draftRecommendations';

export default function LaneMatchups({ draft, players, playerId, catalog, minimum, results, onLoad, onHero, onAction }) {
  const [choice, setChoice] = useState('');
  const [poolOnly, setPoolOnly] = useState(false);
  const unavailable = new Set(draft.map(action => action.id));
  const opponents = Object.values(catalog).filter(hero => !draft.some(action => action.id === hero.id && action.type !== 'them'))
    .sort((a, b) => a.localized_name.localeCompare(b.localized_name));
  const opponent = opponents.some(hero => String(hero.id) === choice) ? Number(choice) : null;
  const result = results[opponent];
  const eligiblePlayers = players.filter(player => player.team === 'us' && (!playerId || String(player.id) === playerId));
  const rows = opponent && result?.sample ? Object.values(catalog)
    .filter(hero => hero.id !== opponent && !unavailable.has(hero.id))
    .map(hero => ({ ...hero, matchup: candidateMatchup(hero.id, opponent, result.sample), comfort: comfortPlayers(hero.id, eligiblePlayers, minimum) }))
    .filter(hero => hero.matchup && (!poolOnly || hero.comfort.length))
    .sort((a, b) => b.matchup.advantage - a.matchup.advantage || b.matchup.games - a.matchup.games || a.id - b.id)
    .slice(0, 12) : [];
  const full = draft.filter(action => action.type === 'us').length >= 5;
  return <section className="surface lane-matchups" aria-label="Lane matchup comparison">
    <h2>Lane matchup comparison</h2>
    <p className="muted">Choose a likely lane opponent to compare available picks. These are Ancient+ whole-match results against that hero, not lane win rates or verified lane pairings.</p>
    <div className="lane-controls">
      <label>Likely lane opponent<select aria-label="Likely lane opponent" value={opponent ?? ''} onChange={event => setChoice(event.target.value)}>
        <option value="">Select a hero</option>
        {opponents.map(hero => <option key={hero.id} value={hero.id}>{hero.localized_name}{draft.some(action => action.id === hero.id && action.type === 'them') ? ' (opponent pick)' : ''}</option>)}
      </select></label>
      <button disabled={!opponent || result?.status === 'loading'} onClick={() => onLoad(opponent)}>{result?.status === 'loading' ? 'Loading comparison…' : 'Compare picks'}</button>
      <label><input type="checkbox" checked={poolOnly} onChange={event => setPoolOnly(event.target.checked)} /> Only comfort heroes</label>
    </div>
    <p className="muted small">Comfort uses the “Recommend for” selection and history filters. Comparison loads one opponent snapshot; it is shared with hero cards and reused for six hours.</p>
    {result?.status === 'loading' && <p role="status">Loading matchup data. Requests may wait during the OpenDota cooldown.</p>}
    {result?.error && <p role="alert" className="error">{result.error} Use Compare picks to retry.</p>}
    {result?.sample && <>
      <p className="muted small">Ancient+ average lobby rank · ranked All Pick · {result.sample.sample_size.toLocaleString()} sampled matches
        {result.sample.oldest && result.sample.newest ? ` · ${new Date(result.sample.oldest * 1000).toLocaleString()} – ${new Date(result.sample.newest * 1000).toLocaleString()}` : ''}.
        {' '}Top available options by adjusted advantage; at least 100 head-to-head games required. Positive means better than expected from the two heroes’ overall win rates.</p>
      {rows.length ? <div className="lane-table-wrap" tabIndex="0" role="region" aria-label="Lane matchup table"><table className="lane-table">
        <thead><tr><th scope="col">Available pick</th><th scope="col">Advantage</th><th scope="col">Match win rate</th><th scope="col">Games</th><th scope="col">Comfort</th><th scope="col">Action</th></tr></thead>
        <tbody>{rows.map(hero => <tr key={hero.id}>
          <th scope="row"><button className="text-button" onClick={() => onHero(hero.id)}>{hero.localized_name}</button></th>
          <td>{signedPoints(hero.matchup.advantage)}</td><td>{(hero.matchup.winRate * 100).toFixed(1)}%</td><td>{hero.matchup.games.toLocaleString()}</td>
          <td>{hero.comfort.length ? hero.comfort.map(player => `${player.name}: ${player.games} games`).join('; ') : 'No qualifying history'}</td>
          <td><button disabled={full} onClick={() => onAction(hero.id, 'us')} aria-label={`Pick ${hero.localized_name} for lane`}>Pick</button></td>
        </tr>)}</tbody>
      </table></div> : <p>No available heroes meet the sample and comfort filters.</p>}
      {full && <p className="muted small">Five picks recorded. Undo a pick before adding another.</p>}
    </>}
  </section>;
}
