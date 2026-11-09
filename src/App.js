import { useEffect, useRef, useState } from "react";
import fallbackHeroes from "./Data/heroes.json";
import roster from "./Data/savedRoster.json";
import { loadHeroes, loadPlayerMatches, loadProfile } from "./openDota";
import { HISTORY_SIZES, summarizeMatches, validPlayerId } from "./scouting";
import PlayerCard from "./components/PlayerCard";
import HeroInspector from "./components/HeroInspector";
import DraftOverview from "./components/DraftOverview";

const ACTION_LABELS = { ban: "Banned", us: "Your pick", them: "Opponent pick" };

export default function App() {
  const [players, setPlayers] = useState([]);
  const [catalog, setCatalog] = useState(fallbackHeroes);
  const [catalogError, setCatalogError] = useState(false);
  const [tab, setTab] = useState("scout");
  const [view, setView] = useState("pool");
  const [team, setTeam] = useState("all");
  const [historyIndex, setHistoryIndex] = useState(2);
  const [recentSize, setRecentSize] = useState(20);
  const [days, setDays] = useState(0);
  const [minimum, setMinimum] = useState(1);
  const [sort, setSort] = useState("games");
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [rosterOpen, setRosterOpen] = useState(false);
  const [selectedHero, setSelectedHero] = useState(null);
  const [heroSearch, setHeroSearch] = useState("");
  const [draft, setDraft] = useState([]);
  const requests = useRef(new Map());

  useEffect(() => {
    let active = true;
    loadHeroes().then((heroes) => {
      if (active) setCatalog({ ...fallbackHeroes, ...Object.fromEntries(heroes.map((hero) => [hero.id, hero])) });
    }).catch(() => { if (active) setCatalogError(true); });
    return () => { active = false; };
  }, []);

  async function fetchPlayer(player) {
    const token = Symbol();
    requests.current.set(player.id, token);
    setPlayers((current) => {
      const next = { ...player, status: "loading", matches: [] };
      return current.some((entry) => entry.id === player.id)
        ? current.map((entry) => entry.id === player.id ? next : entry)
        : [...current, next];
    });
    const [history, profile] = await Promise.allSettled([loadPlayerMatches(player.id), loadProfile(player.id)]);
    if (requests.current.get(player.id) !== token) return;
    setPlayers((current) => current.map((entry) => {
      if (entry.id !== player.id) return entry;
      if (history.status === "rejected") return { ...entry, status: "error", error: "Couldn’t load matches. Try again in a moment." };
      return {
        ...entry, status: "ready", matches: history.value,
        name: player.saved ? player.name : profile.value?.personaname ?? player.name,
      };
    }));
  }

  function addPlayer(rawId, savedName) {
    const id = validPlayerId(String(rawId));
    if (!id) { setError("Enter a valid Dota 2 Friend ID."); return; }
    if (requests.current.has(id)) { setError("That player is already on the board."); return; }
    if (requests.current.size >= 10) { setError("The board holds up to ten players."); return; }
    setError("");
    setInput("");
    fetchPlayer({ id, name: savedName ?? id, saved: Boolean(savedName), team: "them" });
  }

  function removePlayer(id) {
    requests.current.delete(id);
    setPlayers((current) => current.filter((player) => player.id !== id));
  }

  function lockRoster() {
    players.filter((player) => player.saved).forEach((player) => requests.current.delete(player.id));
    setPlayers((current) => current.filter((player) => !player.saved));
    setUnlocked(false);
    setPassword("");
  }

  function recordAction(id, type) {
    setDraft((current) => {
      if (!type) return current.filter((action) => action.id !== id);
      if (current.some((action) => action.id === id) || (type !== "ban" && current.filter((action) => action.type === type).length >= 5)) return current;
      return [...current, { id, type, label: ACTION_LABELS[type] }];
    });
  }

  const historySize = HISTORY_SIZES[historyIndex];
  const summarized = players.map((player) => ({
    ...player, summary: summarizeMatches(player.matches ?? [], historySize, days, recentSize),
  }));
  const visiblePlayers = summarized.filter((player) => team === "all" || player.team === team);
  const searchResults = heroSearch.trim() ? Object.values(catalog).filter((hero) =>
    hero.localized_name.toLowerCase().includes(heroSearch.trim().toLowerCase())
  ).slice(0, 8) : [];

  return (
    <div className="app-shell">
      <aside className="rail">
        <a className="brand" href="/" aria-label="What2Ban home"><span className="brand-mark">W<span>2</span></span><span>what2ban<span className="version">2.0</span></span></a>
        <span className="rail-label">WORKSPACE</span>
        <nav aria-label="Workspace">
          <button className={tab === "scout" ? "active" : ""} onClick={() => setTab("scout")}><span>◫</span> Player scouting <b>{players.length}</b></button>
          <button className={tab === "draft" ? "active" : ""} onClick={() => setTab("draft")}><span>◇</span> Draft overview <b>{draft.length}</b></button>
        </nav>
        <div className="rail-bottom"><span className="live-dot" /> OpenDota data</div>
      </aside>
      <main className="workspace">
        <header className="page-header">
          <div><span className="eyebrow">DOTA 2 / SCOUTING WORKSPACE</span><h1>{tab === "scout" ? "Player scouting" : "Draft overview"}</h1></div>
          <button className="roster-button" aria-expanded={rosterOpen} onClick={() => setRosterOpen(!rosterOpen)}>Saved roster <span>{unlocked ? "●" : "↗"}</span></button>
        </header>
        {rosterOpen && (
          <section className="surface roster-panel" aria-label="Saved roster">
            <div className="section-heading"><h2>Saved roster</h2>{unlocked && <button className="text-button" onClick={lockRoster}>Lock roster</button>}</div>
            {unlocked ? <div className="roster-list">{roster.map((player) => <button key={player.id} disabled={players.some((entry) => entry.id === String(player.id)) || players.length >= 10} onClick={() => addPlayer(player.id, player.name)}>{player.name}<small>{player.id}</small><span>+</span></button>)}</div> : (
              <form className="add-form" onSubmit={(event) => {
                event.preventDefault();
                setUnlocked(password === "123451");
                setPasswordError(password === "123451" ? "" : "Incorrect password.");
                setPassword("");
              }}><label className="sr-only" htmlFor="password">Roster password</label><input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Roster password" required /><button className="primary">Unlock roster</button>{passwordError && <span role="alert">{passwordError}</span>}</form>
            )}
          </section>
        )}
        <div className="toolbar">
          <form className="add-form" onSubmit={(event) => { event.preventDefault(); addPlayer(input); }}>
            <label className="sr-only" htmlFor="friend-id">Dota 2 Friend ID</label><input id="friend-id" inputMode="numeric" placeholder="Dota 2 Friend ID" value={input} onChange={(event) => setInput(event.target.value)} required /><button className="primary" disabled={players.length >= 10}>+ Add player</button>
          </form>
          <div className="hero-search"><label className="sr-only" htmlFor="hero-search">Find a hero</label><input id="hero-search" placeholder="Search any hero…" value={heroSearch} onChange={(event) => setHeroSearch(event.target.value)} />
            {heroSearch.trim() && <div className="search-results">{searchResults.map((hero) => <button key={hero.id} onClick={() => { setSelectedHero(hero.id); setHeroSearch(""); }}>{hero.localized_name}</button>)}{!searchResults.length && <span>No heroes found.</span>}</div>}
          </div>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <section className="filter-bar" aria-label="History filters">
          <label className="range-filter"><span>Match history <b>Last {historySize}</b></span><input aria-label="Match history" type="range" min="0" max={HISTORY_SIZES.length - 1} value={historyIndex} onChange={(event) => setHistoryIndex(Number(event.target.value))} /></label>
          <label className="range-filter"><span>Recent window <b>Last {recentSize}</b></span><input aria-label="Recent window" type="range" min="5" max="50" step="5" value={recentSize} onChange={(event) => setRecentSize(Number(event.target.value))} /></label>
          <label>Date range<select value={days} onChange={(event) => setDays(Number(event.target.value))}><option value="0">Any date</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="180">Last 180 days</option><option value="365">Last year</option></select></label>
          <label>Min. games<select value={minimum} onChange={(event) => setMinimum(Number(event.target.value))}>{[1, 3, 5, 10, 20].map((n) => <option key={n}>{n}</option>)}</select></label>
        </section>
        <div className={`content-layout ${selectedHero !== null ? "with-inspector" : ""}`}>
          <div className="main-content">
            {tab === "scout" ? (
              <>
                <div className="board-heading">
                  <div className="team-tabs">{[["all", "Everyone"], ["them", "Opponents"], ["us", "Your team"], ["watch", "Watchlist"]].map(([value, label]) => <button key={value} aria-pressed={team === value} onClick={() => setTeam(value)}>{label}</button>)}</div>
                  <div className="board-options"><select aria-label="Sort heroes" value={sort} onChange={(event) => setSort(event.target.value)}><option value="games">Most played</option><option value="recent">Recent frequency</option><option value="last">Last played</option><option value="wins">Win rate</option></select><div className="segmented"><button aria-pressed={view === "pool"} onClick={() => setView("pool")}>Hero pool</button><button aria-pressed={view === "matches"} onClick={() => setView("matches")}>Matches</button></div></div>
                </div>
                {!visiblePlayers.length && <section className="empty-state"><span className="empty-symbol">◫</span><span className="eyebrow">PLAYERS</span><h2>{players.length ? "No players on this team" : "No players added"}</h2><p>{players.length ? "Change a player’s team using the selector on their card." : "Add a Friend ID or select a saved player."}</p></section>}
                <div className="player-grid">{visiblePlayers.map((player) => <PlayerCard key={player.id} player={player} summary={player.summary} catalog={catalog} minimum={minimum} sort={sort} view={view} draft={draft} onHero={setSelectedHero} onTeam={(value) => setPlayers((current) => current.map((entry) => entry.id === player.id ? { ...entry, team: value } : entry))} onRemove={() => removePlayer(player.id)} onRetry={() => fetchPlayer(player)} />)}</div>
              </>
            ) : <DraftOverview draft={draft} players={summarized} catalog={catalog} minimum={minimum} onHero={setSelectedHero} onAction={recordAction} onRemove={(id) => recordAction(id, null)} />}
          </div>
          {selectedHero !== null && <HeroInspector id={selectedHero} catalog={catalog} draft={draft} players={summarized} onAction={recordAction} onClose={() => setSelectedHero(null)} onHero={setSelectedHero} />}
        </div>
        <footer className="workspace-footer"><span>WHAT2BAN 2.0</span><p>Up to 1,000 available matches per player. Filters apply to that history. Recent counts use up to the selected recent window within it.{catalogError && " Live hero catalog unavailable; using bundled names."}</p></footer>
      </main>
    </div>
  );
}
