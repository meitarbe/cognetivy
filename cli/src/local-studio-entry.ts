/**
 * Start local HTTP + WebSocket backend and block until SIGINT/SIGTERM.
 */
import open from "open";
import {
  createLocalStudioServer,
  type LocalStudioServerHandle,
} from "./local-server/local-studio-server.js";

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
  console.log("");
  console.log("Cognetivy local backend is running.");
  console.log(`  ${handle.openUrl}`);
  console.log("");
  console.log("Press Ctrl+C to stop.");
  console.log("");

  if (process.stdin.isTTY) {
    await openUrlIfConfigured(handle.openUrl);
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
