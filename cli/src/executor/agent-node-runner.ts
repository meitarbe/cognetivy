/**
 * Spawn Claude Code or Codex with a text prompt; parse collection payload from stdout.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { isExecutorTerminalLogEnabled, writeExecutorTerminalNote } from "../local-server/executor-terminal-log.js";
import {
  buildClaudeStreamJsonStdinHandshake,
  createStdinJsonlWriter,
  tryRespondToClaudeStdoutControlLine,
} from "./claude-code-stdio-protocol.js";
import { processClaudeStreamJsonLine } from "./claude-stream-json-line.js";
import { processCodexJsonlLine } from "./codex-jsonl-stream.js";
import { extractFirstJsonValueFromText, stripLeadingMarkdownFence } from "./json-extract.js";
import { WORKFLOW_GENERATE_OUTPUT_MARKER } from "./workflow-generate-prompt.js";

export type ExecutorAgentKind = "claude" | "codex";

const CLAUDE_CODE_PACKAGE =
  process.env.COGNETIVY_CLAUDE_PACKAGE?.trim() || process.env.AGENT_BRIDGE_CLAUDE_PACKAGE?.trim() || "@anthropic-ai/claude-code@2.1.62";

function npxCommand(): string {
  return process.platform === "win32" ? "npx.cmd" : "npx";
}

function shouldSkipCodexGitRepoCheck(cwd: string): boolean {
  const env = (process.env.COGNETIVY_CODEX_SKIP_GIT_REPO_CHECK ?? "").trim();
  if (env === "1") return true;
  if (env === "0") return false;
  /**
   * Default: auto-skip when running in an isolated workspace copy that intentionally excludes `.git`.
   * Codex uses "inside a git repo" as its trust boundary; without `.git`, it refuses to run.
   */
  try {
    return !fs.existsSync(path.join(cwd, ".git"));
  } catch {
    return true;
  }
}

function buildSpawn(
  agent: ExecutorAgentKind,
  cwd: string,
  prompt: string,
  options?: { codexJsonlStdout?: boolean; claudeStreamJsonStdout?: boolean }
): { command: string; args: string[] } {
  switch (agent) {
    case "claude": {
      const useGlobal = process.env.COGNETIVY_CLAUDE_USE_GLOBAL === "1" || process.env.AGENT_BRIDGE_CLAUDE_USE_GLOBAL === "1";
      const bare = process.env.COGNETIVY_CLAUDE_BARE === "1" || process.env.AGENT_BRIDGE_CLAUDE_BARE === "1";
      const useStreamJson = Boolean(options?.claudeStreamJsonStdout);
      /**
       * Stream-json mode matches vibe-kanban `ClaudeCode::build_command_builder`: stdin is JSONL
       * (initialize → set_permission_mode → user message) plus control_response lines for tool/hook
       * requests (`claude-code-stdio-protocol.ts`).
       */
      const flags: string[] = [
        "-p",
        "--disallowedTools",
        "AskUserQuestion",
        "--allowedTools",
        "Bash,Read,Edit",
      ];
      if (useStreamJson) {
        flags.push(
          "--verbose",
          "--output-format=stream-json",
          "--input-format=stream-json",
          "--include-partial-messages",
          "--replay-user-messages"
        );
      } else {
        flags.push("--output-format", "text");
      }
      if (bare) {
        flags.unshift("--bare");
      }
      if (useGlobal) {
        return { command: "claude", args: flags };
      }
      return {
        command: npxCommand(),
        args: ["-y", CLAUDE_CODE_PACKAGE, ...flags],
      };
    }
    case "codex": {
      const args = ["exec"];
      if (options?.codexJsonlStdout) {
        args.push("--json");
      }
      if (shouldSkipCodexGitRepoCheck(cwd)) {
        args.push("--skip-git-repo-check");
      }
      args.push("--sandbox", "workspace-write", "--ephemeral", prompt);
      return { command: "codex", args };
    }
    default:
      throw new Error(`Unknown agent: ${agent}`);
  }
}

