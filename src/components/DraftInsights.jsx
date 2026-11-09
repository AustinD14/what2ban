import { getDraftInsights } from "../draftInsights";
import HeroPortrait from "./HeroPortrait";

export default function DraftInsights({ draft, players, catalog, minimum, onHero, onAction }) {
  const insights = getDraftInsights(draft, players, catalog, minimum);
  function options(rows, type) {
    return rows.map((row) => (
      <div className="draft-option" key={row.id}>
        <button className="draft-option-hero" onClick={() => onHero(row.id)} aria-label={`Inspect ${catalog[row.id].localized_name} ${type === "us" ? "pick" : "ban"} option`}>
          <HeroPortrait hero={catalog[row.id]} /><strong>{catalog[row.id].localized_name}</strong>
        </button>
        {!!row.fills.length && <p>{type === "us" ? "Adds" : "Would give opponents"}: {row.fills.join(", ").toLowerCase()}.</p>}
        {row.players.map((player) => <small key={player}>{player}</small>)}
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
      {insights.ourFull ? <p className="muted small">Five picks recorded.</p> : <>
        <p className="muted small">{insights.genericPicks ? "Role matches only. Load your team's histories for player-specific options." : "Your team's pools, sorted by missing roles, recent games, then total games."}</p>
        {options(insights.picks, "us")}
        {!insights.picks.length && <p className="muted small">No available options match the current filters.</p>}
      </>}
      <h3>Ban options</h3>
      <p className="muted small">Opponent pools, sorted by their missing roles, recent games, then total games.</p>
      {options(insights.bans, "ban")}
      {!insights.bans.length && <p className="muted small">No available opponent heroes in the loaded histories. Add opponents or adjust the history filters.</p>}
      <p className="muted small">These are pool and role matches, not counter ratings. Open a hero to check matchup stats.</p>
    </aside>
  );
}
