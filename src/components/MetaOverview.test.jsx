import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import MetaOverview from './MetaOverview';
import { loadLeagues, loadLeagueMatches, loadDraftMatch, isRateLimited } from '../openDota';
jest.mock('../openDota', () => ({ loadLeagues: jest.fn(), loadLeagueMatches: jest.fn(), loadDraftMatch: jest.fn(), describeError: () => 'Request failed', isRateLimited: jest.fn() }));
const draft = id => ({ match_id: id, radiant_win: true, picks_bans: [
  { hero_id: 20, is_pick: false, team: 1, order: 0 },
  ...Array.from({ length: 10 }, (_, i) => ({ hero_id: i + 1, is_pick: true, team: i < 5 ? 0 : 1, order: i + 1 })),
] });
const props = { catalog: { 1: { id: 1, localized_name: 'Anti-Mage' } }, players: [
  { name: 'Opponent', team: 'them', summary: { heroes: [{ id: 1 }] } },
], onHero: jest.fn() };
beforeEach(() => {
  loadLeagues.mockResolvedValue([{ leagueid: 1, name: 'Test Cup', tier: 'professional' }, { leagueid: 2, name: 'Second Cup', tier: 'premium' }]);
  loadLeagueMatches.mockResolvedValue([{ match_id: 1 }, { match_id: 2 }]);
  loadDraftMatch.mockImplementation(async id => draft(id));
});
async function selectCup() {
  await screen.findByRole('option', { name: /Test Cup/ });
  await act(async () => { fireEvent.change(screen.getByLabelText('Tournament'), { target: { value: '1' } }); });
}

test('shows coverage, opponents, filters and opens the inspector', async () => {
  loadDraftMatch.mockImplementation(async id => id === 2 ? { match_id: id, picks_bans: [], radiant_win: true } : draft(id));
  render(<MetaOverview {...props} />);
  await selectCup();
  await screen.findByText('Drafts available for 1 of 2 listed matches. 2 checked.');
  expect(screen.getByText('Played by Opponent')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Anti-Mage/ }));
  expect(props.onHero).toHaveBeenCalledWith(1);
  fireEvent.change(screen.getByLabelText('Minimum picks'), { target: { value: '3' } });
  expect(screen.getByText('No heroes match these filters.')).toBeInTheDocument();
});

test('loads only a batch until the user requests more', async () => {
  loadLeagueMatches.mockResolvedValue(Array.from({ length: 21 }, (_, i) => ({ match_id: i + 1 })));
  render(<MetaOverview {...props} />);
  await selectCup();
  fireEvent.click(await screen.findByRole('button', { name: 'Load next 1 matches' }));
  await screen.findByText('Drafts available for 21 of 21 listed matches. 21 checked.');
  expect(loadDraftMatch).toHaveBeenCalledTimes(21);
});

test('changing tournaments aborts old work and ignores its response', async () => {
  let finish;
  loadLeagueMatches.mockImplementation(async id => [{ match_id: id }]);
  loadDraftMatch.mockImplementation(id => id === 1 ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(draft(id)));
  render(<MetaOverview {...props} />);
  await selectCup();
  await waitFor(() => expect(loadDraftMatch).toHaveBeenCalled());
  const signal = loadDraftMatch.mock.calls[0][1].signal;
  fireEvent.change(screen.getByLabelText('Tournament'), { target: { value: '2' } });
  expect(signal.aborted).toBe(true);
  await screen.findByText('Drafts available for 1 of 1 listed matches. 1 checked.');
  await act(async () => { finish(draft(1)); });
  expect(within(screen.getByRole('region', { name: 'Tournament statistics' })).getByRole('heading', { name: 'Second Cup' })).toBeInTheDocument();
});

test('rate limits stop the batch and retry resumes the failed requests', async () => {
  isRateLimited.mockReturnValue(true);
  loadDraftMatch.mockRejectedValueOnce(new Error('429'));
  render(<MetaOverview {...props} />);
  await selectCup();
  const retry = await screen.findByRole('button', { name: 'Retry loading' });
  expect(loadDraftMatch).toHaveBeenCalledTimes(1);
  fireEvent.click(retry);
  await screen.findByText('Drafts available for 2 of 2 listed matches. 2 checked.');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
