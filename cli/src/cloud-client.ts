/**
 * Cloud API client for Cognetivy backend. Use COGNETIVY_API_URL and API key (env or stored file).
 */

import type { NextStepAction } from "./run-engine.js";
import { readStoredApiKey } from "./credentials.js";

/** Default cloud API when not in dev; must match the backend used by the app at alpha.cognetivy.com. */
const DEFAULT_CLOUD_API_URL = "https://bm.cognetivy.com";

function isLocalDev(): boolean {
  return (
    process.env.NODE_ENV === "development" ||
    process.env.COGNETIVY_DEV === "true" ||
    process.env.COGNETIVY_DEV === "1"
  );
}

const getBaseUrl = (): string => {
  if (process.env.COGNETIVY_API_URL) {
    return process.env.COGNETIVY_API_URL.replace(/\/$/, "");
  }
  return isLocalDev() ? "http://localhost:3000" : DEFAULT_CLOUD_API_URL;
};

/** Cloud API base URL (for display only; does not require API key). */
export function getCloudApiUrl(): string {
  return getBaseUrl();
}

/** Resolve API key: env COGNETIVY_API_KEY first, then stored credentials file. */
function resolveApiKey(): string | null {
  const fromEnv = process.env.COGNETIVY_API_KEY;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  return readStoredApiKey();
}

const getApiKey = (): string => {
  const key = resolveApiKey();
  if (!key) {
    throw new Error("COGNETIVY_API_KEY is required for cloud mode. Run `cognetivy auth login` to sign in.");
  }
  return key;
};

/** True when CLI should use the backend API (key in env or stored file). */
export function isCloudMode(): boolean {
  return Boolean(resolveApiKey());
}

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
    let message = body || res.statusText;
    if (res.status === 403 && body) {
      try {
        const parsed = JSON.parse(body) as { message?: string };
        if (typeof parsed.message === "string" && parsed.message.trim()) {
          message = parsed.message;
        }
      } catch {
        // keep message as body
      }
    } else {
      message = `Cloud API ${res.status}: ${message}`;
    }
    throw new Error(message);
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

export interface CloudCurrentUser {
  id: string;
  email?: string;
  displayName?: string | null;
  /** From backend: either { id, name }[] or { organization: { id, name } }[] */
  organizations?: Array<{ id?: string; name?: string | null; organization?: { id: string; name?: string } }>;
}

/** Get current user and organizations (requires COGNETIVY_API_KEY). */
export async function cloudGetCurrentUser(): Promise<CloudCurrentUser> {
  return cloudFetch<CloudCurrentUser>("/users/me");
}

/** True only if an API key is set and the token is valid (e.g. /users/me succeeds). Use this when you need to treat invalid/expired tokens as not authenticated. */
export async function isCloudAuthenticated(): Promise<boolean> {
  if (!resolveApiKey()) return false;
  try {
    await cloudGetCurrentUser();
    return true;
  } catch {
    return false;
  }
}

/** Resolve organization ID: env COGNETIVY_ORGANIZATION_ID or first org from whoami. */
export async function resolveCloudOrganizationId(): Promise<string> {
  const fromEnv = process.env.COGNETIVY_ORGANIZATION_ID?.trim();
  if (fromEnv) return fromEnv;
  const user = await cloudGetCurrentUser();
  const orgs = user.organizations ?? [];
  const first = orgs[0];
  const id = first?.organization?.id ?? (first as { id?: string })?.id;
  if (!id) throw new Error("No organization. Set COGNETIVY_ORGANIZATION_ID or use an account with an organization.");
  return id;
}

// --- Workflows (cloud API) ---

export interface CloudWorkflowListItem {
  id: string;
  name: string;
  description?: string | null;
  currentVersionId?: string | null;
  organizationId?: string;
}

export async function cloudListWorkflows(
  organizationId: string,
  q?: string
): Promise<CloudWorkflowListItem[]> {
  const url = q?.trim()
    ? `/workflows?organizationId=${encodeURIComponent(organizationId)}&q=${encodeURIComponent(q.trim())}`
    : `/workflows?organizationId=${encodeURIComponent(organizationId)}`;
  const list = await cloudFetch<CloudWorkflowListItem[]>(url);
  return Array.isArray(list) ? list : [];
}

