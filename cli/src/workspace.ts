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
  createMinimalWorkflowIndex,
  DEFAULT_WORKFLOW_ID,
} from "./default-workflow.js";
import { localStoreExists, LocalStore, initLocalStore } from "./local-store/index.js";
import { validateCollectionItemPayload } from "./validate-collection.js";

export const WORKSPACE_DIR = ".cognetivy";
export const WORKFLOWS_DIR = "workflows";
export const WORKFLOWS_INDEX_JSON = "index.json";
export const WORKFLOW_JSON = "workflow.json";
export const WORKFLOW_VERSIONS_DIR = "versions";
export const WORKFLOW_VERSION_IDS_JSON = "version_ids.json";
export const WORKFLOW_COLLECTIONS_DIR = "collections";
export const WORKFLOW_COLLECTION_SCHEMA_JSON = "schema.json";
export const RUNS_DIR = "runs";
export const EVENTS_DIR = "events";
export const COLLECTIONS_DIR = "collections";
export const NODE_RESULTS_DIR = "node-results";


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
 * Check if workspace exists (.cognetivy/cognetivy.db).
 */
export async function workspaceExists(cwd: string = process.cwd()): Promise<boolean> {
  return localStoreExists(cwd);
}

/**
 * Create full workspace (SQLite DB + default workflow). Idempotent.
 */
export async function ensureWorkspace(
  cwd: string = process.cwd(),
  options: { force?: boolean; noGitignore?: boolean } = {}
): Promise<WorkspacePaths> {
  const p = getWorkspacePaths(cwd);
  await fs.mkdir(p.root, { recursive: true });
  const existed = await localStoreExists(cwd);
  await initLocalStore(cwd);
  const store = new LocalStore(cwd);
  try {
    if (!existed || options.force) {
      const now = new Date().toISOString();
      store.writeWorkflowIndex(createDefaultWorkflowIndex());
      store.writeWorkflowRecord(createDefaultWorkflowRecord(now));
      store.writeWorkflowVersionRecord(createDefaultWorkflowVersionRecord(now));
      const { createDefaultCollectionSchema } = await import("./default-collection-schema.js");
      store.writeCollectionSchema(DEFAULT_WORKFLOW_ID, createDefaultCollectionSchema(DEFAULT_WORKFLOW_ID));
    }
  } finally {
    store.close();
  }
  return p;
}

/**
 * Create minimal workspace (SQLite DB, no default workflow). Idempotent.
 */
