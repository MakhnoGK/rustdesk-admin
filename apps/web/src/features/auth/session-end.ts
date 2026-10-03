import type { LoginReason } from './redirect';

type SessionEndHandler = (reason?: LoginReason) => void;

let handler: SessionEndHandler | null = null;

/** Registered once by the router: clears the cache and goes to the login page. */
export function setSessionEndHandler(fn: SessionEndHandler | null): void {
  handler = fn;
}

/** Called on any 401 and when the session cookie expires. */
export function endSession(reason?: LoginReason): void {
  handler?.(reason);
}
