import { renderHook } from "@testing-library/react";
import { summarizeMatches } from "./scouting";
import usePlayerSummaries from "./usePlayerSummaries";

jest.mock("./scouting", () => ({
  ...jest.requireActual("./scouting"), summarizeMatches: jest.fn(),
}));

beforeEach(() => summarizeMatches.mockImplementation(jest.requireActual("./scouting").summarizeMatches));

const history = Array.from({ length: 30 }, (_, index) => ({
  match_id: index + 1, hero_id: index < 5 ? 2 : 1,
  start_time: Math.floor(Date.now() / 1000) - index * 86400,
  radiant_win: true, player_slot: 0,
}));

test("unrelated renders and player metadata changes reuse history calculations", () => {
  const players = [{ id: "1", name: "Original", matches: history, team: "them" }];
  const { result, rerender } = renderHook(({ players }) => usePlayerSummaries(players, 100, 0, 20), { initialProps: { players } });
  const original = result.current[0].summary;
  summarizeMatches.mockClear();
  rerender({ players });
  rerender({ players: [{ ...players[0], name: "New name", team: "us", status: "ready" }] });
  expect(summarizeMatches).not.toHaveBeenCalled();
  expect(result.current[0]).toMatchObject({ name: "New name", team: "us", status: "ready" });
  expect(result.current[0].summary).toBe(original);
});

test("new histories recalculate only affected players", () => {
  const players = [{ id: "1", matches: history }, { id: "2", matches: [] }];
  const { result, rerender } = renderHook(({ players }) => usePlayerSummaries(players, 100, 0, 20), { initialProps: { players } });
  summarizeMatches.mockClear();
  rerender({ players: [players[0], { ...players[1], matches: history.slice(0, 5) }] });
  expect(summarizeMatches).toHaveBeenCalledTimes(1);
  expect(result.current.map(player => player.summary.sample.length)).toEqual([30, 5]);
});

test("history, date and recent filters invalidate summaries and update results", () => {
  const players = [{ id: "1", matches: history }];
  const { result, rerender } = renderHook(({ limit, days, recent }) => usePlayerSummaries(players, limit, days, recent), {
    initialProps: { limit: 100, days: 0, recent: 20 },
  });
  rerender({ limit: 20, days: 0, recent: 20 });
  expect(result.current[0].summary.sample).toHaveLength(20);
  rerender({ limit: 20, days: 0, recent: 5 });
  expect(result.current[0].summary.recent).toHaveLength(5);
  rerender({ limit: 20, days: 7, recent: 5 });
  expect(result.current[0].summary.sample.length).toBeLessThanOrEqual(8);
  expect(summarizeMatches).toHaveBeenCalledTimes(4);
});
