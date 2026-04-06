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
  isExecutorTerminalLogEnabled,
  isWorkflowGenerateDebugEnabled,
  writeExecutorTerminalNote,
  writeWorkflowGenerateDebug,
} from "../local-server/executor-terminal-log.js";
import {
  WORKFLOW_GENERATE_OUTPUT_MARKER,
  buildWorkflowGenerateFullPrompt,
} from "./workflow-generate-prompt.js";
import { extractFirstJsonObjectFromText } from "./json-extract.js";

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

/** Strip UI prefixes that were incorrectly concatenated into combinedLog (thinking deltas) so markers stay findable. */
function normalizeWorkflowAgentLogForMarker(raw: string): string {
  return raw.replace(/〈thinking〉\n/g, "");
}

function countSubstringOccurrences(haystack: string, needle: string): number {
  if (!needle) {
    return 0;
  }
  let count = 0;
  let pos = 0;
  while (true) {
    const i = haystack.indexOf(needle, pos);
    if (i < 0) {
      break;
    }
    count += 1;
    pos = i + needle.length;
  }
  return count;
}

function logWorkflowGenerateCombinedLogDiagnostics(agent: ExecutorAgentKind, rawCombinedLog: string): void {
  if (!isWorkflowGenerateDebugEnabled()) {
    return;
  }
  const marker = WORKFLOW_GENERATE_OUTPUT_MARKER;
  const normalized = normalizeWorkflowAgentLogForMarker(rawCombinedLog);
  const rawOcc = countSubstringOccurrences(rawCombinedLog, marker);
  const normOcc = countSubstringOccurrences(normalized, marker);
  const thinkingStrippedChars = rawCombinedLog.length - normalized.length;
  writeWorkflowGenerateDebug(
    `agent=${agent} combinedLog raw_chars=${rawCombinedLog.length} normalized_chars=${normalized.length} ` +
      `marker_occurrences_raw=${rawOcc} marker_occurrences_normalized=${normOcc} thinking_prefixes_stripped_chars≈${thinkingStrippedChars}`
  );
  if (normOcc === 0) {
    const tail = normalized.slice(-1200).replace(/\r?\n/g, "\\n");
    writeWorkflowGenerateDebug(`no_marker tail_snippet=${tail}`);
    return;
  }
  const lastIdx = normalized.lastIndexOf(marker);
  const after = normalized.slice(lastIdx + marker.length);
  const jsonProbe = extractFirstJsonObjectFromText(after.trim());
  writeWorkflowGenerateDebug(
    `last_marker_at=${lastIdx} after_marker_chars=${after.length} first_brace_object_extracted=${jsonProbe != null} ` +
      `extracted_json_chars=${jsonProbe?.length ?? 0}`
  );
  if (jsonProbe) {
    const head = jsonProbe.slice(0, 160).replace(/\r?\n/g, "\\n");
    writeWorkflowGenerateDebug(`extracted_json_head=${JSON.stringify(head)}`);
  }
}

