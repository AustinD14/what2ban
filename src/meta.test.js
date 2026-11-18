import { summarizeTournament } from './meta';

export const makeDraft = (id, radiantWin = true) => ({ match_id: id, radiant_win: radiantWin,
  picks_bans: [
    { hero_id: 20, is_pick: false, team: 0, order: 0 },
    { hero_id: 21, is_pick: false, team: 1, order: 1 },
    ...Array.from({ length: 10 }, (_, index) => ({ hero_id: index + 1, is_pick: true, team: index < 5 ? 0 : 1, order: index + 2 })),
  ] });

test('counts picks, bans, team wins and early actions with correct denominators', () => {
  const result = summarizeTournament([makeDraft(1), makeDraft(2, false)]);
  expect(result.analyzed).toBe(2);
  expect(result.rows.find(row => row.id === 1)).toMatchObject({ picks: 2, bans: 0, wins: 1, winRate: .5, contest: 1, early: 2 });
  expect(result.rows.find(row => row.id === 6)).toMatchObject({ wins: 1, early: 0 });
  expect(result.rows.find(row => row.id === 20)).toMatchObject({ picks: 0, bans: 2, winRate: null, contest: 1 });
});

test('excludes incomplete drafts, unknown results and duplicate matches', () => {
  const draft = makeDraft(1);
  expect(summarizeTournament([draft, draft, { ...makeDraft(2), picks_bans: [] }, makeDraft(3, null)]).analyzed).toBe(1);
  const bad = makeDraft(4);
  bad.picks_bans[1].hero_id = 20;
  expect(summarizeTournament([bad]).analyzed).toBe(0);
});

test('uses draft order instead of response array order', () => {
  const draft = makeDraft(1);
  draft.picks_bans.reverse();
  expect(summarizeTournament([draft]).rows.find(row => row.id === 20).early).toBe(1);
});
