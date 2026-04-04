import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { describe, it } from "node:test";
import assert from "node:assert";
import {
  ensureMinimalWorkspace,
  workspaceExists,
  readWorkflowIndex,
  getWorkspacePaths,
} from "../dist/workspace.js";

describe("thin .cognetivy workspace", () => {
  it("ensureMinimalWorkspace creates workflows/index.json with no local default workflow", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "cognetivy-thin-"));
    await ensureMinimalWorkspace(cwd, { noGitignore: true });
    assert.strictEqual(await workspaceExists(cwd), true);
    const index = await readWorkflowIndex(cwd);
    assert.strictEqual(index.current_workflow_id, "");
    assert.deepStrictEqual(index.workflows, []);
  });

  it("second ensureMinimalWorkspace does not overwrite existing index", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "cognetivy-thin-"));
    await ensureMinimalWorkspace(cwd, { noGitignore: true });
    const indexPath = getWorkspacePaths(cwd).workflowsIndexPath;
    const patched = {
      current_workflow_id: "",
      cloud_current_workflow_id: "wf_preserved",
      workflows: [],
    };
    await fs.writeFile(indexPath, `${JSON.stringify(patched, null, 2)}\n`, "utf-8");
    await ensureMinimalWorkspace(cwd, { noGitignore: true });
    const after = await readWorkflowIndex(cwd);
    assert.strictEqual(after.cloud_current_workflow_id, "wf_preserved");
  });
});
