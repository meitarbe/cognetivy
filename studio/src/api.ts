const API_BASE = "/api";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export interface WorkspaceInfo {
  path: string;
  exists: boolean;
}

export const WORKFLOW_NODE_TYPE = {
  Prompt: "PROMPT",
  HumanInTheLoop: "HUMAN_IN_THE_LOOP",
} as const;

export type WorkflowNodeType = (typeof WORKFLOW_NODE_TYPE)[keyof typeof WORKFLOW_NODE_TYPE];

export interface WorkflowSummary {
  workflow_id: string;
  name: string;
  description?: string;
  current_version_id: string;
}

export interface WorkflowRecord extends WorkflowSummary {
  created_at: string;
}

export interface WorkflowVersion {
  workflow_id: string;
  version_id: string;
  name?: string;
  description?: string;
  created_at: string;
  nodes: WorkflowNode[];
}

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  input_collections: string[];
  output_collections: string[];
  prompt?: string;
  description?: string;
  minimum_rows?: number;
}

export interface VersionListItem {
  version_id: string;
  name?: string;
  created_at?: string;
}

export interface WorkflowNodePrompt {
  prompt?: string;
  description?: string;
  minimum_rows?: number;
}

export interface RunRecord {
  run_id: string;
  name?: string;
  workflow_id: string;
  workflow_version_id: string;
  status: string;
  input: Record<string, unknown>;
  created_at: string;
  final_answer?: string;
}

export interface EventPayload {
  ts: string;
  type: string;
  by?: string;
  data: Record<string, unknown>;
}

export interface CollectionStore {
  run_id: string;
  workflow_id: string;
  workflow_version_id: string;
  kind: string;
  updated_at: string;
  items: CollectionItem[];
}

export interface CollectionItem {
  id: string;
  created_at: string;
  run_id: string;
  created_by_node_id: string;
  created_by_node_result_id: string;
  [key: string]: unknown;
}

/** Traceability: external source or reference to another collection item. */
export interface CitationItemRef {
  kind: string;
  item_id: string;
}

/** One citation: external (url) or internal (item_ref). */
export interface Citation {
  url?: string;
  title?: string;
  excerpt?: string;
  item_ref?: CitationItemRef;
}

/** Chain of thinking: item this was derived from. */
export interface DerivedFrom {
  kind: string;
  item_id: string;
}

/** Keys that are rendered by TraceabilityDisplay, not as generic fields. */
export const TRACEABILITY_KEYS = new Set(["citations", "derived_from", "reasoning"]);

export const COLLECTION_REFERENCE_CARDINALITY = {
  One: "one",
  Many: "many",
} as const;

export type CollectionReferenceCardinality =
  (typeof COLLECTION_REFERENCE_CARDINALITY)[keyof typeof COLLECTION_REFERENCE_CARDINALITY];

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

export const NODE_RESULT_STATUS = {
  Started: "started",
  Completed: "completed",
  Failed: "failed",
  NeedsHuman: "needs_human",
} as const;

export type NodeResultStatus = (typeof NODE_RESULT_STATUS)[keyof typeof NODE_RESULT_STATUS];

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

export const api = {
  getWorkspace: () => get<WorkspaceInfo>("/workspace"),
  getWorkflows: () => get<WorkflowSummary[]>("/workflows"),
  getWorkflow: (workflowId: string) => get<WorkflowRecord>(`/workflows/${encodeURIComponent(workflowId)}`),
  getWorkflowVersions: (workflowId: string) =>
    get<VersionListItem[]>(`/workflows/${encodeURIComponent(workflowId)}/versions`),
  getWorkflowVersion: (workflowId: string, versionId: string, options?: { includePrompts?: boolean }) => {
    const params = new URLSearchParams();
    if (options?.includePrompts === false) params.set("include_prompts", "false");
    const qs = params.toString();
    return get<WorkflowVersion>(
      `/workflows/${encodeURIComponent(workflowId)}/versions/${encodeURIComponent(versionId)}${qs ? `?${qs}` : ""}`
    );
  },
  getWorkflowNodePrompt: (workflowId: string, versionId: string, nodeId: string) =>
    get<WorkflowNodePrompt>(
      `/workflows/${encodeURIComponent(workflowId)}/versions/${encodeURIComponent(versionId)}/nodes/${encodeURIComponent(nodeId)}`
    ),
  getRuns: () => get<RunRecord[]>("/runs"),
  getRun: (id: string) => get<RunRecord>(`/runs/${encodeURIComponent(id)}`),
  getRunEvents: (id: string) => get<EventPayload[]>(`/runs/${encodeURIComponent(id)}/events`),
  getNodeResults: (runId: string) => get<NodeResultRecord[]>(`/runs/${encodeURIComponent(runId)}/node-results`),
  getCollectionSchema: (workflowId: string) =>
    get<CollectionSchemaConfig>(`/workflows/${encodeURIComponent(workflowId)}/collections/schema`),
  getCollectionKinds: (runId: string) => get<string[]>(`/collections/${encodeURIComponent(runId)}`),
  getCollections: (runId: string, kind: string) =>
    get<CollectionStore>(`/collections/${encodeURIComponent(runId)}/${encodeURIComponent(kind)}`),
  getEntityData: (kind: string, options?: { runId?: string; workflowId?: string }) => {
    const params = new URLSearchParams();
    if (options?.runId) params.set("run_id", options.runId);
    if (options?.workflowId) params.set("workflow_id", options.workflowId);
    const qs = params.toString();
    return get<CollectionItem[]>(`/entities/${encodeURIComponent(kind)}${qs ? `?${qs}` : ""}`);
  },
};
