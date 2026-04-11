/**
 * Versioned WebSocket messages between local studio and CLI backend.
 */

export const WS_PROTOCOL_VERSION = 1 as const;

export type WsClientMessageType =
  | "hello"
  | "run.start"
  | "run.cancel"
  | "hitl.response"
  | "workflow.generate"
  | "agent.check"
  | "fs.list"
  | "fs.read";

export type WsServerMessageType =
  | "welcome"
  | "run.event"
  | "log.append"
  | "hitl.request"
  | "error"
  | "workflow.generate"
  | "agent.check.result"
  | "fs.list.result"
  | "fs.read.result";

export interface WsEnvelopeBase {
  v: typeof WS_PROTOCOL_VERSION;
  type: string;
}

export interface WsHelloMessage extends WsEnvelopeBase {
  type: "hello";
  clientVersion?: string;
  token?: string;
}

export interface WsRunStartMessage extends WsEnvelopeBase {
  type: "run.start";
  workflowId: string;
  workflowVersionId?: string;
  name: string;
  input: Record<string, unknown>;
  cwd?: string;
  agent?: "claude" | "codex";
}

export interface WsRunCancelMessage extends WsEnvelopeBase {
  type: "run.cancel";
  runId: string;
}

export interface WsHitlResponseMessage extends WsEnvelopeBase {
  type: "hitl.response";
  runId: string;
  nodeId: string;
  /** Collection payload or structured approval data */
  payload: Record<string, unknown>;
}

export interface WsWorkflowGenerateClientMessage extends WsEnvelopeBase {
  type: "workflow.generate";
  brief: string;
  name?: string;
  description?: string;
  agent?: "claude" | "codex";
}

export interface WsAgentCheckClientMessage extends WsEnvelopeBase {
  type: "agent.check";
  agent: "claude" | "codex";
  cwd?: string;
}

/** List directory entries under workspace cwd (path relative to cwd, "" = root). */
export interface WsFsListClientMessage extends WsEnvelopeBase {
  type: "fs.list";
  path: string;
  requestId?: string;
}

/** Read a UTF-8 text file under workspace cwd (e.g. load prompt from .md). */
export interface WsFsReadClientMessage extends WsEnvelopeBase {
  type: "fs.read";
  path: string;
  requestId?: string;
}

export type WsClientMessage =
  | WsHelloMessage
  | WsRunStartMessage
  | WsRunCancelMessage
  | WsHitlResponseMessage
  | WsWorkflowGenerateClientMessage
  | WsAgentCheckClientMessage
  | WsFsListClientMessage
  | WsFsReadClientMessage;

export interface WsWelcomeMessage extends WsEnvelopeBase {
  type: "welcome";
  sessionOk: boolean;
  /** Workspace working directory the CLI executor will use for agent subprocesses */
  cwd?: string;
}

export interface WsRunEventMessage extends WsEnvelopeBase {
  type: "run.event";
  phase: string;
  runId: string;
  nodeId?: string;
  payload?: Record<string, unknown>;
}

export interface WsLogAppendMessage extends WsEnvelopeBase {
  type: "log.append";
  runId: string;
  nodeId?: string;
  chunk: string;
  stream?: "stdout" | "stderr";
}

export interface WsHitlRequestMessage extends WsEnvelopeBase {
  type: "hitl.request";
  runId: string;
  nodeId: string;
  title: string;
  detail?: string;
  expectedCollectionKind?: string;
}

export interface WsErrorMessage extends WsEnvelopeBase {
  type: "error";
  code: string;
  message: string;
  runId?: string;
}

export type WsWorkflowGeneratePhase =
  | "started"
  | "agent_running"
  /** Streaming subprocess output (stdout/stderr) while the coding agent runs */
  | "agent_log"
  | "parsing"
  | "validating"
  | "creating"
  | "complete"
  | "failed";

export interface WsWorkflowGenerateServerMessage extends WsEnvelopeBase {
  type: "workflow.generate";
  phase: WsWorkflowGeneratePhase;
  workflowId?: string;
  message?: string;
  chunk?: string;
  stream?: "stdout" | "stderr";
}

export interface WsAgentCheckResultServerMessage extends WsEnvelopeBase {
  type: "agent.check.result";
  agent: "claude" | "codex";
  ok: boolean;
  message: string;
  stdoutTail?: string;
  stderrTail?: string;
}

export type WsFsEntryKind = "file" | "dir";

export interface WsFsListResultServerMessage extends WsEnvelopeBase {
  type: "fs.list.result";
  requestId?: string;
  ok: boolean;
  /** Path relative to workspace cwd (POSIX-style segments for display). */
  path: string;
  entries?: { name: string; kind: WsFsEntryKind }[];
  error?: string;
}

export interface WsFsReadResultServerMessage extends WsEnvelopeBase {
  type: "fs.read.result";
  requestId?: string;
  ok: boolean;
  path: string;
  content?: string;
  error?: string;
}

export type WsServerMessage =
  | WsWelcomeMessage
  | WsRunEventMessage
  | WsLogAppendMessage
  | WsHitlRequestMessage
  | WsErrorMessage
  | WsWorkflowGenerateServerMessage
  | WsAgentCheckResultServerMessage
  | WsFsListResultServerMessage
  | WsFsReadResultServerMessage;

export function serverMessage(msg: WsServerMessage): string {
  return JSON.stringify(msg);
}
