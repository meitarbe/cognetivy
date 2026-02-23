/**
 * Minimal MCP server over stdio (JSON-RPC 2.0).
 * Exposes cognetivy operations as tools for Cursor/agents.
 */

import * as readline from "node:readline";
import type { WorkflowVersion } from "./models.js";
import {
  workspaceExists,
  readWorkflowPointer,
  readWorkflowVersion,
  writeWorkflowPointer,
  writeWorkflowVersion,
  listWorkflowVersionFiles,
  versionFromFileName,
  writeRunFile,
  appendEventLine,
  runExists,
  readMutationFile,
  updateMutationFile,
  writeMutationFile,
  readArtifactSchema,
  writeArtifactSchema,
  listArtifactKindsForRun,
  readArtifacts,
  writeArtifacts,
  appendArtifact,
} from "./workspace.js";
import { getMergedConfig } from "./config.js";
import { validateWorkflow } from "./validate.js";
import { applyMutationToWorkspace } from "./mutation.js";
import type {
  RunRecord,
  EventPayload,
  MutationRecord,
  MutationTarget,
  JsonPatchOperation,
  ArtifactSchemaConfig,
  ArtifactItem,
} from "./models.js";

const DEFAULT_BY = "mcp";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

function sendResponse(response: JsonRpcResponse): void {
  console.log(JSON.stringify(response));
}

function sendError(id: string | number | null, code: number, message: string, data?: unknown): void {
  sendResponse({ jsonrpc: "2.0", id, error: { code, message, data } });
}

const TOOLS: Array<{ name: string; description: string; inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[] } }> = [
  {
    name: "workflow_get",
    description: "Get the current workflow version JSON.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "workflow_set",
    description: "Set workflow from provided JSON. Creates a new version and updates the pointer.",
    inputSchema: {
      type: "object",
      properties: { workflow_json: { type: "object", description: "Workflow object (workflow_id, version, nodes, edges)" } },
      required: ["workflow_json"],
    },
  },
  {
    name: "run_start",
    description: "Start a new run. Returns run_id.",
    inputSchema: {
      type: "object",
      properties: {
        input_json: { type: "object", description: "Run input" },
        by: { type: "string", description: "Actor (e.g. agent:cursor)" },
      },
      required: ["input_json"],
    },
  },
  {
    name: "event_append",
    description: "Append one event to a run's NDJSON log.",
    inputSchema: {
      type: "object",
      properties: {
        run_id: { type: "string" },
        event_json: { type: "object", description: "Event payload (type, data, etc.)" },
        by: { type: "string" },
      },
      required: ["run_id", "event_json"],
    },
  },
  {
    name: "mutate_propose",
    description: "Propose a workflow mutation (JSON Patch). Returns mutation_id.",
    inputSchema: {
      type: "object",
      properties: {
        patch_json: { type: "array", description: "JSON Patch operations" },
        reason: { type: "string" },
        by: { type: "string" },
      },
      required: ["patch_json", "reason"],
    },
  },
  {
    name: "mutate_apply",
    description: "Apply a proposed mutation. Creates new workflow version and updates pointer.",
    inputSchema: {
      type: "object",
      properties: {
        mutation_id: { type: "string" },
        by: { type: "string" },
      },
      required: ["mutation_id"],
    },
  },
  {
    name: "artifact_schema_get",
    description: "Get the current artifact schema (kinds and required fields). Defines structure for sources, collected, ideas, etc.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "artifact_schema_set",
    description: "Set artifact schema from JSON. Must have 'kinds' object; each kind has description, required (array), optional properties.",
    inputSchema: {
      type: "object",
      properties: { schema_json: { type: "object", description: "ArtifactSchemaConfig with kinds" } },
      required: ["schema_json"],
    },
  },
  {
    name: "artifact_list",
    description: "List artifact kinds that have data for a run.",
    inputSchema: {
      type: "object",
      properties: { run_id: { type: "string" } },
      required: ["run_id"],
    },
  },
  {
    name: "artifact_get",
    description: "Get all artifacts of a kind for a run (structured store: run_id, kind, updated_at, items).",
    inputSchema: {
      type: "object",
      properties: {
        run_id: { type: "string" },
        kind: { type: "string", description: "e.g. sources, collected, ideas" },
      },
      required: ["run_id", "kind"],
    },
  },
  {
    name: "artifact_set",
    description: "Replace all artifacts of a kind for a run. Items are validated against artifact schema.",
    inputSchema: {
      type: "object",
      properties: {
        run_id: { type: "string" },
        kind: { type: "string" },
        items: { type: "array", description: "Array of artifact items (each must satisfy schema required fields)" },
      },
      required: ["run_id", "kind", "items"],
    },
  },
  {
    name: "artifact_append",
    description: "Append one artifact item to a run's kind. Validated against schema. Returns the created item (with id, created_at).",
    inputSchema: {
      type: "object",
      properties: {
        run_id: { type: "string" },
        kind: { type: "string" },
        payload: { type: "object", description: "Artifact payload (must include required fields for kind)" },
        id: { type: "string", description: "Optional id for the item" },
      },
      required: ["run_id", "kind", "payload"],
    },
  },
];

