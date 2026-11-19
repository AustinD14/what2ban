import axios from "axios";
import { cached, peek } from "./cache";
import { createRequestQueue } from "./requestQueue";
import { hasCompleteDraft, RECENT_LEAGUES_QUERY } from "./meta";
import { ancientMatchupQuery } from "./ancientMatchups";

const API = "https://api.opendota.com/api";
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

// A player's first match-history request can take ~12 s while OpenDota builds it
// (repeat requests are near-instant), so histories get a longer timeout.
const TIMEOUT = { history: 30 * 1000, default: 12 * 1000 };

// How long each kind of response is reused before asking OpenDota again.
const TTL = { matches: 15 * MINUTE, profile: DAY, heroes: DAY, matchups: DAY };

// Every OpenDota request goes through this queue. The free tier allows 60 requests
// a minute, so we stay a little under that. Slow match histories load a few at a
// time in their own lane so quick requests (profiles, heroes, matchups) aren't stuck
// behind them.
export const QUEUE_LIMITS = { perMinute: 50, historyConcurrency: 4, otherConcurrency: 4 };
const queue = createRequestQueue({
  perMinute: QUEUE_LIMITS.perMinute,
  lanes: { other: QUEUE_LIMITS.otherConcurrency, history: QUEUE_LIMITS.historyConcurrency, meta: 1 },
});

// Only the fields the app reads are kept, which keeps the localStorage cache small
// (a full 1,000-match history is ~250 KB raw; trimmed it is well under half that).
const MATCH_FIELDS = ["match_id", "hero_id", "start_time", "player_slot", "radiant_win", "duration"];
const HERO_FIELDS = ["id", "name", "localized_name", "roles"];
const MATCHUP_FIELDS = ["hero_id", "games_played", "wins"];
const positiveId = (value) => Number.isSafeInteger(value) && value > 0;
const listOf = (validRow) => (value) => Array.isArray(value) && value.every(validRow);
const validMatches = listOf((row) => row && positiveId(row.match_id) &&
  Number.isInteger(row.hero_id) && row.hero_id >= 0 && Number.isFinite(row.start_time));
const validHeroes = listOf((row) => row && positiveId(row.id) &&
  typeof row.name === "string" && typeof row.localized_name === "string" &&
  Array.isArray(row.roles) && row.roles.every((role) => typeof role === "string"));
const validMatchups = listOf((row) => row && positiveId(row.hero_id) &&
  Number.isInteger(row.games_played) && row.games_played >= 0 &&
  Number.isInteger(row.wins) && row.wins >= 0 && row.wins <= row.games_played);
const validProfile = (value) => value === null || (value && typeof value.personaname === "string");

// TODO(rate limit): Loading several players has hit OpenDota's rate limit before
// (cards failed and had to be retried after waiting a minute). Done so far:
// response cache, a request queue with a per-minute budget, longer history timeout
// with one automatic retry. 429 responses pause every lane and retry at most twice.
// Still to do:
//   - add a "retry all failed players" action
//   - consider an OpenDota API key for higher limits (needs a small server or
//     Firebase function so the key isn't shipped to the browser)

function pick(source, fields) {
  return Object.fromEntries(fields.filter((field) => source?.[field] !== undefined).map((field) => [field, source[field]]));
}

// Retry-After may be seconds or an HTTP date. Missing/unreadable headers use a minute.
function retryDelay(error) {
  const headers = error?.response?.headers;
  const value = headers?.get?.("retry-after") ?? headers?.["retry-after"];
  if (value === undefined || value === null || String(value).trim() === "") return MINUTE;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return seconds >= 0 && Number.isFinite(seconds * 1000) ? Math.max(1000, seconds * 1000) : MINUTE;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(1000, date - Date.now()) : MINUTE;
}

export const subscribeRateLimit = queue.subscribe;
export const getRateLimitUntil = queue.getPauseUntil;

async function request(path, { lane = "other", timeout = TIMEOUT.default, hooks, signal } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await queue.schedule(lane, async () => {
        try {
          return (await axios.get(API + path, { timeout, ...(signal ? { signal } : {}) })).data;
        } catch (error) {
          // Pause before releasing the slot, so another lane cannot start on this 429.
          if (isRateLimited(error)) queue.pause(retryDelay(error));
          throw error;
        }
      }, { ...hooks, signal });
    } catch (error) {
      if (!isRateLimited(error) || attempt >= 2 || signal?.aborted) throw error;
    }
  }
}

function checkList(data) {
  if (!Array.isArray(data)) {
    throw Object.assign(new Error("OpenDota returned an invalid list."), { code: "INVALID_RESPONSE" });
  }
  return data;
}