export async function ensureMinimalWorkspace(
  cwd: string = process.cwd(),
  _options: { noGitignore?: boolean } = {}
): Promise<WorkspacePaths> {
  const p = getWorkspacePaths(cwd);
  await fs.mkdir(p.root, { recursive: true });
  const existed = await localStoreExists(cwd);
  await initLocalStore(cwd);
  if (!existed) {
    const store = new LocalStore(cwd);
    try {
      store.writeWorkflowIndex(createMinimalWorkflowIndex());
    } finally {
      store.close();
    }
  }
  return p;
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
 * True if workspace exists but default workflow (wf_default) is not present (cloud-only minimal workspace).
 */
export async function isWorkspaceMinimal(cwd: string = process.cwd()): Promise<boolean> {
  if (!(await workspaceExists(cwd))) return false;
  const store = new LocalStore(cwd);
  try {
    const index = store.readWorkflowIndex();
    return !index.workflows.some((w) => w.workflow_id === DEFAULT_WORKFLOW_ID);
  } finally {
    store.close();
  }
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

export function getWorkflowVersionIdsManifestPath(workflowId: string, cwd: string = process.cwd()): string {
  return path.join(getWorkflowVersionsDirPath(workflowId, cwd), WORKFLOW_VERSION_IDS_JSON);
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
 * Read workflow index. Throws if workspace missing.
 */
export async function readWorkflowIndex(cwd: string = process.cwd()): Promise<WorkflowIndexRecord> {
  await requireWorkspace(cwd);
  const store = new LocalStore(cwd);
  try {
    return store.readWorkflowIndex();
  } finally {
    store.close();
  }
}

/**
 * Read workflow index if workspace exists; otherwise null.
 */
export async function readWorkflowIndexOptional(cwd: string = process.cwd()): Promise<WorkflowIndexRecord | null> {
  if (!(await workspaceExists(cwd))) return null;
  const store = new LocalStore(cwd);
  try {
    return store.readWorkflowIndex();
  } finally {
    store.close();
  }
}

/**
 * Write workflow index.
 */
export async function writeWorkflowIndex(index: WorkflowIndexRecord, cwd: string = process.cwd()): Promise<void> {
  await requireWorkspace(cwd);
  const store = new LocalStore(cwd);
  try {
    store.writeWorkflowIndex(index);
  } finally {
    store.close();
  }
}

export async function listWorkflows(cwd: string = process.cwd()): Promise<WorkflowRecordSummary[]> {
  const index = await readWorkflowIndex(cwd);
  return index.workflows ?? [];
}

export async function readWorkflowRecord(workflowId: string, cwd: string = process.cwd()): Promise<WorkflowRecord> {
  await requireWorkspace(cwd);
  const store = new LocalStore(cwd);
  try {
    return store.readWorkflowRecord(workflowId);
  } finally {
    store.close();
  }
}

export async function writeWorkflowRecord(workflow: WorkflowRecord, cwd: string = process.cwd()): Promise<void> {
  await requireWorkspace(cwd);
  const store = new LocalStore(cwd);
  try {
    store.writeWorkflowRecord(workflow);
  } finally {
    store.close();
  }
}

export async function listWorkflowVersionIds(
  workflowId: string,
  cwd: string = process.cwd()
): Promise<string[]> {
  await requireWorkspace(cwd);
  const store = new LocalStore(cwd);
  try {
    return store.listWorkflowVersionIds(workflowId);
  } finally {
    store.close();
  }
}

export async function readWorkflowVersionRecord(
  workflowId: string,
  versionId: string,
  cwd: string = process.cwd()
): Promise<WorkflowVersionRecord> {
  await requireWorkspace(cwd);
  const store = new LocalStore(cwd);
  try {
    return store.readWorkflowVersionRecord(workflowId, versionId);
  } finally {
    store.close();
  }
}

export async function writeWorkflowVersionRecord(
  workflow: WorkflowVersionRecord,
  cwd: string = process.cwd()
): Promise<void> {
  await requireWorkspace(cwd);
  const store = new LocalStore(cwd);
  try {
    store.writeWorkflowVersionRecord(workflow);
  } finally {
    store.close();
  }
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
  const store = new LocalStore(cwd);
  try {
    return store.runExists(runId);
  } finally {
    store.close();
  }
}

export async function writeRunFile(
  record: RunRecord,
  cwd: string = process.cwd()
): Promise<void> {
  await requireWorkspace(cwd);
  const store = new LocalStore(cwd);
  try {
    store.writeRunFile(record);
  } finally {
    store.close();
  }
}

export async function readRunFile(
  runId: string,
  cwd: string = process.cwd()
): Promise<RunRecord> {
  await requireWorkspace(cwd);
  const store = new LocalStore(cwd);
  try {
    return store.readRunFile(runId);
  } finally {
    store.close();
  }
}

export async function updateRunFile(
  runId: string,
  updates: Partial<RunRecord>,
  cwd: string = process.cwd()
): Promise<void> {
  await requireWorkspace(cwd);
  const store = new LocalStore(cwd);
  try {
    store.updateRunFile(runId, updates);
  } finally {
    store.close();
  }
}

/** List all runs (newest first). */
export async function listRuns(cwd: string = process.cwd()): Promise<RunRecord[]> {
  await requireWorkspace(cwd);
  const store = new LocalStore(cwd);
  try {
    return store.listRuns();
  } finally {
    store.close();
  }
}

/** Read all events for a run in order. */
export async function readRunEvents(runId: string, cwd: string = process.cwd()): Promise<EventPayload[]> {
  await requireWorkspace(cwd);
  const store = new LocalStore(cwd);
  try {
    return store.readRunEvents(runId);
  } finally {
    store.close();
  }
}

/** Append a single event line to the run's events. */
export async function appendEventLine(
  runId: string,
  event: EventPayload,
  cwd: string = process.cwd()
): Promise<void> {
  await requireWorkspace(cwd);
  const store = new LocalStore(cwd);
  try {
    store.appendEventLine(runId, event);
  } finally {
    store.close();
  }
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
  const store = new LocalStore(cwd);
  try {
    return store.readCollectionSchema(workflowId);
  } finally {
    store.close();
  }
}

/**
 * Validate run input against the workflow's run_input schema. Call before creating a run;
 * throws if input is invalid so no run is created on validation failure.
 */
export async function validateRunInput(
  workflowId: string,
  input: Record<string, unknown>,
  cwd: string = process.cwd()
): Promise<void> {
  const schema = await readCollectionSchema(workflowId, cwd);
  const payload = typeof input.name === "string" && input.name !== "" ? input : { name: "Run input", ...input };
  const runInputSchema = schema.kinds["run_input"]?.item_schema ?? { type: "object", required: ["name"], properties: { name: { type: "string" } } };
  validateCollectionItemPayload(payload, runInputSchema, "run_input");
}

export async function writeCollectionSchema(
  workflowId: string,
  schema: CollectionSchemaConfig,
  cwd: string = process.cwd()
): Promise<void> {
  await requireWorkspace(cwd);
  const store = new LocalStore(cwd);
  try {
    store.writeCollectionSchema(workflowId, schema);
  } finally {
    store.close();
  }
}

export async function listCollectionKindsForRun(runId: string, cwd: string = process.cwd()): Promise<string[]> {
  await requireWorkspace(cwd);
  const store = new LocalStore(cwd);
  try {
    return store.listCollectionKindsForRun(runId);
  } finally {
    store.close();
  }
}

export async function readCollections(
  runId: string,
  kind: string,
  cwd: string = process.cwd()
): Promise<CollectionStore> {
  await requireWorkspace(cwd);
  const store = new LocalStore(cwd);
  try {
    return store.readCollections(runId, kind);
  } finally {
    store.close();
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
  const store = new LocalStore(cwd);
  try {
    store.writeCollections(runId, kind, payloads, options);
  } finally {
    store.close();
  }
}

export async function appendCollection(
  runId: string,
  kind: string,
  payload: Record<string, unknown>,
  options: { id?: string; created_by_node_id: string; created_by_node_result_id: string },
  cwd: string = process.cwd()
): Promise<CollectionItem> {
  await requireWorkspace(cwd);
  const store = new LocalStore(cwd);
  try {
    return store.appendCollection(runId, kind, payload, options);
  } finally {
    store.close();
  }
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
  const store = new LocalStore(cwd);
  try {
    return store.listNodeResults(runId);
  } finally {
    store.close();
  }
}

export async function readNodeResult(
  runId: string,
  nodeId: string,
  cwd: string = process.cwd()
): Promise<NodeResultRecord | null> {
  await requireWorkspace(cwd);
  const store = new LocalStore(cwd);
  try {
    return store.readNodeResult(runId, nodeId);
  } finally {
    store.close();
  }
}

export async function writeNodeResult(
  runId: string,
  nodeId: string,
  result: NodeResultRecord,
  cwd: string = process.cwd()
): Promise<void> {
  await requireWorkspace(cwd);
  const store = new LocalStore(cwd);
  try {
    store.writeNodeResult(runId, nodeId, result);
  } finally {
    store.close();
  }
}
