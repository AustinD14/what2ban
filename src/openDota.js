import axios from "axios";

const API = "https://api.opendota.com/api";

async function getList(path) {
  const { data } = await axios.get(API + path, { timeout: 12000 });
  if (!Array.isArray(data)) {
    throw new Error("OpenDota returned an invalid list.");
  }
  return data;
}

export function loadPlayerMatches(playerId) {
  return getList(`/players/${playerId}/matches?limit=1000`);
}

export async function loadProfile(playerId) {
  const { data } = await axios.get(API + "/players/" + playerId, { timeout: 12000 });
  return data.profile ?? null;
}

export function loadHeroes() {
  return getList("/heroes");
}

export function loadMatchups(heroId) {
  return getList(`/heroes/${heroId}/matchups`);
}
