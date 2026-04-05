/**
 * Run the local coding agent to produce workflow JSON, validate, and create via cloud API.
 */
import {
  validateWorkflowVersion,
  getCollectionNamesFromNodes,
  WorkflowValidationError,
  WorkflowNodeType,
  type WorkflowNode,
} from "../core/index.js";
import type { CloudCreateWorkflowFullInput } from "../cloud-client.js";
import {
  cloudCreateWorkflowFull,
  resolveCloudOrganizationId,
} from "../cloud-client.js";
import { runAgentForNodeRaw, type ExecutorAgentKind } from "./agent-node-runner.js";
import {
  WORKFLOW_GENERATE_OUTPUT_MARKER,
  buildWorkflowGenerateFullPrompt,
} from "./workflow-generate-prompt.js";

function pickStrArray(v: unknown): string[] {
  if (!Array.isArray(v)) {
    return [];
  }
  return v.filter((x): x is string => typeof x === "string" && x.trim() !== "");
}

function normalizeWorkflowNode(raw: unknown, index: number): WorkflowNode {
  if (!raw || typeof raw !== "object") {
    throw new Error(`Node at index ${index} must be an object.`);
  }
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  if (!id) {
    throw new Error(`Node at index ${index} must have a non-empty string "id".`);
  }
  const typeRaw = o.type;
  const typeStr = typeof typeRaw === "string" ? typeRaw.trim() : "";
  if (typeStr !== WorkflowNodeType.Prompt && typeStr !== WorkflowNodeType.HumanInTheLoop) {
    throw new Error(
      `Node "${id}" has invalid type "${typeStr}". Use "PROMPT" or "HUMAN_IN_THE_LOOP".`
    );
  }
  const input_collections = pickStrArray(o.input_collections ?? o.inputCollections);
  const output_collections = pickStrArray(o.output_collections ?? o.outputCollections);
  const prompt = typeof o.prompt === "string" ? o.prompt : undefined;
  const description = typeof o.description === "string" ? o.description : undefined;
  const minimum_rows = typeof o.minimum_rows === "number" ? o.minimum_rows : undefined;
  const required_skills = pickStrArray(o.required_skills ?? o.requiredSkills);
  const required_mcps = pickStrArray(o.required_mcps ?? o.requiredMcps);

  const node: WorkflowNode = {
    id,
    type: typeStr as WorkflowNodeType,
    input_collections,
    output_collections,
    ...(prompt !== undefined ? { prompt } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(minimum_rows !== undefined ? { minimum_rows } : {}),
    ...(required_skills.length > 0 ? { required_skills } : {}),
    ...(required_mcps.length > 0 ? { required_mcps } : {}),
  };
  return node;
}

export function parseWorkflowFileJsonFromAgentLog(log: string): unknown {
  const idx = log.lastIndexOf(WORKFLOW_GENERATE_OUTPUT_MARKER);
  if (idx < 0) {
    throw new Error(
      `Agent output must include ${WORKFLOW_GENERATE_OUTPUT_MARKER} followed by JSON.`
    );
  }
  const jsonPart = log.slice(idx + WORKFLOW_GENERATE_OUTPUT_MARKER.length).trim();
  try {
    return JSON.parse(jsonPart) as unknown;
  } catch {
    throw new Error("Failed to parse JSON after workflow file marker.");
  }
}

function validateKindsForNodes(
  nodes: WorkflowNode[],
  kinds: Record<string, { name?: string; description: string; item_schema: Record<string, unknown> }>
): void {
  const needed = getCollectionNamesFromNodes(nodes);
  const missing = needed.filter((k) => kinds[k] == null || typeof kinds[k] !== "object");
  if (missing.length > 0) {
    throw new Error(
      `Missing "kinds" entries for collections referenced in nodes: ${missing.join(", ")}.`
    );
  }
  for (const k of needed) {
    const entry = kinds[k];
    if (!entry.description?.trim()) {
      throw new Error(`kinds["${k}"] must have a non-empty description.`);
    }
    if (!entry.item_schema || typeof entry.item_schema !== "object" || Array.isArray(entry.item_schema)) {
      throw new Error(`kinds["${k}"] must have an object item_schema.`);
    }
  }
}

export function parseAndValidateWorkflowFullPayload(raw: unknown): CloudCreateWorkflowFullInput {
  if (!raw || typeof raw !== "object") {
    throw new Error("Workflow payload must be a JSON object.");
  }
  const o = raw as Record<string, unknown>;
  const name = typeof o.name === "string" ? o.name.trim() : "";
  if (!name) {
    throw new Error('JSON must include non-empty string "name".');
  }
  const description = typeof o.description === "string" ? o.description.trim() : undefined;
  if (!Array.isArray(o.nodes)) {
    throw new Error('JSON must include "nodes" array.');
  }
  const nodes = o.nodes.map((n, i) => normalizeWorkflowNode(n, i));
  const kindsRaw = o.kinds ?? o.Kinds;
  if (kindsRaw == null || typeof kindsRaw !== "object" || Array.isArray(kindsRaw)) {
    throw new Error('JSON must include object "kinds" with schema for every collection used in nodes.');
  }
  const kinds: Record<string, { name?: string; description: string; item_schema: Record<string, unknown> }> = {};
  for (const [key, val] of Object.entries(kindsRaw as Record<string, unknown>)) {
    if (!val || typeof val !== "object" || Array.isArray(val)) {
      throw new Error(`kinds["${key}"] must be an object.`);
    }
    const k = val as Record<string, unknown>;
    const desc = typeof k.description === "string" ? k.description : "";
    const item_schema = k.item_schema ?? k.itemSchema;
    if (!item_schema || typeof item_schema !== "object" || Array.isArray(item_schema)) {
      throw new Error(`kinds["${key}"] must include item_schema object.`);
    }
    const nameOpt = typeof k.name === "string" ? k.name : undefined;
    kinds[key] = {
      description: desc,
      item_schema: item_schema as Record<string, unknown>,
      ...(nameOpt !== undefined ? { name: nameOpt } : {}),
    };
  }

  validateKindsForNodes(nodes, kinds);

  const versionStub = {
    workflow_id: "pending",
    version_id: "pending",
    created_at: new Date().toISOString(),
    nodes,
  };
  validateWorkflowVersion(versionStub);

  return {
    organizationId: "",
    name,
    ...(description !== undefined && description !== "" ? { description } : {}),
    nodes,
    kinds,
  };
}

export interface RunWorkflowGenerateParams {
  brief: string;
  nameHint?: string;
  descriptionHint?: string;
  agent: ExecutorAgentKind;
  cwd: string;
  signal?: AbortSignal;
  onChunk?: (text: string, stream: "stdout" | "stderr") => void;
  onPhase?: (phase: "parsing" | "validating" | "creating") => void;
}

export interface RunWorkflowGenerateResult {
  workflowId: string;
  versionId: string | null;
}

export async function runWorkflowGenerateFromBrief(
  params: RunWorkflowGenerateParams
): Promise<RunWorkflowGenerateResult> {
  const { brief, nameHint, descriptionHint, agent, cwd, signal, onChunk, onPhase } = params;
  const prompt = buildWorkflowGenerateFullPrompt({ brief, nameHint, descriptionHint });

  const { exitCode, combinedLog } = await runAgentForNodeRaw({
    cwd,
    agent,
    prompt,
    onChunk: onChunk ?? (() => {}),
    signal,
    /** Codex plain exec buffers transcript; `--json` emits each item as it completes. */
    codexJsonlStdout: agent === "codex",
  });

  if (exitCode !== 0 && exitCode !== null) {
    const tail = combinedLog.trim().slice(-2000);
    throw new Error(`Agent exited with code ${exitCode}.${tail ? `\n--- tail ---\n${tail}` : ""}`);
  }

  onPhase?.("parsing");
  const parsed = parseWorkflowFileJsonFromAgentLog(combinedLog);
  onPhase?.("validating");
  const payload = parseAndValidateWorkflowFullPayload(parsed);
  onPhase?.("creating");
  const organizationId = await resolveCloudOrganizationId();
  const created = await cloudCreateWorkflowFull({
    ...payload,
    organizationId,
  });
  return { workflowId: created.id, versionId: created.versionId ?? null };
}

export function formatWorkflowValidationError(err: unknown): string {
  if (err instanceof WorkflowValidationError) {
    return err.message;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}
