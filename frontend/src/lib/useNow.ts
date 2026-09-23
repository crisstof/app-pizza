import { useEffect, useState } from "react";

// Current time, re-rendered every `intervalMs` — for countdowns and "il y a N min".
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

// Whole minutes from `now` to `target`, rounded (negative once it's past):
// rounding rather than ceil keeps a slow-ticking `now` from showing 16 min
// right after a 15 min estimate.
export function minutesUntil(target: string | Date, now: number) {
  return Math.round((new Date(target).getTime() - now) / 60_000);
}
