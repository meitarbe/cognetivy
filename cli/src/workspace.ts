import path from "node:path";
import fs from "node:fs/promises";
import type {
  WorkflowIndexRecord,
  WorkflowRecordSummary,
  WorkflowRecord,
  WorkflowVersionRecord,
  RunRecord,
  EventPayload,
  CollectionSchemaConfig,
  CollectionItem,
  CollectionStore,
  NodeResultRecord,
} from "./models.js";
import {
  createDefaultWorkflowIndex,
  createDefaultWorkflowRecord,
  createDefaultWorkflowVersionRecord,
  DEFAULT_WORKFLOW_ID,
} from "./default-workflow.js";
import { validateCollectionItemPayload, validateCollectionItemsPayload } from "./validate-collection.js";

export const WORKSPACE_DIR = ".cognetivy";
export const WORKFLOWS_DIR = "workflows";
export const WORKFLOWS_INDEX_JSON = "index.json";
export const WORKFLOW_JSON = "workflow.json";
export const WORKFLOW_VERSIONS_DIR = "versions";
export const WORKFLOW_COLLECTIONS_DIR = "collections";
export const WORKFLOW_COLLECTION_SCHEMA_JSON = "schema.json";
export const RUNS_DIR = "runs";
export const EVENTS_DIR = "events";
export const COLLECTIONS_DIR = "collections";
export const NODE_RESULTS_DIR = "node-results";

const GITIGNORE_SNIPPET = `
# cognetivy - ignore runtime data; commit workflows/*/versions/
.cognetivy/runs/
.cognetivy/events/
.cognetivy/collections/
.cognetivy/node-results/
`.trim();

export interface WorkspacePaths {
  root: string;
  workflowsDir: string;
  workflowsIndexPath: string;
  runsDir: string;
  eventsDir: string;
  collectionsDir: string;
  nodeResultsDir: string;
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
    workflowsDir: path.join(root, WORKFLOWS_DIR),
    workflowsIndexPath: path.join(root, WORKFLOWS_DIR, WORKFLOWS_INDEX_JSON),
    runsDir: path.join(root, RUNS_DIR),
    eventsDir: path.join(root, EVENTS_DIR),
    collectionsDir: path.join(root, COLLECTIONS_DIR),
    nodeResultsDir: path.join(root, NODE_RESULTS_DIR),
  };
}

/**
 * Check if workspace exists (has workflow.json).
 */
