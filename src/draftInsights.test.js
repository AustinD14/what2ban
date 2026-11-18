import { getDraftInsights } from "./draftInsights";
import heroes from './Data/heroes.json';

const catalog = {
  1: { id: 1, localized_name: "Carry", roles: ["Carry"] },
  2: { id: 2, localized_name: "Initiator", roles: ["Initiator", "Disabler"] },
  3: { id: 3, localized_name: "Pusher", roles: ["Pusher"] },
  4: { id: 4, localized_name: "Support", roles: ["Support"] },
};
const player = (team) => ({ name: team, team, summary: { heroes: [
  { id: 1, games: 30, recent: 10 }, { id: 2, games: 10, recent: 5 }, { id: 3, games: 2, recent: 1 },
] } });

test('covering every role with Tiny and Bane keeps available generic picks eligible', () => {
  const idFor = name => Object.values(heroes).find(hero => hero.localized_name === name).id;
  const draft = ['Tiny', 'Bane'].map(name => ({ id: idFor(name), type: 'us' }));
  const opponent = idFor('Axe');
  const candidate = idFor('Anti-Mage');
  draft.push({ id: opponent, type: 'them' });
  const sample = { baselines: [opponent, candidate].map(hero_id => ({ hero_id, games: 1000, wins: 500 })),
    matchups: [{ hero_id: candidate, games_played: 200, wins: 60 }] };
  const result = getDraftInsights(draft, [], heroes, 1, { [opponent]: sample });
  expect(result.ours.every(role => role.heroes.length > 0)).toBe(true);
  expect(result.ourFull).toBe(false);
  expect(result.picks).toHaveLength(4);
  expect(result.picks[0].id).toBe(candidate);
  expect(result.picks.every(row => row.fills.length === 0 && row.comfort.length === 0)).toBe(true);
  expect(result.picks.some(row => draft.some(action => action.id === row.id))).toBe(false);
});

test("options follow draft coverage, team pools, filters and availability", () => {
  const players = [player("us"), player("them"), player("watch")];
  const before = getDraftInsights([], players, catalog, 1);
  expect(before.picks[0].id).toBe(1); // Established comfort now outweighs one extra role tag.
  expect(before.bans[0].id).toBe(2);
  const after = getDraftInsights([{ id: 2, type: "us" }, { id: 1, type: "ban" }], players, catalog, 1);
  expect(after.ours.find(({ role }) => role === "Disabler").heroes).toEqual(["Initiator"]);
  expect(after.picks.map(({ id }) => id)).toEqual([3]);
  expect(after.bans.map(({ id }) => id)).toEqual([3]);
  expect(after.picks[0].players).toEqual(["us: 2 games, 1 recent"]);
  expect(getDraftInsights([], players, catalog, 3).picks.some(({ id }) => id === 3)).toBe(false);
  expect(getDraftInsights([], [player("watch")], catalog, 1).bans).toEqual([]);
});

test("opponent picks change ban priorities and full teams do not get extra picks", () => {
  const result = getDraftInsights([{ id: 4, type: "them" }], [player("them")], {
    ...catalog, 4: { ...catalog[4], roles: ["Initiator", "Disabler"] },
  }, 1);
  expect(result.bans[0].id).toBe(1);
  const full = getDraftInsights([1, 2, 3, 4, 5].map((id) => ({ id, type: "us" })), [], catalog, 1);
  expect(full.ourFull).toBe(true);
  expect(full.picks).toEqual([]);
});

test("missing history uses labeled role options; filtered-out history does not invent player pools", () => {
  expect(getDraftInsights([], [], catalog, 1).genericPicks).toBe(true);
  const filtered = getDraftInsights([], [player("us")], catalog, 100);
  expect(filtered.genericPicks).toBe(false);
  expect(filtered.picks).toEqual([]);
});
