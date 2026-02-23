import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { describe, it } from "node:test";
import assert from "node:assert";
import {
  ensureWorkspace,
  writeRunFile,
  appendEventLine,
  readRunFile,
  getEventsFilePath,
} from "../dist/workspace.js";

describe("run start and event append", () => {
  it("run start creates run file and first event line", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "cognetivy-test-"));
    await ensureWorkspace(cwd, { noGitignore: true });
    const runId = "run_2025-01-01T00-00-00Z_abc123";
    const now = new Date().toISOString();
    const runRecord = {
      run_id: runId,
      workflow_id: "wf_default",
      workflow_version: "v1",
      status: "running",
      input: { topic: "test" },
      created_at: now,
    };
    await writeRunFile(runRecord, cwd);

    const event = {
      ts: now,
      type: "run_started",
      by: "test",
      data: { workflow_version: "v1", input: runRecord.input },
    };
    await appendEventLine(runId, event, cwd);

    const read = await readRunFile(runId, cwd);
    assert.strictEqual(read.run_id, runId);
    assert.strictEqual(read.status, "running");

    const eventsPath = getEventsFilePath(runId, cwd);
    const lines = (await fs.readFile(eventsPath, "utf-8")).trim().split("\n");
    assert.strictEqual(lines.length, 1);
    const firstEvent = JSON.parse(lines[0]);
    assert.strictEqual(firstEvent.type, "run_started");
  });

  it("event append adds a line to NDJSON", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "cognetivy-test-"));
    await ensureWorkspace(cwd, { noGitignore: true });
    const runId = "run_2025-01-01T00-00-00Z_xyz";
    const now = new Date().toISOString();
    await writeRunFile(
      {
        run_id: runId,
        workflow_id: "wf_default",
        workflow_version: "v1",
        status: "running",
        input: {},
        created_at: now,
      },
      cwd
    );
    await appendEventLine(
      runId,
      { ts: now, type: "run_started", by: "cli", data: {} },
      cwd
    );
    await appendEventLine(
      runId,
      {
        ts: new Date().toISOString(),
        type: "step_started",
        by: "cli",
        data: { node_id: "retrieve" },
      },
      cwd
    );

    const eventsPath = getEventsFilePath(runId, cwd);
    const lines = (await fs.readFile(eventsPath, "utf-8")).trim().split("\n");
    assert.strictEqual(lines.length, 2);
    assert.strictEqual(JSON.parse(lines[1]).type, "step_started");
  });
});