export async function workspaceExists(cwd: string = process.cwd()): Promise<boolean> {
  const p = getWorkspacePaths(cwd);
  try {
    await fs.access(p.workflowsIndexPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create full workspace structure. Idempotent for directories.
 * If default workflow artifacts already exist and force is false, they are not overwritten.
 */
export async function ensureWorkspace(
  cwd: string = process.cwd(),
  options: { force?: boolean; noGitignore?: boolean } = {}
): Promise<WorkspacePaths> {
  const p = getWorkspacePaths(cwd);
  await fs.mkdir(p.root, { recursive: true });
  await fs.mkdir(p.workflowsDir, { recursive: true });
  await fs.mkdir(p.runsDir, { recursive: true });
  await fs.mkdir(p.eventsDir, { recursive: true });
  await fs.mkdir(p.collectionsDir, { recursive: true });
  await fs.mkdir(p.nodeResultsDir, { recursive: true });

  const indexExists = await fileExists(p.workflowsIndexPath);
  if (!indexExists || options.force) {
    const index = createDefaultWorkflowIndex();
    await fs.writeFile(p.workflowsIndexPath, JSON.stringify(index, null, 2), "utf-8");
  }

  await ensureDefaultWorkflowFiles(cwd, { force: options.force });

  if (!options.noGitignore) {
    const gitignorePath = path.resolve(cwd, ".gitignore");
    await appendGitignoreSnippet(gitignorePath, GITIGNORE_SNIPPET);
  }

  return p;
}

async function ensureDefaultWorkflowFiles(
  cwd: string,
  options: { force?: boolean } = {}
): Promise<void> {
  const p = getWorkspacePaths(cwd);
  const now = new Date().toISOString();

  const wfDir = getWorkflowDirPath(DEFAULT_WORKFLOW_ID, cwd);
  const versionsDir = getWorkflowVersionsDirPath(DEFAULT_WORKFLOW_ID, cwd);
  const wfCollectionsDir = getWorkflowCollectionsDirPath(DEFAULT_WORKFLOW_ID, cwd);
  await fs.mkdir(wfDir, { recursive: true });
  await fs.mkdir(versionsDir, { recursive: true });
  await fs.mkdir(wfCollectionsDir, { recursive: true });

  const wfPath = getWorkflowRecordPath(DEFAULT_WORKFLOW_ID, cwd);
  const version = createDefaultWorkflowVersionRecord(now);
  const versionPath = getWorkflowVersionRecordPath(DEFAULT_WORKFLOW_ID, version.version_id, cwd);
  const schemaPath = getWorkflowCollectionSchemaPath(DEFAULT_WORKFLOW_ID, cwd);

  if (!(await fileExists(wfPath)) || options.force) {
    const wf = createDefaultWorkflowRecord(now);
    await fs.writeFile(wfPath, JSON.stringify(wf, null, 2), "utf-8");
  }
  if (!(await fileExists(versionPath)) || options.force) {
    await fs.writeFile(versionPath, JSON.stringify(version, null, 2), "utf-8");
  }
  if (!(await fileExists(schemaPath)) || options.force) {
    const { createDefaultCollectionSchema } = await import("./default-collection-schema.js");
    const schema = createDefaultCollectionSchema(DEFAULT_WORKFLOW_ID);
    await fs.writeFile(schemaPath, JSON.stringify(schema, null, 2), "utf-8");
  }
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
 * Workflow path helpers
 */
export function getWorkflowDirPath(workflowId: string, cwd: string = process.cwd()): string {
  const p = getWorkspacePaths(cwd);
  return path.join(p.workflowsDir, workflowId);
}

/**
 * Path to `workflow.json` for a workflow.
 */
export function getWorkflowRecordPath(workflowId: string, cwd: string = process.cwd()): string {
  return path.join(getWorkflowDirPath(workflowId, cwd), WORKFLOW_JSON);
}

/**
 * Path to versions directory for a workflow.
 */
export function getWorkflowVersionsDirPath(workflowId: string, cwd: string = process.cwd()): string {
  return path.join(getWorkflowDirPath(workflowId, cwd), WORKFLOW_VERSIONS_DIR);
}

/**
 * Path to a workflow version record file.
 */
export function getWorkflowVersionRecordPath(
  workflowId: string,
  versionId: string,
  cwd: string = process.cwd()
): string {
  return path.join(getWorkflowVersionsDirPath(workflowId, cwd), `${versionId}.json`);
}

/**
 * Path to workflow collections directory.
 */
export function getWorkflowCollectionsDirPath(workflowId: string, cwd: string = process.cwd()): string {
  return path.join(getWorkflowDirPath(workflowId, cwd), WORKFLOW_COLLECTIONS_DIR);
}

/**
 * Path to workflow collections schema file.
 */
export function getWorkflowCollectionSchemaPath(workflowId: string, cwd: string = process.cwd()): string {
  return path.join(getWorkflowCollectionsDirPath(workflowId, cwd), WORKFLOW_COLLECTION_SCHEMA_JSON);
}

/**
 * Read workflow index (workflows/index.json).
 */
export async function readWorkflowIndex(cwd: string = process.cwd()): Promise<WorkflowIndexRecord> {
  const p = await requireWorkspace(cwd);
  const raw = await fs.readFile(p.workflowsIndexPath, "utf-8");
  return JSON.parse(raw) as WorkflowIndexRecord;
}

/**
 * Write workflow index.
 */
export async function writeWorkflowIndex(index: WorkflowIndexRecord, cwd: string = process.cwd()): Promise<void> {
  const p = await requireWorkspace(cwd);
  await fs.writeFile(p.workflowsIndexPath, JSON.stringify(index, null, 2), "utf-8");
}

export async function listWorkflows(cwd: string = process.cwd()): Promise<WorkflowRecordSummary[]> {
  const index = await readWorkflowIndex(cwd);
  return index.workflows ?? [];
}

export async function readWorkflowRecord(workflowId: string, cwd: string = process.cwd()): Promise<WorkflowRecord> {
  await requireWorkspace(cwd);
  const filePath = getWorkflowRecordPath(workflowId, cwd);
  const raw = await fs.readFile(filePath, "utf-8");
  return JSON.parse(raw) as WorkflowRecord;
}

export async function writeWorkflowRecord(workflow: WorkflowRecord, cwd: string = process.cwd()): Promise<void> {
  await requireWorkspace(cwd);
  const wfDir = getWorkflowDirPath(workflow.workflow_id, cwd);
  await fs.mkdir(wfDir, { recursive: true });
  const filePath = getWorkflowRecordPath(workflow.workflow_id, cwd);
  await fs.writeFile(filePath, JSON.stringify(workflow, null, 2), "utf-8");
}

export async function listWorkflowVersionIds(
  workflowId: string,
  cwd: string = process.cwd()
): Promise<string[]> {
  await requireWorkspace(cwd);
  const dir = getWorkflowVersionsDirPath(workflowId, cwd);
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".json"))
    .map((e) => e.name.replace(/\.json$/, ""))
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true, sensitivity: "base" }));
}

