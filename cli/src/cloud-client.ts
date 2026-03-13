/**
 * Cloud API client for Cognetivy backend. Use with COGNETIVY_API_URL and COGNETIVY_API_KEY.
 */

const getBaseUrl = (): string => {
  const url = process.env.COGNETIVY_API_URL ?? "http://localhost:3000";
  return url.replace(/\/$/, "");
};

const getApiKey = (): string => {
  const key = process.env.COGNETIVY_API_KEY;
  if (!key) {
    throw new Error("COGNETIVY_API_KEY is required for cloud mode. Create one at the app: POST /auth/api-key.");
  }
  return key;
};

async function cloudFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const baseUrl = getBaseUrl();
  const apiKey = getApiKey();
  const url = `${baseUrl}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    ...(options.headers as Record<string, string>),
  };
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Cloud API ${res.status}: ${body || res.statusText}`);
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

export interface CloudCreateRunInput {
  workflowId: string;
  workflowVersionId?: string;
  name?: string;
  input: Record<string, unknown>;
}

export interface CloudNextStep {
  action: string;
  node_id?: string;
  runnable_node_ids?: string[];
  hint?: string;
}

export interface CloudCreateRunResult {
  run: { id: string; status: string };
  run_id: string;
  run_url?: string;
  next_step: CloudNextStep;
  current_node_id?: string;
  current_node_ids?: string[];
}

export async function cloudCreateRun(body: CloudCreateRunInput): Promise<CloudCreateRunResult> {
  return cloudFetch<CloudCreateRunResult>("/runs", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function cloudGetRun(runId: string): Promise<{ id: string; status: string; workflowId: string }> {
  return cloudFetch<{ id: string; status: string; workflowId: string }>(`/runs/${runId}`);
}

export async function cloudGetNext(runId: string): Promise<{
  next_step: CloudNextStep;
  current_node_id?: string;
  current_node_ids?: string[];
}> {
  return cloudFetch(`/runs/${runId}/next`);
}

export async function cloudStartNode(runId: string, nodeId: string): Promise<{
  next_step: CloudNextStep;
  current_node_id?: string;
  current_node_ids?: string[];
}> {
  return cloudFetch(`/runs/${runId}/nodes/${encodeURIComponent(nodeId)}/start`, { method: "POST" });
}

export interface CloudCompleteNodeBody {
  output?: string;
  collectionKind?: string;
  collectionPayload?: unknown;
  writes?: Array<{ kind: string; item_ids: string[] }>;
}

export async function cloudCompleteNode(
  runId: string,
  nodeId: string,
  body: CloudCompleteNodeBody = {}
): Promise<{ next_step: CloudNextStep; current_node_id?: string; current_node_ids?: string[] }> {
  return cloudFetch(`/runs/${runId}/nodes/${encodeURIComponent(nodeId)}/complete`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export interface CloudAppendEventsBody {
  events: Array<{ type: string; by?: string; data?: Record<string, unknown> }>;
}

export async function cloudAppendEvents(runId: string, body: CloudAppendEventsBody): Promise<{ appended: number }> {
  return cloudFetch(`/runs/${runId}/events`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Map backend action names to CLI next_step action for display. */
export function mapCloudActionToLocal(action: string): string {
  const map: Record<string, string> = {
    execute_node: "run_node",
    execute_nodes_parallel: "run_nodes_parallel",
    complete_run: "complete_run",
    wait: "done",
  };
  return map[action] ?? action;
}