const COLLECTION_MARKER = "COGNETIVY_COLLECTION_JSON=";

function getAgentCombinedLogMaxChars(): number {
  const n = Number(process.env.COGNETIVY_AGENT_COMBINED_LOG_MAX_CHARS);
  return Number.isFinite(n) && n >= 50_000 ? Math.floor(n) : 1_500_000;
}

function trimAgentCombinedLogBuffer(s: string): string {
  const maxChars = getAgentCombinedLogMaxChars();
  if (s.length <= maxChars) {
    return s;
  }
  const m1 = s.lastIndexOf(COLLECTION_MARKER);
  const m2 = s.lastIndexOf(WORKFLOW_GENERATE_OUTPUT_MARKER);
  const markerPos = Math.max(m1, m2);
  if (markerPos >= 0) {
    const headBeforeMarker = 16_000;
    const from = Math.max(0, markerPos - headBeforeMarker);
    const suffix = s.slice(from);
    if (suffix.length <= maxChars) {
      return suffix;
    }
    return suffix.slice(-maxChars);
  }
  return s.slice(-maxChars);
}

function combinedHasAgentPayloadMarker(combined: string): boolean {
  return combined.includes(COLLECTION_MARKER) || combined.includes(WORKFLOW_GENERATE_OUTPUT_MARKER);
}

function traceAgentPipeData(agent: ExecutorAgentKind, label: "stdout" | "stderr", byteLength: number): void {
  if (!isExecutorTerminalLogEnabled() || process.env.COGNETIVY_AGENT_STDOUT_TRACE !== "1") {
    return;
  }
  writeExecutorTerminalNote(`agent ${agent} ${label} pipe data bytes=${byteLength}`);
}

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
  const noOutputHint =
    !tail && !hit
      ? " If stderr was empty, check `claude` / npx, auth (~/.claude.json), and that the CLI accepts `-p` with prompt on stdin."
      : "";
  const detail = hit ?? (tail || `(no output)${noOutputHint}`);
  const codePart = exitCode == null ? "exited abnormally (no code)" : `exit code ${exitCode}`;
  return `Agent failed (${codePart}): ${detail}`;
}

