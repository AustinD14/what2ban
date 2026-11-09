import { useEffect, useRef, useState } from "react";
import { loadMatchups } from "../openDota";
import HeroPortrait from "./HeroPortrait";

export default function HeroInspector({ id, catalog, draft, players, onAction, onClose, onHero }) {
  const [result, setResult] = useState({ status: "loading", data: [] });
  const [minimum, setMinimum] = useState(100);
  const [direction, setDirection] = useState("difficult");
  const [attempt, setAttempt] = useState(0);
  const cache = useRef(new Map());
  const title = useRef(null);
  const hero = catalog[id];
  const name = hero?.localized_name ?? `Hero ${id}`;
  const action = draft.find((item) => item.id === id);

  useEffect(() => {
    let active = true;
    title.current?.focus();
    if (cache.current.has(id)) {
      setResult({ status: "ready", data: cache.current.get(id) });
    } else {
      setResult({ status: "loading", data: [] });
      loadMatchups(id).then((data) => {
        cache.current.set(id, data);
        if (active) setResult({ status: "ready", data });
      }).catch(() => {
        if (active) setResult({ status: "error", data: [] });
      });
    }
    return () => { active = false; };
  }, [id, attempt]);

  useEffect(() => {
    function closeOnEscape(event) { if (event.key === "Escape") onClose(); }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const rows = result.data.filter((row) => row.games_played >= minimum && row.hero_id !== id)
    .sort((a, b) => {
      const difference = a.wins / a.games_played - b.wins / b.games_played;
      return (direction === "difficult" ? difference : -difference) || b.games_played - a.games_played;
    }).slice(0, 12);

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
      <p className="small muted">Historical professional matches. Rates below are <strong>{name}’s</strong> win rate against each hero.</p>
      <div className="segmented">
        <button aria-pressed={direction === "difficult"} onClick={() => setDirection("difficult")}>Difficult</button>
        <button aria-pressed={direction === "favorable"} onClick={() => setDirection("favorable")}>Favorable</button>
      </div>
      <label className="inline-filter">Minimum matches <select value={minimum} onChange={(event) => setMinimum(Number(event.target.value))}>{[20, 50, 100, 250, 500].map((count) => <option key={count}>{count}</option>)}</select></label>
      {result.status === "loading" && <p role="status">Loading matchups…</p>}
      {result.status === "error" && <div><p role="alert">Matchups couldn’t load.</p><button onClick={() => setAttempt(attempt + 1)}>Retry matchups</button></div>}
      {result.status === "ready" && !rows.length && <p className="muted">No matchups meet this sample size.</p>}
      <div className="matchup-list">
        {rows.map((row) => {
          const users = players.filter((player) => player.summary.heroes.some((entry) => entry.id === row.hero_id));
          return (
            <button className="matchup-row" key={row.hero_id} onClick={() => onHero(row.hero_id)}>
              <HeroPortrait hero={catalog[row.hero_id]} />
              <span>{catalog[row.hero_id]?.localized_name ?? `Hero ${row.hero_id}`}<small>{row.games_played.toLocaleString()} matches{users.length > 0 && ` · ${users.map((player) => player.name).join(", ")}`}</small></span>
              <b>{Math.round(row.wins / row.games_played * 100)}%</b>
            </button>
          );
        })}
      </div>
      <p className="small muted">Historical results can span patches and differ from your lobby.</p>
    </aside>
  );
}
