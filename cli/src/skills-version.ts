/**
 * Track which CLI version was used to install skills. Version is stored per skill folder only
 * (.cognetivy-version in each install target); no central .cognetivy/ file.
 */

import path from "node:path";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import { fileURLToPath } from "node:url";

export const COGNETIVY_VERSION_FILENAME = ".cognetivy-version";

/** All install targets that can have the cognetivy skill (project-local paths only). */
const COGNETIVY_VERSION_CANDIDATES_RELATIVE = [
  ".cursor/skills/cognetivy",
  ".claude/skills/cognetivy",
  ".agents/skills/cognetivy",
  ".factory/skills/cognetivy",
  ".gemini/skills/cognetivy",
  "skills/cognetivy",
  ".opencode/skills/cognetivy",
  ".qwen/skills/cognetivy",
  ".cognetivy/skills/cognetivy",
] as const;

function getPackageJsonPath(): string {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  return path.join(dir, "..", "package.json");
}

export function getCurrentVersionSync(): string {
  try {
    const raw = fsSync.readFileSync(getPackageJsonPath(), "utf-8");
    const pkg = JSON.parse(raw) as { version?: string };
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function parseSemverParts(version: string): number[] {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return [0, 0, 0];
  return [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)];
}

export function isNewerVersion(a: string, b: string): boolean {
  const va = parseSemverParts(a);
  const vb = parseSemverParts(b);
  for (let i = 0; i < 3; i++) {
    if (va[i] > vb[i]) return true;
    if (va[i] < vb[i]) return false;
  }
  return false;
}

/**
 * Read the CLI version from installed skill folders (per-folder .cognetivy-version).
 * Returns the newest version found, or null if none.
 */
export async function readInstalledSkillsVersion(cwd: string): Promise<string | null> {
  const resolvedCwd = path.resolve(cwd);
  let maxVersion: string | null = null;
  for (const rel of COGNETIVY_VERSION_CANDIDATES_RELATIVE) {
    const versionFile = path.join(resolvedCwd, rel, COGNETIVY_VERSION_FILENAME);
    try {
      const v = (await fs.readFile(versionFile, "utf-8")).trim();
      if (v && (!maxVersion || isNewerVersion(v, maxVersion))) maxVersion = v;
    } catch {
      // skip
    }
  }
  return maxVersion;
}

/**
 * No-op: version is written per skill folder by installCognetivySkill. Kept for API compatibility.
 */
export async function writeInstalledSkillsVersion(_cwd: string, _version: string): Promise<void> {
  // Version is stored only in each install target's .cognetivy-version file.
}
