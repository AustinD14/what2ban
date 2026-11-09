import { useState } from "react";
import HeroPortrait from "./HeroPortrait";
import DraftInsights from "./DraftInsights";

// Choosing in the dropdown only selects a hero; it's recorded with the Add button or
// Enter in the filter. (On Windows, arrow keys or typing on a closed <select> fire
// `change`, which used to record heroes by accident.)
function DraftHeroSelect({ type, title, draft, catalog, onAction }) {
  const [search, setSearch] = useState("");
  const [choice, setChoice] = useState("");
  const label = title.toLowerCase();
  const query = search.trim().toLowerCase();
  const full = type !== "ban" && draft.filter((action) => action.type === type).length >= 5;
  const available = Object.values(catalog).filter((hero) => !draft.some((action) => action.id === hero.id)
    && hero.localized_name.toLowerCase().includes(query))
    .sort((a, b) => a.localized_name.localeCompare(b.localized_name));
  // An explicit choice wins; otherwise a typed filter targets its first match.
  const selected = available.find((hero) => String(hero.id) === choice) ?? (query ? available[0] : undefined);
  function add(event) {
    event.preventDefault();
    if (full || !selected) return;
    onAction(selected.id, type);
    setSearch("");
    setChoice("");
  }
  return <form className="draft-hero-select" onSubmit={add}>
    <input aria-label={`Search ${label}`} placeholder="Filter heroes…" value={search} disabled={full} onChange={(event) => setSearch(event.target.value)} />
    <div className="draft-hero-add">
      <select aria-label={`Hero for ${label}`} value={selected ? String(selected.id) : ""} disabled={full || !available.length} onChange={(event) => setChoice(event.target.value)}>
        <option value="" disabled>{full ? "Five picks recorded" : available.length ? "Select a hero" : "No heroes found"}</option>
        {available.map((hero) => <option key={hero.id} value={hero.id}>{hero.localized_name}</option>)}
      </select>
      <button type="submit" aria-label={`Add to ${label}`} disabled={full || !selected}>Add</button>
    </div>
  </form>;
}

export default function DraftOverview({ draft, players, catalog, minimum, onHero, onRemove, onAction }) {
  const groups = [{ type: "ban", title: "Banned" }, { type: "us", title: "Your picks" }, { type: "them", title: "Opponent picks" }];
  const overlaps = new Map();
  for (const player of players) {
    if (player.team === "watch") continue;
    for (const hero of player.summary.heroes) {
      if (hero.games < minimum) continue;
      const entry = overlaps.get(hero.id) ?? { id: hero.id, us: [], them: [] };
      entry[player.team].push(`${player.name} (${hero.games})`);
      overlaps.set(hero.id, entry);
    }
  }
  const shared = [...overlaps.values()].filter((row) => row.us.length && row.them.length && !draft.some((action) => action.id === row.id));
  return (
    <div className="draft-overview">
      <DraftInsights draft={draft} players={players} catalog={catalog} minimum={minimum} onHero={onHero} onAction={onAction} />
      <div className="draft-board">
      <div className="draft-columns">
        {groups.map(({ type, title }) => (
          <section className="surface" key={type}>
            <h2>{title} <span className="count">{draft.filter((action) => action.type === type).length}</span></h2>
            <DraftHeroSelect type={type} title={title} draft={draft} catalog={catalog} onAction={onAction} />
            {draft.filter((action) => action.type === type).map((action) => (
              <div className="draft-item" key={action.id}>
                <button onClick={() => onHero(action.id)}><HeroPortrait hero={catalog[action.id]} />{catalog[action.id]?.localized_name ?? `Hero ${action.id}`}</button>
                <button className="icon-button" onClick={() => onRemove(action.id)} aria-label={`Undo ${catalog[action.id]?.localized_name ?? action.id}`}>×</button>
              </div>
            ))}
            {!draft.some((action) => action.type === type) && <p className="muted">Nothing recorded yet.</p>}
          </section>
        ))}
      </div>
      <section className="surface overlap" aria-label="Shared hero pools">
        <div className="section-heading"><h2>Shared hero pools</h2><span className="muted">Available heroes played by both sides</span></div>
        {!shared.length && <p className="muted">No overlap in the loaded histories. Assign players to both teams to compare.</p>}
        {shared.map((row) => (
          <button className="overlap-row" key={row.id} onClick={() => onHero(row.id)}>
            <span className="hero-label"><HeroPortrait hero={catalog[row.id]} />{catalog[row.id]?.localized_name ?? `Hero ${row.id}`}</span>
            <span><small>YOUR TEAM · GAMES</small>{row.us.join(", ")}</span>
            <span><small>OPPONENTS · GAMES</small>{row.them.join(", ")}</span>
          </button>
        ))}
      </section>
      </div>
    </div>
  );
}
