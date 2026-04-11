/**
 * Per-node working directories for parallel executor runs (isolated agent writes).
 *
 * COGNETIVY_PARALLEL_ISOLATION:
 *   copy (default) - copy workspace into .cognetivy/exec-islands/<runId>/<nodeId>/ (skips heavy dirs)
 *   none - use the parent workspace cwd (no isolation; faster, not isolated)
 */
import fs from "node:fs/promises";
import path from "node:path";

const EXCLUDE_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  "dist",
  "dist-local",
  "build",
  ".next",
  "coverage",
  ".turbo",
  ".cache",
  "tmp",
  "temp",
]);

export function sanitizeNodeIdForPath(nodeId: string): string {
  const s = nodeId.replace(/[^a-zA-Z0-9._-]+/g, "_");
  return s.length > 0 ? s.slice(0, 120) : "node";
}

function shouldSkipPath(root: string, absPath: string): boolean {
  const rel = path.relative(root, absPath);
  if (rel.startsWith("..")) {
    return true;
  }
  const parts = rel.split(path.sep).filter(Boolean);
  if (parts.length >= 2 && parts[0] === ".cognetivy" && parts[1] === "exec-islands") {
    return true;
  }
  return parts.some((p) => EXCLUDE_DIR_NAMES.has(p));
}

async function copyDirectoryFiltered(srcDir: string, destDir: string, root: string): Promise<void> {
  await fs.mkdir(destDir, { recursive: true });
  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  for (const ent of entries) {
    const src = path.join(srcDir, ent.name);
    const dest = path.join(destDir, ent.name);
    if (shouldSkipPath(root, src)) {
      continue;
    }
    if (ent.isDirectory()) {
      await copyDirectoryFiltered(src, dest, root);
    } else if (ent.isFile()) {
      await fs.copyFile(src, dest);
    } else if (ent.isSymbolicLink()) {
      const link = await fs.readlink(src);
      try {
        await fs.symlink(link, dest);
      } catch {
        // If symlink fails (e.g. perms), skip
      }
    }
  }
}

export async function prepareIsolatedNodeWorkspace(
  baseCwd: string,
  runId: string,
  nodeId: string
): Promise<string> {
  const mode = (process.env.COGNETIVY_PARALLEL_ISOLATION ?? "copy").trim().toLowerCase();
  if (mode === "none") {
    return baseCwd;
  }
  if (mode !== "copy") {
    throw new Error(
      `COGNETIVY_PARALLEL_ISOLATION="${mode}" is not supported. Use "copy" (default) or "none".`
    );
  }

  const safeNode = sanitizeNodeIdForPath(nodeId);
  const islandRoot = path.join(baseCwd, ".cognetivy", "exec-islands", runId, safeNode);
  await fs.rm(islandRoot, { recursive: true, force: true });
  await fs.mkdir(path.dirname(islandRoot), { recursive: true });
  await copyDirectoryFiltered(baseCwd, islandRoot, baseCwd);
  return islandRoot;
}
