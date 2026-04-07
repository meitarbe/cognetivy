import path from "node:path";
import fs from "node:fs/promises";
import type { WorkflowIndexRecord } from "./models.js";
import { createMinimalWorkflowIndex } from "./default-workflow.js";

export const WORKSPACE_DIR = ".cognetivy";
export const WORKFLOWS_DIR = "workflows";
export const WORKFLOWS_INDEX_JSON = "index.json";

export interface WorkspacePaths {
  root: string;
  workflowsDir: string;
  workflowsIndexPath: string;
}

export function getWorkspaceRoot(cwd: string = process.cwd()): string {
  return path.resolve(cwd, WORKSPACE_DIR);
}

export function getWorkspacePaths(cwd: string = process.cwd()): WorkspacePaths {
  const root = getWorkspaceRoot(cwd);
  return {
    root,
    workflowsDir: path.join(root, WORKFLOWS_DIR),
    workflowsIndexPath: path.join(root, WORKFLOWS_DIR, WORKFLOWS_INDEX_JSON),
  };
}

export async function workspaceExists(cwd: string = process.cwd()): Promise<boolean> {
  try {
    await fs.access(getWorkspacePaths(cwd).root);
    return true;
  } catch {
    return false;
  }
}

async function readIndexRaw(cwd: string): Promise<WorkflowIndexRecord | null> {
  const indexPath = getWorkspacePaths(cwd).workflowsIndexPath;
  try {
    const raw = await fs.readFile(indexPath, "utf-8");
    return JSON.parse(raw) as WorkflowIndexRecord;
  } catch {
    return null;
  }
}

async function writeIndexRaw(index: WorkflowIndexRecord, cwd: string): Promise<void> {
  const paths = getWorkspacePaths(cwd);
  await fs.mkdir(paths.workflowsDir, { recursive: true });
  await fs.writeFile(paths.workflowsIndexPath, `${JSON.stringify(index, null, 2)}\n`, "utf-8");
}

/**
 * Minimal workspace root. Does not create workflow index or modify .gitignore.
 * (Some commands will create `.cognetivy/workflows/index.json` lazily only when needed.)
 */
export async function ensureMinimalWorkspace(
  cwd: string = process.cwd(),
  options: { noGitignore?: boolean } = {}
): Promise<WorkspacePaths> {
  const paths = getWorkspacePaths(cwd);
  await fs.mkdir(paths.root, { recursive: true });
  void options; // kept for backwards compatibility; .gitignore is no longer modified here
  return paths;
}

/** Same as ensureMinimalWorkspace; `force` is ignored (no local DB to reset). */
export async function ensureWorkspace(
  cwd: string = process.cwd(),
  options: { force?: boolean; noGitignore?: boolean } = {}
): Promise<WorkspacePaths> {
  void options;
  return ensureMinimalWorkspace(cwd);
}

export async function requireWorkspace(cwd: string = process.cwd()): Promise<WorkspacePaths> {
  if (!(await workspaceExists(cwd))) {
    throw new Error("No cognetivy workspace found. Run `cognetivy init` in this directory first.");
  }
  return getWorkspacePaths(cwd);
}

function normalizeIndex(data: WorkflowIndexRecord): WorkflowIndexRecord {
  return {
    current_workflow_id: data.current_workflow_id ?? "",
    cloud_current_workflow_id: data.cloud_current_workflow_id,
    workflows: Array.isArray(data.workflows) ? data.workflows : [],
  };
}

export async function readWorkflowIndex(cwd: string = process.cwd()): Promise<WorkflowIndexRecord> {
  await requireWorkspace(cwd);
  const data = await readIndexRaw(cwd);
  if (!data) {
    throw new Error("Invalid or missing workflows index.");
  }
  return normalizeIndex(data);
}

export async function readWorkflowIndexOptional(cwd: string = process.cwd()): Promise<WorkflowIndexRecord | null> {
  if (!(await workspaceExists(cwd))) {
    return null;
  }
  const data = await readIndexRaw(cwd);
  return data ? normalizeIndex(data) : null;
}

export async function writeWorkflowIndex(index: WorkflowIndexRecord, cwd: string = process.cwd()): Promise<void> {
  await ensureMinimalWorkspace(cwd);
  await writeIndexRaw(normalizeIndex(index), cwd);
}
