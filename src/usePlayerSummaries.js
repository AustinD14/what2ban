import { useMemo } from "react";
import { summarizeMatches } from "./scouting";

const EMPTY_MATCHES = [];

export default function usePlayerSummaries(players, historySize, days, recentSize) {
  // A history array is immutable. Reuse its summary through name, team and status
  // updates; replaced/removed histories can be collected by the WeakMap.
  const summarize = useMemo(() => {
    const summaries = new WeakMap();
    return (matches) => {
      if (!summaries.has(matches)) {
        summaries.set(matches, summarizeMatches(matches, historySize, days, recentSize));
      }
      return summaries.get(matches);
    };
  }, [historySize, days, recentSize]);

  return useMemo(() => players.map((player) => ({
    ...player, summary: summarize(player.matches ?? EMPTY_MATCHES),
  })), [players, summarize]);
}
