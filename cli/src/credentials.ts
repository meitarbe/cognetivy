/**
 * Path to stored API key file. Env takes precedence; this is used when COGNETIVY_API_KEY is not set.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const COGNETIVY_DIR = process.platform === "win32"
  ? path.join(process.env.LOCALAPPDATA ?? os.homedir(), "Cognetivy")
  : path.join(os.homedir(), ".config", "cognetivy");
const API_KEY_FILENAME = "api-key";

export function getCredentialsDir(): string {
  return COGNETIVY_DIR;
}

export function getApiKeyPath(): string {
  return path.join(COGNETIVY_DIR, API_KEY_FILENAME);
}

/** Read stored API key; returns null if missing or unreadable. */
export function readStoredApiKey(): string | null {
  try {
    const p = getApiKeyPath();
    const raw = fs.readFileSync(p, "utf-8");
    const key = raw.trim();
    return key || null;
  } catch {
    return null;
  }
}

/** Write API key to config file (creates directory if needed). */
export function writeStoredApiKey(key: string): void {
  const dir = getCredentialsDir();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(dir, API_KEY_FILENAME), key + "\n", { mode: 0o600 });
}

/** Remove stored API key file. */
export function removeStoredApiKey(): boolean {
  try {
    const p = getApiKeyPath();
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}
