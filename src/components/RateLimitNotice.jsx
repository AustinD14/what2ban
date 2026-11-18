import { useSyncExternalStore } from "react";
import { getRateLimitUntil, subscribeRateLimit } from "../openDota";

export default function RateLimitNotice() {
  const until = useSyncExternalStore(subscribeRateLimit, getRateLimitUntil);
  return until ? <div className="rate-limit-notice" role="status">
    OpenDota rate limit reached. Waiting before sending more requests… Cached data is still available.
  </div> : null;
}
