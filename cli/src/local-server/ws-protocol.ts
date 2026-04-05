/**
 * Versioned WebSocket messages between local studio and CLI backend.
 */

export const WS_PROTOCOL_VERSION = 1 as const;

export type WsClientMessageType =
  | "hello"
  | "run.start"
  | "run.cancel"
  | "hitl.response";

export type WsServerMessageType =
  | "welcome"
  | "run.event"
  | "log.append"
  | "hitl.request"
  | "error";

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

export type WsClientMessage = WsHelloMessage | WsRunStartMessage | WsRunCancelMessage | WsHitlResponseMessage;

export interface WsWelcomeMessage extends WsEnvelopeBase {
  type: "welcome";
  sessionOk: boolean;
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

export type WsServerMessage =
  | WsWelcomeMessage
  | WsRunEventMessage
  | WsLogAppendMessage
  | WsHitlRequestMessage
  | WsErrorMessage;

export function serverMessage(msg: WsServerMessage): string {
  return JSON.stringify(msg);
}
