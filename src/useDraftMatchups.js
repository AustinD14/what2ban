import { useEffect, useRef, useState } from 'react';
import { describeError, loadAncientMatchups, peekAncientMatchups } from './openDota';

function cachedOpponents(key) {
  return Object.fromEntries(key.split(',').filter(Boolean).flatMap(value => {
    const id = Number(value);
    const sample = peekAncientMatchups(id);
    return sample ? [[id, { status: 'ready', sample }]] : [];
  }));
}

export default function useDraftMatchups(draft = []) {
  const opponentKey = draft.filter(action => action.type === 'them').map(action => action.id).sort((a, b) => a - b).join(',');
  const [results, setResults] = useState(() => cachedOpponents(opponentKey));
  const pending = useRef(new Set());
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  // Restore valid evidence on remount and when a cached hero becomes an opponent.
  // Cache misses stay unloaded: hydration must never spend API requests.
  useEffect(() => {
    const cached = cachedOpponents(opponentKey);
    setResults(current => Object.entries(cached).some(([id, result]) => current[id]?.sample !== result.sample)
      ? { ...current, ...cached } : current);
  }, [opponentKey]);
  async function load(id) {
    if (pending.current.has(id)) return;
    const cached = peekAncientMatchups(id);
    if (cached) { setResults(current => ({ ...current, [id]: { status: 'ready', sample: cached } })); return; }
    pending.current.add(id);
    setResults(current => ({ ...current, [id]: { status: 'loading' } }));
    try {
      const sample = await loadAncientMatchups(id);
      if (active.current) setResults(current => ({ ...current, [id]: { status: 'ready', sample } }));
    } catch (error) {
      if (active.current) setResults(current => ({ ...current, [id]: { status: 'error', error: describeError(error) } }));
    } finally { pending.current.delete(id); }
  }
  return { results, load, samples: Object.fromEntries(Object.entries(results)
    .filter(([, result]) => result.status === 'ready').map(([id, result]) => [id, result.sample])) };
}
