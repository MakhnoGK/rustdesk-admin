import { useSyncExternalStore } from 'react';

// One shared 1 s clock for every live timer on the page; it only re-renders its subscribers and
// never triggers a fetch.
const listeners = new Set<() => void>();
let now = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      listeners.forEach((l) => l());
    }, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) clearInterval(timer);
  };
}

/** Current time in ms, updated every second while at least one component uses it. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, () => now);
}
