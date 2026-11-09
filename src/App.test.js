import { act, fireEvent, render, screen, within } from "@testing-library/react";
import axios from "axios";
import App from "./App";
import { clearCache } from "./cache";
import { QUEUE_LIMITS, resetRequestQueue } from "./openDota";
import { matchResult, summarizeMatches } from "./scouting";
import DraftOverview from "./components/DraftOverview";
import HeroInspector from "./components/HeroInspector";

jest.mock("axios");
const now = Math.floor(Date.now() / 1000);
const matches = Array.from({ length: 30 }, (_, index) => ({
  match_id: index + 1, hero_id: index < 5 ? 2 : 1,
  start_time: now - index * 86400, player_slot: index % 2 ? 128 : 0,
  radiant_win: true, duration: 2400,
}));

const addHero = (group, id) => {
  fireEvent.change(screen.getByRole("combobox", { name: `Hero for ${group}` }), { target: { value: String(id) } });
  fireEvent.click(screen.getByRole("button", { name: `Add to ${group}` }));
};
const matchRequests = () => axios.get.mock.calls.filter(([url]) => url.includes("/matches?")).length;

beforeEach(() => {
  localStorage.clear();
  clearCache();
  resetRequestQueue();
  axios.get.mockReset();
  axios.get.mockImplementation(async (url) => {
    if (url.endsWith("/heroes")) return { data: [] };
    if (url.includes("/matches?")) return { data: matches };
    if (url.includes("/matchups")) return { data: [{ hero_id: 5, games_played: 200, wins: 80 }] };
    return { data: { profile: { personaname: "Test player" } } };
  });
});

test("draft dropdowns add, exclude used heroes, undo and enforce five picks", async () => {
  await act(async () => { render(<App />); });
  fireEvent.click(screen.getByRole("button", { name: /Draft overview/ }));
  const bans = screen.getByRole("combobox", { name: "Hero for banned" });
  const ours = screen.getByRole("combobox", { name: "Hero for your picks" });
  const theirs = screen.getByRole("combobox", { name: "Hero for opponent picks" });
  fireEvent.change(screen.getByLabelText("Search banned"), { target: { value: "axe" } });
  expect(within(bans).getAllByRole("option")).toHaveLength(2);
  expect(bans).toHaveValue("2");
  fireEvent.click(screen.getByRole("button", { name: "Add to banned" }));
  expect(screen.getByRole("button", { name: "Undo Axe" })).toBeInTheDocument();
  expect(screen.getByLabelText("Search banned")).toHaveValue("");
  for (const select of [bans, ours, theirs]) expect(within(select).queryByRole("option", { name: "Axe", exact: true })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Undo Axe" }));
  expect(within(ours).getByRole("option", { name: "Axe", exact: true })).toBeInTheDocument();
  for (const id of [1, 2, 3, 4, 5]) addHero("your picks", id);
  expect(ours).toBeDisabled();
  expect(screen.getByRole("button", { name: "Add to your picks" })).toBeDisabled();
  expect(theirs).not.toBeDisabled();
  expect(within(screen.getByRole("complementary", { name: "Draft insights" })).getByText("Five picks recorded.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Undo Axe" }));
  expect(ours).not.toBeDisabled();
  for (const id of [6, 7, 8, 9, 10]) addHero("opponent picks", id);
  expect(theirs).toBeDisabled();
  expect(bans).not.toBeDisabled();
});

