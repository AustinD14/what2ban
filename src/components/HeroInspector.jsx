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
    // One Ancient+ snapshot supplies both pair results and overall baselines;
    // openDota.js reuses it across inspector opens and reloads for six hours.
    // Scouting history filters and the Meta tournament do not alter this sample.
    // Methodology lives in ancientMatchups.js and matchupAdvantage.js comments
    // rather than explanatory banners in the hero card.
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
    </aside>
  );
}
