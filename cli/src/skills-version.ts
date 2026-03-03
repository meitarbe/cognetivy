/**
 * Track which CLI version was used to install skills (per project and per skill dir).
 */

import path from "node:path";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import { fileURLToPath } from "node:url";
import { getWorkspaceRoot } from "./workspace.js";

export const SKILLS_VERSION_FILENAME = "skills-version.json";
export const COGNETIVY_VERSION_FILENAME = ".cognetivy-version";

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
 * Read the CLI version that was used when skills were last installed in this project.
 */
export async function readInstalledSkillsVersion(cwd: string): Promise<string | null> {
  const root = getWorkspaceRoot(cwd);
  const projectFile = path.join(root, SKILLS_VERSION_FILENAME);
  try {
    const raw = await fs.readFile(projectFile, "utf-8");
    const data = JSON.parse(raw) as { version?: string };
    if (typeof data.version === "string") return data.version;
  } catch {
    // no project file
  }
  const candidates = [
    path.resolve(cwd, ".cursor", "skills", "cognetivy", COGNETIVY_VERSION_FILENAME),
    path.resolve(cwd, ".claude", "skills", "cognetivy", COGNETIVY_VERSION_FILENAME),
  ];
  let maxVersion: string | null = null;
  for (const file of candidates) {
    try {
      const v = (await fs.readFile(file, "utf-8")).trim();
      if (v && (!maxVersion || isNewerVersion(v, maxVersion))) maxVersion = v;
    } catch {
      // skip
    }
  }
  return maxVersion;
}

/**
 * Write the current CLI version so we know "skills in this project were installed with version X".
 */
export async function writeInstalledSkillsVersion(cwd: string, version: string): Promise<void> {
  const root = getWorkspaceRoot(cwd);
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(
    path.join(root, SKILLS_VERSION_FILENAME),
    JSON.stringify({ version }, null, 2),
    "utf-8"
  );
}
