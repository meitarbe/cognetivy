/**
 * Claude Code CLI `--input-format=stream-json` / `--output-format=stream-json` handshake
 * and minimal control_request handling (mirrors vibe-kanban `claude/protocol.rs` + `types.rs`).
 */
import { randomUUID } from "node:crypto";

const HOOK_AUTO_APPROVE = {
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "allow",
    permissionDecisionReason: "Auto-approved by cognetivy local executor",
  },
};

export function buildClaudeStreamJsonStdinHandshake(prompt: string): string[] {
  return [
    JSON.stringify({
      type: "control_request",
      request_id: randomUUID(),
      request: { subtype: "initialize" },
    }),
    JSON.stringify({
      type: "control_request",
      request_id: randomUUID(),
      request: { subtype: "set_permission_mode", mode: "bypassPermissions" },
    }),
    JSON.stringify({
      type: "user",
      message: { role: "user", content: prompt },
    }),
  ];
}

function buildSuccessControlResponse(requestId: string, payload: unknown): string {
  return JSON.stringify({
    type: "control_response",
    response: {
      subtype: "success",
      request_id: requestId,
      response: payload,
    },
  });
}

/**
 * Returns true if this stdout line was a control_request we answered on stdin.
 */
export function tryRespondToClaudeStdoutControlLine(line: string, writeJsonLine: (jsonLine: string) => void): boolean {
  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return false;
  }
  if (!parsed || typeof parsed !== "object") {
    return false;
  }
  const o = parsed as Record<string, unknown>;
  if (o.type !== "control_request") {
    return false;
  }
  const requestId = o.request_id;
  if (typeof requestId !== "string") {
    return false;
  }
  const req = o.request;
  if (!req || typeof req !== "object") {
    return false;
  }
  const r = req as Record<string, unknown>;
  const subtype = r.subtype;
  if (subtype === "can_use_tool") {
    writeJsonLine(
      buildSuccessControlResponse(requestId, {
        behavior: "allow",
        updatedInput: r.input ?? {},
      })
    );
    return true;
  }
  if (subtype === "hook_callback") {
    writeJsonLine(buildSuccessControlResponse(requestId, HOOK_AUTO_APPROVE));
    return true;
  }
  return false;
}

export function createStdinJsonlWriter(stdin: NodeJS.WritableStream): { writeLine: (line: string) => void } {
  const queue: string[] = [];
  let writing = false;

  function drainQueue(): void {
    if (writing || queue.length === 0) {
      return;
    }
    const line = queue[0];
    const ok = stdin.write(`${line}\n`, "utf8");
    if (!ok) {
      writing = true;
      stdin.once("drain", function stdinDrainContinue() {
        writing = false;
        queue.shift();
        drainQueue();
      });
      return;
    }
    queue.shift();
    drainQueue();
  }

  return {
    writeLine(line: string): void {
      queue.push(line);
      drainQueue();
    },
  };
}
