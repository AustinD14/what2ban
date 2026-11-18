import { act, fireEvent, render, screen, within } from '@testing-library/react';
import DraftOverview from './DraftOverview';
import { loadAncientMatchups, peekAncientMatchups } from '../openDota';

jest.mock('../openDota', () => ({ loadAncientMatchups: jest.fn(), peekAncientMatchups: jest.fn(), describeError: () => 'Request failed.' }));
const catalog = Object.fromEntries([1, 2, 3, 4].map(id => [id, { id, name: `npc_dota_hero_${id}`, localized_name: `Hero ${id}`, roles: ['Carry'] }]));
const sample = { sample_size: 1000, oldest: 1700000000, newest: 1700003600,
  baselines: [1, 2, 3, 4].map(hero_id => ({ hero_id, games: 1000, wins: 500 })),
  matchups: [{ hero_id: 1, games_played: 200, wins: 80 }, { hero_id: 2, games_played: 200, wins: 120 }] };
const players = [{ id: 'a', name: 'Alice', team: 'us', summary: { heroes: [{ id: 1, games: 20, recent: 5, decided: 20, wins: 12 }] } }];
const props = { draft: [{ id: 3, type: 'them' }], players, catalog, minimum: 1, onHero: jest.fn(), onAction: jest.fn(), onRemove: jest.fn() };
beforeEach(() => { jest.clearAllMocks(); peekAncientMatchups.mockReturnValue(undefined); loadAncientMatchups.mockResolvedValue(sample); });

test('loads only on demand and shares a snapshot between explanations and lane comparison', async () => {
  render(<DraftOverview {...props} />);
  expect(loadAncientMatchups).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Likely lane opponent'), { target: { value: '3' } });
  expect(loadAncientMatchups).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Compare picks' }));
  const table = await screen.findByRole('table');
  expect(loadAncientMatchups).toHaveBeenCalledTimes(1);
  expect(within(table).getByText('+10.0 pp')).toBeInTheDocument();
  expect(within(table).getByText('60.0%')).toBeInTheDocument();
  expect(screen.getByText(/\+10.0 pp vs Hero 3/)).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('Only comfort heroes'));
  expect(within(table).queryByText('Hero 2')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Pick Hero 1 for lane' }));
  expect(props.onAction).toHaveBeenCalledWith(1, 'us');
});

test('cached comparison avoids a request and drafted heroes cannot be recommended', async () => {
  peekAncientMatchups.mockReturnValue(sample);
  render(<DraftOverview {...props} draft={[...props.draft, { id: 1, type: 'ban' }]} />);
  fireEvent.change(screen.getByLabelText('Likely lane opponent'), { target: { value: '3' } });
  fireEvent.click(screen.getByRole('button', { name: 'Compare picks' }));
  expect(within(screen.getByRole('table')).queryByText('Hero 1')).not.toBeInTheDocument();
  expect(loadAncientMatchups).not.toHaveBeenCalled();
});

test('switching opponents does not display the previous response; failed loads can retry', async () => {
  let resolve;
  loadAncientMatchups.mockReturnValueOnce(new Promise(done => { resolve = done; })).mockRejectedValueOnce(new Error('failed')).mockResolvedValue(sample);
  render(<DraftOverview {...props} />);
  fireEvent.change(screen.getByLabelText('Likely lane opponent'), { target: { value: '3' } });
  fireEvent.click(screen.getByRole('button', { name: 'Compare picks' }));
  fireEvent.change(screen.getByLabelText('Likely lane opponent'), { target: { value: '4' } });
  await act(async () => { resolve(sample); });
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Compare picks' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Request failed');
  fireEvent.click(screen.getByRole('button', { name: 'Compare picks' }));
  expect(await screen.findByRole('table')).toBeInTheDocument();
});

