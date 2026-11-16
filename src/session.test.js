import { restoreSession, saveSession } from "./session";

const KEY = "what2ban:session:v1";
const session = {
  players: [{ id: "123", name: "Player", saved: false, team: "them", status: "loading", matches: [] }],
  draft: [], historyIndex: 2,
};
beforeEach(() => localStorage.clear());
afterEach(() => jest.restoreAllMocks());

test("loading and history updates do not rewrite the saved workspace", () => {
  const write = jest.spyOn(Storage.prototype, "setItem");
  saveSession(session);
  saveSession({ ...session, players: [{ ...session.players[0], status: "queued" }] });
  saveSession({ ...session, players: [{ ...session.players[0], status: "ready", matches: [{ match_id: 1 }] }] });
  expect(write).toHaveBeenCalledTimes(1);
});

test("name, team, filters and draft changes are still persisted", () => {
  saveSession(session);
  const updated = {
    ...session, players: [{ ...session.players[0], name: "Updated", team: "us" }],
    draft: [{ id: 2, type: "ban" }], historyIndex: 3,
  };
  saveSession(updated);
  expect(restoreSession()).toMatchObject({
    players: [{ id: "123", name: "Updated", team: "us" }],
    draft: [{ id: 2, type: "ban" }], historyIndex: 3,
  });
});

test("saving compares actual storage, including writes from other tabs", () => {
  saveSession(session);
  localStorage.setItem(KEY, JSON.stringify({ players: [], draft: [] }));
  saveSession(session);
  expect(restoreSession().players).toHaveLength(1);
});

test("failed storage writes can be retried", () => {
  const write = jest.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => { throw new Error("Storage full"); });
  expect(() => saveSession(session)).not.toThrow();
  saveSession(session);
  expect(write).toHaveBeenCalledTimes(2);
  expect(restoreSession().players).toHaveLength(1);
});
