/**
 * Minimal MCP server over stdio (JSON-RPC 2.0).
 * Exposes cognetivy operations as tools for Cursor/agents.
 */

import * as readline from "node:readline";
import {
  workspaceExists,
  readWorkflowIndex,
  readWorkflowRecord,
  writeWorkflowIndex,
  writeWorkflowRecord,
  listWorkflowVersionIds,
  readWorkflowVersionRecord,
  writeWorkflowVersionRecord,
  writeRunFile,
  readRunFile,
  updateRunFile,
  appendEventLine,
  runExists,
  readCollectionSchema,
  writeCollectionSchema,
  listCollectionKindsForRun,
  readCollections,
  writeCollections,
  appendCollection,
  writeNodeResult,
} from "./workspace.js";
import { getMergedConfig } from "./config.js";
import { validateWorkflowVersion } from "./validate.js";
import type {
  RunRecord,
  EventPayload,
  CollectionSchemaConfig,
  CollectionKindSchema,
  NodeResultRecord,
  WorkflowVersionRecord,
  WorkflowRecordSummary,
} from "./models.js";
import { NodeResultStatus } from "./models.js";
import { CollectionValidationError } from "./validate-collection.js";
import { mergeKindTemplate } from "./kind-templates.js";
import { listSkills, getSkillByName } from "./skills.js";
import type { SkillSource } from "./skills.js";

const DEFAULT_BY = "mcp";

