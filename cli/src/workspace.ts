import path from "node:path";
import fs from "node:fs/promises";
import type {
  WorkflowPointer,
  WorkflowVersion,
  RunRecord,
  EventPayload,
  MutationRecord,
  ArtifactSchemaConfig,
  ArtifactItem,
  ArtifactStore,
} from "./models.js";
import {
  createDefaultPointer,
  createDefaultWorkflowVersion,
  DEFAULT_WORKFLOW_ID,
} from "./default-workflow.js";
import { validateArtifactItem, validateArtifactItems } from "./validate-artifact.js";

export const WORKSPACE_DIR = ".cognetivy";
export const WORKFLOW_JSON = "workflow.json";
export const WORKFLOW_VERSIONS_DIR = "workflow.versions";
export const RUNS_DIR = "runs";
export const EVENTS_DIR = "events";
export const MUTATIONS_DIR = "mutations";
export const ARTIFACTS_DIR = "artifacts";
export const ARTIFACT_SCHEMA_JSON = "artifact-schema.json";

const GITIGNORE_SNIPPET = `
# cognetivy — ignore runtime data; commit workflow.versions/
.cognetivy/runs/
.cognetivy/events/
.cognetivy/mutations/
.cognetivy/artifacts/
`.trim();

export interface WorkspacePaths {
  root: string;
  workflowJson: string;
  workflowVersionsDir: string;
  runsDir: string;
  eventsDir: string;
  mutationsDir: string;
  artifactsDir: string;
  artifactSchemaPath: string;
}

/**
 * Resolve workspace root from a given directory (default: cwd).
 * Does NOT create anything; use ensureWorkspace to create.
 */
export function getWorkspaceRoot(cwd: string = process.cwd()): string {
  return path.resolve(cwd, WORKSPACE_DIR);
}

/**
 * Get all workspace paths. Paths are derived from root; directories may not exist yet.
 */
export function getWorkspacePaths(cwd: string = process.cwd()): WorkspacePaths {
  const root = getWorkspaceRoot(cwd);
  return {
    root,
    workflowJson: path.join(root, WORKFLOW_JSON),
    workflowVersionsDir: path.join(root, WORKFLOW_VERSIONS_DIR),
    runsDir: path.join(root, RUNS_DIR),
    eventsDir: path.join(root, EVENTS_DIR),
    mutationsDir: path.join(root, MUTATIONS_DIR),
    artifactsDir: path.join(root, ARTIFACTS_DIR),
    artifactSchemaPath: path.join(root, ARTIFACT_SCHEMA_JSON),
  };
}

/**
 * Check if workspace exists (has workflow.json).
 */