export function parseCollectionPayloadFromLog(log: string): unknown {
  const idx = log.lastIndexOf(COLLECTION_MARKER);
  if (idx < 0) {
    throw new Error(
      `Agent output must end with ${COLLECTION_MARKER} followed by JSON (array of items or one object).`
    );
  }
  let tail = log.slice(idx + COLLECTION_MARKER.length).trim();
  tail = stripLeadingMarkdownFence(tail);
  try {
    return JSON.parse(tail) as unknown;
  } catch {
    const extracted = extractFirstJsonValueFromText(tail);
    if (extracted) {
      try {
        return JSON.parse(extracted) as unknown;
      } catch {
        // fall through
      }
    }
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
  const proseHint =
    " Each collection item: every string-typed property must be a single Markdown string (lists and structure go inside that string as Markdown). Never put JSON arrays in a string field; never use a JSON array where the schema expects a string-only Markdown text.";
  return (
    `\n\n---\nWhen finished, print the exact line ${COLLECTION_MARKER} immediately followed by JSON on the same line or the next lines: ` +
    `a JSON array of collection item objects, or a single object (outer JSON is only for wrapping items).${kindHint}${schemaHint}${proseHint}`
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
    const spec = buildSpawn(params.agent, params.cwd, params.prompt, {
      codexJsonlStdout: useCodexJsonl,
      claudeStreamJsonStdout: useClaudeStreamJson,
    });

    let combined = "";
    const pushCombined = (frag: string) => {
      if (!frag) {
        return;
      }
      combined += frag;
      if (combined.length > getAgentCombinedLogMaxChars()) {
        combined = trimAgentCombinedLogBuffer(combined);
      }
    };

    const appendPipeChunk = (chunk: string, stream: "stdout" | "stderr") => {
      pushCombined(chunk);
      params.onChunk(chunk, stream);
    };

    const child = spawn(spec.command, spec.args, {
      cwd: params.cwd,
      env: {
        ...process.env,
        ...(params.agent === "claude" ? { NPM_CONFIG_LOGLEVEL: "error" } : {}),
      },
      stdio: params.agent === "claude" ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
    });

    child.once("spawn", function logAgentChildSpawn() {
      if (!isExecutorTerminalLogEnabled()) {
        return;
      }
      const argv0 = spec.args[0] ?? "";
      writeExecutorTerminalNote(
        `agent subprocess spawned pid=${child.pid ?? "?"} command=${spec.command} argv0=${argv0} arg_count=${spec.args.length}`
      );
    });

    function logAgentChildClosed(code: number | null, signal: NodeJS.Signals | null): void {
      if (!isExecutorTerminalLogEnabled()) {
        return;
      }
      writeExecutorTerminalNote(
        `agent subprocess closed agent=${params.agent} exitCode=${code === null ? "null" : String(code)} signal=${signal ?? ""}`
      );
    }

    let claudeStdinWriter: { writeLine: (line: string) => void } | null = null;
    if (params.agent === "claude") {
      const stdin = child.stdin;
      if (!stdin) {
        reject(new Error("Claude Code: stdin pipe is missing"));
        return;
      }
      try {
        if (useClaudeStreamJson) {
          claudeStdinWriter = createStdinJsonlWriter(stdin);
          for (const handshakeLine of buildClaudeStreamJsonStdinHandshake(params.prompt)) {
            claudeStdinWriter.writeLine(handshakeLine);
          }
        } else {
          const body = params.prompt;
          const written = stdin.write(body, "utf8");
          if (!written && body.length > 0) {
            stdin.once("drain", function claudeStdinEndAfterDrain() {
              stdin.end();
            });
          } else {
            stdin.end();
          }
        }
      } catch (err) {
        child.kill("SIGTERM");
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }
    }

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

    type NdjsonLineOutcome = { uiText: string | null; parseFragment: string | null; endStdin?: boolean };

    function attachNdjsonStdout(
      processLine: (line: string) => NdjsonLineOutcome,
      options?: { interceptLine?: (line: string) => boolean; onEndStdin?: () => void }
    ): { flush: () => void; onData: (buf: Buffer) => void } {
      let carry = "";
      function handleParsedLine(line: string): void {
        if (options?.interceptLine?.(line)) {
          return;
        }
        const { uiText, parseFragment, endStdin } = processLine(line);
        if (uiText) {
          params.onChunk(uiText, "stdout");
        }
        if (parseFragment) {
          pushCombined(parseFragment);
        } else if (uiText) {
          pushCombined(uiText);
        }
        if (endStdin) {
          options?.onEndStdin?.();
        }
      }
      return {
        onData(buf: Buffer) {
          carry += buf.toString("utf8");
          const lines = carry.split("\n");
          carry = lines.pop() ?? "";
          for (const line of lines) {
            handleParsedLine(line);
          }
        },
        flush() {
          const trimmed = carry.trim();
          carry = "";
          if (!trimmed) {
            return;
          }
          handleParsedLine(trimmed);
        },
      };
    }

    if (useCodexJsonl) {
      let stderrAcc = "";
      const ndjson = attachNdjsonStdout(processCodexJsonlLine);
      child.stdout?.on("data", (buf: Buffer) => {
        traceAgentPipeData(params.agent, "stdout", buf.length);
        ndjson.onData(buf);
      });
      child.stderr?.on("data", (buf: Buffer) => {
        traceAgentPipeData(params.agent, "stderr", buf.length);
        const s = buf.toString("utf8");
        stderrAcc += s;
        params.onChunk(s, "stderr");
      });
      child.on("error", (err) => {
        if (params.signal) params.signal.removeEventListener("abort", onAbort);
        reject(err);
      });
      child.on("close", (code, signal) => {
        logAgentChildClosed(code, signal);
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
      const controlWrite = claudeStdinWriter?.writeLine;
      let payloadIdleTimer: ReturnType<typeof setTimeout> | null = null;
      function clearClaudePayloadIdleTimer(): void {
        if (payloadIdleTimer != null) {
          clearTimeout(payloadIdleTimer);
          payloadIdleTimer = null;
        }
      }
      let claudeStdinClosed = false;
      function scheduleClaudeStreamJsonStdinEnd(): void {
        clearClaudePayloadIdleTimer();
        if (claudeStdinClosed) {
          return;
        }
        const stdin = child.stdin;
        if (!stdin) {
          return;
        }
        claudeStdinClosed = true;
        /**
         * Claude Code with `--input-format=stream-json` waits for stdin EOF to exit after the
         * final `{"type":"result",...}` line (vibe-kanban stops reading there too). Defer `end()` so
         * any pending `createStdinJsonlWriter` queue drains and control_response lines flush first.
         */
        setImmediate(function endClaudeStdinAfterResult() {
          try {
            if (!stdin.writableEnded) {
              stdin.end();
            }
          } catch {
            // ignore - process may already be tearing down
          }
        });
      }
      /**
       * Sometimes the CLI never emits a top-level `result` NDJSON line after the model prints the
       * payload (markers appear only in streamed text deltas). If stdout goes quiet while the log
       * already contains COGNETIVY_* markers, close stdin so the child can exit.
       */
      function scheduleIdleStdinEndIfPayloadPresent(): void {
        clearClaudePayloadIdleTimer();
        if (claudeStdinClosed) {
          return;
        }
        if (!combinedHasAgentPayloadMarker(combined)) {
          return;
        }
        const idleMsRaw = Number(process.env.COGNETIVY_CLAUDE_STREAM_JSON_IDLE_END_MS);
        const idleMs = Number.isFinite(idleMsRaw) && idleMsRaw >= 1000 ? idleMsRaw : 6000;
        payloadIdleTimer = setTimeout(function claudeStreamJsonIdleEndStdin() {
          payloadIdleTimer = null;
          if (claudeStdinClosed || !combinedHasAgentPayloadMarker(combined)) {
            return;
          }
          if (isExecutorTerminalLogEnabled()) {
            writeExecutorTerminalNote(
              `agent claude stream-json: stdin.end after ${idleMs}ms stdout idle (payload marker present; no result line)`
            );
          }
          scheduleClaudeStreamJsonStdinEnd();
        }, idleMs);
      }
      const ndjson = attachNdjsonStdout(processClaudeStreamJsonLine, {
        interceptLine(line: string): boolean {
          if (!controlWrite) {
            return false;
          }
          return tryRespondToClaudeStdoutControlLine(line, controlWrite);
        },
        onEndStdin: scheduleClaudeStreamJsonStdinEnd,
      });
      child.stdout?.on("data", (buf: Buffer) => {
        traceAgentPipeData(params.agent, "stdout", buf.length);
        ndjson.onData(buf);
        scheduleIdleStdinEndIfPayloadPresent();
      });
      child.stderr?.on("data", (buf: Buffer) => {
        traceAgentPipeData(params.agent, "stderr", buf.length);
        const s = buf.toString("utf8");
        stderrAcc += s;
        params.onChunk(s, "stderr");
      });
      child.on("error", (err) => {
        if (params.signal) params.signal.removeEventListener("abort", onAbort);
        reject(err);
      });
      child.on("close", (code, signal) => {
        clearClaudePayloadIdleTimer();
        logAgentChildClosed(code, signal);
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
        traceAgentPipeData(params.agent, "stdout", buf.length);
        appendPipeChunk(buf.toString("utf8"), "stdout");
      });
      child.stderr?.on("data", (buf: Buffer) => {
        traceAgentPipeData(params.agent, "stderr", buf.length);
        appendPipeChunk(buf.toString("utf8"), "stderr");
      });

      child.on("error", (err) => {
        if (params.signal) params.signal.removeEventListener("abort", onAbort);
        reject(err);
      });

      child.on("close", (code, signal) => {
        logAgentChildClosed(code, signal);
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
