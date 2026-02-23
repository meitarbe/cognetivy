import path from "node:path";
import fs from "node:fs/promises";
import type {
  WorkflowPointer,
  WorkflowVersion,
  RunRecord,
  EventPayload,
  CollectionSchemaConfig,
  CollectionItem,
  CollectionStore,
  GlobalEntityStore,
} from "./models.js";
import {
  createDefaultPointer,
  createDefaultWorkflowVersion,
  DEFAULT_WORKFLOW_ID,
} from "./default-workflow.js";
import { validateCollectionItem, validateCollectionItems } from "./validate-collection.js";

export const WORKSPACE_DIR = ".cognetivy";
export const WORKFLOW_JSON = "workflow.json";
export const WORKFLOW_VERSIONS_DIR = "workflow.versions";
export const RUNS_DIR = "runs";
export const EVENTS_DIR = "events";
export const COLLECTIONS_DIR = "collections";
export const COLLECTION_SCHEMA_JSON = "collection-schema.json";
export const DATA_DIR = "data";

const GITIGNORE_SNIPPET = `
# cognetivy — ignore runtime data; commit workflow.versions/
.cognetivy/runs/
.cognetivy/events/
.cognetivy/collections/
.cognetivy/data/
`.trim();

export interface WorkspacePaths {
  root: string;
  workflowJson: string;
  workflowVersionsDir: string;
  runsDir: string;
  eventsDir: string;
  collectionsDir: string;
  collectionSchemaPath: string;
  dataDir: string;
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
    collectionsDir: path.join(root, COLLECTIONS_DIR),
    collectionSchemaPath: path.join(root, COLLECTION_SCHEMA_JSON),
    dataDir: path.join(root, DATA_DIR),
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

  const legacySchemaPath = path.join(p.root, "artifact-schema.json");
  const legacyArtifactsPath = path.join(p.root, "artifacts");
  const collectionsPath = path.join(p.root, COLLECTIONS_DIR);
  if (await fileExists(legacySchemaPath) && !(await fileExists(p.collectionSchemaPath))) {
    const raw = await fs.readFile(legacySchemaPath, "utf-8");
    await fs.writeFile(p.collectionSchemaPath, raw, "utf-8");
  }
  if (await dirExists(legacyArtifactsPath) && !(await dirExists(collectionsPath))) {
    await copyDirRecursive(legacyArtifactsPath, collectionsPath);
  }
  await fs.mkdir(p.collectionsDir, { recursive: true });

