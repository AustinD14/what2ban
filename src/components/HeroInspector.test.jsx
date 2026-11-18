import { act, fireEvent, render, screen } from '@testing-library/react';
import HeroInspector from './HeroInspector';
import { loadAncientMatchups, peekAncientMatchups } from '../openDota';
jest.mock('../openDota', () => ({ loadAncientMatchups: jest.fn(), peekAncientMatchups: jest.fn(), describeError: () => 'Could not load.' }));
const props = { id: 1, catalog: { 1: { localized_name: 'Selected' }, 2: { localized_name: 'Weak overall' }, 3: { localized_name: 'Strong overall' } }, draft: [], players: [], onAction: jest.fn(), onClose: jest.fn(), onHero: jest.fn() };
const baselineRows = [{ hero_id: 1, games: 1000, wins: 500 }, { hero_id: 2, games: 1000, wins: 200 }, { hero_id: 3, games: 1000, wins: 800 }];
beforeEach(() => {
  peekAncientMatchups.mockReturnValue(undefined);
  loadAncientMatchups.mockResolvedValue({ sample_size: 10000, oldest: 1700000000, newest: 1700086400,
    matchups: [{ hero_id: 2, games_played: 200, wins: 120 }, { hero_id: 3, games_played: 200, wins: 80 }], baselines: baselineRows });
});

test('defaults to adjusted ranking and allows comparison with raw win rate', async () => {
  await act(async () => { render(<HeroInspector {...props} />); });
  expect(screen.getByText('-20.0 pp')).toBeInTheDocument();
  expect(screen.getByText('60%')).toBeInTheDocument();
  expect(screen.getByText('80.0% expected')).toBeInTheDocument();
  expect(screen.queryByText('Strong overall')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Counters', exact: true }));
  expect(screen.getByText('+20.0 pp')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Rank by'), { target: { value: 'winRate' } });
  fireEvent.click(screen.getByRole('button', { name: 'Difficult' }));
  const matchups = screen.getAllByRole('button').filter(button => button.className === 'matchup-row');
  expect(matchups[0]).toHaveTextContent('Strong overall');
  fireEvent.click(matchups[0]);
  expect(props.onHero).toHaveBeenCalledWith(3);
});

test('failed Ancient+ requests do not substitute pro data and can be retried', async () => {
  loadAncientMatchups.mockRejectedValueOnce(new Error('network'));
  await act(async () => { render(<HeroInspector {...props} />); });
  expect(screen.getByRole('alert')).toHaveTextContent('Could not load');
  expect(screen.queryByText('40%')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry matchups' }));
  expect(await screen.findByText('-20.0 pp')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByText(/Ancient\+ average lobby rank/)).toBeInTheDocument();
  expect(screen.getByText(/10,000 sampled public matches/)).toBeInTheDocument();
});
