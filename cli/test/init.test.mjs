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
  it("creates workspace structure with workflow.json and wf_v1.json", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "cognetivy-test-"));
    await ensureWorkspace(cwd, { noGitignore: true });

    assert.strictEqual(await workspaceExists(cwd), true);
    const p = getWorkspacePaths(cwd);
    assert.strictEqual(p.root, path.join(cwd, WORKSPACE_DIR));

    await assert.doesNotReject(fs.access(p.workflowJson));
    await assert.doesNotReject(fs.access(p.workflowVersionsDir));
    await assert.doesNotReject(fs.access(p.runsDir));
    await assert.doesNotReject(fs.access(p.eventsDir));
    await assert.doesNotReject(fs.access(p.mutationsDir));

    const pointer = JSON.parse(await fs.readFile(p.workflowJson, "utf-8"));
    assert.strictEqual(pointer.workflow_id, "wf_default");
    assert.strictEqual(pointer.current_version, "v1");

    const versionPath = path.join(p.workflowVersionsDir, "wf_v1.json");
    await assert.doesNotReject(fs.access(versionPath));
    const wf = JSON.parse(await fs.readFile(versionPath, "utf-8"));
    assert.strictEqual(wf.version, "v1");
    assert.strictEqual(Array.isArray(wf.nodes), true);
    assert.strictEqual(Array.isArray(wf.edges), true);
  });
});
