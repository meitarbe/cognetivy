/**
 * Data types for cognetivy workflow, runs, events, and mutations.
 * All timestamps are ISO 8601 strings.
 */

export enum WorkflowNodeType {
  Prompt = "PROMPT",
  HumanInTheLoop = "HUMAN_IN_THE_LOOP",
}

export interface WorkflowIndexRecord {
  current_workflow_id: string;
  workflows: WorkflowRecordSummary[];
}

export interface WorkflowRecordSummary {
  workflow_id: string;
  name: string;
  description?: string;
  current_version_id: string;
}

export interface WorkflowRecord extends WorkflowRecordSummary {
  created_at: string;
}

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  input_collections: string[];
  output_collections: string[];
  /**
   * Prompt/instructions for this node.
   * For Prompt nodes this is the prompt; for HITL nodes this is instructions for the human.
   */
  prompt?: string;
  /** Optional longer description shown in UI. */
  description?: string;
  /**
   * When set, the agent should aim to produce at least this many items for this node's output collection(s).
   * Must be a positive integer if present.
   */
  minimum_rows?: number;
}

export interface WorkflowVersionRecord {
  workflow_id: string;
  version_id: string;
  name?: string;
  description?: string;
  created_at: string;
  nodes: WorkflowNode[];
}

export type RunStatus = "running" | "completed" | "failed";

export interface RunRecord {
  run_id: string;
  /** Human-readable name for the run (e.g. "Q1 ideas exploration"). */
  name?: string;
  workflow_id: string;
  workflow_version_id: string;
  status: RunStatus;
  input: Record<string, unknown>;
  created_at: string;
  /** Final answer or summary for the run (e.g. markdown). */
  final_answer?: string;
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
  from_version_id: string;
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
  applied_to_version_id?: string;
}

/** RFC 6902 JSON Patch operation */
export interface JsonPatchOperation {
  op: "add" | "remove" | "replace" | "move" | "copy" | "test";
  path: string;
  value?: unknown;
  from?: string;
}

// --- Collections (workflow-scoped schemas + per-run item stores) ---

export enum CollectionReferenceCardinality {
  One = "one",
  Many = "many",
}

export interface CollectionFieldReference {
  kind: string;
  cardinality: CollectionReferenceCardinality;
  /** Optional label for UI. */
  label?: string;
}

/**
 * Strict JSON Schema for collection items (validated with Ajv).
 * Stored alongside optional `references` metadata for easy navigation in Studio.
 */
export interface CollectionKindSchema {
  name?: string;
  description: string;
  /** JSON Schema (object) that describes the item payload (excluding system provenance fields). */
  item_schema: Record<string, unknown>;
  /** Field-level references for navigation. Keys are top-level field names in the item. */
  references?: Record<string, CollectionFieldReference>;
}

export interface CollectionSchemaConfig {
  workflow_id: string;
  kinds: Record<string, CollectionKindSchema>;
}

export interface CollectionItemMeta {
  id: string;
  created_at: string;
  run_id: string;
  created_by_node_id: string;
  created_by_node_result_id: string;
}

export type CollectionItem = CollectionItemMeta & Record<string, unknown>;

export interface CollectionStore {
  run_id: string;
  workflow_id: string;
  workflow_version_id: string;
  kind: string;
  updated_at: string;
  items: CollectionItem[];
}

export enum NodeResultStatus {
  Started = "started",
  Completed = "completed",
  Failed = "failed",
  NeedsHuman = "needs_human",
}

export interface NodeResultWrite {
  kind: string;
  item_ids: string[];
}

export interface NodeResultRecord {
  node_result_id: string;
  run_id: string;
  workflow_id: string;
  workflow_version_id: string;
  node_id: string;
  status: NodeResultStatus;
  started_at: string;
  completed_at?: string;
  output?: string;
  writes?: NodeResultWrite[];
}

