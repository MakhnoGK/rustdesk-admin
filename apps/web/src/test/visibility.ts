/** Simulates the tab being hidden or shown (TanStack Query's focus manager listens to this). */
export function setDocumentHidden(hidden: boolean): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => (hidden ? 'hidden' : 'visible'),
  });
  // Bubbles to window, where the focus manager listens.
  document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
}