  if (!(await fileExists(p.collectionSchemaPath)) || options.force) {
    const { DEFAULT_COLLECTION_SCHEMA } = await import("./default-collection-schema.js");
    await fs.writeFile(p.collectionSchemaPath, JSON.stringify(DEFAULT_COLLECTION_SCHEMA, null, 2), "utf-8");
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

async function dirExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function copyDirRecursive(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const e of entries) {
    const srcPath = path.join(src, e.name);
    const destPath = path.join(dest, e.name);
    if (e.isDirectory()) {
      await copyDirRecursive(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
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

// --- Global entity store (for kinds with global: true in schema) ---

function generateItemId(prefix: string): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${ts}_${rand}`;
}

function getGlobalEntityPath(kind: string, cwd: string = process.cwd()): string {
  const p = getWorkspacePaths(cwd);
  const safeKind = kind.replace(/[^a-z0-9_-]/gi, "_");
  return path.join(p.dataDir, `${safeKind}.json`);
}

function isGlobalKind(schema: CollectionSchemaConfig, kind: string): boolean {
  return schema.kinds[kind]?.global === true;
}

export async function readGlobalEntityStore(kind: string, cwd: string = process.cwd()): Promise<GlobalEntityStore> {
  await requireWorkspace(cwd);
  const filePath = getGlobalEntityPath(kind, cwd);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as GlobalEntityStore;
  } catch {
    return { kind, items: [], updated_at: new Date().toISOString() };
  }
}

export async function listGlobalEntities(
  kind: string,
  options: { run_id?: string } = {},
  cwd: string = process.cwd()
): Promise<CollectionItem[]> {
  const store = await readGlobalEntityStore(kind, cwd);
  let items = store.items;
  if (options.run_id) {
    items = items.filter((i) => (i.run_id as string) === options.run_id);
  }
  return items;
}

async function setGlobalEntitiesForRun(
  runId: string,
  kind: string,
  items: CollectionItem[],
  cwd: string = process.cwd()
): Promise<void> {
  const schema = await readCollectionSchema(cwd);
  validateCollectionItems(schema, kind, items);
  const store = await readGlobalEntityStore(kind, cwd);
  store.items = store.items.filter((i) => (i.run_id as string) !== runId);
  const now = new Date().toISOString();
  const prefix = kind.slice(0, 3);
  for (const { id, created_at, ...payload } of items) {
    store.items.push({
      ...payload,
      id: (id as string) ?? generateItemId(prefix),
      created_at: created_at ?? now,
      run_id: runId,
    });
  }
  store.updated_at = now;
  await fs.mkdir(path.dirname(getGlobalEntityPath(kind, cwd)), { recursive: true });
  await fs.writeFile(getGlobalEntityPath(kind, cwd), JSON.stringify(store, null, 2), "utf-8");
}

async function appendToGlobalStore(
  runId: string,
  kind: string,
  payload: Record<string, unknown>,
  options: { id?: string },
  cwd: string = process.cwd()
): Promise<CollectionItem> {
  const schema = await readCollectionSchema(cwd);
  validateCollectionItem(schema, kind, payload);
  const store = await readGlobalEntityStore(kind, cwd);
  const now = new Date().toISOString();
  const prefix = kind.slice(0, 3);
  const item: CollectionItem = {
    ...payload,
    id: (options.id as string) ?? generateItemId(prefix),
    created_at: now,
    run_id: runId,
  };
  store.items.push(item);
  store.updated_at = now;
  await fs.mkdir(path.dirname(getGlobalEntityPath(kind, cwd)), { recursive: true });
  await fs.writeFile(getGlobalEntityPath(kind, cwd), JSON.stringify(store, null, 2), "utf-8");
  return item;
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

export async function readCollectionSchema(cwd: string = process.cwd()): Promise<CollectionSchemaConfig> {
  const p = await requireWorkspace(cwd);
  try {
    const raw = await fs.readFile(p.collectionSchemaPath, "utf-8");
    return JSON.parse(raw) as CollectionSchemaConfig;
  } catch {
    const { DEFAULT_COLLECTION_SCHEMA } = await import("./default-collection-schema.js");
    await fs.writeFile(p.collectionSchemaPath, JSON.stringify(DEFAULT_COLLECTION_SCHEMA, null, 2), "utf-8");
    return DEFAULT_COLLECTION_SCHEMA;
  }
}

export async function writeCollectionSchema(
  schema: CollectionSchemaConfig,
  cwd: string = process.cwd()
): Promise<void> {
  const p = await requireWorkspace(cwd);
  await fs.writeFile(p.collectionSchemaPath, JSON.stringify(schema, null, 2), "utf-8");
}

export async function listCollectionKindsForRun(runId: string, cwd: string = process.cwd()): Promise<string[]> {
  await requireWorkspace(cwd);
  if (!(await runExists(runId, cwd))) {
    throw new Error(`Run "${runId}" not found.`);
  }
  const kinds = new Set<string>();
  const schema = await readCollectionSchema(cwd);
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
  for (const kind of Object.keys(schema.kinds)) {
    if (schema.kinds[kind].global) {
      const items = await listGlobalEntities(kind, { run_id: runId }, cwd);
      if (items.length > 0) kinds.add(kind);
    }
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
  const schema = await readCollectionSchema(cwd);
  if (isGlobalKind(schema, kind)) {
    const items = await listGlobalEntities(kind, { run_id: runId }, cwd);
    const store = await readGlobalEntityStore(kind, cwd);
    return {
      run_id: runId,
      kind,
      updated_at: store.updated_at,
      items,
    };
  }
  const filePath = getCollectionStorePath(runId, kind, cwd);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as CollectionStore;
  } catch {
    return {
      run_id: runId,
      kind,
      updated_at: new Date().toISOString(),
      items: [],
    };
  }
}

export async function writeCollections(
  runId: string,
  kind: string,
  items: CollectionItem[],
  cwd: string = process.cwd()
): Promise<void> {
  await requireWorkspace(cwd);
  if (!(await runExists(runId, cwd))) {
    throw new Error(`Run "${runId}" not found.`);
  }
  const collectionSchema = await readCollectionSchema(cwd);
  if (isGlobalKind(collectionSchema, kind)) {
    await setGlobalEntitiesForRun(runId, kind, items, cwd);
    return;
  }
  validateCollectionItems(collectionSchema, kind, items);
  const dir = getRunCollectionsDir(runId, cwd);
  await fs.mkdir(dir, { recursive: true });
  const store: CollectionStore = {
    run_id: runId,
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
  options: { id?: string } = {},
  cwd: string = process.cwd()
): Promise<CollectionItem> {
  await requireWorkspace(cwd);
  if (!(await runExists(runId, cwd))) {
    throw new Error(`Run "${runId}" not found.`);
  }
  const collectionSchema = await readCollectionSchema(cwd);
  if (isGlobalKind(collectionSchema, kind)) {
    return appendToGlobalStore(runId, kind, payload, { id: options.id }, cwd);
  }
  validateCollectionItem(collectionSchema, kind, payload);
  const existing = await readCollections(runId, kind, cwd);
  const now = new Date().toISOString();
  const item: CollectionItem = {
    ...payload,
    id: options.id ?? `col_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    created_at: now,
  };
  existing.items.push(item);
  existing.updated_at = now;
  const dir = getRunCollectionsDir(runId, cwd);
  await fs.mkdir(dir, { recursive: true });
  const filePath = getCollectionStorePath(runId, kind, cwd);
  await fs.writeFile(filePath, JSON.stringify(existing, null, 2), "utf-8");
  return item;
}
