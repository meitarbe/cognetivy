/**
 * Start local HTTP + WebSocket backend and block until SIGINT/SIGTERM.
 */
import open from "open";
import {
  createLocalStudioServer,
  type LocalStudioServerHandle,
} from "./local-server/local-studio-server.js";

/**
 * When COGNETIVY_LOCAL_STUDIO_URL is set (e.g. http://localhost:5174), use that origin for CLI auth
 * (`/cli-auth`) instead of the CLI static server port. Use 0/false to keep the CLI base URL.
 */
export function resolveLocalStudioBrowserBase(handle: LocalStudioServerHandle): string {
  const raw = (process.env.COGNETIVY_LOCAL_STUDIO_URL ?? "").trim();
  if (raw && raw !== "0" && raw !== "false") {
    return raw.replace(/\/$/, "");
  }
  return handle.baseUrl;
}

/** URL opened in the browser: Vite dev (with ?session=) or bundled index on the CLI server. */
export function resolveLocalStudioOpenUrl(handle: LocalStudioServerHandle): string {
  const raw = (process.env.COGNETIVY_LOCAL_STUDIO_URL ?? "").trim();
  if (!raw || raw === "0" || raw === "false") {
    return handle.openUrl;
  }
  const base = raw.replace(/\/$/, "");
  return `${base}/?session=${encodeURIComponent(handle.sessionToken)}`;
}

async function openUrlIfConfigured(url: string): Promise<void> {
  if (process.env.COGNETIVY_SKIP_OPEN === "1" || process.env.COGNETIVY_SKIP_OPEN === "true") {
    console.log(`[SKIP_OPEN] ${url}`);
    return;
  }
  if (process.env.COGNETIVY_OPEN_APP === "0" || process.env.COGNETIVY_OPEN_APP === "false") {
    return;
  }
  await open(url);
}

export interface RunLocalStudioForegroundOptions {
  /** If set, use this server instead of creating a new one (e.g. already started for sign-in). */
  existingHandle?: LocalStudioServerHandle;
}

export async function runLocalStudioForeground(
  cwd: string,
  options: RunLocalStudioForegroundOptions = {}
): Promise<void> {
  const handle =
    options.existingHandle ?? (await createLocalStudioServer({ workspaceCwd: cwd }));
  const browserUrl = resolveLocalStudioOpenUrl(handle);
  console.log("");
  console.log("Cognetivy local backend is running.");
  console.log(`  Executor WebSocket: ${handle.baseUrl}/ws`);
  console.log(`  Open in browser:    ${browserUrl}`);
  console.log("");
  console.log("Press Ctrl+C to stop.");
  console.log("");

  if (process.stdin.isTTY) {
    await openUrlIfConfigured(browserUrl);
  }

  await new Promise<void>((resolve) => {
    const stop = () => {
      void handle.close().finally(() => {
        resolve();
        process.exit(0);
      });
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });
}
