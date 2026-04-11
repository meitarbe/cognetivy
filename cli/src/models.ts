/**
 * Data types for cognetivy workflow, runs, events, and mutations.
 * Workflow/collection schema types from shared core; run/event/mutation types local.
 */

export {
  WorkflowNodeType,
  type WorkflowNode,
  type WorkflowVersionRecord,
  type CollectionKindSchema,
  type CollectionSchemaConfig,
  CollectionReferenceCardinality,
  type CollectionFieldReference,
} from "./core/index.js";

export interface WorkflowIndexRecord {
  current_workflow_id: string;
  cloud_current_workflow_id?: string;
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

export type RunStatus = "running" | "completed" | "failed";

export interface RunRecord {
  run_id: string;
  name?: string;
  workflow_id: string;
  workflow_version_id: string;
  status: RunStatus;
  input: Record<string, unknown>;
  created_at: string;
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

export interface JsonPatchOperation {
  op: "add" | "remove" | "replace" | "move" | "copy" | "test";
  path: string;
  value?: unknown;
  from?: string;
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
