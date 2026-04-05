/**
 * Spawn Claude Code or Codex with a text prompt; parse collection payload from stdout.
 */
import { spawn } from "node:child_process";
import { processClaudeStreamJsonLine } from "./claude-stream-json-line.js";
import { processCodexJsonlLine } from "./codex-jsonl-stream.js";

export type ExecutorAgentKind = "claude" | "codex";

const CLAUDE_CODE_PACKAGE =
  process.env.COGNETIVY_CLAUDE_PACKAGE?.trim() || process.env.AGENT_BRIDGE_CLAUDE_PACKAGE?.trim() || "@anthropic-ai/claude-code@2.1.62";

function npxCommand(): string {
  return process.platform === "win32" ? "npx.cmd" : "npx";
}

function buildSpawn(
  agent: ExecutorAgentKind,
  prompt: string,
  options?: { codexJsonlStdout?: boolean; claudeStreamJsonStdout?: boolean }
): { command: string; args: string[] } {
  switch (agent) {
    case "claude": {
      const useGlobal = process.env.COGNETIVY_CLAUDE_USE_GLOBAL === "1" || process.env.AGENT_BRIDGE_CLAUDE_USE_GLOBAL === "1";
      const bare = process.env.COGNETIVY_CLAUDE_BARE === "1" || process.env.AGENT_BRIDGE_CLAUDE_BARE === "1";
      const useStreamJson = Boolean(options?.claudeStreamJsonStdout);
      const tail: string[] = [
        "-p",
        prompt,
        "--disallowedTools",
        "AskUserQuestion",
        "--allowedTools",
        "Bash,Read,Edit",
        "--output-format",
        useStreamJson ? "stream-json" : "text",
      ];
      if (useStreamJson) {
        tail.push("--include-partial-messages");
      }
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
    case "codex": {
      const args = ["exec"];
      if (options?.codexJsonlStdout) {
        args.push("--json");
      }
      args.push("--sandbox", "workspace-write", "--ephemeral", prompt);
      return { command: "codex", args };
    }
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
  /**
   * Codex: use `codex exec --json` and parse JSONL on stdout (incremental tool/thinking UI).
   * Default true for codex.
   */
  codexJsonlStdout?: boolean;
  /**
   * Claude: use `--output-format stream-json --include-partial-messages` and parse NDJSON lines.
   * Default true for claude unless `COGNETIVY_CLAUDE_STREAM_JSON=0` or this flag is false.
   */
  claudeStreamJsonStdout?: boolean;
}

export interface AgentNodeRunResult {
  exitCode: number | null;
  combinedLog: string;
  collectionPayload: unknown;
}

const AGENT_ERR_SNIPPET = 1200;
const AGENT_OUTPUT_TAIL = 2500;

function formatAgentProcessFailure(exitCode: number | null, combinedLog: string): string {
  const trimmed = combinedLog.trim();
  const tail = trimmed.length > AGENT_ERR_SNIPPET ? trimmed.slice(-AGENT_ERR_SNIPPET) : trimmed;
  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const hit = lines.find((l) =>
    /access to Claude|does not have access|Please login|ENOENT|command not found|EACCES|authentication|unauthorized|error:/i.test(
      l
    )
  );
  const detail = hit ?? (tail || "(no output)");
  const codePart = exitCode == null ? "exited abnormally (no code)" : `exit code ${exitCode}`;
  return `Agent failed (${codePart}): ${detail}`;
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

export function buildAgentSystemPromptSuffix(
  expectedKind: string | undefined,
  options?: { schemaProvidedInline?: boolean }
): string {
  const kindHint = expectedKind ? ` Output kind name: "${expectedKind}".` : "";
  const schemaHint = options?.schemaProvidedInline
    ? ` Match the JSON Schema under "Required output shape" exactly (required keys and types).`
    : " Items must satisfy the workflow collection schema (traceability fields if required by schema).";
  return (
    `\n\n---\nWhen finished, print the exact line ${COLLECTION_MARKER} immediately followed by JSON on the same line or the next lines: ` +
    `a JSON array of collection item objects, or a single object.${kindHint}${schemaHint}`
  );
}

export function runAgentForNodeRaw(params: AgentNodeRunParams): Promise<{ exitCode: number | null; combinedLog: string }> {
  return new Promise((resolve, reject) => {
    const useCodexJsonl = params.agent === "codex" && Boolean(params.codexJsonlStdout);
    const claudeStreamEnvOff = process.env.COGNETIVY_CLAUDE_STREAM_JSON === "0";
    const useClaudeStreamJson =
      params.agent === "claude" &&
      params.claudeStreamJsonStdout !== false &&
      !claudeStreamEnvOff;
    const spec = buildSpawn(params.agent, params.prompt, {
      codexJsonlStdout: useCodexJsonl,
      claudeStreamJsonStdout: useClaudeStreamJson,
    });

    let combined = "";
    const pushCombined = (frag: string) => {
      if (!frag) {
        return;
      }
      combined += frag;
      if (combined.length > MAX_LOG_CHARS) {
        combined = combined.slice(-MAX_LOG_CHARS);
      }
    };

    const appendPipeChunk = (chunk: string, stream: "stdout" | "stderr") => {
      pushCombined(chunk);
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

    function attachNdjsonStdout(
      processLine: (line: string) => { uiText: string | null; parseFragment: string | null }
    ): { flush: () => void; onData: (buf: Buffer) => void } {
      let carry = "";
      return {
        onData(buf: Buffer) {
          carry += buf.toString("utf8");
          const lines = carry.split("\n");
          carry = lines.pop() ?? "";
          for (const line of lines) {
            const { uiText, parseFragment } = processLine(line);
            if (uiText) {
              params.onChunk(uiText, "stdout");
            }
            if (parseFragment) {
              pushCombined(parseFragment);
            }
          }
        },
        flush() {
          const trimmed = carry.trim();
          carry = "";
          if (!trimmed) {
            return;
          }
          const { uiText, parseFragment } = processLine(trimmed);
          if (uiText) {
            params.onChunk(uiText, "stdout");
          }
          if (parseFragment) {
            pushCombined(parseFragment);
          }
        },
      };
    }

    if (useCodexJsonl) {
      let stderrAcc = "";
      const ndjson = attachNdjsonStdout(processCodexJsonlLine);
      child.stdout?.on("data", (buf: Buffer) => {
        ndjson.onData(buf);
      });
      child.stderr?.on("data", (buf: Buffer) => {
        const s = buf.toString("utf8");
        stderrAcc += s;
        params.onChunk(s, "stderr");
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
        ndjson.flush();
        const withStderr =
          stderrAcc.trim().length > 0 ? `${combined}\n--- stderr ---\n${stderrAcc}` : combined;
        resolve({ exitCode: code, combinedLog: withStderr });
      });
    } else if (useClaudeStreamJson) {
      let stderrAcc = "";
      const ndjson = attachNdjsonStdout(processClaudeStreamJsonLine);
      child.stdout?.on("data", (buf: Buffer) => {
        ndjson.onData(buf);
      });
      child.stderr?.on("data", (buf: Buffer) => {
        const s = buf.toString("utf8");
        stderrAcc += s;
        params.onChunk(s, "stderr");
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
        ndjson.flush();
        const withStderr =
          stderrAcc.trim().length > 0 ? `${combined}\n--- stderr ---\n${stderrAcc}` : combined;
        resolve({ exitCode: code, combinedLog: withStderr });
      });
    } else {
      child.stdout?.on("data", (buf: Buffer) => {
        appendPipeChunk(buf.toString("utf8"), "stdout");
      });
      child.stderr?.on("data", (buf: Buffer) => {
        appendPipeChunk(buf.toString("utf8"), "stderr");
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
    }
  });
}

export async function runAgentForNode(params: AgentNodeRunParams): Promise<AgentNodeRunResult> {
  const useCodexJsonl = params.codexJsonlStdout ?? (params.agent === "codex");
  const useClaudeStream = params.claudeStreamJsonStdout ?? (params.agent === "claude");
  const { exitCode, combinedLog } = await runAgentForNodeRaw({
    ...params,
    codexJsonlStdout: useCodexJsonl,
    claudeStreamJsonStdout: useClaudeStream,
  });
  if (exitCode !== 0 && exitCode !== null) {
    throw new Error(formatAgentProcessFailure(exitCode, combinedLog));
  }
  try {
    const collectionPayload = parseCollectionPayloadFromLog(combinedLog);
    return { exitCode, combinedLog, collectionPayload };
  } catch (parseErr) {
    const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
    const tail = combinedLog.trim().length > 0 ? `\n--- agent output (tail) ---\n${combinedLog.trim().slice(-AGENT_OUTPUT_TAIL)}` : "";
    throw new Error(`${msg}${tail}`);
  }
}

export function buildNoOutputPromptSuffix(): string {
  return `\n\n---\nThis node has no collection outputs. When finished, print the line COGNETIVY_NODE_DONE=1`;
}