export function parseWorkflowFileJsonFromAgentLog(rawLog: string): unknown {
  const log = normalizeWorkflowAgentLogForMarker(rawLog);
  const marker = WORKFLOW_GENERATE_OUTPUT_MARKER;
  let searchEnd = log.length;
  let lastParseError: Error | null = null;
  while (searchEnd >= 0) {
    const idx = log.lastIndexOf(marker, searchEnd);
    if (idx < 0) {
      break;
    }
    const afterMarker = log.slice(idx + marker.length).trim();
    const jsonStr = extractFirstJsonObjectFromText(afterMarker);
    if (jsonStr) {
      try {
        return JSON.parse(jsonStr) as unknown;
      } catch (err) {
        lastParseError = err instanceof Error ? err : new Error(String(err));
      }
    }
    if (idx === 0) {
      break;
    }
    searchEnd = idx - 1;
  }
  if (lastParseError) {
    throw new Error(`Failed to parse JSON after workflow file marker: ${lastParseError.message}`);
  }
  throw new Error(`Agent output must include ${marker} followed by a JSON object.`);
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

  const claudeStreamJsonDisabled = process.env.COGNETIVY_CLAUDE_STREAM_JSON === "0";
  const useCodexJsonl = agent === "codex";
  const useClaudeStreamJson = agent === "claude" && !claudeStreamJsonDisabled;

  if (isExecutorTerminalLogEnabled()) {
    writeExecutorTerminalNote(
      `workflow.generate spawn agent=${agent} codex_jsonl=${useCodexJsonl} claude_stream_json=${useClaudeStreamJson}`
    );
  }

  let onChunkCalls = 0;
  let onChunkBytes = 0;
  const sink = onChunk ?? (() => {});

  if (isExecutorTerminalLogEnabled()) {
    writeExecutorTerminalNote(
      `workflow.generate awaiting agent subprocess agent=${agent} (pid logs when child spawns)`
    );
  }

  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const heartbeatStartedMs = Date.now();
  if (isExecutorTerminalLogEnabled()) {
    const heartbeatSecRaw = Number(process.env.COGNETIVY_WORKFLOW_GENERATE_HEARTBEAT_SEC);
    const heartbeatSec = Number.isFinite(heartbeatSecRaw) && heartbeatSecRaw > 0 ? heartbeatSecRaw : 20;
    const intervalMs = Math.max(5000, Math.round(heartbeatSec * 1000));
    heartbeat = setInterval(function workflowGenerateHeartbeat() {
      const elapsedS = Math.round((Date.now() - heartbeatStartedMs) / 1000);
      writeExecutorTerminalNote(
        `workflow.generate agent still running elapsed_s=${elapsedS} onChunk_calls=${onChunkCalls} onChunk_bytes=${onChunkBytes}`
      );
    }, intervalMs);
  }

  let exitCode: number | null;
  let combinedLog: string;
  try {
    const result = await runAgentForNodeRaw({
      cwd,
      agent,
      prompt,
      onChunk: (text: string, stream: "stdout" | "stderr") => {
        onChunkCalls += 1;
        onChunkBytes += text.length;
        sink(text, stream);
      },
      signal,
      /** Codex plain exec buffers transcript; `--json` emits each item as it completes. */
      codexJsonlStdout: useCodexJsonl,
      claudeStreamJsonStdout: useClaudeStreamJson,
    });
    exitCode = result.exitCode;
    combinedLog = result.combinedLog;
  } finally {
    if (heartbeat) {
      clearInterval(heartbeat);
    }
  }

  if (isExecutorTerminalLogEnabled()) {
    writeExecutorTerminalNote(
      `workflow.generate agent subprocess done onChunk_calls=${onChunkCalls} onChunk_bytes=${onChunkBytes} combined_log_chars=${combinedLog.length}`
    );
  }
  if (isWorkflowGenerateDebugEnabled()) {
    writeWorkflowGenerateDebug(
      `subprocess exitCode=${exitCode === null ? "null" : String(exitCode)} onChunk_calls=${onChunkCalls} onChunk_bytes=${onChunkBytes}`
    );
    logWorkflowGenerateCombinedLogDiagnostics(agent, combinedLog);
  }

  if (exitCode !== 0 && exitCode !== null) {
    const tail = combinedLog.trim().slice(-2000);
    if (isWorkflowGenerateDebugEnabled()) {
      writeWorkflowGenerateDebug(`nonzero_exit tail_chars=${tail.length}`);
    }
    throw new Error(`Agent exited with code ${exitCode}.${tail ? `\n--- tail ---\n${tail}` : ""}`);
  }

  onPhase?.("parsing");
  let parsed: unknown;
  try {
    parsed = parseWorkflowFileJsonFromAgentLog(combinedLog);
  } catch (parseErr) {
    if (isWorkflowGenerateDebugEnabled()) {
      writeWorkflowGenerateDebug(`parseWorkflowFileJsonFromAgentLog failed: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`);
    }
    throw parseErr;
  }
  if (isWorkflowGenerateDebugEnabled()) {
    const name = parsed && typeof parsed === "object" && "name" in (parsed as object) ? String((parsed as { name?: unknown }).name ?? "") : "";
    writeWorkflowGenerateDebug(`parse ok workflow_name=${name.slice(0, 120)}`);
  }

  onPhase?.("validating");
  let payload: CloudCreateWorkflowFullInput;
  try {
    payload = parseAndValidateWorkflowFullPayload(parsed);
  } catch (valErr) {
    if (isWorkflowGenerateDebugEnabled()) {
      writeWorkflowGenerateDebug(`validation failed: ${valErr instanceof Error ? valErr.message : String(valErr)}`);
    }
    throw valErr;
  }

  onPhase?.("creating");
  if (isWorkflowGenerateDebugEnabled()) {
    writeWorkflowGenerateDebug("resolveCloudOrganizationId + POST /workflows/full starting");
  }
  const t0 = Date.now();
  const organizationId = await resolveCloudOrganizationId();
  if (isWorkflowGenerateDebugEnabled()) {
    writeWorkflowGenerateDebug(`organizationId resolved len=${organizationId.length} in ${Date.now() - t0}ms`);
  }
  const t1 = Date.now();
  const created = await cloudCreateWorkflowFull({
    ...payload,
    organizationId,
  });
  if (isWorkflowGenerateDebugEnabled()) {
    writeWorkflowGenerateDebug(
      `cloudCreateWorkflowFull done workflowId=${created.id} versionId=${created.versionId ?? "null"} in ${Date.now() - t1}ms`
    );
  }
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
