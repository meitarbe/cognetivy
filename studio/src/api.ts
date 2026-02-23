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

export interface WorkflowResponse {
  pointer: { workflow_id: string; current_version: string };
  workflow: WorkflowVersion;
}

export interface WorkflowVersion {
  workflow_id: string;
  version: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface WorkflowNode {
  id: string;
  type: string;
  contract: { input: string[]; output: string[] };
  description?: string;
}

export interface WorkflowEdge {
  from: string;
  to: string;
}

export interface VersionListItem {
  version: string;
  filename: string;
}

export interface RunRecord {
  run_id: string;
  workflow_id: string;
  workflow_version: string;
  status: string;
  input: Record<string, unknown>;
  created_at: string;
}

export interface EventPayload {
  ts: string;
  type: string;
  by?: string;
  data: Record<string, unknown>;
}

export interface ArtifactStore {
  run_id: string;
  kind: string;
  updated_at: string;
  items: ArtifactItem[];
}

export interface ArtifactItem {
  id?: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface ArtifactSchemaConfig {
  kinds: Record<
    string,
    { description: string; required: string[]; properties?: Record<string, { type?: string; description?: string }> }
  >;
}

export interface MutationRecord {
  mutation_id: string;
  target: { type: string; workflow_id: string; from_version: string };
  patch: unknown[];
  reason: string;
  status: string;
  created_by: string;
  created_at: string;
  applied_to_version?: string;
}

export const api = {
  getWorkspace: () => get<WorkspaceInfo>("/workspace"),
  getWorkflow: () => get<WorkflowResponse>("/workflow"),
  getWorkflowVersions: () => get<VersionListItem[]>("/workflow/versions"),
  getWorkflowVersion: (version: string) => get<WorkflowVersion>(`/workflow/versions/${encodeURIComponent(version)}`),
  getRuns: () => get<RunRecord[]>("/runs"),
  getRun: (id: string) => get<RunRecord>(`/runs/${encodeURIComponent(id)}`),
  getRunEvents: (id: string) => get<EventPayload[]>(`/runs/${encodeURIComponent(id)}/events`),
  getArtifactSchema: () => get<ArtifactSchemaConfig>("/artifacts/schema"),
  getArtifactKinds: (runId: string) => get<string[]>(`/artifacts/${encodeURIComponent(runId)}`),
  getArtifacts: (runId: string, kind: string) =>
    get<ArtifactStore>(`/artifacts/${encodeURIComponent(runId)}/${encodeURIComponent(kind)}`),
  getMutations: () => get<MutationRecord[]>("/mutations"),
  getMutation: (id: string) => get<MutationRecord>(`/mutations/${encodeURIComponent(id)}`),
};