function getSkillsConfig(cwd: string): Promise<{ sources?: SkillSource[]; extraDirs?: string[] }> {
  return getMergedConfig(cwd).then((config) => {
    const skills = config.skills as { sources?: SkillSource[]; extraDirs?: string[] } | undefined;
    return skills ?? {};
  });
}

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
    description:
      "Get the current workflow version JSON (nodes, edges). Call this after run_start to see which steps you must execute for the run.",
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
    description:
      "Start a new run. Returns { run_id, suggested_collection_kinds, _hint }. You MUST provide a descriptive name. SCHEMA-FIRST: Call collection_schema_get, then collection_schema_add_kind for any suggested_collection_kinds missing from schema, before collection_set/collection_append.",
    inputSchema: {
      type: "object",
      properties: {
        input_json: { type: "object", description: "Run input (e.g. { topic: '...' })" },
        name: {
          type: "string",
          description:
            "Required. Short descriptive name for the run (e.g. 'Hotels tech opportunities 2026').",
        },
        by: { type: "string", description: "Actor (e.g. agent:cursor)" },
      },
      required: ["input_json", "name"],
    },
  },
  {
    name: "run_complete",
    description:
      "Explicitly mark a run as completed. ALWAYS call this after event_append run_completed to ensure the run status is updated. Guarantees status=completed is persisted.",
    inputSchema: {
      type: "object",
      properties: { run_id: { type: "string", description: "Run ID to mark complete" } },
      required: ["run_id"],
    },
  },
  {
    name: "event_append",
    description:
      "Append one event to a run's NDJSON log. REQUIRED for step status in Studio: For step_started and step_completed events, event_json.data MUST include the workflow node id. Use data.step (or step_id) = <node_id>, e.g. { type: 'step_started', data: { step: 'expand_domain' } }. When ending a run: event_append run_completed, then run_complete to ensure status is updated.",
    inputSchema: {
      type: "object",
      properties: {
        run_id: { type: "string" },
        event_json: {
          type: "object",
          description:
            "Event: { type: 'step_started'|'step_completed'|'run_completed'|..., data: { step: '<node_id>', ... } }. data.step (or step_id) is REQUIRED for step events so Studio displays progress.",
        },
        by: { type: "string" },
      },
      required: ["run_id", "event_json"],
    },
  },
  {
    name: "collection_schema_get",
    description:
      "Get the current collection schema. CALL THIS before collection_set/collection_append. If schema is empty or lacks kinds for workflow outputs, use collection_schema_add_kind to add them.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "collection_schema_set",
    description: "Set collection schema from JSON. Must have 'kinds' object; each kind has description, required (array), optional properties.",
    inputSchema: {
      type: "object",
      properties: { schema_json: { type: "object", description: "CollectionSchemaConfig with kinds" } },
      required: ["schema_json"],
    },
  },
  {
    name: "collection_schema_add_kind",
    description:
      "Add or update one collection kind without replacing the full schema. Use when workflow outputs need a new kind (e.g. ideas, sources, resource_pack). Merges into existing schema. Prefer field names that suggest rich content (idea_summary, why_now_thesis, description, excerpt) so Studio renders them as Markdown.",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", description: "Kind name (e.g. ideas, sources, resource_pack)" },
        description: { type: "string", description: "What this kind stores" },
        required: {
          type: "array",
          items: { type: "string" },
          description: "Required field names for each item",
        },
        properties: {
          type: "object",
          description: "Optional: { field: { type, description } }",
        },
      },
      required: ["kind", "description", "required"],
    },
  },
  {
    name: "collection_list",
    description: "List collection kinds that have data for a run.",
    inputSchema: {
      type: "object",
      properties: { run_id: { type: "string" } },
      required: ["run_id"],
    },
  },
  {
    name: "collection_get",
    description: "Get all collections of a kind for a run (structured store: run_id, kind, updated_at, items).",
    inputSchema: {
      type: "object",
      properties: {
        run_id: { type: "string" },
        kind: { type: "string", description: "e.g. sources, ideas" },
      },
      required: ["run_id", "kind"],
    },
  },
  {
    name: "collection_set",
    description:
      "Replace all collections of a kind for a run. Items are validated against schema. If kind is unknown or validation fails, error includes schema—use collection_schema_add_kind first. Use **Markdown** for long text fields (summaries, theses, descriptions, reasons) so Studio renders them as rich text.",
    inputSchema: {
      type: "object",
      properties: {
        run_id: { type: "string" },
        kind: { type: "string" },
        items: { type: "array", description: "Array of collection items (each must satisfy schema required fields)" },
      },
      required: ["run_id", "kind", "items"],
    },
  },
  {
    name: "collection_append",
    description:
      "Append one collection item to a run's kind. Validated against schema. If kind unknown or validation fails, use collection_schema_add_kind first. Use **Markdown** for long text fields (summaries, theses, descriptions, reasons) so Studio renders them as rich text.",
    inputSchema: {
      type: "object",
      properties: {
        run_id: { type: "string" },
        kind: { type: "string" },
        payload: { type: "object", description: "Collection payload (must include required fields for kind)" },
        id: { type: "string", description: "Optional id for the item" },
      },
      required: ["run_id", "kind", "payload"],
    },
  },
  {
    name: "skills_list",
    description:
      "List available Agent skills and OpenClaw skills (SKILL.md) from configured sources (agent, openclaw, workspace). Returns name, description, path, source for discovery.",
    inputSchema: {
      type: "object",
      properties: {
        sources: {
          type: "array",
          items: { type: "string" },
          description: "Optional: filter by source (agent, openclaw, workspace)",
        },
      },
    },
  },
  {
    name: "skills_get",
    description:
      "Get full SKILL.md content for a skill by name. Use after skills_list to load a skill when needed.",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string", description: "Skill name (from skills_list)" } },
      required: ["name"],
    },
  },
  {
    name: "node_start",
    description:
      "Append step_started event and create a started node result. Returns { node_result_id } for use with node_complete or collection writes. Use before doing the node work.",
    inputSchema: {
      type: "object",
      properties: {
        run_id: { type: "string", description: "Run ID" },
        node_id: { type: "string", description: "Workflow node ID" },
        by: { type: "string", description: "Actor (e.g. agent:cursor)" },
      },
      required: ["run_id", "node_id"],
    },
  },
  {
    name: "node_complete",
    description:
      "Single call to create node result, optionally write collection (set or append), and append step_completed. Cuts 3–4 calls down to one. Returns { node_result_id }.",
    inputSchema: {
      type: "object",
      properties: {
        run_id: { type: "string" },
        node_id: { type: "string", description: "Workflow node ID" },
        status: { type: "string", description: "completed | failed | needs_human" },
        output: { type: "string", description: "Optional node result output text" },
        collection_kind: { type: "string", description: "Optional collection kind to write" },
        collection_items: {
          type: "array",
          description: "Optional array (set) or pass single object for append",
          items: { type: "object" },
        },
        collection_payload: { type: "object", description: "Optional single item for append (use when not using collection_items array)" },
        collection_mode: { type: "string", description: "set | append (default: infer from payload)" },
        by: { type: "string" },
      },
      required: ["run_id", "node_id", "status"],
    },
  },
];

