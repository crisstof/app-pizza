/**
 * In-memory failure counter for login endpoints: after `max` failures for a
 * key within `windowMs`, `isLockedOut(key)` is true until the window ends.
 * Per-process only (fine for a single backend instance); a restart resets it.
 */
export function createFailureLimiter({ max, windowMs }: { max: number; windowMs: number }) {
  const failures = new Map<string, { count: number; resetAt: number }>();

  // Drop expired entries now and then, so a flood of distinct keys can't grow
  // the map forever.
  function prune(now: number) {
    if (failures.size < 1000) return;
    for (const [key, entry] of failures) if (entry.resetAt < now) failures.delete(key);
  }

  return {
    isLockedOut(key: string) {
      const entry = failures.get(key);
      return Boolean(entry && entry.resetAt >= Date.now() && entry.count >= max);
    },
    recordFailure(key: string) {
      const now = Date.now();
      prune(now);
      const entry = failures.get(key);
      if (!entry || entry.resetAt < now) failures.set(key, { count: 1, resetAt: now + windowMs });
      else entry.count++;
    },
    clear(key: string) {
      failures.delete(key);
    },
  };
}