export function isTimeout(error) {
  return error?.code === "ECONNABORTED" || error?.code === "ETIMEDOUT";
}

// hooks: onWait (queued behind other requests), onStart (left the queue), onRetry (timed out, trying again).
export function loadPlayerMatches(playerId, { onWait, onStart, onRetry, signal } = {}) {
  const path = `/players/${playerId}/matches?limit=1000`;
  const options = { lane: "history", timeout: TIMEOUT.history, hooks: { onWait, onStart }, signal };
  return cached(`matches:${playerId}`, TTL.matches, async () => {
    let data;
    try {
      data = await request(path, options);
    } catch (error) {
      if (!isTimeout(error)) throw error;
      // OpenDota usually finishes building the history after a slow first request.
      onRetry?.();
      data = await request(path, options);
    }
    return checkList(data).map((match) => pick(match, MATCH_FIELDS));
  }, { validate: validMatches, signal });
}

export function loadProfile(playerId, { signal } = {}) {
  return cached(`profile:${playerId}`, TTL.profile, async () => {
    const data = await request(`/players/${playerId}`, { signal });
    return typeof data?.profile?.personaname === "string" ? { personaname: data.profile.personaname } : null;
  }, { validate: validProfile, signal });
}

export function loadHeroes() {
  return cached("heroes", TTL.heroes, async () => checkList(await request("/heroes")).map((hero) => pick(hero, HERO_FIELDS)), { validate: validHeroes });
}

export function loadMatchups(heroId) {
  return cached(`matchups:${heroId}`, TTL.matchups, async () =>
    checkList(await request(`/heroes/${heroId}/matchups`)).map((row) => pick(row, MATCHUP_FIELDS)), { validate: validMatchups });
}

export function peekMatchups(heroId) {
  return peek(`matchups:${heroId}`, validMatchups);
}

// Match /heroes/:id/matchups: same matches/player_matches tables and rolling
// 365-day window. LATERAL keeps reads on the match_id index instead of scanning
// the entire player_matches table (the naive aggregate times out on OpenDota).
export const MATCHUP_BASELINE_SQL = `SELECT pm.hero_id, count(*) AS games,
  sum(CASE WHEN (pm.player_slot < 128) = m.radiant_win THEN 1 ELSE 0 END) AS wins
  FROM (SELECT match_id, radiant_win FROM matches
    WHERE start_time > extract(epoch from now()) - 365 * 86400) m
  CROSS JOIN LATERAL (SELECT hero_id, player_slot FROM player_matches
    WHERE match_id = m.match_id OFFSET 0) pm
  WHERE pm.hero_id > 0 GROUP BY pm.hero_id`;
const validBaselines = rows => Array.isArray(rows) && rows.length > 0 && rows.every(row => row &&
  positiveId(row.hero_id) && positiveId(row.games) && Number.isSafeInteger(row.wins) && row.wins >= 0 && row.wins <= row.games);

export function loadMatchupBaselines() {
  return cached("matchup-baselines:365:v1", DAY, async () => {
    const data = await request(`/explorer?sql=${encodeURIComponent(MATCHUP_BASELINE_SQL)}`, { timeout: TIMEOUT.history });
    if (data?.err) throw Object.assign(new Error("Baseline query failed."), { code: "INVALID_RESPONSE" });
    return checkList(data?.rows).map(row => ({ hero_id: Number(row?.hero_id), games: Number(row?.games), wins: Number(row?.wins) }));
  }, { validate: validBaselines });
}

const ancientKey = id => `ancient-matchups:rank61:30d:recent250000:50000:v1:${id}`;
const validAncient = value => value && Number.isSafeInteger(value.sample_size) && value.sample_size >= 0 && value.sample_size <= 50000 &&
  (value.oldest === null || Number.isFinite(value.oldest)) && (value.newest === null || Number.isFinite(value.newest)) &&
  Array.isArray(value.baselines) && (value.baselines.length === 0 ? value.sample_size === 0 : validBaselines(value.baselines)) &&
  validMatchups(value.matchups);

export function peekAncientMatchups(heroId) {
  return peek(ancientKey(heroId), validAncient);
}

