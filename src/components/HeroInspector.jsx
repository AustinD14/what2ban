import { useEffect, useRef, useState } from "react";
import { describeError, loadAncientMatchups, peekAncientMatchups } from "../openDota";
import { rankMatchups } from "../matchupAdvantage";
import HeroPortrait from "./HeroPortrait";

export default function HeroInspector({ id, catalog, draft, players, onAction, onClose, onHero }) {
  const [result, setResult] = useState({ status: "loading", data: [] });
  const [minimum, setMinimum] = useState(100);
  const [direction, setDirection] = useState("difficult");
  const [attempt, setAttempt] = useState(0);
  const [metric, setMetric] = useState("advantage");
  const title = useRef(null);
  const hero = catalog[id];
  const name = hero?.localized_name ?? `Hero ${id}`;
  const action = draft.find((item) => item.id === id);

  useEffect(() => {
    let active = true;
    title.current?.focus();
    // Matchups are cached across inspector opens and reloads by openDota.js.
    const ready = sample => ({ status: "ready", data: sample.matchups, sample });
    const cachedRows = peekAncientMatchups(id);
    if (cachedRows) {
      setResult(ready(cachedRows));
    } else {
      setResult({ status: "loading", data: [] });
      loadAncientMatchups(id).then((data) => {
        if (active) setResult(ready(data));
      }).catch((error) => {
        if (active) setResult({ status: "error", data: [], message: describeError(error) });
      });
    }
    return () => { active = false; };
  }, [id, attempt]);

  useEffect(() => {
    function closeOnEscape(event) { if (event.key === "Escape") onClose(); }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const baselines = Object.fromEntries((result.sample?.baselines ?? []).map(row => [row.hero_id, row]));
  const baselineAvailable = Boolean(baselines[id]);
  const effectiveMetric = metric === "advantage" && baselineAvailable ? "advantage" : "winRate";
  const rows = rankMatchups(result.data, id, baselines, minimum, direction, effectiveMetric);
  const missingBaselines = baselineAvailable ? result.data.filter(row => row.hero_id !== id && row.games_played >= minimum && !baselines[row.hero_id]).length : 0;

  return (
    <aside className="inspector" aria-label="Hero details">
      <div className="section-caption"><span>HERO DETAILS</span><button className="icon-button" onClick={onClose} aria-label="Close hero details">×</button></div>
      <HeroPortrait hero={hero} className="inspector-portrait" />
      <h2 ref={title} tabIndex="-1">{name}</h2>
      <p className="muted">{hero?.roles?.join(" · ") || "Role data unavailable"}</p>
      <div className="draft-actions">
        {action ? <button onClick={() => onAction(id, null)}>Undo {action.label.toLowerCase()}</button> : (
          <>
            <button onClick={() => onAction(id, "ban")}>Ban</button>
            <button disabled={draft.filter((row) => row.type === "us").length >= 5} onClick={() => onAction(id, "us")}>Our pick</button>
            <button disabled={draft.filter((row) => row.type === "them").length >= 5} onClick={() => onAction(id, "them")}>Their pick</button>
          </>
        )}
      </div>
      <div className="inspector-divider" />
      <h3>Matchup explorer</h3>
      <p className="small muted">Ancient+ average lobby rank · ranked All Pick · recent sample (up to 30 days old) · cached up to 6 hours. All numbers are from <strong>{name}’s</strong> perspective.</p>
      {result.sample && <p className="small muted">{result.sample.sample_size.toLocaleString()} sampled public matches{result.sample.oldest !== null && result.sample.newest !== null && ` · ${new Date(result.sample.oldest * 1000).toLocaleDateString()} – ${new Date(result.sample.newest * 1000).toLocaleDateString()}`}. Uses up to the latest 50,000 eligible matches available from OpenDota, not every pub game.</p>}
      <label className="inline-filter">Rank by <select value={metric} onChange={event => setMetric(event.target.value)}><option value="advantage">Adjusted advantage</option><option value="winRate">Raw win rate</option></select></label>
      <div className="segmented">
        <button aria-pressed={direction === "difficult"} onClick={() => setDirection("difficult")}>{effectiveMetric === "advantage" ? "Countered by" : "Difficult"}</button>
        <button aria-pressed={direction === "favorable"} onClick={() => setDirection("favorable")}>{effectiveMetric === "advantage" ? "Counters" : "Favorable"}</button>
      </div>
      <label className="inline-filter">Minimum matches <select value={minimum} onChange={(event) => setMinimum(Number(event.target.value))}>{[20, 50, 100, 250, 500].map((count) => <option key={count}>{count}</option>)}</select></label>
      {result.status === "ready" && metric === "advantage" && !baselineAvailable && <p className="small muted">No Ancient+ baseline for this hero in the available sample. No professional or lower-rank data is substituted.</p>}
      {metric === "advantage" && missingBaselines > 0 && <p className="small muted">{missingBaselines} matchups omitted because their hero baseline is unavailable.</p>}
      {result.status === "loading" && <p role="status">Loading matchups…</p>}
      {result.status === "error" && <div><p role="alert">Matchups couldn’t load. {result.message}</p><button onClick={() => setAttempt(attempt + 1)}>Retry matchups</button></div>}
      {result.status === "ready" && !rows.length && <p className="muted">No matchups meet this sample size and ranking direction.</p>}
      <div className="matchup-list">
        {rows.map((row) => {
          const users = players.filter((player) => player.summary.heroes.some((entry) => entry.id === row.hero_id));
          return (
            <button className="matchup-row" key={row.hero_id} onClick={() => onHero(row.hero_id)}>
              <HeroPortrait hero={catalog[row.hero_id]} />
              <span>{catalog[row.hero_id]?.localized_name ?? `Hero ${row.hero_id}`}<small>{row.games_played.toLocaleString()} matches{users.length > 0 && ` · ${users.map((player) => player.name).join(", ")}`}</small></span>
              <span className="matchup-score">
                {effectiveMetric === "advantage" && <b className={row.advantage < 0 ? "loss-text" : "win-text"}>{row.advantage > 0 ? "+" : ""}{(row.advantage * 100).toFixed(1)} pp</b>}
                <b>{Math.round(row.wins / row.games_played * 100)}%</b><small>win rate</small>
                {effectiveMetric === "advantage" && <small>{(row.expected * 100).toFixed(1)}% expected</small>}
              </span>
            </button>
          );
        })}
      </div>
      <details className="matchup-method"><summary>How this ranking works</summary><p className="small muted">Adjusted advantage is observed win rate minus expected win rate, in percentage points (pp). Expected win rate uses both heroes’ overall win rates from exactly the same Ancient+ public-match sample: A × (1 − B) / [A × (1 − B) + (1 − A) × B]. Positive favors {name}; negative favors the opponent. Ancient+ refers to average lobby rank, not every player. Unknown ranks, unranked games and Turbo are excluded. We inspect the latest 250,000 public matches available from OpenDota and use up to 50,000 qualifying matches no older than 30 days. The actual date range above may be much shorter. This is our estimate, not Dotabuff’s formula. It does not adjust for lanes, teammates or patch changes; small samples remain noisy.</p></details>
      <p className="small muted">Scouting filters and the Meta tournament do not change this sample.</p>
    </aside>
  );
}
