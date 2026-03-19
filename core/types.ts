/**
 * Canonical domain types for cognetivy (shared by backend and CLI).
 * Snake_case for consistency with API and file formats.
 */

export enum WorkflowNodeType {
  Prompt = "PROMPT",
  HumanInTheLoop = "HUMAN_IN_THE_LOOP",
}

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  input_collections: string[];
  output_collections: string[];
  prompt?: string;
  description?: string;
  minimum_rows?: number;
  required_mcps?: string[];
  required_skills?: string[];
}

export interface WorkflowVersionRecord {
  workflow_id: string;
  version_id: string;
  name?: string;
  description?: string;
  created_at: string;
  nodes: WorkflowNode[];
}

/** Canonical next-step actions (used by CLI and mapped to API by backend). */
export type CanonicalNextStepAction =
  | "run_node"
  | "run_nodes_parallel"
  | "complete_node"
  | "complete_run"
  | "done";

export interface CanonicalNextStep {
  action: CanonicalNextStepAction;
  node_id?: string;
  runnable_node_ids?: string[];
  input_collections?: string[];
  input_collections_by_node?: Record<string, string[]>;
  output_collections?: string[];
  collection_kind?: string;
  hint?: string;
  in_progress_node_id?: string;
}

/** Input to storage-agnostic getNextStep(). */
export interface GetNextStepParams {
  nodes: WorkflowNode[];
  completedNodeIds: Set<string>;
  startedNodeIds: Set<string>;
  kindsWithData: Set<string>;
}

/** Result from getNextStep() (canonical). */
export interface GetNextStepResult {
  next_step: CanonicalNextStep;
  current_node_id?: string;
  current_node_ids?: string[];
}

export enum CollectionReferenceCardinality {
  One = "one",
  Many = "many",
}

export interface CollectionFieldReference {
  kind: string;
  cardinality: CollectionReferenceCardinality;
  label?: string;
}

export interface CollectionKindSchema {
  name?: string;
  description: string;
  item_schema: Record<string, unknown>;
  references?: Record<string, CollectionFieldReference>;
}

export interface CollectionSchemaConfig {
  workflow_id: string;
  kinds: Record<string, CollectionKindSchema>;
}