function generateId(prefix: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${ts}_${rand}`;
}

async function resolveBy(cwd: string): Promise<string> {
  const config = await getMergedConfig(cwd);
  return (config.default_by as string) ?? DEFAULT_BY;
}

async function handleToolsList(): Promise<{ tools: typeof TOOLS }> {
  return { tools: TOOLS };
}

async function handleToolsCall(
  name: string,
  args: Record<string, unknown>,
  cwd: string
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const runTool = async (): Promise<string> => {
    switch (name) {
      case "workflow_get": {
        const pointer = await readWorkflowPointer(cwd);
        const workflow = await readWorkflowVersion(pointer.current_version, cwd);
        return JSON.stringify(workflow, null, 2);
      }
      case "workflow_set": {
        const workflowJson = args.workflow_json as object;
        validateWorkflow(workflowJson);
        const pointer = await readWorkflowPointer(cwd);
        const files = await listWorkflowVersionFiles(cwd);
        const versions = files.map(versionFromFileName);
        const maxNum = Math.max(0, ...versions.map((v) => parseInt(v.replace(/^v/, ""), 10) || 0));
        const newVersion = `v${maxNum + 1}`;
        const workflow: WorkflowVersion = {
          ...(workflowJson as WorkflowVersion),
          workflow_id: pointer.workflow_id,
          version: newVersion,
        };
        await writeWorkflowVersion(workflow, cwd);
        await writeWorkflowPointer(
          { workflow_id: pointer.workflow_id, current_version: newVersion },
          cwd
        );
        return newVersion;
      }
      case "run_start": {
        const inputJson = args.input_json as Record<string, unknown>;
        const by = (args.by as string) ?? (await resolveBy(cwd));
        const pointer = await readWorkflowPointer(cwd);
        const runId = generateId("run");
        const now = new Date().toISOString();
        const runRecord: RunRecord = {
          run_id: runId,
          workflow_id: pointer.workflow_id,
          workflow_version: pointer.current_version,
          status: "running",
          input: inputJson,
          created_at: now,
        };
        await writeRunFile(runRecord, cwd);
        const event: EventPayload = {
          ts: now,
          type: "run_started",
          by,
          data: { workflow_version: pointer.current_version, input: inputJson },
        };
        await appendEventLine(runId, event, cwd);
        return runId;
      }
      case "event_append": {
        const runId = args.run_id as string;
        const eventJson = args.event_json as Record<string, unknown>;
        const by = (args.by as string) ?? (await resolveBy(cwd));
        if (!(await runExists(runId, cwd))) {
          throw new Error(`Run "${runId}" not found.`);
        }
        const now = new Date().toISOString();
        const event: EventPayload = {
          ts: (eventJson.ts as string) ?? now,
          type: (eventJson.type as EventPayload["type"]) ?? "artifact",
          by: (eventJson.by as string) ?? by,
          data: (eventJson.data as Record<string, unknown>) ?? eventJson,
        };
        await appendEventLine(runId, event, cwd);
        return "Appended event.";
      }
      case "mutate_propose": {
        const patchJson = args.patch_json as JsonPatchOperation[];
        const reason = args.reason as string;
        const by = (args.by as string) ?? (await resolveBy(cwd));
        const pointer = await readWorkflowPointer(cwd);
        const mutationId = generateId("mut");
        const target: MutationTarget = {
          type: "workflow",
          workflow_id: pointer.workflow_id,
          from_version: pointer.current_version,
        };
        const record: MutationRecord = {
          mutation_id: mutationId,
          target,
          patch: patchJson,
          reason,
          status: "proposed",
          created_by: by,
          created_at: new Date().toISOString(),
        };
        await writeMutationFile(record, cwd);
        return mutationId;
      }
      case "mutate_apply": {
        const mutationId = args.mutation_id as string;
        const mutation = await readMutationFile(mutationId, cwd);
        if (mutation.status !== "proposed") {
          throw new Error(`Mutation "${mutationId}" is not proposed (status: ${mutation.status}).`);
        }
        const newVersion = await applyMutationToWorkspace(
          mutation.target.from_version,
          mutation.patch,
          mutation.target.workflow_id,
          cwd
        );
        await writeWorkflowPointer(
          { workflow_id: mutation.target.workflow_id, current_version: newVersion },
          cwd
        );
        await updateMutationFile(
          mutationId,
          { status: "applied", applied_to_version: newVersion },
          cwd
        );
        return newVersion;
      }
      case "artifact_schema_get": {
        const schema = await readArtifactSchema(cwd);
        return JSON.stringify(schema, null, 2);
      }
      case "artifact_schema_set": {
        const schemaJson = args.schema_json as ArtifactSchemaConfig;
        if (!schemaJson.kinds || typeof schemaJson.kinds !== "object") {
          throw new Error("schema_json must have a 'kinds' object.");
        }
        await writeArtifactSchema(schemaJson, cwd);
        return "Artifact schema updated.";
      }
      case "artifact_list": {
        const runIdList = args.run_id as string;
        const kinds = await listArtifactKindsForRun(runIdList, cwd);
        return JSON.stringify(kinds);
      }
      case "artifact_get": {
        const runIdGet = args.run_id as string;
        const kindGet = args.kind as string;
        const store = await readArtifacts(runIdGet, kindGet, cwd);
        return JSON.stringify(store, null, 2);
      }
      case "artifact_set": {
        const runIdSet = args.run_id as string;
        const kindSet = args.kind as string;
        const items = args.items as ArtifactItem[];
        if (!Array.isArray(items)) {
          throw new Error("items must be an array.");
        }
        await writeArtifacts(runIdSet, kindSet, items, cwd);
        return `Set ${items.length} artifact(s) for kind "${kindSet}".`;
      }
      case "artifact_append": {
        const runIdApp = args.run_id as string;
        const kindApp = args.kind as string;
        const payload = args.payload as Record<string, unknown>;
        const idOpt = args.id as string | undefined;
        const item = await appendArtifact(runIdApp, kindApp, payload, { id: idOpt }, cwd);
        return JSON.stringify(item, null, 2);
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  };

  const result = await runTool();
  return { content: [{ type: "text" as const, text: result }] };
}

async function handleInitialize(): Promise<{
  protocolVersion: string;
  capabilities: { tools: {} };
  serverInfo: { name: string; version: string };
}> {
  return {
    protocolVersion: "2024-11-05",
    capabilities: { tools: {} },
    serverInfo: { name: "cognetivy", version: "0.1.0" },
  };
}

export async function runMcpServer(workspacePath: string): Promise<void> {
  const cwd = workspacePath;

  if (!(await workspaceExists(cwd))) {
    process.stderr.write(
      "Error: No cognetivy workspace at " + workspacePath + ". Run `cognetivy init` first.\n"
    );
    process.exit(1);
  }

  const rl = readline.createInterface({ input: process.stdin, terminal: false });

  for await (const line of rl) {
    if (!line.trim()) continue;
    let req: JsonRpcRequest;
    try {
      req = JSON.parse(line) as JsonRpcRequest;
    } catch {
      sendError(null, -32700, "Parse error");
      continue;
    }
    const id = req.id ?? null;

    try {
      if (req.method === "initialize") {
        const result = await handleInitialize();
        sendResponse({ jsonrpc: "2.0", id, result });
        continue;
      }
      if (req.method === "notifications/initialized") {
        continue;
      }
      if (req.method === "tools/list") {
        const result = await handleToolsList();
        sendResponse({ jsonrpc: "2.0", id, result });
        continue;
      }
      if (req.method === "tools/call") {
        const params = (req.params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
        const name = params.name;
        const args = (params.arguments ?? {}) as Record<string, unknown>;
        if (!name) {
          sendError(id, -32602, "Invalid params: name required");
          continue;
        }
        const result = await handleToolsCall(name, args, cwd);
        sendResponse({ jsonrpc: "2.0", id, result });
        continue;
      }
      sendError(id, -32601, "Method not found: " + req.method);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendError(id, -32603, message);
    }
  }
}
