import { HISTORY_SIZES, validPlayerId } from "./scouting";

// Saves the workspace (players, draft and filters) so it survives a reload.
// Match data itself is not stored here; it comes back from the response cache.
const KEY = "what2ban:session:v1";

export const ACTION_LABELS = { ban: "Banned", us: "Your pick", them: "Opponent pick" };
export const PLAYER_TEAMS = ["them", "us", "watch"];
export const DAY_OPTIONS = [0, 30, 90, 180, 365];
export const MINIMUM_OPTIONS = [1, 3, 5, 10, 20];
export const MAX_PLAYERS = 10;

const DEFAULTS = {
  tab: "scout", view: "pool", team: "all", historyIndex: 2, recentSize: 20,
  days: 0, minimum: 1, sort: "games", unlocked: false,
};
const ALLOWED = {
  tab: ["scout", "draft"],
  view: ["pool", "matches"],
  team: ["all", ...PLAYER_TEAMS],
  historyIndex: HISTORY_SIZES.map((_, index) => index),
  recentSize: Array.from({ length: 10 }, (_, index) => (index + 1) * 5),
  days: DAY_OPTIONS,
  minimum: MINIMUM_OPTIONS,
  sort: ["games", "recent", "last", "wins"],
  unlocked: [true, false],
};

function readStored() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY));
    return stored && typeof stored === "object" ? stored : {};
  } catch {
    return {};
  }
}

// Reads the saved session, dropping anything invalid so a corrupt entry can't break the app.
export function restoreSession() {
  const stored = readStored();
  const session = Object.fromEntries(Object.entries(DEFAULTS).map(([key, fallback]) =>
    [key, ALLOWED[key].includes(stored[key]) ? stored[key] : fallback]));

  const ids = new Set();
  session.players = (Array.isArray(stored.players) ? stored.players : []).flatMap((player) => {
    const id = typeof player?.id === "string" ? validPlayerId(player.id) : null;
    if (!id || ids.has(id) || ids.size >= MAX_PLAYERS) return [];
    const saved = player.saved === true;
    if (saved && !session.unlocked) return [];
    ids.add(id);
    const name = typeof player.name === "string" && player.name.trim() ? player.name : id;
    return [{ id, name, saved, team: PLAYER_TEAMS.includes(player.team) ? player.team : "them" }];
  });

  const heroes = new Set();
  const picks = { us: 0, them: 0 };
  session.draft = (Array.isArray(stored.draft) ? stored.draft : []).flatMap((action) => {
    const id = action?.id;
    const type = action?.type;
    if (!Number.isInteger(id) || id <= 0 || heroes.has(id) || !["ban", "us", "them"].includes(type)) return [];
    if (type !== "ban" && picks[type] >= 5) return [];
    if (type !== "ban") picks[type] += 1;
    heroes.add(id);
    return [{ id, type, label: ACTION_LABELS[type] }];
  });
  return session;
}

export function saveSession({ players, draft, ...settings }) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      ...settings,
      players: players.map((player) => ({ id: player.id, name: player.name, saved: player.saved, team: player.team })),
      draft: draft.map((action) => ({ id: action.id, type: action.type })),
    }));
  } catch {
    // Storage full or disabled: the session just won't survive a reload.
  }
}
