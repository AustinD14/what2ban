import { useState } from "react";
import HeroPortrait from "./HeroPortrait";
import { matchResult, winRate } from "../scouting";

export default function PlayerCard({ player, summary, catalog, minimum, sort, view, draft, onHero, onTeam, onRemove, onRetry }) {
  const [expanded, setExpanded] = useState(false);
  const unavailable = new Map(draft.map((action) => [action.id, action]));
  const rows = summary.heroes.filter((row) => row.games >= minimum).sort((a, b) => {
    if (sort === "last") return b.last - a.last || b.games - a.games;
    if (sort === "recent") return b.recent - a.recent || b.last - a.last;
    if (sort === "wins") return (b.wins / (b.decided || 1)) - (a.wins / (a.decided || 1)) || b.games - a.games;
    return b.games - a.games || b.last - a.last;
  });
  const shown = expanded ? rows : rows.slice(0, 8);
  const name = (id) => catalog[id]?.localized_name ?? `Hero ${id}`;
  return (
    <article className="player-card" aria-label={player.name}>
      <header className="player-header">
        <span className="avatar">{player.name.slice(0, 2).toUpperCase()}</span>
        <div className="player-identity"><h2>{player.name}</h2><a href={`https://www.opendota.com/players/${player.id}`} target="_blank" rel="noreferrer">{player.id} ↗</a></div>
        <button className="icon-button" onClick={onRemove} aria-label={`Remove ${player.name}`}>×</button>
      </header>
      <div className="player-meta">
        <select aria-label={`Team for ${player.name}`} value={player.team} onChange={(event) => onTeam(event.target.value)}>
          <option value="them">Opponents</option><option value="us">Your team</option><option value="watch">Watchlist</option>
        </select>
        <span>{player.status === "ready" ? `${summary.sample.length} matches · ${summary.heroes.length} heroes` : "History"}</span>
      </div>
      {player.status === "queued" && <div className="card-message" role="status">Queued. Waiting for other players to finish loading…</div>}
      {player.status === "loading" && <div className="card-message" role="status">Loading match history…</div>}
      {player.status === "retrying" && <div className="card-message" role="status">OpenDota is slow to respond. Trying once more…</div>}
      {player.status === "error" && <div className="card-message"><p role="alert">{player.error}</p><button onClick={onRetry}>Retry</button></div>}
      {player.status === "ready" && summary.sample.length === 0 && <div className="card-message">No matches in this window. Try a longer date range. Private or untracked matches may be unavailable.</div>}
      {player.status === "ready" && summary.sample.length > 0 && (
        <>
          <div className="recent-strip" aria-label="Recent hero sequence">
            {summary.recent.slice(0, 10).map((match) => (
              <button key={match.match_id} onClick={() => onHero(match.hero_id)} title={`${name(match.hero_id)} · ${new Date(match.start_time * 1000).toLocaleDateString()}`} aria-label={`Inspect recent ${name(match.hero_id)}`}>
                <HeroPortrait hero={catalog[match.hero_id]} />
                <span className={matchResult(match) === null ? "neutral" : matchResult(match) ? "win" : "loss"} />
              </button>
            ))}
          </div>
          {view === "pool" ? (
            <>
              <div className="hero-table">
                <div className="hero-table-head"><span>Hero</span><span>Games</span><span>Win %</span><span>Recent</span></div>
                {shown.map((row) => (
                  <button className={`hero-row ${unavailable.has(row.id) ? "unavailable" : ""}`} key={row.id} onClick={() => onHero(row.id)} aria-label={`Inspect ${name(row.id)} for ${player.name}`}>
                    <span className="hero-label"><HeroPortrait hero={catalog[row.id]} /><span>{name(row.id)}<small>{unavailable.get(row.id)?.label ?? `Last played ${new Date(row.last * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}</small></span></span>
                    <span>{row.games}</span><span>{winRate(row)}</span><span className={row.recent ? "recent-number" : "muted"}>{row.recent || "—"}</span>
                  </button>
                ))}
                {!rows.length && <p className="card-message">No heroes meet the minimum games filter.</p>}
              </div>
              {rows.length > 8 && <button className="text-button card-expand" onClick={() => setExpanded(!expanded)}>{expanded ? "Show fewer" : `Show all ${rows.length} heroes`}</button>}
            </>
          ) : (
            <div className="match-feed">
              {summary.recent.map((match) => {
                const result = matchResult(match);
                return <a key={match.match_id} href={`https://www.opendota.com/matches/${match.match_id}`} target="_blank" rel="noreferrer" className="match-row">
                  <HeroPortrait hero={catalog[match.hero_id]} /><span>{name(match.hero_id)}<small>{new Date(match.start_time * 1000).toLocaleDateString()}</small></span>
                  <b className={result === null ? "muted" : result ? "win-text" : "loss-text"}>{result === null ? "—" : result ? "W" : "L"}</b>
                  <span>{Number.isFinite(match.duration) ? Math.round(match.duration / 60) + "m" : "—"} ↗</span>
                </a>;
              })}
            </div>
          )}
          <footer className="player-footer">{rows.filter((row) => !unavailable.has(row.id)).length} / {rows.length} filtered heroes available <span>Newest first in strip</span></footer>
        </>
      )}
    </article>
  );
}