test('teammate selection limits comfort picks and resets if that teammate leaves', () => {
  const bob = { id: 'b', name: 'Bob', team: 'us', summary: { heroes: [{ id: 2, games: 30, recent: 5, decided: 30, wins: 18 }] } };
  const view = render(<DraftOverview {...props} players={[...players, bob]} />);
  fireEvent.change(screen.getByLabelText('Recommend for'), { target: { value: 'b' } });
  const insights = within(screen.getByRole('complementary', { name: 'Draft insights' }));
  expect(insights.queryByRole('button', { name: 'Pick Hero 1' })).not.toBeInTheDocument();
  expect(insights.getByRole('button', { name: 'Pick Hero 2' })).toBeInTheDocument();
  view.rerender(<DraftOverview {...props} />);
  expect(screen.getByLabelText('Recommend for')).toHaveValue('');
  expect(insights.getByRole('button', { name: 'Pick Hero 1' })).toBeInTheDocument();
  expect(loadAncientMatchups).not.toHaveBeenCalled();
});

test('a full lineup can compare matchups but cannot add a sixth pick', () => {
  peekAncientMatchups.mockReturnValue(sample);
  render(<DraftOverview {...props} draft={[...props.draft, ...[5, 6, 7, 8, 9].map(id => ({ id, type: 'us' }))]} />);
  fireEvent.change(screen.getByLabelText('Likely lane opponent'), { target: { value: '3' } });
  fireEvent.click(screen.getByRole('button', { name: 'Compare picks' }));
  expect(screen.getByRole('button', { name: 'Pick Hero 1 for lane' })).toBeDisabled();
});

test('returning to Draft restores cached evidence and ranking without another request', async () => {
  const rankedPlayers = [{ ...players[0], summary: { heroes: [1, 2].map(id => ({ id, games: 20, recent: 5, decided: 20, wins: 10 })) } }];
  const reversed = { ...sample, matchups: [{ hero_id: 1, games_played: 200, wins: 120 }, { hero_id: 2, games_played: 200, wins: 80 }] };
  loadAncientMatchups.mockResolvedValue(reversed);
  const first = render(<DraftOverview {...props} players={rankedPlayers} />);
  fireEvent.click(screen.getByRole('button', { name: 'Load Hero 3 matchups' }));
  expect(await screen.findByText(/\+10.0 pp vs Hero 3/)).toBeInTheDocument();
  const pickOrder = () => within(screen.getByRole('complementary', { name: 'Draft insights' }))
    .getAllByRole('button', { name: /^Pick Hero/ }).map(button => button.textContent);
  expect(pickOrder()).toEqual(['Pick Hero 2', 'Pick Hero 1']);
  first.unmount(); // App switches tabs by unmounting DraftOverview.
  peekAncientMatchups.mockImplementation(id => id === 3 ? reversed : undefined);
  render(<DraftOverview {...props} players={rankedPlayers} />);
  expect(screen.getByText(/\+10.0 pp vs Hero 3/)).toBeInTheDocument();
  expect(pickOrder()).toEqual(['Pick Hero 2', 'Pick Hero 1']);
  expect(loadAncientMatchups).toHaveBeenCalledTimes(1);
});

test('newly drafted opponents hydrate from cache while cache misses stay manual', () => {
  const view = render(<DraftOverview {...props} draft={[]} />);
  peekAncientMatchups.mockImplementation(id => id === 3 ? sample : undefined);
  view.rerender(<DraftOverview {...props} draft={[...props.draft, { id: 4, type: 'them' }]} />);
  expect(screen.getByText(/\+10.0 pp vs Hero 3/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Load Hero 4 matchups' })).toBeInTheDocument();
  expect(loadAncientMatchups).not.toHaveBeenCalled();
});

test('expired or absent cache is not restored or fetched when returning to Draft', () => {
  peekAncientMatchups.mockReturnValue(sample);
  const first = render(<DraftOverview {...props} />);
  expect(screen.getByText(/\+10.0 pp vs Hero 3/)).toBeInTheDocument();
  first.unmount();
  peekAncientMatchups.mockReturnValue(undefined); // The cache rejects expired entries.
  render(<DraftOverview {...props} />);
  expect(screen.queryByText(/\+10.0 pp vs Hero 3/)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Load Hero 3 matchups' })).toBeInTheDocument();
  expect(loadAncientMatchups).not.toHaveBeenCalled();
});
