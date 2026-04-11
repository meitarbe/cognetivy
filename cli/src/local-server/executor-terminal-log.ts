/**
 * Concise executor status lines on stderr (not agent stdout/stderr chunks).
 * Disable with COGNETIVY_EXECUTOR_LOG=0 or false.
 *
 * Optional workflow.generate / agent streaming diagnostics:
 * - COGNETIVY_WORKFLOW_GENERATE_CHUNK_LOG=1 - log each agent_log WS payload (stream + byte size).
 * - COGNETIVY_WORKFLOW_GENERATE_DEBUG=1 - marker counts, combinedLog stats, parse/cloud phases (stderr).
 * - COGNETIVY_WORKFLOW_GENERATE_HEARTBEAT_SEC - while awaiting the agent subprocess during “Generate workflow”, log elapsed seconds and chunk stats every N seconds (default 20; min 5 when executor log is on).
 * - COGNETIVY_CLAUDE_STREAM_JSON_IDLE_END_MS - Claude stream-json: if stdout goes quiet for this many ms after COGNETIVY_COLLECTION_JSON= / COGNETIVY_WORKFLOW_FILE_JSON= appears, close stdin (fallback when no `{"type":"result"}` line). Default 6000; min 1000.
 * - COGNETIVY_AGENT_COMBINED_LOG_MAX_CHARS - max retained characters of agent stdout for parsing (default 1_500_000). When over limit, prefers keeping from the last COGNETIVY_* marker so large JSON is not truncated mid-payload.
 * - COGNETIVY_AGENT_STDOUT_TRACE=1 - log each child_process stdout/stderr `data` event size (raw OS pipe).
 */
import type { WsServerMessage } from "./ws-protocol.js";

const PREFIX = "cognetivy";

function truncateText(text: string, maxChars: number): string {
  const singleLine = text.replace(/\s+/g, " ").trim();
  if (singleLine.length <= maxChars) {
    return singleLine;
  }
  return `${singleLine.slice(0, Math.max(0, maxChars - 1))}…`;
}

export function isExecutorTerminalLogEnabled(): boolean {
  const v = process.env.COGNETIVY_EXECUTOR_LOG;
  if (v === "0" || v === "false" || v === "no") {
    return false;
  }
  return true;
}

function isWorkflowGenerateChunkLogEnabled(): boolean {
  const v = process.env.COGNETIVY_WORKFLOW_GENERATE_CHUNK_LOG;
  return v === "1" || v === "true" || v === "yes";
}

/** Verbose workflow.generate pipeline logs (marker, combinedLog, parse, cloud API). */
export function isWorkflowGenerateDebugEnabled(): boolean {
  const v = process.env.COGNETIVY_WORKFLOW_GENERATE_DEBUG;
  return v === "1" || v === "true" || v === "yes";
}

export function writeWorkflowGenerateDebug(note: string): void {
  if (!isWorkflowGenerateDebugEnabled()) {
    return;
  }
  console.error(`[${PREFIX}] workflow.generate.debug ${note}`);
}

export function writeExecutorTerminalNote(note: string): void {
  if (!isExecutorTerminalLogEnabled()) {
    return;
  }
  console.error(`[${PREFIX}] ${note}`);
}

function formatRunEventLine(msg: Extract<WsServerMessage, { type: "run.event" }>): string | null {
  const { phase, runId, nodeId, payload } = msg;
  const rid = runId.trim() ? runId : "-";
  const nid = nodeId ? ` node=${nodeId}` : "";

  if (phase === "error") {
    return null;
  }

  switch (phase) {
    case "creating": {
      const wf = payload && typeof payload.workflowId === "string" ? payload.workflowId : "?";
      return `run (creating) workflow=${wf}`;
    }
    case "created":
      return `run ${rid} created`;
    case "wait": {
      const hint =
        payload && payload.hint != null && String(payload.hint).trim()
          ? ` hint=${truncateText(String(payload.hint), 900)}`
          : "";
      return `run ${rid} wait (orchestrator idle)${hint}`;
    }
    case "complete":
      return `run ${rid} workflow complete`;
    case "parallel_start": {
      const rawIds = payload && Array.isArray(payload.nodeIds) ? payload.nodeIds : [];
      const ids = rawIds.filter((x): x is string => typeof x === "string").join(", ") || "?";
      return `run ${rid} parallel start [${ids}]`;
    }
    case "node_start":
      return `run ${rid}${nid} node start`;
    case "agent_running": {
      const agent = payload && typeof payload.agent === "string" ? payload.agent : "?";
      const attempt = payload?.attempt;
      const max = payload?.maxAttempts;
      const att =
        typeof attempt === "number"
          ? ` attempt ${attempt}${typeof max === "number" ? `/${max}` : ""}`
          : "";
      return `run ${rid}${nid} agent ${agent}${att}`;
    }
    case "agent_validation_retry": {
      const source = payload && typeof payload.source === "string" ? payload.source : "?";
      const reason =
        payload && payload.reason != null ? ` ${truncateText(String(payload.reason), 180)}` : "";
      return `run ${rid}${nid} validation retry (${source})${reason}`;
    }
    case "node_complete": {
      const attempts = payload?.attempts;
      const extra = typeof attempts === "number" ? ` (${attempts} attempt(s))` : "";
      return `run ${rid}${nid} node complete${extra}`;
    }
    case "cancel_requested":
      return `run ${rid} cancel requested`;
    case "accepted":
      return `run accepted (queued) workflow=${payload && typeof payload.workflowId === "string" ? payload.workflowId : "?"}`;
    case "unhandled_next": {
      const action = payload && typeof payload.action === "string" ? payload.action : "?";
      return `run ${rid} stopped: unsupported next step (${action})`;
    }
    case "parallel_serial_fallback":
      return `run ${rid} parallel branches run sequentially (non-PROMPT or unsupported node mix)`;
    default:
      return `run ${rid} ${phase}${nid}`;
  }
}

export function writeExecutorTerminalLog(msg: WsServerMessage): void {
  if (!isExecutorTerminalLogEnabled()) {
    return;
  }

  switch (msg.type) {
    case "log.append":
      return;
    case "welcome":
      return;
    case "error": {
      const rid = msg.runId ? ` run=${msg.runId}` : "";
      console.error(`[${PREFIX}] ERROR ${msg.code}${rid}: ${truncateText(msg.message, 400)}`);
      return;
    }
    case "hitl.request": {
      const kind = msg.expectedCollectionKind ? ` kind=${msg.expectedCollectionKind}` : "";
      console.error(`[${PREFIX}] HITL run=${msg.runId} node=${msg.nodeId}${kind} - ${msg.title}`);
      return;
    }
    case "run.event": {
      const line = formatRunEventLine(msg);
      if (line) {
        console.error(`[${PREFIX}] ${line}`);
      }
      return;
    }
    case "workflow.generate": {
      if (msg.phase === "agent_log") {
        if (isWorkflowGenerateChunkLogEnabled() && isExecutorTerminalLogEnabled()) {
          const n = typeof msg.chunk === "string" ? msg.chunk.length : 0;
          const st = msg.stream === "stderr" ? "stderr" : "stdout";
          console.error(`[${PREFIX}] workflow.generate agent_log ${st} bytes=${n}`);
        }
        return;
      }
      const wf = msg.workflowId ? ` id=${msg.workflowId}` : "";
      const detail = msg.message ? ` - ${truncateText(msg.message, 240)}` : "";
      console.error(`[${PREFIX}] workflow.generate ${msg.phase}${wf}${detail}`);
      return;
    }
    default:
      return;
  }
}
