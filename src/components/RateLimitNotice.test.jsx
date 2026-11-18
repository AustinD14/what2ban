import { act, render, screen } from '@testing-library/react';
import axios from 'axios';
import RateLimitNotice from './RateLimitNotice';
import { loadHeroes, resetRequestQueue } from '../openDota';
import { clearCache } from '../cache';

jest.mock('axios');

test('shows the shared cooldown notice and removes it when requests resume', async () => {
  jest.useFakeTimers('modern');
  localStorage.clear();
  clearCache();
  resetRequestQueue();
  axios.get.mockRejectedValueOnce({ response: { status: 429 } }).mockResolvedValueOnce({ data: [] });
  const view = render(<RateLimitNotice />);
  try {
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    let request;
    await act(async () => { request = loadHeroes(); });
    expect(screen.getByRole('status')).toHaveTextContent('OpenDota rate limit reached');
    await act(async () => { jest.advanceTimersByTime(60000); await request; });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  } finally {
    view.unmount();
    resetRequestQueue();
    jest.useRealTimers();
  }
});
