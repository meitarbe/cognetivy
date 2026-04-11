/**
 * Unit tests for Claude stream-json line parsing (no live Claude process).
 */
import assert from "node:assert";
import { describe, it } from "node:test";
import { processClaudeStreamJsonLine } from "../dist/executor/claude-stream-json-line.js";

describe("processClaudeStreamJsonLine", () => {
  it("sets endStdin when CLI emits a terminal result line", () => {
    const r = processClaudeStreamJsonLine(
      JSON.stringify({ type: "result", subtype: "success", session_id: "s1", num_turns: 1 })
    );
    assert.strictEqual(r.endStdin, true);
  });

  it("sets endStdin on result with string body", () => {
    const r = processClaudeStreamJsonLine(JSON.stringify({ type: "result", result: "done" }));
    assert.strictEqual(r.endStdin, true);
    assert.ok(r.parseFragment?.includes("done"));
  });

  it("sets endStdin on result with error string", () => {
    const r = processClaudeStreamJsonLine(JSON.stringify({ type: "result", error: "boom" }));
    assert.strictEqual(r.endStdin, true);
  });
});
