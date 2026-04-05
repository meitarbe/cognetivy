/**
 * Spawn Claude Code or Codex with a text prompt; parse collection payload from stdout.
 */
import { spawn } from "node:child_process";

export type ExecutorAgentKind = "claude" | "codex";

const CLAUDE_CODE_PACKAGE =
  process.env.COGNETIVY_CLAUDE_PACKAGE?.trim() || process.env.AGENT_BRIDGE_CLAUDE_PACKAGE?.trim() || "@anthropic-ai/claude-code@2.1.62";

function npxCommand(): string {
  return process.platform === "win32" ? "npx.cmd" : "npx";
}

function buildSpawn(agent: ExecutorAgentKind, prompt: string): { command: string; args: string[] } {
  switch (agent) {
    case "claude": {
      const useGlobal = process.env.COGNETIVY_CLAUDE_USE_GLOBAL === "1" || process.env.AGENT_BRIDGE_CLAUDE_USE_GLOBAL === "1";
      const bare = process.env.COGNETIVY_CLAUDE_BARE === "1" || process.env.AGENT_BRIDGE_CLAUDE_BARE === "1";
      const tail: string[] = [
        "-p",
        prompt,
        "--disallowedTools",
        "AskUserQuestion",
        "--allowedTools",
        "Bash,Read,Edit",
        "--output-format",
        "text",
      ];
      if (bare) {
        tail.unshift("--bare");
      }
      if (useGlobal) {
        return { command: "claude", args: tail };
      }
      return {
        command: npxCommand(),
        args: ["-y", CLAUDE_CODE_PACKAGE, ...tail],
      };
    }
    case "codex":
      return {
        command: "codex",
        args: ["exec", "--sandbox", "workspace-write", "--ephemeral", prompt],
      };
    default:
      throw new Error(`Unknown agent: ${agent}`);
  }
}

const COLLECTION_MARKER = "COGNETIVY_COLLECTION_JSON=";
const MAX_LOG_CHARS = 500_000;

export interface AgentNodeRunParams {
  cwd: string;
  agent: ExecutorAgentKind;
  prompt: string;
  onChunk: (text: string, stream: "stdout" | "stderr") => void;
  signal?: AbortSignal;
}

export interface AgentNodeRunResult {
  exitCode: number | null;
  combinedLog: string;
  collectionPayload: unknown;
}

function parseCollectionPayloadFromLog(log: string): unknown {
  const idx = log.lastIndexOf(COLLECTION_MARKER);
  if (idx < 0) {
    throw new Error(
      `Agent output must end with ${COLLECTION_MARKER} followed by JSON (array of items or one object).`
    );
  }
  const jsonPart = log.slice(idx + COLLECTION_MARKER.length).trim();
  try {
    return JSON.parse(jsonPart) as unknown;
  } catch {
    throw new Error("Failed to parse JSON after COGNETIVY_COLLECTION_JSON=");
  }
}

export function buildAgentSystemPromptSuffix(expectedKind: string | undefined): string {
  const kindHint = expectedKind ? ` Output kind name: "${expectedKind}".` : "";
  return (
    `\n\n---\nWhen finished, print the exact line ${COLLECTION_MARKER} immediately followed by JSON on the same line or the next lines: ` +
    `a JSON array of collection item objects, or a single object.${kindHint} ` +
    `Items must satisfy the workflow collection schema (traceability fields if required by schema).`
  );
}

export function runAgentForNodeRaw(params: AgentNodeRunParams): Promise<{ exitCode: number | null; combinedLog: string }> {
  return new Promise((resolve, reject) => {
    const spec = buildSpawn(params.agent, params.prompt);
    let combined = "";
    const append = (chunk: string, stream: "stdout" | "stderr") => {
      combined += chunk;
      if (combined.length > MAX_LOG_CHARS) {
        combined = combined.slice(-MAX_LOG_CHARS);
      }
      params.onChunk(chunk, stream);
    };

    const child = spawn(spec.command, spec.args, {
      cwd: params.cwd,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    const onAbort = () => {
      child.kill("SIGTERM");
    };
    if (params.signal) {
      if (params.signal.aborted) {
        onAbort();
        reject(new Error("Aborted"));
        return;
      }
      params.signal.addEventListener("abort", onAbort, { once: true });
    }

    child.stdout?.on("data", (buf: Buffer) => {
      append(buf.toString("utf8"), "stdout");
    });
    child.stderr?.on("data", (buf: Buffer) => {
      append(buf.toString("utf8"), "stderr");
    });

    child.on("error", (err) => {
      if (params.signal) params.signal.removeEventListener("abort", onAbort);
      reject(err);
    });

    child.on("close", (code) => {
      if (params.signal) params.signal.removeEventListener("abort", onAbort);
      if (params.signal?.aborted) {
        reject(new Error("Aborted"));
        return;
      }
      resolve({ exitCode: code, combinedLog: combined });
    });
  });
}

export async function runAgentForNode(params: AgentNodeRunParams): Promise<AgentNodeRunResult> {
  const { exitCode, combinedLog } = await runAgentForNodeRaw(params);
  const collectionPayload = parseCollectionPayloadFromLog(combinedLog);
  return { exitCode, combinedLog, collectionPayload };
}

export function buildNoOutputPromptSuffix(): string {
  return `\n\n---\nThis node has no collection outputs. When finished, print the line COGNETIVY_NODE_DONE=1`;
}
