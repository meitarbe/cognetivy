/**
 * Local SQLite store: same operations as file-based workspace, one DB per workspace.
 */

import path from "node:path";
import { createRequire } from "node:module";
import fs from "node:fs/promises";

const require = createRequire(import.meta.url);
import type {
  WorkflowIndexRecord,
  WorkflowRecordSummary,
  WorkflowRecord,
  WorkflowVersionRecord,
  RunRecord,
  EventPayload,
  EventType,
  CollectionSchemaConfig,
  CollectionItem,
  CollectionStore,
  NodeResultRecord,
} from "../models.js";
import { getCreateTableStatements, LOCAL_DB_FILENAME } from "./schema.js";
import { mergeTraceabilityIntoSchema, mergeNameRequiredIntoSchema } from "../traceability-schema.js";
import { validateCollectionItemPayload, validateCollectionItemsPayload } from "../validate-collection.js";

type DatabaseConstructor = typeof import("better-sqlite3");
let Database: DatabaseConstructor | null = null;

function loadDb(): DatabaseConstructor {
  if (Database) return Database;
  Database = require("better-sqlite3") as DatabaseConstructor;
  return Database;
}

function generateId(prefix: string): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${ts}_${rand}`;
}

const RESERVED_COLLECTION_KEYS = new Set([
  "id",
  "created_at",
  "run_id",
  "created_by_node_id",
  "created_by_node_result_id",
]);

function stripReserved(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (RESERVED_COLLECTION_KEYS.has(k)) continue;
    out[k] = v;
  }
  return out;
}

export function getLocalDbPath(cwd: string): string {
  return path.resolve(cwd, ".cognetivy", LOCAL_DB_FILENAME);
}

export async function localStoreExists(cwd: string): Promise<boolean> {
  const dbPath = getLocalDbPath(cwd);
  try {
    await fs.access(dbPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Initialize a new SQLite DB at the workspace and run migrations.
 */
export async function initLocalStore(cwd: string): Promise<void> {
  const root = path.resolve(cwd, ".cognetivy");
  await fs.mkdir(root, { recursive: true });
  const dbPath = path.join(root, LOCAL_DB_FILENAME);
  const Db = loadDb();
  const db = new Db(dbPath);
  try {
    for (const sql of getCreateTableStatements()) {
      db.exec(sql);
    }
  } finally {
    db.close();
  }
}

export class LocalStore {
  private dbPath: string;
  private db: import("better-sqlite3").Database | null = null;

  constructor(cwd: string) {
    this.dbPath = getLocalDbPath(cwd);
  }

  private getDb(): import("better-sqlite3").Database {
    if (!this.db) {
      const Db = loadDb();
      this.db = new Db(this.dbPath);
      this.db.pragma("journal_mode = WAL");
    }
    return this.db;
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  // --- Workflow index (stored as single row in workflow_index) ---

  readWorkflowIndex(): WorkflowIndexRecord {
    const db = this.getDb();
    const row = db.prepare("SELECT value_json FROM workflow_index WHERE key = ?").get("index") as { value_json: string } | undefined;
    if (!row) {
      return this.buildWorkflowIndexFromTable();
    }
    const index = JSON.parse(row.value_json) as WorkflowIndexRecord;
    const hasWorkflowsInIndex = (index.workflows?.length ?? 0) > 0;
    const hasWorkflowsInTable = (db.prepare("SELECT 1 FROM workflows LIMIT 1").get() != null);
    if (!hasWorkflowsInIndex && hasWorkflowsInTable) {
      return this.buildWorkflowIndexFromTable();
    }
    return index;
  }

  /** Build workflow index from workflows table when workflow_index is missing (e.g. DB had data before index existed). */
  private buildWorkflowIndexFromTable(): WorkflowIndexRecord {
    const db = this.getDb();
    const rows = db.prepare("SELECT id, name, description, selected_version_id FROM workflows ORDER BY created_at ASC").all() as {
      id: string;
      name: string;
      description: string | null;
      selected_version_id: string | null;
    }[];
    const workflows: WorkflowRecordSummary[] = rows.map((r) => ({
      workflow_id: r.id,
      name: r.name,
      description: r.description ?? undefined,
      current_version_id: r.selected_version_id ?? "",
    }));
    return {
      current_workflow_id: workflows[0]?.workflow_id ?? "",
      workflows,
    };
  }

  writeWorkflowIndex(index: WorkflowIndexRecord): void {
    const db = this.getDb();
    db.prepare(
      "INSERT INTO workflow_index (key, value_json) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json"
    ).run("index", JSON.stringify(index));
  }

  listWorkflows(): WorkflowRecordSummary[] {
    return this.readWorkflowIndex().workflows ?? [];
  }

  // --- Workflows / versions ---

  readWorkflowRecord(workflowId: string): WorkflowRecord {
    const db = this.getDb();
    const row = db.prepare("SELECT * FROM workflows WHERE id = ?").get(workflowId) as {
      id: string;
      name: string;
      description: string | null;
      selected_version_id: string | null;
      created_at: string;
      updated_at: string;
    } | undefined;
    if (!row) throw new Error(`Workflow "${workflowId}" not found.`);
    return {
      workflow_id: row.id,
      name: row.name,
      description: row.description ?? undefined,
      current_version_id: row.selected_version_id ?? "",
      created_at: row.created_at,
    };
  }

  writeWorkflowRecord(workflow: WorkflowRecord): void {
    const db = this.getDb();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO workflows (id, name, description, selected_version_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET
       name = excluded.name, description = excluded.description, selected_version_id = excluded.selected_version_id, updated_at = excluded.updated_at`
    ).run(
      workflow.workflow_id,
      workflow.name,
      workflow.description ?? null,
      workflow.current_version_id || null,
      (workflow as WorkflowRecord & { created_at?: string }).created_at ?? now,
      now
    );
  }

  /** Synthetic PK so each workflow can have its own v1, v2, etc. */
  private workflowVersionRowId(workflowId: string, versionId: string): string {
    return `${workflowId}_v_${versionId}`;
  }

  private logicalVersionId(workflowId: string, rowId: string): string {
    const prefix = workflowId + "_v_";
    return rowId.startsWith(prefix) ? rowId.slice(prefix.length) : rowId;
  }

  listWorkflowVersionIds(workflowId: string): string[] {
    const db = this.getDb();
    const rows = db.prepare("SELECT id FROM workflow_versions WHERE workflow_id = ? ORDER BY version ASC").all(workflowId) as { id: string }[];
    return rows.map((r) => this.logicalVersionId(workflowId, r.id));
  }

  readWorkflowVersionRecord(workflowId: string, versionId: string): WorkflowVersionRecord {
    const db = this.getDb();
    let row = db.prepare("SELECT * FROM workflow_versions WHERE workflow_id = ? AND id = ?").get(workflowId, versionId) as {
      id: string;
      workflow_id: string;
      version: number;
      nodes: string;
      created_at: string;
    } | undefined;
    if (!row) {
      const rowId = this.workflowVersionRowId(workflowId, versionId);
      row = db.prepare("SELECT * FROM workflow_versions WHERE id = ?").get(rowId) as {
      id: string;
      workflow_id: string;
      version: number;
      nodes: string;
      created_at: string;
    } | undefined;
    }
    if (!row) throw new Error(`Workflow version "${workflowId}/${versionId}" not found.`);
    return {
      workflow_id: row.workflow_id,
      version_id: this.logicalVersionId(row.workflow_id, row.id),
      created_at: row.created_at,
      nodes: JSON.parse(row.nodes),
    };
  }

  writeWorkflowVersionRecord(workflow: WorkflowVersionRecord): void {
    const db = this.getDb();
    const now = new Date().toISOString();
    const rowId = this.workflowVersionRowId(workflow.workflow_id, workflow.version_id);
    const existing = db.prepare("SELECT version FROM workflow_versions WHERE id = ?").get(rowId) as { version: number } | undefined;
    const version = existing
      ? existing.version
      : ((db.prepare("SELECT COALESCE(MAX(version), 0) + 1 AS v FROM workflow_versions WHERE workflow_id = ?").get(workflow.workflow_id) as { v: number })?.v ?? 1);
    db.prepare(
      `INSERT INTO workflow_versions (id, workflow_id, version, nodes, created_at)
       VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET nodes = excluded.nodes`
    ).run(rowId, workflow.workflow_id, version, JSON.stringify(workflow.nodes), now);
  }

  // --- Collection schema ---

  readCollectionSchema(workflowId: string): CollectionSchemaConfig {
    const db = this.getDb();
    const rows = db.prepare("SELECT kind, description, item_schema FROM workflow_collection_schemas WHERE workflow_id = ?").all(workflowId) as {
      kind: string;
      description: string | null;
      item_schema: string;
    }[];
    const kinds: Record<string, { name?: string; description: string; item_schema: Record<string, unknown> }> = {};
    for (const r of rows) {
      kinds[r.kind] = {
        description: r.description ?? "",
        item_schema: JSON.parse(r.item_schema) as Record<string, unknown>,
      };
    }
    const schema: CollectionSchemaConfig = { workflow_id: workflowId, kinds };
    const mergedKinds: Record<string, { name?: string; description: string; item_schema: Record<string, unknown> }> = {};
    for (const [k, v] of Object.entries(schema.kinds)) {
      let itemSchema = v.item_schema;
      itemSchema = mergeTraceabilityIntoSchema(itemSchema, k) as Record<string, unknown>;
      itemSchema = mergeNameRequiredIntoSchema(itemSchema) as Record<string, unknown>;
      mergedKinds[k] = { ...v, item_schema: itemSchema };
    }
    return { workflow_id: schema.workflow_id, kinds: mergedKinds };
  }

  writeCollectionSchema(workflowId: string, schema: CollectionSchemaConfig): void {
    if (schema.workflow_id !== workflowId) {
      throw new Error(`Collection schema workflow_id must match: expected "${workflowId}", got "${schema.workflow_id}"`);
    }
    const db = this.getDb();
    const now = new Date().toISOString();
    db.prepare("DELETE FROM workflow_collection_schemas WHERE workflow_id = ?").run(workflowId);
    for (const [kind, kindSchema] of Object.entries(schema.kinds)) {
      const id = generateId("wcs");
      db.prepare(
        `INSERT INTO workflow_collection_schemas (id, workflow_id, kind, description, item_schema, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(id, workflowId, kind, kindSchema.description ?? "", JSON.stringify(kindSchema.item_schema), now, now);
    }
  }

  // --- Runs ---

  runExists(runId: string): boolean {
    const db = this.getDb();
    const row = db.prepare("SELECT 1 FROM runs WHERE id = ?").get(runId);
    return !!row;
  }

  readRunFile(runId: string): RunRecord {
    const db = this.getDb();
    const row = db.prepare("SELECT * FROM runs WHERE id = ?").get(runId) as {
      id: string;
      workflow_id: string;
      workflow_version_id: string;
      name: string | null;
      status: string;
      input: string;
      final_answer: string | null;
      created_at: string;
      updated_at: string;
    } | undefined;
    if (!row) throw new Error(`Run "${runId}" not found. Ensure the run exists (e.g. cognetivy run start).`);
    const workflowVersionId = row.workflow_version_id.startsWith(row.workflow_id + "_v_")
      ? row.workflow_version_id.slice(row.workflow_id.length + 3)
      : row.workflow_version_id;
    return {
      run_id: row.id,
      workflow_id: row.workflow_id,
      workflow_version_id: workflowVersionId,
      name: row.name ?? undefined,
      status: row.status as RunRecord["status"],
      input: JSON.parse(row.input) as Record<string, unknown>,
      created_at: row.created_at,
      final_answer: row.final_answer ?? undefined,
    };
  }

  writeRunFile(record: RunRecord): void {
    const db = this.getDb();
    const now = new Date().toISOString();
    const syntheticVersionId = record.workflow_version_id.startsWith(record.workflow_id + "_v_")
      ? record.workflow_version_id
      : this.workflowVersionRowId(record.workflow_id, record.workflow_version_id);
    db.prepare(
      `INSERT INTO runs (id, workflow_id, workflow_version_id, name, status, input, final_answer, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET
       name = excluded.name, status = excluded.status, input = excluded.input, final_answer = excluded.final_answer, updated_at = excluded.updated_at`
    ).run(
      record.run_id,
      record.workflow_id,
      syntheticVersionId,
      record.name ?? null,
      record.status,
      JSON.stringify(record.input),
      record.final_answer ?? null,
      record.created_at,
      now
    );
  }

  updateRunFile(runId: string, updates: Partial<RunRecord>): void {
    const existing = this.readRunFile(runId);
    const updated = { ...existing, ...updates };
    this.writeRunFile(updated);
  }

  listRuns(): RunRecord[] {
    const db = this.getDb();
    const rows = db.prepare("SELECT * FROM runs ORDER BY created_at DESC").all() as {
      id: string;
      workflow_id: string;
      workflow_version_id: string;
      name: string | null;
      status: string;
      input: string;
      final_answer: string | null;
      created_at: string;
      updated_at: string;
    }[];
    return rows.map((row) => {
      const workflowVersionId = row.workflow_version_id.startsWith(row.workflow_id + "_v_")
        ? row.workflow_version_id.slice(row.workflow_id.length + 3)
        : row.workflow_version_id;
      return {
        run_id: row.id,
        workflow_id: row.workflow_id,
        workflow_version_id: workflowVersionId,
        name: row.name ?? undefined,
        status: row.status as RunRecord["status"],
        input: JSON.parse(row.input) as Record<string, unknown>,
        created_at: row.created_at,
        final_answer: row.final_answer ?? undefined,
      };
    });
  }

  readRunEvents(runId: string): EventPayload[] {
    const db = this.getDb();
    const rows = db.prepare("SELECT ts, type, by, data FROM run_events WHERE run_id = ? ORDER BY ts ASC").all(runId) as {
      ts: string;
      type: string;
      by: string | null;
      data: string;
    }[];
    return rows.map((r) => ({
      ts: r.ts,
      type: r.type as EventType,
      by: r.by ?? "",
      data: (JSON.parse(r.data || "{}") ?? {}) as Record<string, unknown>,
    }));
  }

  appendEventLine(runId: string, event: EventPayload): void {
    const db = this.getDb();
    const id = generateId("evt");
    db.prepare(
      "INSERT INTO run_events (id, run_id, ts, type, by, data) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(id, runId, event.ts, event.type, event.by ?? null, JSON.stringify(event.data ?? {}));
  }

  // --- Collections ---

  listCollectionKindsForRun(runId: string): string[] {
    if (!this.runExists(runId)) throw new Error(`Run "${runId}" not found.`);
    const db = this.getDb();
    const rows = db.prepare("SELECT DISTINCT kind FROM collection_items WHERE run_id = ?").all(runId) as { kind: string }[];
    return rows.map((r) => r.kind);
  }

  readCollections(runId: string, kind: string): CollectionStore {
    const run = this.readRunFile(runId);
    const db = this.getDb();
    const rows = db.prepare("SELECT * FROM collection_items WHERE run_id = ? AND kind = ? ORDER BY created_at ASC").all(runId, kind) as {
      id: string;
      run_id: string;
      kind: string;
      created_at: string;
      created_by_node_id: string;
      created_by_node_result_id: string;
      payload: string;
    }[];
    const items: CollectionItem[] = rows.map((r) => ({
      ...(JSON.parse(r.payload) as Record<string, unknown>),
      id: r.id,
      created_at: r.created_at,
      run_id: r.run_id,
      created_by_node_id: r.created_by_node_id,
      created_by_node_result_id: r.created_by_node_result_id,
    }));
    return {
      run_id: runId,
      workflow_id: run.workflow_id,
      workflow_version_id: run.workflow_version_id,
      kind,
      updated_at: rows.length ? rows[rows.length - 1]!.created_at : new Date().toISOString(),
      items,
    };
  }

  writeCollections(
    runId: string,
    kind: string,
    payloads: Array<Record<string, unknown>>,
    options: { created_by_node_id: string; created_by_node_result_id: string }
  ): void {
    const run = this.readRunFile(runId);
    const collectionSchema = this.readCollectionSchema(run.workflow_id);
    const itemSchema = collectionSchema.kinds[kind]?.item_schema;
    if (!itemSchema) {
      throw new Error(
        `Missing collection schema for kind "${kind}" in this workflow. Add it before writing collections (agent/tool flow):\n` +
          `- MCP: call collection_schema_add_kind or collection_schema_set\n` +
          `- CLI: cognetivy collection-schema set --file <schema.json>\n` +
          `This prevents silent schema mismatches and skipped findings.`
      );
    }
    validateCollectionItemsPayload(payloads, itemSchema, kind);
    const db = this.getDb();
    const now = new Date().toISOString();
    const prefix = kind.slice(0, 3) || "col";
    payloads.forEach((p, index) => {
      let itemId: string;
      if (kind === "run_input") {
        itemId = `${runId}_run_input`;
      } else if (typeof p.id === "string" && p.id) {
        itemId = p.id;
      } else {
        itemId = `${generateId(prefix)}_${index}`;
      }
      const payload = stripReserved(p);
      db.prepare(
        `INSERT INTO collection_items (id, run_id, kind, created_at, created_by_node_id, created_by_node_result_id, payload)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(itemId, runId, kind, now, options.created_by_node_id, options.created_by_node_result_id, JSON.stringify(payload));
    });
  }

  appendCollection(
    runId: string,
    kind: string,
    payload: Record<string, unknown>,
    options: { id?: string; created_by_node_id: string; created_by_node_result_id: string }
  ): CollectionItem {
    const run = this.readRunFile(runId);
    const collectionSchema = this.readCollectionSchema(run.workflow_id);
    const itemSchema = collectionSchema.kinds[kind]?.item_schema;
    if (!itemSchema) {
      throw new Error(
        `Missing collection schema for kind "${kind}" in this workflow. Add it before writing collections (agent/tool flow):\n` +
          `- MCP: call collection_schema_add_kind or collection_schema_set\n` +
          `- CLI: cognetivy collection-schema set --file <schema.json>\n` +
          `This prevents silent schema mismatches and skipped findings.`
      );
    }
    validateCollectionItemPayload(payload, itemSchema, kind);
    const db = this.getDb();
    const now = new Date().toISOString();
    const prefix = kind.slice(0, 3) || "col";
    let itemId = (options.id ?? (typeof payload.id === "string" && payload.id ? payload.id : generateId(prefix))) as string;
    if (kind === "run_input") itemId = `${runId}_run_input`;
    const payloadStr = JSON.stringify(stripReserved(payload));
    db.prepare(
      `INSERT INTO collection_items (id, run_id, kind, created_at, created_by_node_id, created_by_node_result_id, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(itemId, runId, kind, now, options.created_by_node_id, options.created_by_node_result_id, payloadStr);
    return {
      ...(JSON.parse(payloadStr) as Record<string, unknown>),
      id: itemId,
      created_at: now,
      run_id: runId,
      created_by_node_id: options.created_by_node_id,
      created_by_node_result_id: options.created_by_node_result_id,
    } as CollectionItem;
  }

  deleteCollectionItemsByIds(runId: string, itemIds: string[]): void {
    const unique = Array.from(new Set(itemIds.filter((id) => typeof id === "string" && id.trim() !== "")));
    if (unique.length === 0) return;
    const placeholders = unique.map(() => "?").join(",");
    const db = this.getDb();
    db.prepare(
      `DELETE FROM collection_items WHERE run_id = ? AND id IN (${placeholders})`
    ).run(runId, ...unique);
  }

  // --- Node results ---

  listNodeResults(runId: string): NodeResultRecord[] {
    const db = this.getDb();
    const rows = db.prepare("SELECT * FROM node_results WHERE run_id = ? ORDER BY started_at DESC").all(runId) as {
      id: string;
      run_id: string;
      node_id: string;
      status: string;
      started_at: string;
      completed_at: string | null;
      output: string | null;
      writes: string | null;
    }[];
    return rows.map((r) => ({
      node_result_id: r.id,
      run_id: r.run_id,
      workflow_id: "",
      workflow_version_id: "",
      node_id: r.node_id,
      status: r.status as NodeResultRecord["status"],
      started_at: r.started_at,
      completed_at: r.completed_at ?? undefined,
      output: r.output ?? undefined,
      writes: r.writes ? (JSON.parse(r.writes) as NodeResultRecord["writes"]) : undefined,
    }));
  }

  readNodeResult(runId: string, nodeId: string): NodeResultRecord | null {
    const db = this.getDb();
    const row = db.prepare("SELECT * FROM node_results WHERE run_id = ? AND node_id = ?").get(runId, nodeId) as {
      id: string;
      run_id: string;
      node_id: string;
      status: string;
      started_at: string;
      completed_at: string | null;
      output: string | null;
      writes: string | null;
    } | undefined;
    if (!row) return null;
    return {
      node_result_id: row.id,
      run_id: row.run_id,
      workflow_id: "",
      workflow_version_id: "",
      node_id: row.node_id,
      status: row.status as NodeResultRecord["status"],
      started_at: row.started_at,
      completed_at: row.completed_at ?? undefined,
      output: row.output ?? undefined,
      writes: row.writes ? (JSON.parse(row.writes) as NodeResultRecord["writes"]) : undefined,
    };
  }

  writeNodeResult(runId: string, nodeId: string, result: NodeResultRecord): void {
    if (result.run_id !== runId) throw new Error(`NodeResult.run_id must match: expected "${runId}", got "${result.run_id}"`);
    if (result.node_id !== nodeId) throw new Error(`NodeResult.node_id must match: expected "${nodeId}", got "${result.node_id}"`);
    const db = this.getDb();
    db.prepare(
      `INSERT INTO node_results (id, run_id, node_id, status, started_at, completed_at, output, writes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(run_id, node_id) DO UPDATE SET
       status = excluded.status, completed_at = excluded.completed_at, output = excluded.output, writes = excluded.writes`
    ).run(
      result.node_result_id,
      result.run_id,
      result.node_id,
      result.status,
      result.started_at,
      result.completed_at ?? null,
      result.output ?? null,
      result.writes ? JSON.stringify(result.writes) : null
    );
  }
}