/** Extract suggested collection kinds from workflow node outputs. */
function getSuggestedCollectionKinds(workflow: WorkflowVersionRecord): string[] {
  const kinds = new Set<string>();
  for (const node of workflow.nodes) {
    const outputs = node.output_collections ?? [];
    for (const out of outputs) {
      if (out && typeof out === "string" && !["vertical", "trends"].includes(out)) {
        kinds.add(out);
      }
    }
  }
  return Array.from(kinds);
}

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
        const index = await readWorkflowIndex(cwd);
        const workflowId = index.current_workflow_id;
        const wf = await readWorkflowRecord(workflowId, cwd);
        const version = await readWorkflowVersionRecord(workflowId, wf.current_version_id, cwd);
        const suggested_collection_kinds = getSuggestedCollectionKinds(version);
        return JSON.stringify(
          {
            workflow: wf,
            version,
            suggested_collection_kinds,
            _hint:
              suggested_collection_kinds.length > 0
                ? `Before collection_set/collection_append: call collection_schema_get. Ensure schema has kinds for: ${suggested_collection_kinds.join(", ")}. Use collection_schema_set or collection_schema_add_kind if missing.`
                : undefined,
          },
          null,
          2
        );
      }
      case "workflow_set": {
        const workflowJson = args.workflow_json as object;
        const index = await readWorkflowIndex(cwd);
        const workflowId = index.current_workflow_id;
        const wf = await readWorkflowRecord(workflowId, cwd);
        const existing = await listWorkflowVersionIds(workflowId, cwd);
        const nums = existing.map((v) => parseInt(v.replace(/^v/, ""), 10)).filter((n) => !Number.isNaN(n));
        const nextNum = Math.max(0, ...nums) + 1;
        const newVersionId = `v${nextNum}`;
        const version: WorkflowVersionRecord = {
          ...(workflowJson as unknown as Omit<WorkflowVersionRecord, "workflow_id" | "version_id" | "created_at">),
          workflow_id: workflowId,
          version_id: newVersionId,
          created_at: new Date().toISOString(),
          nodes: (workflowJson as { nodes?: unknown[] }).nodes as WorkflowVersionRecord["nodes"],
        };
        validateWorkflowVersion(version);
        await writeWorkflowVersionRecord(version, cwd);
        await writeWorkflowRecord({ ...wf, current_version_id: newVersionId }, cwd);
        await writeWorkflowIndex(
          {
            ...index,
            workflows: (index.workflows ?? []).map((w) =>
              w.workflow_id === workflowId ? { ...w, current_version_id: newVersionId } : w
            ),
          },
          cwd
        );
        return newVersionId;
      }
      case "run_start": {
        const inputJson = args.input_json as Record<string, unknown>;
        const nameRaw = args.name as string | undefined;
        if (!nameRaw || !String(nameRaw).trim()) {
          throw new Error(
            "run_start requires 'name' (short descriptive name for the run). Provide it in the MCP call arguments."
          );
        }
        const name = String(nameRaw).trim();
        const by = (args.by as string) ?? (await resolveBy(cwd));
        const index = await readWorkflowIndex(cwd);
        const workflowId = index.current_workflow_id;
        const wf = await readWorkflowRecord(workflowId, cwd);
        const versionId = wf.current_version_id;
        const runId = generateId("run");
        const now = new Date().toISOString();
        const runRecord: RunRecord = {
          run_id: runId,
          name,
          workflow_id: workflowId,
          workflow_version_id: versionId,
          status: "running",
          input: inputJson,
          created_at: now,
        };
        await writeRunFile(runRecord, cwd);
        const event: EventPayload = {
          ts: now,
          type: "run_started",
          by,
          data: { workflow_id: workflowId, workflow_version_id: versionId, input: inputJson },
        };
        await appendEventLine(runId, event, cwd);

        const systemNodeId = "__system__";
        const systemNodeResultId = generateId("node_result");
        const nodeResult: NodeResultRecord = {
          node_result_id: systemNodeResultId,
          run_id: runId,
          workflow_id: workflowId,
          workflow_version_id: versionId,
          node_id: systemNodeId,
          status: NodeResultStatus.Completed,
          started_at: now,
          completed_at: now,
          output: JSON.stringify(inputJson, null, 2),
          writes: [{ kind: "run_input", item_ids: ["run_input"] }],
        };
        await writeNodeResult(runId, systemNodeId, nodeResult, cwd);
        await appendCollection(
          runId,
          "run_input",
          inputJson,
          { id: "run_input", created_by_node_id: systemNodeId, created_by_node_result_id: systemNodeResultId },
          cwd
        );

        const workflow = await readWorkflowVersionRecord(workflowId, versionId, cwd);
        const suggested_collection_kinds = getSuggestedCollectionKinds(workflow);
        return JSON.stringify({
          run_id: runId,
          suggested_collection_kinds,
          _hint:
            suggested_collection_kinds.length > 0
              ? `Call collection_schema_get. Ensure schema has kinds: ${suggested_collection_kinds.join(", ")}. Use collection_schema_add_kind if missing, then collection_set/collection_append per step.`
              : undefined,
        });
      }
      case "run_complete": {
        const runIdComplete = args.run_id as string;
        if (!(await runExists(runIdComplete, cwd))) {
          throw new Error(`Run "${runIdComplete}" not found.`);
        }
        await updateRunFile(runIdComplete, { status: "completed" }, cwd);
        return "Run marked as completed.";
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
        if (event.type === "run_completed") {
          await updateRunFile(runId, { status: "completed" }, cwd);
        }
        return "Appended event.";
      }
      case "collection_schema_get": {
        const index = await readWorkflowIndex(cwd);
        const schema = await readCollectionSchema(index.current_workflow_id, cwd);
        return JSON.stringify(schema, null, 2);
      }
      case "collection_schema_set": {
        const schemaJson = args.schema_json as CollectionSchemaConfig;
        if (!schemaJson.kinds || typeof schemaJson.kinds !== "object") {
          throw new Error("schema_json must have a 'kinds' object.");
        }
        const index = await readWorkflowIndex(cwd);
        const workflowId = index.current_workflow_id;
        const merged: CollectionSchemaConfig = {
          workflow_id: workflowId,
          kinds: {},
        };
        for (const [k, v] of Object.entries(schemaJson.kinds)) {
          merged.kinds[k] = mergeKindTemplate(k, v);
        }
        await writeCollectionSchema(workflowId, merged, cwd);
        return "Collection schema updated.";
      }
      case "collection_schema_add_kind": {
        const kind = args.kind as string;
        const description = args.description as string;
        const required = (args.required as string[] | undefined) ?? [];
        const properties = (args.properties as Record<string, { type?: string; description?: string }> | undefined) ?? undefined;
        if (!kind || !description) {
          throw new Error("collection_schema_add_kind requires: kind, description.");
        }
        const index = await readWorkflowIndex(cwd);
        const workflowId = index.current_workflow_id;
        const schema = await readCollectionSchema(workflowId, cwd);
        const jsonSchemaProps: Record<string, Record<string, unknown>> = {};
        for (const [k, v] of Object.entries(properties ?? {})) {
          jsonSchemaProps[k] = {
            type: v.type ?? "string",
            ...(v.description ? { description: v.description } : {}),
          };
        }
        let kindSchema: CollectionKindSchema = {
          description,
          item_schema: {
            type: "object",
            properties: jsonSchemaProps,
            required,
            additionalProperties: true,
          },
        };
        kindSchema = mergeKindTemplate(kind, kindSchema);
        schema.kinds = { ...schema.kinds, [kind]: kindSchema };
        await writeCollectionSchema(workflowId, schema, cwd);
        return `Added kind "${kind}". Schema now has kinds: ${Object.keys(schema.kinds).join(", ")}.`;
      }
      case "collection_list": {
        const runIdList = args.run_id as string;
        const kinds = await listCollectionKindsForRun(runIdList, cwd);
        return JSON.stringify(kinds);
      }
      case "collection_get": {
        const runIdGet = args.run_id as string;
        const kindGet = args.kind as string;
        const store = await readCollections(runIdGet, kindGet, cwd);
        return JSON.stringify(store, null, 2);
      }
      case "collection_set": {
        const runIdSet = args.run_id as string;
        const kindSet = args.kind as string;
        const payloads = args.items as Array<Record<string, unknown>>;
        const createdByNodeId = args.created_by_node_id as string;
        const createdByNodeResultId = args.created_by_node_result_id as string;
        if (!Array.isArray(payloads)) throw new Error("items must be an array.");
        if (!createdByNodeId || !createdByNodeResultId) {
          throw new Error("collection_set requires created_by_node_id and created_by_node_result_id.");
        }
        try {
          await writeCollections(
            runIdSet,
            kindSet,
            payloads,
            { created_by_node_id: createdByNodeId, created_by_node_result_id: createdByNodeResultId },
            cwd
          );
          return `Set ${payloads.length} collection(s) for kind "${kindSet}".`;
        } catch (err) {
          if (err instanceof CollectionValidationError) {
            const run = await readRunFile(runIdSet, cwd);
            const schema = await readCollectionSchema(run.workflow_id, cwd);
            const kindSchema = schema.kinds[kindSet];
            throw new Error(
              `${err.message} Details: ${(err.details ?? []).join("; ")}. Schema for "${kindSet}": item_schema=${JSON.stringify(kindSchema?.item_schema ?? {})}. Fix schema with collection_schema_add_kind or collection_schema_set.`
            );
          }
          throw err;
        }
      }
      case "collection_append": {
        const runIdApp = args.run_id as string;
        const kindApp = args.kind as string;
        const payload = args.payload as Record<string, unknown>;
        const idOpt = args.id as string | undefined;
        const createdByNodeId = args.created_by_node_id as string;
        const createdByNodeResultId = args.created_by_node_result_id as string;
        if (!createdByNodeId || !createdByNodeResultId) {
          throw new Error("collection_append requires created_by_node_id and created_by_node_result_id.");
        }
        try {
          const item = await appendCollection(
            runIdApp,
            kindApp,
            payload,
            { id: idOpt, created_by_node_id: createdByNodeId, created_by_node_result_id: createdByNodeResultId },
            cwd
          );
          return JSON.stringify(item, null, 2);
        } catch (err) {
          if (err instanceof CollectionValidationError) {
            const run = await readRunFile(runIdApp, cwd);
            const schema = await readCollectionSchema(run.workflow_id, cwd);
            const kindSchema = schema.kinds[kindApp];
            throw new Error(
              `${err.message} Details: ${(err.details ?? []).join("; ")}. Schema for "${kindApp}": item_schema=${JSON.stringify(kindSchema?.item_schema ?? {})}. Fix schema with collection_schema_add_kind or collection_schema_set.`
            );
          }
          throw err;
        }
      }
      case "skills_list": {
        const sourcesArg = args.sources as string[] | undefined;
        const sources = sourcesArg?.length
          ? (sourcesArg as SkillSource[])
          : (["agent", "openclaw", "workspace"] as SkillSource[]);
        const skillsConfig = await getSkillsConfig(cwd);
        const skills = await listSkills(cwd, { sources, extraDirs: skillsConfig.extraDirs }, skillsConfig);
        return JSON.stringify(
          skills.map((s) => ({ name: s.metadata.name, description: s.metadata.description, path: s.path, source: s.source })),
          null,
          2
        );
      }
      case "skills_get": {
        const skillName = args.name as string;
        if (!skillName) throw new Error("skills_get requires 'name'.");
        const skillsConfig = await getSkillsConfig(cwd);
        const skill = await getSkillByName(skillName, cwd, undefined, skillsConfig);
        if (!skill) throw new Error(`Skill "${skillName}" not found.`);
        return skill.fullContent;
      }
      case "node_start": {
        const runIdStart = args.run_id as string;
        const nodeIdStart = args.node_id as string;
        if (!(await runExists(runIdStart, cwd))) {
          throw new Error(`Run "${runIdStart}" not found.`);
        }
        const runStart = await readRunFile(runIdStart, cwd);
        const byStart = (args.by as string) ?? (await resolveBy(cwd));
        const nowStart = new Date().toISOString();
        const nodeResultIdStart = generateId("node_result");
        const eventStart: EventPayload = {
          ts: nowStart,
          type: "step_started",
          by: byStart,
          data: { step: nodeIdStart, step_id: nodeIdStart },
        };
        await appendEventLine(runIdStart, eventStart, cwd);
        const resultStart: NodeResultRecord = {
          node_result_id: nodeResultIdStart,
          run_id: runIdStart,
          workflow_id: runStart.workflow_id,
          workflow_version_id: runStart.workflow_version_id,
          node_id: nodeIdStart,
          status: NodeResultStatus.Started,
          started_at: nowStart,
        };
        await writeNodeResult(runIdStart, nodeIdStart, resultStart, cwd);
        return JSON.stringify({ node_result_id: nodeResultIdStart });
      }
      case "node_complete": {
        const runIdComplete = args.run_id as string;
        const nodeIdComplete = args.node_id as string;
        const statusComplete = args.status as string;
        const validStatuses = ["completed", "failed", "needs_human"] as const;
        if (!validStatuses.includes(statusComplete as (typeof validStatuses)[number])) {
          throw new Error(`status must be one of: ${validStatuses.join(", ")}`);
        }
        if (!(await runExists(runIdComplete, cwd))) {
          throw new Error(`Run "${runIdComplete}" not found.`);
        }
        const runComplete = await readRunFile(runIdComplete, cwd);
        const byComplete = (args.by as string) ?? (await resolveBy(cwd));
        const nowComplete = new Date().toISOString();
        const nodeResultIdComplete = generateId("node_result");
        const outputComplete = args.output as string | undefined;
        const writesComplete: { kind: string; item_ids: string[] }[] = [];

        const collectionKind = args.collection_kind as string | undefined;
        const collectionItems = args.collection_items as Array<Record<string, unknown>> | undefined;
        const collectionPayload = args.collection_payload as Record<string, unknown> | undefined;
        const collectionMode = args.collection_mode as string | undefined;

        if (collectionKind) {
          const payloads = collectionItems ?? (collectionPayload ? [collectionPayload] : []);
          if (payloads.length === 0) {
            throw new Error("node_complete with collection_kind requires collection_items (array) or collection_payload (single object).");
          }
          const mode = collectionMode === "set" || collectionMode === "append" ? collectionMode : payloads.length > 1 ? "set" : "append";
          if (mode === "set") {
            const payloadsWithIds = payloads.map((p, i) => ({
              ...p,
              id: (p as { id?: string }).id ?? `${collectionKind}_${i}`,
            }));
            const itemIds = payloadsWithIds.map((p) => (p as { id: string }).id);
            await writeCollections(
              runIdComplete,
              collectionKind,
              payloadsWithIds,
              { created_by_node_id: nodeIdComplete, created_by_node_result_id: nodeResultIdComplete },
              cwd
            );
            writesComplete.push({ kind: collectionKind, item_ids: itemIds });
          } else {
            const single = payloads[0] as Record<string, unknown>;
            const item = await appendCollection(
              runIdComplete,
              collectionKind,
              single,
              { created_by_node_id: nodeIdComplete, created_by_node_result_id: nodeResultIdComplete },
              cwd
            );
            writesComplete.push({ kind: collectionKind, item_ids: [item.id] });
          }
        }

        const resultComplete: NodeResultRecord = {
          node_result_id: nodeResultIdComplete,
          run_id: runIdComplete,
          workflow_id: runComplete.workflow_id,
          workflow_version_id: runComplete.workflow_version_id,
          node_id: nodeIdComplete,
          status: statusComplete as NodeResultRecord["status"],
          started_at: nowComplete,
          completed_at: nowComplete,
          ...(outputComplete ? { output: outputComplete } : {}),
          ...(writesComplete.length > 0 ? { writes: writesComplete } : {}),
        };
        await writeNodeResult(runIdComplete, nodeIdComplete, resultComplete, cwd);

        const stepCompletedEvent: EventPayload = {
          ts: nowComplete,
          type: "step_completed",
          by: byComplete,
          data: { step: nodeIdComplete, step_id: nodeIdComplete },
        };
        await appendEventLine(runIdComplete, stepCompletedEvent, cwd);

        return JSON.stringify({ node_result_id: nodeResultIdComplete });
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
  instructions?: string;
}> {
  return {
    protocolVersion: "2024-11-05",
    capabilities: { tools: {} },
    serverInfo: { name: "cognetivy", version: "0.1.0" },
    instructions:
      "When you start a run with run_start, you MUST execute the workflow. Do not leave runs incomplete. " +
      "SCHEMA-FIRST: Before collection_set/collection_append, call collection_schema_get. If schema lacks kinds for workflow outputs (see run_start/workflow_get suggested_collection_kinds), use collection_schema_add_kind to add them. " +
      "RICH TEXT: Use **Markdown** in collection item fields for summaries, theses, descriptions, and reasons (e.g. idea_summary, why_now_thesis, reliability_reason). Studio renders these as formatted documents. " +
      "EFFICIENT NODE FLOW: Prefer node_start (optional) then node_complete per step. node_complete creates the node result, optionally writes collection (collection_kind + collection_items or collection_payload), and appends step_completed in one call. Returns { node_result_id }. " +
      "After run_start: 1) workflow_get (note suggested_collection_kinds), 2) collection_schema_get, 3) collection_schema_add_kind for any missing kinds, 4) for each step: node_start (optional), do work, node_complete (with optional collection_kind + items/payload), 5) event_append run_completed, 6) run_complete. " +
      "Step events MUST include data.step (or step_id) = the workflow node id.",
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
