/**
 * Data types for cognetivy workflow, runs, events, and mutations.
 * All timestamps are ISO 8601 strings.
 */

export interface WorkflowPointer {
  workflow_id: string;
  current_version: string;
}

export interface NodeContract {
  input: string[];
  output: string[];
}

export interface WorkflowNode {
  id: string;
  type: "TASK";
  contract: NodeContract;
  /** Human-readable description of what this step does. */
  description?: string;
}

export interface WorkflowEdge {
  from: string;
  to: string;
}

export interface WorkflowVersion {
  workflow_id: string;
  version: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export type RunStatus = "running" | "completed" | "failed";

export interface RunRecord {
  run_id: string;
  /** Human-readable name for the run (e.g. "Q1 ideas exploration"). */
  name?: string;
  workflow_id: string;
  workflow_version: string;
  status: RunStatus;
  input: Record<string, unknown>;
  created_at: string;
}

export type EventType =
  | "run_started"
  | "step_started"
  | "artifact"
  | "step_completed"
  | "run_completed";

export interface EventPayload {
  ts: string;
  type: EventType;
  by: string;
  data: Record<string, unknown>;
}

export interface MutationTarget {
  type: "workflow";
  workflow_id: string;
  from_version: string;
}

export type MutationStatus = "proposed" | "applied" | "rejected";

export interface MutationRecord {
  mutation_id: string;
  target: MutationTarget;
  patch: JsonPatchOperation[];
  reason: string;
  status: MutationStatus;
  created_by: string;
  created_at: string;
  applied_to_version?: string;
}

/** RFC 6902 JSON Patch operation */
export interface JsonPatchOperation {
  op: "add" | "remove" | "replace" | "move" | "copy" | "test";
  path: string;
  value?: unknown;
  from?: string;
}

// --- Collections (structured, schema-backed entities per run) ---

/** Schema for one collection kind. Agent-defined; strict type validation. */
export interface CollectionKindSchema {
  description: string;
  required: string[];
  /** When true, store globally across runs; when false, store per-run. */
  global?: boolean;
  properties?: Record<string, { type?: string; description?: string }>;
}

/** Full collection schema. Stored in .cognetivy/collection-schema.json */
export interface CollectionSchemaConfig {
  kinds: Record<string, CollectionKindSchema>;
}

/** One stored collection item (payload plus optional id and timestamp). */
export interface CollectionItem {
  id?: string;
  created_at?: string;
  [key: string]: unknown;
}

/** File format for a run's collections of one kind. */
export interface CollectionStore {
  run_id: string;
  kind: string;
  updated_at: string;
  items: CollectionItem[];
}

/** File format for a global (cross-run) entity store. */
export interface GlobalEntityStore {
  kind: string;
  items: CollectionItem[];
  updated_at: string;
}

