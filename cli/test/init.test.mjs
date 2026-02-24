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

    await assert.doesNotReject(fs.access(p.workflowsIndexPath));
    await assert.doesNotReject(fs.access(p.workflowsDir));
    await assert.doesNotReject(fs.access(p.runsDir));
    await assert.doesNotReject(fs.access(p.eventsDir));
    await assert.doesNotReject(fs.access(p.collectionsDir));
    await assert.doesNotReject(fs.access(p.nodeResultsDir));

    const index = JSON.parse(await fs.readFile(p.workflowsIndexPath, "utf-8"));
    assert.strictEqual(index.current_workflow_id, "wf_default");
    assert.strictEqual(Array.isArray(index.workflows), true);

    const wfDir = path.join(p.workflowsDir, "wf_default");
    const wfPath = path.join(wfDir, "workflow.json");
    const versionPath = path.join(wfDir, "versions", "v1.json");
    const schemaPath = path.join(wfDir, "collections", "schema.json");
    await assert.doesNotReject(fs.access(wfPath));
    await assert.doesNotReject(fs.access(versionPath));
    await assert.doesNotReject(fs.access(schemaPath));

    const wf = JSON.parse(await fs.readFile(wfPath, "utf-8"));
    assert.strictEqual(wf.workflow_id, "wf_default");
    assert.strictEqual(wf.current_version_id, "v1");

    const version = JSON.parse(await fs.readFile(versionPath, "utf-8"));
    assert.strictEqual(version.workflow_id, "wf_default");
    assert.strictEqual(version.version_id, "v1");
    assert.strictEqual(Array.isArray(version.nodes), true);
  });
});