test("changing a draft dropdown only selects; nothing is recorded until Add", async () => {
  await act(async () => { render(<App />); });
  fireEvent.click(screen.getByRole("button", { name: /Draft overview/ }));
  const bans = screen.getByRole("combobox", { name: "Hero for banned" });
  // Simulates arrow keys / type-ahead on a closed select, which fire change on Windows.
  fireEvent.change(bans, { target: { value: "1" } });
  fireEvent.change(bans, { target: { value: "2" } });
  expect(screen.queryByRole("button", { name: /^Undo / })).not.toBeInTheDocument();
  expect(bans).toHaveValue("2");
  fireEvent.click(screen.getByRole("button", { name: "Add to banned" }));
  expect(screen.getByRole("button", { name: "Undo Axe" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Undo Anti-Mage" })).not.toBeInTheDocument();
});

test("players, draft and filters survive a reload, and history comes from the cache", async () => {
  let view;
  await act(async () => { view = render(<App />); });
  fireEvent.change(screen.getByLabelText("Dota 2 Friend ID"), { target: { value: "150350373" } });
  fireEvent.click(screen.getByRole("button", { name: "+ Add player" }));
  const card = await screen.findByRole("article", { name: "Test player" });
  await within(card).findByText("30 matches · 2 heroes");
  fireEvent.change(screen.getByLabelText("Sort heroes"), { target: { value: "last" } });
  fireEvent.change(within(card).getByLabelText("Team for Test player"), { target: { value: "us" } });
  fireEvent.click(within(card).getByRole("button", { name: "Inspect Axe for Test player" }));
  fireEvent.click(screen.getByRole("button", { name: "Ban", exact: true }));
  expect(matchRequests()).toBe(1);
  view.unmount();

  await act(async () => { render(<App />); });
  const restored = await screen.findByRole("article", { name: "Test player" });
  expect(await within(restored).findByText("30 matches · 2 heroes")).toBeInTheDocument();
  expect(within(restored).getByText("Banned")).toBeInTheDocument();
  expect(within(restored).getByLabelText("Team for Test player")).toHaveValue("us");
  expect(screen.getByLabelText("Sort heroes")).toHaveValue("last");
  expect(matchRequests()).toBe(1);
});

test("new draft warns before clearing and keeps players", async () => {
  await act(async () => { render(<App />); });
  expect(screen.queryByRole("button", { name: "New draft" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Draft overview/ }));
  addHero("banned", 2);
  fireEvent.click(screen.getByRole("button", { name: "New draft" }));
  const panel = screen.getByRole("region", { name: "Start a new draft" });
  expect(panel).toHaveTextContent("This clears 1 recorded ban or pick.");
  expect(within(panel).getByRole("button", { name: "Keep draft" })).toHaveFocus();
  fireEvent.click(within(panel).getByRole("button", { name: "Keep draft" }));
  expect(screen.queryByRole("region", { name: "Start a new draft" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Undo Axe" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "New draft" }));
  fireEvent.click(screen.getByRole("button", { name: "Clear draft" }));
  expect(screen.queryByRole("button", { name: "Undo Axe" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "New draft" })).not.toBeInTheDocument();
});

test("a slow match history gets a long timeout and one automatic retry", async () => {
  let attempts = 0;
  axios.get.mockImplementation(async (url) => {
    if (url.endsWith("/heroes")) return { data: [] };
    if (url.includes("/matches?")) {
      attempts += 1;
      if (attempts === 1) throw Object.assign(new Error("timeout of 30000ms exceeded"), { code: "ECONNABORTED" });
      return { data: matches };
    }
    return { data: { profile: { personaname: "Slow player" } } };
  });
  await act(async () => { render(<App />); });
  fireEvent.change(screen.getByLabelText("Dota 2 Friend ID"), { target: { value: "150350373" } });
  fireEvent.click(screen.getByRole("button", { name: "+ Add player" }));
  const card = await screen.findByRole("article", { name: "Slow player" });
  expect(await within(card).findByText("30 matches · 2 heroes")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(attempts).toBe(2);
  expect(axios.get).toHaveBeenCalledWith(expect.stringContaining("/matches?"), { timeout: 30000 });
});

test("players beyond the history concurrency limit wait in the queue", async () => {
  const pending = new Map();
  axios.get.mockImplementation(async (url) => {
    if (url.endsWith("/heroes")) return { data: [] };
    if (url.includes("/matches?")) return new Promise((resolve) => { pending.set(url, resolve); });
    return { data: {} };
  });
  await act(async () => { render(<App />); });
  const ids = Array.from({ length: QUEUE_LIMITS.historyConcurrency + 1 }, (_, index) => String(1000 + index));
  for (const id of ids) {
    fireEvent.change(screen.getByLabelText("Dota 2 Friend ID"), { target: { value: id } });
    fireEvent.click(screen.getByRole("button", { name: "+ Add player" }));
  }
  const last = screen.getByRole("article", { name: ids.at(-1) });
  expect(within(last).getByRole("status")).toHaveTextContent("Queued");
  expect(within(screen.getByRole("article", { name: ids[0] })).getByRole("status")).toHaveTextContent("Loading match history");
  await act(async () => {}); // let queued requests reach axios
  expect(pending.size).toBe(QUEUE_LIMITS.historyConcurrency);
  await act(async () => { pending.values().next().value({ data: matches }); });
  expect(within(last).getByRole("status")).toHaveTextContent("Loading match history");
});

test("a corrupt saved session is ignored instead of breaking the app", async () => {
  localStorage.setItem("what2ban:session:v1", JSON.stringify({
    players: [{ id: "abc" }, null, { id: "150350373", saved: true, name: "bellaciao" }],
    draft: [{ id: "x", type: "ban" }, { id: 2, type: "nope" }, null], tab: "bogus", minimum: 999,
  }));
  await act(async () => { render(<App />); });
  expect(screen.getByRole("heading", { name: "Player scouting" })).toBeInTheDocument();
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: /Min\. games/ })).toHaveValue("1");
});

test("a rate-limited history load says so", async () => {
  axios.get.mockImplementation(async (url) => {
    if (url.endsWith("/heroes")) return { data: [] };
    if (url.includes("/matches?")) throw Object.assign(new Error("Request failed with status code 429"), { response: { status: 429 } });
    return { data: { profile: { personaname: "Busy player" } } };
  });
  await act(async () => { render(<App />); });
  fireEvent.change(screen.getByLabelText("Dota 2 Friend ID"), { target: { value: "150350373" } });
  fireEvent.click(screen.getByRole("button", { name: "+ Add player" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Couldn’t load matches. OpenDota’s rate limit was reached. Wait about a minute, then retry.");
});

test("an insight pick records a hero and updates lineup coverage", async () => {
  await act(async () => { render(<App />); });
  fireEvent.click(screen.getByRole("button", { name: /Draft overview/ }));
  const insights = within(screen.getByRole("complementary", { name: "Draft insights" }));
  const pick = insights.getAllByRole("button", { name: /^Pick / })[0];
  const heroName = pick.textContent.slice(5);
  fireEvent.click(pick);
  expect(screen.getByRole("button", { name: `Undo ${heroName}` })).toBeInTheDocument();
  expect(insights.queryByRole("button", { name: `Pick ${heroName}`, exact: true })).not.toBeInTheDocument();
  expect(insights.getAllByText(heroName).length).toBeGreaterThan(0);
});

test("uses chronological matches, actual team results, date limits and recent windows", () => {
  const summary = summarizeMatches([...matches].reverse(), 20, 0, 5);
  expect(summary.sample).toHaveLength(20);
  expect(summary.heroes.find((hero) => hero.id === 2).recent).toBe(5);
  expect(summary.heroes.find((hero) => hero.id === 1).games).toBe(15);
  expect(summarizeMatches(matches, 100, 7, 5, now * 1000).sample).toHaveLength(8);
  expect(matchResult({ radiant_win: false, player_slot: 128 })).toBe(true);
  expect(matchResult({ radiant_win: null, player_slot: 0 })).toBeNull();
});

test("scouts player history, adjusts filters and records a ban from hero details", async () => {
  await act(async () => { render(<App />); });
  fireEvent.change(screen.getByLabelText("Dota 2 Friend ID"), { target: { value: "150350373" } });
  fireEvent.click(screen.getByRole("button", { name: "+ Add player" }));
  const card = await screen.findByRole("article", { name: "Test player" });
  expect(within(card).getByText("30 matches · 2 heroes")).toBeInTheDocument();
  fireEvent.change(screen.getByRole("slider", { name: "Match history" }), { target: { value: "0" } });
  expect(within(card).getByText("20 matches · 2 heroes")).toBeInTheDocument();
  fireEvent.click(within(card).getByRole("button", { name: "Inspect Axe for Test player" }));
  const inspector = within(screen.getByRole("complementary", { name: "Hero details" }));
  expect(await inspector.findByText("40%")).toBeInTheDocument();
  fireEvent.click(inspector.getByRole("button", { name: "Ban", exact: true }));
  expect(within(card).getByText("Banned")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Draft overview/ }));
  expect(screen.getByRole("button", { name: "Undo Axe" })).toBeInTheDocument();
});

test("saved players stay behind the password and disappear when the roster locks", async () => {
  await act(async () => { render(<App />); });
  fireEvent.click(screen.getByRole("button", { name: /Saved roster/ }));
  fireEvent.change(screen.getByLabelText("Roster password"), { target: { value: "12345" } });
  fireEvent.click(screen.getByRole("button", { name: "Unlock roster" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Incorrect password.");
  expect(screen.queryByText("bellaciao")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Roster password"), { target: { value: "123451" } });
  fireEvent.click(screen.getByRole("button", { name: "Unlock roster" }));
  fireEvent.click(screen.getByRole("button", { name: /bellaciao/ }));
  const card = await screen.findByRole("article", { name: "bellaciao" });
  expect(await within(card).findByText("30 matches · 2 heroes")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Lock roster" }));
  expect(screen.queryByRole("article", { name: "bellaciao" })).not.toBeInTheDocument();
  expect(screen.queryByText("150350373")).not.toBeInTheDocument();
});

test("failed history can be retried without duplicating the player", async () => {
  let attempts = 0;
  axios.get.mockImplementation(async (url) => {
    if (url.endsWith("/heroes")) return { data: [] };
    if (url.includes("/matches?")) {
      attempts += 1;
      if (attempts === 1) throw new Error("Rate limited");
      return { data: matches };
    }
    return { data: { profile: { personaname: "Recovered player" } } };
  });
  await act(async () => { render(<App />); });
  fireEvent.change(screen.getByLabelText("Dota 2 Friend ID"), { target: { value: "145810557" } });
  fireEvent.click(screen.getByRole("button", { name: "+ Add player" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Couldn’t load matches");
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByRole("article", { name: "Recovered player" })).toBeInTheDocument();
  expect(screen.getAllByRole("article")).toHaveLength(1);
});

test("last-played sorting differs from most-played sorting and recent window changes counts", async () => {
  await act(async () => { render(<App />); });
  fireEvent.change(screen.getByLabelText("Dota 2 Friend ID"), { target: { value: "150350373" } });
  fireEvent.click(screen.getByRole("button", { name: "+ Add player" }));
  const card = within(await screen.findByRole("article", { name: "Test player" }));
  expect(card.getAllByRole("button", { name: / for Test player/ })[0]).toHaveAccessibleName("Inspect Anti-Mage for Test player");
  fireEvent.change(screen.getByLabelText("Sort heroes"), { target: { value: "last" } });
  expect(card.getAllByRole("button", { name: / for Test player/ })[0]).toHaveAccessibleName("Inspect Axe for Test player");
  fireEvent.change(screen.getByRole("slider", { name: "Recent window" }), { target: { value: "5" } });
  fireEvent.click(screen.getByRole("button", { name: "Matches", exact: true }));
  expect(card.getAllByRole("link").filter((link) => link.href.includes("/matches/"))).toHaveLength(5);
});

test("a removed player's delayed response cannot add them back", async () => {
  let resolveHistory;
  axios.get.mockImplementation(async (url) => {
    if (url.endsWith("/heroes")) return { data: [] };
    if (url.includes("/matches?")) return new Promise((resolve) => { resolveHistory = resolve; });
    return { data: { profile: { personaname: "Removed player" } } };
  });
  await act(async () => { render(<App />); });
  fireEvent.change(screen.getByLabelText("Dota 2 Friend ID"), { target: { value: "150350373" } });
  fireEvent.click(screen.getByRole("button", { name: "+ Add player" }));
  await act(async () => {}); // let the queued request reach axios
  fireEvent.click(screen.getByRole("button", { name: "Remove 150350373" }));
  await act(async () => { resolveHistory({ data: matches }); });
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
});

test("shared pools respect minimum games, team membership and draft availability", () => {
  const props = {
    draft: [], minimum: 1,
    catalog: { 1: { id: 1, localized_name: "Anti-Mage" }, 2: { id: 2, localized_name: "Axe" } },
    players: [
      { name: "A", team: "us", summary: { heroes: [{ id: 1, games: 2 }, { id: 2, games: 5 }] } },
      { name: "B", team: "them", summary: { heroes: [{ id: 1, games: 5 }, { id: 2, games: 10 }] } },
    ], onHero: jest.fn(), onRemove: jest.fn(), onAction: jest.fn(),
  };
  const { rerender } = render(<DraftOverview {...props} />);
  expect(within(screen.getByRole("region", { name: "Shared hero pools" })).getByRole("button", { name: /Anti-Mage/ })).toBeInTheDocument();
  rerender(<DraftOverview {...props} minimum={3} draft={[{ id: 2, type: "ban" }]} />);
  expect(within(screen.getByRole("region", { name: "Shared hero pools" })).queryByRole("button", { name: /Anti-Mage/ })).not.toBeInTheDocument();
  expect(screen.getByText(/No overlap/)).toBeInTheDocument();
});

test("switching heroes ignores outdated matchup responses and enforces the five-pick limit", async () => {
  let resolveFirst;
  axios.get.mockImplementation(async (url) => {
    if (url.includes("/1/matchups")) return new Promise((resolve) => { resolveFirst = resolve; });
    return { data: [{ hero_id: 3, games_played: 200, wins: 120 }] };
  });
  const props = {
    id: 1, catalog: { 1: { localized_name: "Anti-Mage" }, 2: { localized_name: "Axe" }, 3: { localized_name: "Bane" } },
    draft: Array.from({ length: 5 }, (_, i) => ({ id: 20 + i, type: "us" })),
    players: [], onAction: jest.fn(), onHero: jest.fn(), onClose: jest.fn(),
  };
  const { rerender } = render(<HeroInspector {...props} />);
  rerender(<HeroInspector {...props} id={2} />);
  expect(await screen.findByText("60%")).toBeInTheDocument();
  await act(async () => { resolveFirst({ data: [{ hero_id: 3, games_played: 200, wins: 20 }] }); });
  expect(screen.queryByText("10%")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Our pick" })).toBeDisabled();
});

test("matchups explain timeouts and are reused after the inspector closes", async () => {
  axios.get.mockRejectedValueOnce(Object.assign(new Error("timeout of 12000ms exceeded"), { code: "ECONNABORTED" }));
  axios.get.mockResolvedValue({ data: [{ hero_id: 3, games_played: 200, wins: 120 }] });
  const props = {
    id: 1, catalog: { 1: { localized_name: "Anti-Mage" }, 3: { localized_name: "Bane" } },
    draft: [], players: [], onAction: jest.fn(), onHero: jest.fn(), onClose: jest.fn(),
  };
  const { unmount } = render(<HeroInspector {...props} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("OpenDota took too long to respond.");
  fireEvent.click(screen.getByRole("button", { name: "Retry matchups" }));
  expect(await screen.findByText("60%")).toBeInTheDocument();
  unmount();
  render(<HeroInspector {...props} />);
  expect(screen.getByText("60%")).toBeInTheDocument();
  expect(axios.get).toHaveBeenCalledTimes(2);
});
