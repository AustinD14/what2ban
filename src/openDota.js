import axios from "axios";
import { cached, peek } from "./cache";
import { createRequestQueue } from "./requestQueue";

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
  lanes: { other: QUEUE_LIMITS.otherConcurrency, history: QUEUE_LIMITS.historyConcurrency },
});

// Only the fields the app reads are kept, which keeps the localStorage cache small
// (a full 1,000-match history is ~250 KB raw; trimmed it is well under half that).
const MATCH_FIELDS = ["match_id", "hero_id", "start_time", "player_slot", "radiant_win", "duration"];
const HERO_FIELDS = ["id", "name", "localized_name", "roles"];
const MATCHUP_FIELDS = ["hero_id", "games_played", "wins"];

// TODO(rate limit): Loading several players has hit OpenDota's rate limit before
// (cards failed and had to be retried after waiting a minute). Done so far:
// response cache, a request queue with a per-minute budget, longer history timeout
// with one automatic retry. Still to do:
//   - on a 429, pause the queue and retry automatically instead of failing the card
//   - add a "retry all failed players" action
//   - drop queued requests for players removed before their turn
//   - consider an OpenDota API key for higher limits (needs a small server or
//     Firebase function so the key isn't shipped to the browser)

function pick(source, fields) {
  return Object.fromEntries(fields.filter((field) => source?.[field] !== undefined).map((field) => [field, source[field]]));
}

function request(path, { lane = "other", timeout = TIMEOUT.default, hooks } = {}) {
  return queue.schedule(lane, async () => (await axios.get(API + path, { timeout })).data, hooks);
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
export function loadPlayerMatches(playerId, { onWait, onStart, onRetry } = {}) {
  const path = `/players/${playerId}/matches?limit=1000`;
  const options = { lane: "history", timeout: TIMEOUT.history, hooks: { onWait, onStart } };
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
  });
}

export function loadProfile(playerId) {
  return cached(`profile:${playerId}`, TTL.profile, async () => {
    const data = await request(`/players/${playerId}`);
    return data?.profile ? { personaname: data.profile.personaname } : null;
  });
}

export function loadHeroes() {
  return cached("heroes", TTL.heroes, async () => checkList(await request("/heroes")).map((hero) => pick(hero, HERO_FIELDS)));
}

export function loadMatchups(heroId) {
  return cached(`matchups:${heroId}`, TTL.matchups, async () =>
    checkList(await request(`/heroes/${heroId}/matchups`)).map((row) => pick(row, MATCHUP_FIELDS)));
}

export function peekMatchups(heroId) {
  return peek(`matchups:${heroId}`);
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
  if (isRateLimited(error)) return "OpenDota’s rate limit was reached. Wait about a minute, then retry.";
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
