const API_BASE = "/api";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
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
  name?: string;
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

export interface CollectionStore {
  run_id: string;
  kind: string;
  updated_at: string;
  items: CollectionItem[];
}

export interface CollectionItem {
  id?: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface CollectionKindSchema {
  description: string;
  required: string[];
  global?: boolean;
  properties?: Record<string, { type?: string; description?: string }>;
}

export interface CollectionSchemaConfig {
  kinds: Record<string, CollectionKindSchema>;
}

export const api = {
  getWorkspace: () => get<WorkspaceInfo>("/workspace"),
  getWorkflow: () => get<WorkflowResponse>("/workflow"),
  getWorkflowVersions: () => get<VersionListItem[]>("/workflow/versions"),
  getWorkflowVersion: (version: string) => get<WorkflowVersion>(`/workflow/versions/${encodeURIComponent(version)}`),
  getRuns: () => get<RunRecord[]>("/runs"),
  getRun: (id: string) => get<RunRecord>(`/runs/${encodeURIComponent(id)}`),
  updateRunName: (id: string, name: string) =>
    patch<RunRecord>(`/runs/${encodeURIComponent(id)}`, { name }),
  getRunEvents: (id: string) => get<EventPayload[]>(`/runs/${encodeURIComponent(id)}/events`),
  getCollectionSchema: () => get<CollectionSchemaConfig>("/collections/schema"),
  getCollectionKinds: (runId: string) => get<string[]>(`/collections/${encodeURIComponent(runId)}`),
  getCollections: (runId: string, kind: string) =>
    get<CollectionStore>(`/collections/${encodeURIComponent(runId)}/${encodeURIComponent(kind)}`),
  getEntityData: (kind: string, runId?: string) => {
    const q = runId ? `?run_id=${encodeURIComponent(runId)}` : "";
    return get<CollectionItem[]>(`/entities/${encodeURIComponent(kind)}${q}`);
  },
};
