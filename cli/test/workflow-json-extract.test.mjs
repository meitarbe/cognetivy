import { describe, it } from "node:test";
import assert from "node:assert";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const runnerPath = path.join(__dirname, "..", "dist", "executor", "workflow-generate-runner.js");

describe("parseWorkflowFileJsonFromAgentLog", () => {
  it("parses JSON when trailing prose follows the closing brace", async () => {
    const { parseWorkflowFileJsonFromAgentLog } = await import(runnerPath);
    const log = `COGNETIVY_WORKFLOW_FILE_JSON={"name":"A","nodes":[],"kinds":{}}
Thanks for reading.`;
    const out = parseWorkflowFileJsonFromAgentLog(log);
    assert.strictEqual(out.name, "A");
  });

  it("uses the last valid object when earlier blocks are broken", async () => {
    const { parseWorkflowFileJsonFromAgentLog } = await import(runnerPath);
    const log = `COGNETIVY_WORKFLOW_FILE_JSON={broken
COGNETIVY_WORKFLOW_FILE_JSON={"name":"Fixed","nodes":[],"kinds":{}}`;
    const out = parseWorkflowFileJsonFromAgentLog(log);
    assert.strictEqual(out.name, "Fixed");
  });
});
