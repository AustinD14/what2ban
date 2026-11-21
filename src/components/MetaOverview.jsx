import { useEffect, useMemo, useState } from "react";
import { describeError, isRateLimited, loadLeagues, loadLeagueMatches, loadDraftMatch } from "../openDota";
import { summarizeTournament, filterRecentLeagues } from "../meta";
import HeroPortrait from "./HeroPortrait";

const BATCH = 20;
const percent = value => value === null ? "—" : `${(value * 100).toFixed(1)}%`;

function Tournament({ league, catalog, players, onHero, active, onMetaChange }) {
  const [matches, setMatches] = useState(null);
  const [results, setResults] = useState({});
  const [limit, setLimit] = useState(BATCH);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [sort, setSort] = useState("contest");
  const [minimum, setMinimum] = useState(0);
  const [search, setSearch] = useState("");
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const { signal } = controller;
    setBusy(true);
    setError("");
    async function run() {
      try {
        const list = matches ?? [...new Map((await loadLeagueMatches(league.leagueid, { signal }))
          .map(row => [row.match_id, row])).values()].sort((a, b) => b.match_id - a.match_id);
        if (signal.aborted) return;
        setMatches(list);
        for (const row of list.slice(0, limit)) {
          if (signal.aborted) return;
          if (results[row.match_id]?.data) continue;
          try {
            const data = await loadDraftMatch(row.match_id, { signal });
            if (signal.aborted) return;
            setResults(current => ({ ...current, [row.match_id]: { data } }));
          } catch (reason) {
            if (signal.aborted) return;
            setResults(current => ({ ...current, [row.match_id]: { failed: true } }));
            setError(describeError(reason));
            if (isRateLimited(reason)) break;
          }
        }
      } catch (reason) { if (!signal.aborted) setError(describeError(reason)); }
      finally { if (!signal.aborted) setBusy(false); }
    }
    run();
    return () => controller.abort();
    // Each run captures completed results; updates render progress without restarting work.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league.leagueid, limit, attempt, active]);

  const completed = Object.values(results).filter(row => row.data).map(row => row.data);
  const summary = useMemo(() => summarizeTournament(Object.values(results).filter(row => row.data).map(row => row.data)), [results]);
  // Share complete drafts already loaded by the user. Recommendation consumers
  // never fetch their own tournament data or use the table's display filters.
  useEffect(() => {
    onMetaChange?.({ leagueid: league.leagueid, name: league.name, last_match_time: league.last_match_time, ...summary });
  }, [league.leagueid, league.name, league.last_match_time, summary, onMetaChange]);
  const failed = Object.values(results).filter(row => row.failed).length;
  const rows = summary.rows.filter(row => row.picks >= minimum &&
    (catalog[row.id]?.localized_name ?? `Hero ${row.id}`).toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => (b[sort] ?? -1) - (a[sort] ?? -1) || b.contest - a.contest || a.id - b.id);
  return <section className="surface meta-results" aria-label="Tournament statistics">
    <div className="section-heading"><div><span className="eyebrow">TOURNAMENT META</span><h2>{league.name}</h2></div>
      <span className="meta-badge">{busy ? "Loading progressively" : "Snapshot"}</span></div>
    <div className="meta-metrics">
      <div><strong>{summary.analyzed}</strong><span>Complete drafts analyzed</span></div>
      <div><strong>{matches?.length ?? "—"}</strong><span>Matches listed by OpenDota</span></div>
      <div><strong>{completed.length - summary.analyzed}</strong><span>Missing or incomplete drafts</span></div>
      <div><strong>{failed}</strong><span>Requests failed</span></div>
    </div>
    <p role="status">{busy ? "Loading match drafts… " : ""}Drafts available for {summary.analyzed} of {matches?.length ?? "…"} listed matches. {completed.length} checked.</p>
    {busy && <progress aria-label="Draft loading progress" value={Object.keys(results).length} max={Math.max(1, Math.min(limit, matches?.length ?? limit))} />}
    {error && <p role="alert" className="error">{error}</p>}
    <div className="meta-controls">
      {!busy && (error || (matches && Object.keys(results).length < Math.min(limit, matches.length))) && <button onClick={() => setAttempt(value => value + 1)}>Retry loading</button>}
      {!busy && matches && limit < matches.length && <button onClick={() => setLimit(value => value + BATCH)}>Load next {Math.min(BATCH, matches.length - limit)} matches</button>}
    </div>
    <p className="muted small">Newest matches first, loaded in groups of 20. Percentages use complete drafts checked so far, not the entire tournament. A tournament can span patches. Player history filters do not filter these results.</p>
    <div className="meta-controls">
      <label>Find hero<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Hero name" /></label>
      <label>Sort by<select value={sort} onChange={event => setSort(event.target.value)}>{[["contest", "Contest rate"], ["picks", "Picks"], ["bans", "Bans"], ["winRate", "Win rate"], ["early", "Early priority"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Minimum picks<select value={minimum} onChange={event => setMinimum(Number(event.target.value))}>{[0, 3, 5, 10, 20].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
    </div>
    <div className="meta-table-scroll" tabIndex="0" role="region" aria-label="Hero statistics table">
      <table className="meta-table"><caption className="sr-only">Tournament hero picks, bans and wins</caption>
        <thead><tr><th>Hero</th><th>Picks</th><th>Bans</th><th>Contest</th><th>Win rate</th><th>Early</th></tr></thead>
        <tbody>{rows.map(row => {
          const opponents = players.filter(player => player.team === "them" && player.summary.heroes.some(hero => hero.id === row.id));
          return <tr key={row.id}><td><button className="meta-hero" onClick={() => onHero(row.id)}><HeroPortrait hero={catalog[row.id]} /><span>{catalog[row.id]?.localized_name ?? `Hero ${row.id}`}<small>{opponents.length ? `Played by ${opponents.map(player => player.name).join(", ")}` : "Inspect hero"}</small></span></button></td>
            <td>{row.picks}</td><td>{row.bans}</td><td>{percent(row.contest)}</td><td>{percent(row.winRate)}<small>{row.wins}/{row.picks} wins</small></td><td>{row.early}</td></tr>;
        })}</tbody></table>
    </div>
    {!rows.length && !busy && <p className="muted">{matches?.length === 0 ? "No matches are available for this tournament." : summary.analyzed ? "No heroes match these filters." : "No complete drafts available in the checked matches."}</p>}
    <p className="small muted">Contest = picked or banned in an analyzed game. Early = appearances in the first four draft actions (picks or bans). Win rate uses picks only. Opponent names use your currently filtered scouting histories.</p>
  </section>;
}

export default function MetaOverview({ catalog, players, onHero, active = true, onMetaChange }) {
  const [leagues, setLeagues] = useState([]);
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [days, setDays] = useState(90);
  const [majorOnly, setMajorOnly] = useState(true);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    setBusy(true); setError("");
    loadLeagues({ signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setLeagues(data);
    }).catch(reason => { if (!controller.signal.aborted) setError(describeError(reason)); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [attempt, active]);
  const filtered = filterRecentLeagues(leagues, { days, majorOnly, search });
  const league = filtered.find(row => String(row.leagueid) === selected);
  useEffect(() => { if (!league) onMetaChange?.(null); }, [league, onMetaChange]);
  function changeFilter(update) { setSelected(''); update(); }
  return <div className="meta-overview">
    <section className="surface meta-picker" aria-label="Choose tournament">
      <h2>Professional tournament meta</h2><p className="muted">Explore which heroes teams prioritize, then compare them with your opponents’ pools.</p>
      <div className="meta-controls">
        <label>Activity<select value={days} onChange={event => changeFilter(() => setDays(Number(event.target.value)))}>{[30, 60, 90].map(value => <option key={value} value={value}>Last {value} days</option>)}</select></label>
        <label>Events<select value={majorOnly ? 'major' : 'all'} onChange={event => changeFilter(() => setMajorOnly(event.target.value === 'major'))}><option value="major">Major event series</option><option value="all">All professional events</option></select></label>
        <label>Find tournament<input value={search} onChange={event => changeFilter(() => setSearch(event.target.value))} placeholder="Search recent tournaments" /></label>
        <label>Tournament<select value={league ? selected : ''} onChange={event => setSelected(event.target.value)} disabled={busy}><option value="">Select a tournament</option>{filtered.map(row => <option key={row.leagueid} value={row.leagueid}>{row.name} · {new Date(row.last_match_time * 1000).toLocaleDateString()}</option>)}</select></label></div>
      {busy && <p role="status">Loading tournaments…</p>}
      {error && <div><p role="alert" className="error">{error}</p><button onClick={() => setAttempt(value => value + 1)}>Retry tournaments</button></div>}
      {!busy && !error && !filtered.length && <p>No recent tournaments match. Try All professional events or a wider activity window.</p>}
      <p className="small muted">Latest match first. Major series is a name-based preset, not an official Tier 1 rating.</p>
    </section>
    {league ? <Tournament key={league.leagueid} league={league} catalog={catalog} players={players} onHero={onHero} active={active} onMetaChange={onMetaChange} /> : <section className="empty-state"><span className="eyebrow">PRO PLAY</span><h2>See what makes the draft</h2><p>Select a tournament to explore picks, bans, win rates and early priorities.</p></section>}
  </div>;
}
