import path from "node:path";

/**
 * Resolve `relPath` under `workspaceRoot` and reject escapes (.., absolute outside root).
 * Returns absolute path or null if invalid.
 */
export function resolvePathUnderWorkspaceRoot(workspaceRoot: string, relPath: string): string | null {
  const root = path.resolve(workspaceRoot);
  const normalizedRel = typeof relPath === "string" ? relPath.trim() : "";
  const candidate = path.resolve(root, normalizedRel === "" ? "." : normalizedRel);
  const rel = path.relative(root, candidate);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return null;
  }
  return candidate;
}

/** Path relative to workspace root using forward slashes (for UI). */
export function toDisplayRelativePath(workspaceRoot: string, absolutePath: string): string {
  const root = path.resolve(workspaceRoot);
  const abs = path.resolve(absolutePath);
  const rel = path.relative(root, abs);
  if (!rel || rel === "") {
    return ".";
  }
  return rel.split(path.sep).join("/");
}