export async function readWorkflowVersionRecord(
  workflowId: string,
  versionId: string,
  cwd: string = process.cwd()
): Promise<WorkflowVersionRecord> {
  await requireWorkspace(cwd);
  const filePath = getWorkflowVersionRecordPath(workflowId, versionId, cwd);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as WorkflowVersionRecord;
  } catch {
    throw new Error(`Workflow version "${workflowId}/${versionId}" not found at ${filePath}`);
  }
}

export async function writeWorkflowVersionRecord(
  workflow: WorkflowVersionRecord,
  cwd: string = process.cwd()
): Promise<void> {
  await requireWorkspace(cwd);
  const dir = getWorkflowVersionsDirPath(workflow.workflow_id, cwd);
  await fs.mkdir(dir, { recursive: true });
  const filePath = getWorkflowVersionRecordPath(workflow.workflow_id, workflow.version_id, cwd);
  await fs.writeFile(filePath, JSON.stringify(workflow, null, 2), "utf-8");
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

function generateItemId(prefix: string): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${ts}_${rand}`;
}

// --- Collection schema and storage ---

export function getRunCollectionsDir(runId: string, cwd: string = process.cwd()): string {
  const p = getWorkspacePaths(cwd);
  return path.join(p.collectionsDir, runId);
}

export function getCollectionStorePath(runId: string, kind: string, cwd: string = process.cwd()): string {
  const dir = getRunCollectionsDir(runId, cwd);
  const safeKind = kind.replace(/[^a-z0-9_-]/gi, "_");
  return path.join(dir, `${safeKind}.json`);
}

export async function readCollectionSchema(
  workflowId: string,
  cwd: string = process.cwd()
): Promise<CollectionSchemaConfig> {
  await requireWorkspace(cwd);
  const schemaPath = getWorkflowCollectionSchemaPath(workflowId, cwd);
  try {
    const raw = await fs.readFile(schemaPath, "utf-8");
    return JSON.parse(raw) as CollectionSchemaConfig;
  } catch {
    const { createDefaultCollectionSchema } = await import("./default-collection-schema.js");
    const schema = createDefaultCollectionSchema(workflowId);
    await fs.mkdir(path.dirname(schemaPath), { recursive: true });
    await fs.writeFile(schemaPath, JSON.stringify(schema, null, 2), "utf-8");
    return schema;
  }
}

export async function writeCollectionSchema(
  workflowId: string,
  schema: CollectionSchemaConfig,
  cwd: string = process.cwd()
): Promise<void> {
  await requireWorkspace(cwd);
  if (schema.workflow_id !== workflowId) {
    throw new Error(`Collection schema workflow_id must match: expected "${workflowId}", got "${schema.workflow_id}"`);
  }
  const schemaPath = getWorkflowCollectionSchemaPath(workflowId, cwd);
  await fs.mkdir(path.dirname(schemaPath), { recursive: true });
  await fs.writeFile(schemaPath, JSON.stringify(schema, null, 2), "utf-8");
}

export async function listCollectionKindsForRun(runId: string, cwd: string = process.cwd()): Promise<string[]> {
  await requireWorkspace(cwd);
  if (!(await runExists(runId, cwd))) {
    throw new Error(`Run "${runId}" not found.`);
  }
  const kinds = new Set<string>();
  const dir = getRunCollectionsDir(runId, cwd);
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith(".json")) {
        kinds.add(e.name.replace(/\.json$/, ""));
      }
    }
  } catch {
    // dir may not exist
  }
  return Array.from(kinds);
}

export async function readCollections(
  runId: string,
  kind: string,
  cwd: string = process.cwd()
): Promise<CollectionStore> {
  await requireWorkspace(cwd);
  if (!(await runExists(runId, cwd))) {
    throw new Error(`Run "${runId}" not found.`);
  }
  const run = await readRunFile(runId, cwd);
  const filePath = getCollectionStorePath(runId, kind, cwd);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as CollectionStore;
  } catch {
    return {
      run_id: runId,
      workflow_id: run.workflow_id,
      workflow_version_id: run.workflow_version_id,
      kind,
      updated_at: new Date().toISOString(),
      items: [],
    };
  }
}

export async function writeCollections(
  runId: string,
  kind: string,
  payloads: Array<Record<string, unknown>>,
  options: { created_by_node_id: string; created_by_node_result_id: string },
  cwd: string = process.cwd()
): Promise<void> {
  await requireWorkspace(cwd);
  if (!(await runExists(runId, cwd))) {
    throw new Error(`Run "${runId}" not found.`);
  }
  const run = await readRunFile(runId, cwd);
  const collectionSchema = await readCollectionSchema(run.workflow_id, cwd);
  validateCollectionItemsPayload(collectionSchema, kind, payloads);

  const now = new Date().toISOString();
  const prefix = kind.slice(0, 3) || "col";
  const items: CollectionItem[] = payloads.map((p) => {
    const reserved = stripReservedCollectionKeys(p);
    const idFromPayload = typeof p.id === "string" && p.id ? p.id : undefined;
    const item: CollectionItem = {
      ...reserved,
      id: idFromPayload ?? generateItemId(prefix),
      created_at: now,
      run_id: runId,
      created_by_node_id: options.created_by_node_id,
      created_by_node_result_id: options.created_by_node_result_id,
    };
    return item;
  });

  const dir = getRunCollectionsDir(runId, cwd);
  await fs.mkdir(dir, { recursive: true });
  const store: CollectionStore = {
    run_id: runId,
    workflow_id: run.workflow_id,
    workflow_version_id: run.workflow_version_id,
    kind,
    updated_at: new Date().toISOString(),
    items,
  };
  const filePath = getCollectionStorePath(runId, kind, cwd);
  await fs.writeFile(filePath, JSON.stringify(store, null, 2), "utf-8");
}

export async function appendCollection(
  runId: string,
  kind: string,
  payload: Record<string, unknown>,
  options: { id?: string; created_by_node_id: string; created_by_node_result_id: string },
  cwd: string = process.cwd()
): Promise<CollectionItem> {
  await requireWorkspace(cwd);
  if (!(await runExists(runId, cwd))) {
    throw new Error(`Run "${runId}" not found.`);
  }
  const run = await readRunFile(runId, cwd);
  const collectionSchema = await readCollectionSchema(run.workflow_id, cwd);
  validateCollectionItemPayload(collectionSchema, kind, payload);
  const existing = await readCollections(runId, kind, cwd);
  const now = new Date().toISOString();
  const prefix = kind.slice(0, 3) || "col";
  const item: CollectionItem = {
    ...stripReservedCollectionKeys(payload),
    id: options.id ?? (typeof payload.id === "string" && payload.id ? payload.id : generateItemId(prefix)),
    created_at: now,
    run_id: runId,
    created_by_node_id: options.created_by_node_id,
    created_by_node_result_id: options.created_by_node_result_id,
  };
  existing.items.push(item);
  existing.updated_at = now;
  existing.workflow_id = run.workflow_id;
  existing.workflow_version_id = run.workflow_version_id;
  const dir = getRunCollectionsDir(runId, cwd);
  await fs.mkdir(dir, { recursive: true });
  const filePath = getCollectionStorePath(runId, kind, cwd);
  await fs.writeFile(filePath, JSON.stringify(existing, null, 2), "utf-8");
  return item;
}

function stripReservedCollectionKeys(payload: Record<string, unknown>): Record<string, unknown> {
  const reserved = new Set([
    "id",
    "created_at",
    "run_id",
    "created_by_node_id",
    "created_by_node_result_id",
  ]);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (reserved.has(k)) continue;
    out[k] = v;
  }
  return out;
}

// --- Node results (per-run, per-node) ---

export function getRunNodeResultsDir(runId: string, cwd: string = process.cwd()): string {
  const p = getWorkspacePaths(cwd);
  return path.join(p.nodeResultsDir, runId);
}

export function getNodeResultPath(runId: string, nodeId: string, cwd: string = process.cwd()): string {
  const dir = getRunNodeResultsDir(runId, cwd);
  const safeNode = nodeId.replace(/[^a-z0-9_-]/gi, "_");
  return path.join(dir, `${safeNode}.json`);
}

export async function listNodeResults(runId: string, cwd: string = process.cwd()): Promise<NodeResultRecord[]> {
  await requireWorkspace(cwd);
  const dir = getRunNodeResultsDir(runId, cwd);
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const results: NodeResultRecord[] = [];
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith(".json")) continue;
    const raw = await fs.readFile(path.join(dir, e.name), "utf-8").catch(() => "");
    if (!raw) continue;
    try {
      results.push(JSON.parse(raw) as NodeResultRecord);
    } catch {
      // skip
    }
  }
  results.sort((a, b) => (b.started_at ?? "").localeCompare(a.started_at ?? ""));
  return results;
}

export async function readNodeResult(
  runId: string,
  nodeId: string,
  cwd: string = process.cwd()
): Promise<NodeResultRecord | null> {
  await requireWorkspace(cwd);
  const filePath = getNodeResultPath(runId, nodeId, cwd);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as NodeResultRecord;
  } catch {
    return null;
  }
}

export async function writeNodeResult(
  runId: string,
  nodeId: string,
  result: NodeResultRecord,
  cwd: string = process.cwd()
): Promise<void> {
  await requireWorkspace(cwd);
  if (result.run_id !== runId) {
    throw new Error(`NodeResult.run_id must match: expected "${runId}", got "${result.run_id}"`);
  }
  if (result.node_id !== nodeId) {
    throw new Error(`NodeResult.node_id must match: expected "${nodeId}", got "${result.node_id}"`);
  }
  const dir = getRunNodeResultsDir(runId, cwd);
  await fs.mkdir(dir, { recursive: true });
  const filePath = getNodeResultPath(runId, nodeId, cwd);
  await fs.writeFile(filePath, JSON.stringify(result, null, 2), "utf-8");
}