export async function workspaceExists(cwd: string = process.cwd()): Promise<boolean> {
  const p = getWorkspacePaths(cwd);
  try {
    await fs.access(p.workflowJson);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create full workspace structure. Idempotent for directories.
 * If workflow.json or wf_v1 already exist and force is false, they are not overwritten.
 */
export async function ensureWorkspace(
  cwd: string = process.cwd(),
  options: { force?: boolean; noGitignore?: boolean } = {}
): Promise<WorkspacePaths> {
  const p = getWorkspacePaths(cwd);
  await fs.mkdir(p.root, { recursive: true });
  await fs.mkdir(p.workflowVersionsDir, { recursive: true });
  await fs.mkdir(p.runsDir, { recursive: true });
  await fs.mkdir(p.eventsDir, { recursive: true });
  await fs.mkdir(p.mutationsDir, { recursive: true });
  await fs.mkdir(p.artifactsDir, { recursive: true });

  const schemaPath = p.artifactSchemaPath;
  if (!(await fileExists(schemaPath)) || options.force) {
    const { DEFAULT_ARTIFACT_SCHEMA } = await import("./default-artifact-schema.js");
    await fs.writeFile(schemaPath, JSON.stringify(DEFAULT_ARTIFACT_SCHEMA, null, 2), "utf-8");
  }

  const pointerPath = p.workflowJson;
  const versionFileName = `wf_${createDefaultWorkflowVersion().version}.json`;
  const versionPath = path.join(p.workflowVersionsDir, versionFileName);

  const pointerExists = await fileExists(pointerPath);
  const versionExists = await fileExists(versionPath);

  if (!pointerExists || options.force) {
    const pointer = createDefaultPointer();
    await fs.writeFile(pointerPath, JSON.stringify(pointer, null, 2), "utf-8");
  }
  if (!versionExists || options.force) {
    const version = createDefaultWorkflowVersion();
    await fs.writeFile(versionPath, JSON.stringify(version, null, 2), "utf-8");
  }

  if (!options.noGitignore) {
    const gitignorePath = path.resolve(cwd, ".gitignore");
    await appendGitignoreSnippet(gitignorePath, GITIGNORE_SNIPPET);
  }

  return p;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function appendGitignoreSnippet(
  gitignorePath: string,
  snippet: string
): Promise<void> {
  let content = "";
  try {
    content = await fs.readFile(gitignorePath, "utf-8");
  } catch {
    // .gitignore does not exist
  }
  const marker = "# cognetivy";
  if (content.includes(marker)) return;
  const toAppend = "\n\n" + snippet + "\n";
  await fs.appendFile(gitignorePath, toAppend, "utf-8");
}

/**
 * Require workspace to exist; throw with a helpful message if not.
 */
export async function requireWorkspace(cwd: string = process.cwd()): Promise<WorkspacePaths> {
  const exists = await workspaceExists(cwd);
  if (!exists) {
    throw new Error(
      "No cognetivy workspace found. Run `cognetivy init` in this directory first."
    );
  }
  return getWorkspacePaths(cwd);
}

/**
 * Read workflow pointer from workspace.
 */
export async function readWorkflowPointer(
  cwd: string = process.cwd()
): Promise<WorkflowPointer> {
  const p = await requireWorkspace(cwd);
  const raw = await fs.readFile(p.workflowJson, "utf-8");
  return JSON.parse(raw) as WorkflowPointer;
}

/**
 * Write workflow pointer (e.g. after setting new version).
 */
export async function writeWorkflowPointer(
  pointer: WorkflowPointer,
  cwd: string = process.cwd()
): Promise<void> {
  const p = await requireWorkspace(cwd);
  await fs.writeFile(p.workflowJson, JSON.stringify(pointer, null, 2), "utf-8");
}

/**
 * Resolve path to a workflow version file (e.g. wf_v1.json).
 * Convention: workflow_id is wf_default, version is v1 -> file is wf_v1.json.
 */
export function getWorkflowVersionFilePath(
  version: string,
  cwd: string = process.cwd()
): string {
  const p = getWorkspacePaths(cwd);
  return path.join(p.workflowVersionsDir, `wf_${version}.json`);
}

/**
 * Read workflow version from workspace.
 */
export async function readWorkflowVersion(
  version: string,
  cwd: string = process.cwd()
): Promise<WorkflowVersion> {
  await requireWorkspace(cwd);
  const filePath = getWorkflowVersionFilePath(version, cwd);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as WorkflowVersion;
  } catch (err) {
    throw new Error(`Workflow version "${version}" not found at ${filePath}`);
  }
}

/**
 * Write a new workflow version file (immutable). File name: wf_<version>.json
 */
export async function writeWorkflowVersion(
  workflow: WorkflowVersion,
  cwd: string = process.cwd()
): Promise<void> {
  const p = await requireWorkspace(cwd);
  const fileName = `wf_${workflow.version}.json`;
  const filePath = path.join(p.workflowVersionsDir, fileName);
  await fs.writeFile(filePath, JSON.stringify(workflow, null, 2), "utf-8");
}

/**
 * List existing version file names (e.g. ["wf_v1.json", "wf_v2.json"]) to infer next version.
 */
export async function listWorkflowVersionFiles(
  cwd: string = process.cwd()
): Promise<string[]> {
  const p = await requireWorkspace(cwd);
  const entries = await fs.readdir(p.workflowVersionsDir, { withFileTypes: true });
  return entries.filter((e) => e.isFile() && e.name.startsWith("wf_") && e.name.endsWith(".json")).map((e) => e.name);
}

/**
 * Parse version from filename (e.g. wf_v2.json -> v2).
 */
export function versionFromFileName(fileName: string): string {
  const base = fileName.replace(/^wf_/, "").replace(/\.json$/, "");
  return base || "v1";
}

/**
 * Compute next version (v1 -> v2, v2 -> v3, ...).
 */
export function nextVersion(current: string): string {
  const num = parseInt(current.replace(/^v/, ""), 10);
  if (Number.isNaN(num)) return "v2";
  return `v${num + 1}`;
}

export { DEFAULT_WORKFLOW_ID };

// --- Run / Event / Mutation file helpers ---

export function getRunFilePath(runId: string, cwd: string = process.cwd()): string {
  const p = getWorkspacePaths(cwd);
  return path.join(p.runsDir, `${runId}.json`);
}

export function getEventsFilePath(runId: string, cwd: string = process.cwd()): string {
  const p = getWorkspacePaths(cwd);
  return path.join(p.eventsDir, `${runId}.ndjson`);
}

export function getMutationFilePath(mutationId: string, cwd: string = process.cwd()): string {
  const p = getWorkspacePaths(cwd);
  return path.join(p.mutationsDir, `${mutationId}.json`);
}

export async function runExists(runId: string, cwd: string = process.cwd()): Promise<boolean> {
  await requireWorkspace(cwd);
  const filePath = getRunFilePath(runId, cwd);
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function writeRunFile(
  record: RunRecord,
  cwd: string = process.cwd()
): Promise<void> {
  const p = await requireWorkspace(cwd);
  const filePath = path.join(p.runsDir, `${record.run_id}.json`);
  await fs.writeFile(filePath, JSON.stringify(record, null, 2), "utf-8");
}

export async function readRunFile(
  runId: string,
  cwd: string = process.cwd()
): Promise<RunRecord> {
  await requireWorkspace(cwd);
  const filePath = getRunFilePath(runId, cwd);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as RunRecord;
  } catch (err) {
    throw new Error(`Run "${runId}" not found. Ensure the run exists (e.g. cognetivy run start).`);
  }
}

export async function updateRunFile(
  runId: string,
  updates: Partial<RunRecord>,
  cwd: string = process.cwd()
): Promise<void> {
  const existing = await readRunFile(runId, cwd);
  const updated = { ...existing, ...updates };
  await writeRunFile(updated, cwd);
}

/** Append a single NDJSON line to the events file. Uses append-only write. */
export async function appendEventLine(
  runId: string,
  event: EventPayload,
  cwd: string = process.cwd()
): Promise<void> {
  const p = await requireWorkspace(cwd);
  const filePath = path.join(p.eventsDir, `${runId}.ndjson`);
  const line = JSON.stringify(event) + "\n";
  const fd = await fs.open(filePath, "a");
  try {
    await fd.write(line, undefined, "utf-8");
  } finally {
    await fd.close();
  }
}

export async function writeMutationFile(
  record: MutationRecord,
  cwd: string = process.cwd()
): Promise<void> {
  const p = await requireWorkspace(cwd);
  const filePath = path.join(p.mutationsDir, `${record.mutation_id}.json`);
  await fs.writeFile(filePath, JSON.stringify(record, null, 2), "utf-8");
}

export async function readMutationFile(
  mutationId: string,
  cwd: string = process.cwd()
): Promise<MutationRecord> {
  await requireWorkspace(cwd);
  const filePath = getMutationFilePath(mutationId, cwd);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as MutationRecord;
  } catch (err) {
    throw new Error(`Mutation "${mutationId}" not found.`);
  }
}

export async function updateMutationFile(
  mutationId: string,
  updates: Partial<MutationRecord>,
  cwd: string = process.cwd()
): Promise<void> {
  const existing = await readMutationFile(mutationId, cwd);
  const updated = { ...existing, ...updates };
  await writeMutationFile(updated, cwd);
}

// --- Artifact schema and storage ---

export function getRunArtifactsDir(runId: string, cwd: string = process.cwd()): string {
  const p = getWorkspacePaths(cwd);
  return path.join(p.artifactsDir, runId);
}

export function getArtifactStorePath(runId: string, kind: string, cwd: string = process.cwd()): string {
  const dir = getRunArtifactsDir(runId, cwd);
  const safeKind = kind.replace(/[^a-z0-9_-]/gi, "_");
  return path.join(dir, `${safeKind}.json`);
}

export async function readArtifactSchema(cwd: string = process.cwd()): Promise<ArtifactSchemaConfig> {
  const p = await requireWorkspace(cwd);
  try {
    const raw = await fs.readFile(p.artifactSchemaPath, "utf-8");
    return JSON.parse(raw) as ArtifactSchemaConfig;
  } catch {
    const { DEFAULT_ARTIFACT_SCHEMA } = await import("./default-artifact-schema.js");
    await fs.writeFile(p.artifactSchemaPath, JSON.stringify(DEFAULT_ARTIFACT_SCHEMA, null, 2), "utf-8");
    return DEFAULT_ARTIFACT_SCHEMA;
  }
}

export async function writeArtifactSchema(
  schema: ArtifactSchemaConfig,
  cwd: string = process.cwd()
): Promise<void> {
  const p = await requireWorkspace(cwd);
  await fs.writeFile(p.artifactSchemaPath, JSON.stringify(schema, null, 2), "utf-8");
}

export async function listArtifactKindsForRun(runId: string, cwd: string = process.cwd()): Promise<string[]> {
  await requireWorkspace(cwd);
  if (!(await runExists(runId, cwd))) {
    throw new Error(`Run "${runId}" not found.`);
  }
  const dir = getRunArtifactsDir(runId, cwd);
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith(".json"))
      .map((e) => e.name.replace(/\.json$/, ""));
  } catch {
    return [];
  }
}

