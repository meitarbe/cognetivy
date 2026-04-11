/**
 * Live integration: spawns `npx @anthropic-ai/claude-code` (needs network).
 * Run: COGNETIVY_LIVE_CLAUDE=1 npm run test:live
 * Skipped in default `npm test` so CI stays offline.
 */
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { describe, it } from "node:test";
import assert from "node:assert";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIVE_CLAUDE = process.env.COGNETIVY_LIVE_CLAUDE === "1";
const protocolPath = path.join(__dirname, "..", "dist", "executor", "claude-code-stdio-protocol.js");
const runnerPath = path.join(__dirname, "..", "dist", "executor", "agent-node-runner.js");

const CLAUDE_PKG = "@anthropic-ai/claude-code@2.1.62";

function claudeStreamJsonNpxArgs() {
  return [
    "-y",
    CLAUDE_PKG,
    "-p",
    "--disallowedTools",
    "AskUserQuestion",
    "--allowedTools",
    "Bash,Read,Edit",
    "--verbose",
    "--output-format=stream-json",
    "--input-format=stream-json",
    "--include-partial-messages",
    "--replay-user-messages",
  ];
}

describe("Claude stream-json stdio (live npx)", () => {
  it(
    "handshake: system init appears on stdout within 35s",
    { skip: !LIVE_CLAUDE, timeout: 45_000 },
    async () => {
      const {
        buildClaudeStreamJsonStdinHandshake,
        createStdinJsonlWriter,
        tryRespondToClaudeStdoutControlLine,
      } = await import(protocolPath);

      await new Promise((resolve, reject) => {
        let settled = false;
        function resolveOnce() {
          if (settled) {
            return;
          }
          settled = true;
          resolve(undefined);
        }
        function rejectOnce(err) {
          if (settled) {
            return;
          }
          settled = true;
          reject(err);
        }

        const child = spawn("npx", claudeStreamJsonNpxArgs(), {
          cwd: os.tmpdir(),
          stdio: ["pipe", "pipe", "pipe"],
          env: { ...process.env, NPM_CONFIG_LOGLEVEL: "error" },
        });

        const stdin = child.stdin;
        if (!stdin) {
          rejectOnce(new Error("missing stdin"));
          return;
        }

        const { writeLine } = createStdinJsonlWriter(stdin);
        for (const handshakeLine of buildClaudeStreamJsonStdinHandshake("ping")) {
          writeLine(handshakeLine);
        }

        let carry = "";
        let sawInit = false;

        const timer = setTimeout(() => {
          child.kill("SIGTERM");
          rejectOnce(new Error("timeout waiting for system init line"));
        }, 32_000);

        function onStdoutChunk(buf) {
          carry += buf.toString("utf8");
          const parts = carry.split("\n");
          carry = parts.pop() ?? "";
          for (const line of parts) {
            if (tryRespondToClaudeStdoutControlLine(line, writeLine)) {
              continue;
            }
            if (line.includes('"subtype":"init"') && line.includes('"type":"system"')) {
              sawInit = true;
              clearTimeout(timer);
              child.kill("SIGTERM");
            }
          }
        }

        child.stdout.setEncoding("utf8");
        child.stdout.on("data", onStdoutChunk);
        child.stderr.on("data", () => {});

        child.on("error", (err) => {
          clearTimeout(timer);
          rejectOnce(err);
        });

        child.on("close", () => {
          clearTimeout(timer);
          if (sawInit) {
            resolveOnce();
            return;
          }
          rejectOnce(new Error(`no system init in stdout (tail carry: ${carry.slice(-400)})`));
        });
      });
    }
  );

  it(
    "runAgentForNodeRaw: abort leaves process (no hang on signal)",
    { skip: !LIVE_CLAUDE, timeout: 25_000 },
    async () => {
      const { runAgentForNodeRaw } = await import(runnerPath);
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 12_000);
      try {
        await runAgentForNodeRaw({
          cwd: os.tmpdir(),
          agent: "claude",
          prompt: "Say hi. COGNETIVY_COLLECTION_JSON=[]",
          claudeStreamJsonStdout: true,
          signal: ac.signal,
          onChunk() {},
        });
        assert.fail("expected abort");
      } catch (e) {
        assert.ok(e instanceof Error);
        assert.ok(/Aborted/i.test(e.message));
      } finally {
        clearTimeout(t);
      }
    }
  );
});
