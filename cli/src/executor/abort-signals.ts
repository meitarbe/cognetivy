/**
 * Combine multiple AbortSignals so aborting any one aborts the merged signal.
 */
export function mergeAbortSignals(...signals: AbortSignal[]): AbortSignal {
  const merged = new AbortController();
  function abortMerged() {
    merged.abort();
  }
  for (const s of signals) {
    if (s.aborted) {
      merged.abort();
      return merged.signal;
    }
    s.addEventListener("abort", abortMerged, { once: true });
  }
  return merged.signal;
}