export async function readArtifacts(
  runId: string,
  kind: string,
  cwd: string = process.cwd()
): Promise<ArtifactStore> {
  await requireWorkspace(cwd);
  if (!(await runExists(runId, cwd))) {
    throw new Error(`Run "${runId}" not found.`);
  }
  const filePath = getArtifactStorePath(runId, kind, cwd);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as ArtifactStore;
  } catch {
    return {
      run_id: runId,
      kind,
      updated_at: new Date().toISOString(),
      items: [],
    };
  }
}

export async function writeArtifacts(
  runId: string,
  kind: string,
  items: ArtifactItem[],
  cwd: string = process.cwd()
): Promise<void> {
  await requireWorkspace(cwd);
  if (!(await runExists(runId, cwd))) {
    throw new Error(`Run "${runId}" not found.`);
  }
  const schema = await readArtifactSchema(cwd);
  validateArtifactItems(schema, kind, items);
  const dir = getRunArtifactsDir(runId, cwd);
  await fs.mkdir(dir, { recursive: true });
  const store: ArtifactStore = {
    run_id: runId,
    kind,
    updated_at: new Date().toISOString(),
    items,
  };
  const filePath = getArtifactStorePath(runId, kind, cwd);
  await fs.writeFile(filePath, JSON.stringify(store, null, 2), "utf-8");
}

export async function appendArtifact(
  runId: string,
  kind: string,
  payload: Record<string, unknown>,
  options: { id?: string } = {},
  cwd: string = process.cwd()
): Promise<ArtifactItem> {
  await requireWorkspace(cwd);
  if (!(await runExists(runId, cwd))) {
    throw new Error(`Run "${runId}" not found.`);
  }
  const schema = await readArtifactSchema(cwd);
  validateArtifactItem(schema, kind, payload);
  const existing = await readArtifacts(runId, kind, cwd);
  const now = new Date().toISOString();
  const item: ArtifactItem = {
    ...payload,
    id: options.id ?? `art_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    created_at: now,
  };
  existing.items.push(item);
  existing.updated_at = now;
  const dir = getRunArtifactsDir(runId, cwd);
  await fs.mkdir(dir, { recursive: true });
  const filePath = getArtifactStorePath(runId, kind, cwd);
  await fs.writeFile(filePath, JSON.stringify(existing, null, 2), "utf-8");
  return item;
}
