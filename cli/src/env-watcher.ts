/**
 * Watches Cognetivy-related paths (skills, MCP config, .cognetivy) for real-time visibility.
 * Emits only filesystem path events (add/change/remove); no file contents.
 * Debounced to avoid event storms. Runs in the same process as MCP or other long-lived commands.
 */

import path from "node:path";
import type { FSWatcher } from "chokidar";

const DEFAULT_DEBOUNCE_MS = 400;

/** Paths to watch relative to cwd (directory or file names). */
const WATCH_RELATIVE_PATHS = [
  ".cursor",
  ".claude",
  ".cognetivy",
  ".agents",
] as const;

export type EnvWatcherEventType = "add" | "change" | "unlink";

export interface EnvWatcherEvent {
  type: EnvWatcherEventType;
  path: string;
}

export interface EnvWatcherOptions {
  /** Debounce interval in ms. Default 400. */
  debounceMs?: number;
  /** Called for each debounced batch of events. If omitted, nothing is emitted. */
  onEvent?: (event: EnvWatcherEvent) => void;
}

let chokidarModule: { watch: (paths: string[], options: { ignoreInitial?: boolean }) => FSWatcher } | null = null;

async function loadChokidar(): Promise<typeof chokidarModule> {
  if (chokidarModule) return chokidarModule;
  try {
    const chokidar = await import("chokidar");
    chokidarModule = chokidar;
    return chokidar;
  } catch {
    return null;
  }
}

/**
 * Start watching skills, MCP config, and .cognetivy paths under cwd.
 * Emits path-only events (add/change/remove) with debouncing.
 * Returns a stop function to close the watcher.
 */
export async function startEnvWatcher(
  cwd: string,
  options: EnvWatcherOptions = {}
): Promise<() => void> {
  const chokidar = await loadChokidar();
  if (!chokidar) {
    return () => {};
  }

  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const onEvent = options.onEvent;

  const watchPaths = WATCH_RELATIVE_PATHS.map((rel) => path.resolve(cwd, rel));
  const pending = new Map<string, EnvWatcherEventType>();
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  function flush(): void {
    debounceTimer = null;
    if (!onEvent || pending.size === 0) return;
    for (const [p, type] of pending) {
      onEvent({ type, path: p });
    }
    pending.clear();
  }

  function scheduleFlush(): void {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(flush, debounceMs);
  }

  function record(eventType: EnvWatcherEventType, fullPath: string): void {
    pending.set(fullPath, eventType);
    scheduleFlush();
  }

  const watcher = chokidar.watch(watchPaths, {
    ignoreInitial: true,
  });

  watcher.on("add", (p: string) => record("add", p));
  watcher.on("change", (p: string) => record("change", p));
  watcher.on("unlink", (p: string) => record("unlink", p));

  return function stop(): void {
    if (debounceTimer) clearTimeout(debounceTimer);
    watcher.close();
  };
}