export function loadAncientMatchups(heroId) {
  return cached(ancientKey(heroId), 6 * 60 * MINUTE, async () => {
    const data = await request(`/explorer?sql=${encodeURIComponent(ancientMatchupQuery(heroId))}`, { timeout: TIMEOUT.history });
    if (data?.err || !Array.isArray(data?.rows) || data.rows.length !== 1) {
      throw Object.assign(new Error("Ancient+ sample unavailable."), { code: "INVALID_RESPONSE" });
    }
    const row = data.rows[0];
    return {
      sample_size: Number(row.sample_size), oldest: row.oldest === null ? null : Number(row.oldest), newest: row.newest === null ? null : Number(row.newest),
      baselines: checkList(row.baselines ?? []).map(hero => ({ hero_id: Number(hero?.hero_id), games: Number(hero?.games), wins: Number(hero?.wins) })),
      matchups: checkList(row.matchups ?? []).map(hero => ({ hero_id: Number(hero?.hero_id), games_played: Number(hero?.games_played), wins: Number(hero?.wins) })),
    };
  }, { validate: validAncient });
}

const validLeagues = listOf((row) => row && positiveId(row.leagueid) && typeof row.name === "string"
  && ['premium', 'professional'].includes(row.tier) && Number.isFinite(row.last_match_time) && row.last_match_time > 0);
const validLeagueMatches = listOf((row) => row && positiveId(row.match_id));
const validDraftMatch = (row) => row && positiveId(row.match_id) &&
  (row.radiant_win === null || typeof row.radiant_win === "boolean") &&
  Array.isArray(row.picks_bans) && row.picks_bans.every((action) => action &&
    positiveId(action.hero_id) && typeof action.is_pick === "boolean" &&
    [0, 1].includes(action.team) && Number.isInteger(action.order) && action.order >= 0);

export function loadLeagues({ signal } = {}) {
  // Separate key prevents the old all-time catalog from bypassing recency checks.
  return cached("meta:recent-leagues:90d:v1", 60 * MINUTE, async () => {
    const data = await request(`/explorer?sql=${encodeURIComponent(RECENT_LEAGUES_QUERY)}`, { signal, timeout: TIMEOUT.history });
    if (data?.err || !Array.isArray(data?.rows)) throw Object.assign(new Error('Tournament list unavailable.'), { code: 'INVALID_RESPONSE' });
    return data.rows.map(row => ({ leagueid: Number(row?.leagueid), name: row?.name, tier: row?.tier, last_match_time: Number(row?.last_match_time) }));
  }, { signal, validate: validLeagues });
}

export function loadLeagueMatches(id, { signal } = {}) {
  return cached(`meta:league:${id}`, 15 * MINUTE, async () =>
    checkList(await request(`/leagues/${id}/matches`, { signal }))
      .map((row) => pick(row, ["match_id", "start_time"])), { signal, validate: validLeagueMatches });
}

export function loadDraftMatch(id, { signal } = {}) {
  // Missing drafts use a short cache lifetime so newly available data can be retried.
  const key = `meta:draft:${id}`;
  const complete = peek(key, validDraftMatch);
  if (complete && !signal?.aborted) return Promise.resolve(complete);
  return cached(`meta:pending-draft:${id}`, 5 * MINUTE, async () => {
    const data = await request(`/matches/${id}`, { lane: "meta", signal });
    const match = { match_id: data?.match_id, radiant_win: data?.radiant_win ?? null,
      picks_bans: Array.isArray(data?.picks_bans) ? data.picks_bans.map((row) => pick(row, ["hero_id", "is_pick", "team", "order"])) : [] };
    if (validDraftMatch(match) && hasCompleteDraft(match)) {
      return cached(key, 7 * DAY, async () => match, { signal, validate: validDraftMatch });
    }
    return match;
  }, { signal, validate: validDraftMatch });
}

export function resetRequestQueue() {
  queue.reset();
}

export function isRateLimited(error) {
  return error?.response?.status === 429;
}

// Turns an axios/OpenDota failure into a sentence a user can act on.
export function describeError(error) {
  const status = error?.response?.status;
  if (isRateLimited(error)) return "OpenDota’s rate limit is still active after automatic retries. Try again after the cooldown.";
  if (status === 404) return "OpenDota couldn’t find it. Check the ID and try again.";
  if (status >= 500) return `OpenDota is having problems right now (error ${status}). Try again shortly.`;
  if (status) return `OpenDota rejected the request (error ${status}).`;
  if (isTimeout(error)) return "OpenDota took too long to respond. Try again in a moment.";
  if (error?.code === "INVALID_RESPONSE") return "OpenDota sent back data that couldn’t be read. Try again in a moment.";
  if (error?.code === "ERR_NETWORK" || error?.request) {
    return "Couldn’t reach OpenDota. Check your connection. If you just loaded several players, this can also be the rate limit; wait a minute, then retry.";
  }
  return "Something went wrong while talking to OpenDota. Try again in a moment.";
}