export interface CloudCreateWorkflowInput {
  organizationId: string;
  name: string;
  description?: string;
}

export interface CloudWorkflow {
  id: string;
  name: string;
  description?: string | null;
  currentVersionId?: string | null;
  organizationId: string;
}

export async function cloudCreateWorkflow(input: CloudCreateWorkflowInput): Promise<CloudWorkflow> {
  return cloudFetch<CloudWorkflow>("/workflows", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export interface CloudCreateWorkflowFullInput {
  organizationId: string;
  name: string;
  description?: string;
  nodes?: unknown[];
  kinds?: Record<string, { name?: string; description: string; item_schema: Record<string, unknown> }>;
}

export interface CloudCreateWorkflowFullResult extends CloudWorkflow {
  versionId: string | null;
}

/** Create workflow + first version (nodes) + collection schema in one API call. */
export async function cloudCreateWorkflowFull(
  input: CloudCreateWorkflowFullInput
): Promise<CloudCreateWorkflowFullResult> {
  return cloudFetch<CloudCreateWorkflowFullResult>("/workflows/full", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function cloudSetCollectionSchema(
  workflowId: string,
  kinds: Record<string, { name?: string; description: string; item_schema: Record<string, unknown> }>
): Promise<void> {
  await cloudFetch(`/workflows/${encodeURIComponent(workflowId)}/collections/schema`, {
    method: "PUT",
    body: JSON.stringify({ kinds }),
  });
}

export async function cloudCreateWorkflowVersion(
  workflowId: string,
  nodes: unknown[] = []
): Promise<CloudWorkflowVersion> {
  return cloudFetch<CloudWorkflowVersion>(`/workflows/${encodeURIComponent(workflowId)}/versions`, {
    method: "POST",
    body: JSON.stringify({ nodes }),
  });
}

export async function cloudGetWorkflow(workflowId: string): Promise<CloudWorkflow> {
  return cloudFetch<CloudWorkflow>(`/workflows/${encodeURIComponent(workflowId)}`);
}

export interface CloudWorkflowVersion {
  id: string;
  workflowId: string;
  nodes: unknown[];
  name?: string;
}

export async function cloudGetWorkflowVersions(workflowId: string): Promise<{ id: string }[]> {
  const list = await cloudFetch<{ id: string }[]>(`/workflows/${encodeURIComponent(workflowId)}/versions`);
  return Array.isArray(list) ? list : [];
}

export async function cloudGetWorkflowVersion(
  workflowId: string,
  versionId: string
): Promise<CloudWorkflowVersion> {
  return cloudFetch<CloudWorkflowVersion>(
    `/workflows/${encodeURIComponent(workflowId)}/versions/${encodeURIComponent(versionId)}`
  );
}

/** Map backend action names to CLI NextStepAction for display. */
export function mapCloudActionToLocal(action: string): NextStepAction {
  const map: Record<string, NextStepAction> = {
    execute_node: "run_node",
    execute_nodes_parallel: "run_nodes_parallel",
    complete_run: "complete_run",
    complete_node: "complete_node",
    wait: "done",
  };
  return map[action] ?? "done";
}

// --- Collections (cloud API) ---

export async function cloudListCollectionKinds(
  runId: string
): Promise<{ run_id: string; kinds: string[] }> {
  return cloudFetch<{ run_id: string; kinds: string[] }>(`/runs/${encodeURIComponent(runId)}/collections/kinds`);
}

export async function cloudGetCollectionItems(
  runId: string,
  kind: string
): Promise<{ run_id: string; kind: string; items: Array<Record<string, unknown>> }> {
  return cloudFetch<{ run_id: string; kind: string; items: Array<Record<string, unknown>> }>(
    `/runs/${encodeURIComponent(runId)}/collections/${encodeURIComponent(kind)}/items`
  );
}
