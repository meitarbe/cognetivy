import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { describe, it } from "node:test";
import assert from "node:assert";
import {
  ensureWorkspace,
  workspaceExists,
  getWorkspacePaths,
  WORKSPACE_DIR,
} from "../dist/workspace.js";

describe("cognetivy init", () => {
  it("creates workspace structure with workflows/index.json and default workflow files", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "cognetivy-test-"));
    await ensureWorkspace(cwd, { noGitignore: true });

    assert.strictEqual(await workspaceExists(cwd), true);
    const p = getWorkspacePaths(cwd);
    assert.strictEqual(p.root, path.join(cwd, WORKSPACE_DIR));

    // SQLite-backed workspace may not materialize legacy JSON/NDJSON directories.
    await assert.doesNotReject(fs.access(p.root));
    const { readWorkflowIndex } = await import("../dist/workspace.js");
    const index = await readWorkflowIndex(cwd);
    assert.strictEqual(index.current_workflow_id, "wf_default");
    assert.strictEqual(Array.isArray(index.workflows), true);

    const { readWorkflowRecord, readWorkflowVersionRecord } = await import("../dist/workspace.js");
    const wf = await readWorkflowRecord("wf_default", cwd);
    assert.strictEqual(wf.workflow_id, "wf_default");
    assert.strictEqual(wf.current_version_id, "v1");

    const version = await readWorkflowVersionRecord("wf_default", "v1", cwd);
    assert.strictEqual(version.workflow_id, "wf_default");
    assert.strictEqual(version.version_id, "v1");
    assert.strictEqual(Array.isArray(version.nodes), true);
  });
});
